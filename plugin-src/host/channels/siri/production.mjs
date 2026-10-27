import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { createSiriQuestionFlow } from '../../../../src/channels/siri/question-flow.mjs';
import { createSiriDsBotService } from '../../../../src/channels/siri/ds-bot-service.mjs';
import { SiriConfigStore, SIRI_BOT_ID } from '../../../../src/channels/siri/config-store.mjs';
import { SiriController } from '../../../../src/channels/siri/siri-controller.mjs';
import { SiriHarnessClient } from '../../../../src/channels/siri/harness-client.mjs';
import { SiriRuntime } from '../../../../src/channels/siri/siri-runtime.mjs';
import { SiriStateStore } from '../../../../src/channels/siri/state-store.mjs';
import {
  BotWorkspaceStore,
  createBotWorkspaceScope,
  createWorkspaceAwareController,
} from '../../../../src/channels/shared/bot-workspace-store.mjs';
import { prepareBotWorkspace } from '../../../../src/channels/shared/default-workspace.mjs';
import { listAgentPresetCatalog } from '../../../../src/channels/shared/agent-preset.mjs';
import { listModelCatalog } from '../../../../src/channels/shared/model-setting.mjs';
import { createDsBotClient } from '../../ds-bot-client.mjs';
import { createHarnessCommandExecutor } from '../../harness-command-executor.mjs';
import { harnessConnection } from '../../harness-connection.mjs';
import { createHarnessSessionExecutors } from '../../harness-session-coordinator.mjs';
import { getInboundTtlRuntime } from '../../inbound-ttl-runtime.mjs';
import { TokenConnectionSupervisor } from '../shared/connection-supervisor.mjs';

function pluginPaths(config) {
  const dshHome = resolve(config.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh'));
  const root = resolve(config.dataDir ?? join(dshHome, 'integrations', 'dsh-siri'));
  return {
    config: resolve(config.configPath ?? join(root, 'config.json')),
    state: resolve(config.statePath ?? join(root, 'state.json')),
    workspaces: resolve(config.workspacesPath ?? join(root, 'workspaces.json')),
  };
}

export async function createProductionController(ctx, config = {}, internals = {}) {
  if (!ctx?.credentials) throw new TypeError('dsh-im Siri requires ctx.credentials');
  const connection = harnessConnection(ctx, config, { competitiveApprovals: true });
  const logger = typeof ctx.logger === 'function' ? ctx.logger('dsh-im:siri') : (ctx.logger ?? console);
  const paths = pluginPaths(config);
  const configStore = await new (internals.ConfigStore ?? SiriConfigStore)(paths.config).load();
  const state = await new (internals.StateStore ?? SiriStateStore)(paths.state).load();
  const { defaultWorkspace, ungroupedWorkspace } = await prepareBotWorkspace(config);
  const workspaces = internals.workspaces
    ?? await new (internals.WorkspaceStore ?? BotWorkspaceStore)(paths.workspaces, {
      defaultWorkspace, ungroupedWorkspace,
    }).load();
  await workspaces.reconcile([SIRI_BOT_ID]);
  await workspaces.ensure(SIRI_BOT_ID, { defaultAgentPreset: config.agentPreset });

  const commandExecutor = createHarnessCommandExecutor(ctx, internals.commandExecutor);
  const inboundTtl = internals.inboundTtl ?? getInboundTtlRuntime(ctx, config);
  const inboundTtlService = inboundTtl?.service ?? inboundTtl;
  const { controlExecutor, sessionMaintenanceExecutor, fileIngressExecutor } = createHarnessSessionExecutors(ctx, {
    controlExecutor: internals.controlExecutor,
    sessionMaintenanceExecutor: internals.sessionMaintenanceExecutor,
    fileIngressExecutor: internals.fileIngressExecutor,
    inboundTtlService,
  });
  const harness = new (internals.HarnessClient ?? SiriHarnessClient)({
    ...connection,
    workspace: defaultWorkspace,
    ungroupedWorkspace,
    autostart: false,
    dshBin: config.dshBin ?? 'dsh',
    ...(commandExecutor ? { commandExecutor } : {}),
    ...(controlExecutor ? { controlExecutor } : {}),
    ...(sessionMaintenanceExecutor ? { sessionMaintenanceExecutor } : {}),
    ...(fileIngressExecutor ? { fileIngressExecutor } : {}),
  });
  const dsBot = internals.dsBot ?? createDsBotClient(ctx);
  const dsBotService = createSiriDsBotService({ workspaces, state, dsBot });
  const agentPresetCatalog = () => listAgentPresetCatalog(ctx);
  const questions = createSiriQuestionFlow({ dsBot, harness, sessionOf: dsBotService.sessionOf, logger });
  const modelCatalog = (options) => listModelCatalog(harness, options);

  const coreController = new (internals.Controller ?? SiriController)({
    credentials: ctx.credentials,
    configStore,
    logger,
    env: config.env ?? process.env,
    createRuntime: async ({ config: siriConfig, getApiKey }) => {
      // Re-ensure on every start: a workspace reset or removal must not leave a stale scope.
      await workspaces.ensure(SIRI_BOT_ID, { defaultAgentPreset: config.agentPreset });
      const scope = createBotWorkspaceScope(harness, {
        dsBot,
        botId: SIRI_BOT_ID, workspaces, state, agentPresetCatalog,
      });
      return new (internals.Runtime ?? SiriRuntime)({
        config: siriConfig,
        getApiKey,
        conversationFor: dsBotService.conversationFor,
        questions,
        harness: scope.harness,
        state: scope.state,
        replyTimeoutMs: config.replyTimeoutMs ?? 600_000,
        logger,
      });
    },
  });
  coreController.attachDsBotService(dsBotService);
  const workspaceAware = createWorkspaceAwareController(coreController, {
    workspaces,
    stateFor: async () => state,
    agentPresetCatalog,
    modelCatalog,
  });
  // The DS Bot calls return their own shapes, so they bypass the workspace decoration.
  const controller = new Proxy(workspaceAware, {
    get(target, property) {
      if (['dsBotStatus', 'bindDsBot', 'unbindDsBot'].includes(property)) {
        return (...args) => coreController[property](...args);
      }
      return Reflect.get(target, property, target);
    },
  });
  const supervisor = new TokenConnectionSupervisor({
    channel: 'siri',
    controller,
    harness,
    logger,
    retryDelaysMs: config.retryDelaysMs,
    healthyIntervalMs: config.healthyIntervalMs,
  }).start();
  return {
    controller,
    ready: supervisor.ready,
    async close() {
      await supervisor.close();
      await controller.close();
      harness.stopManagedProcess();
    },
  };
}
