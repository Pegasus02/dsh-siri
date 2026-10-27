import { createProductionController } from './production.mjs';
import { createSiriRpcHandler, installSiriRpc, SIRI_RPC_CHANNEL } from './rpc.mjs';
import { installProductionChannel } from '../shared/startup.mjs';

export const name = 'dsh-im-siri-host';
export const inject = ['connection', 'credentials', 'typertGateway'];

export async function apply(ctx, config = {}) {
  if (config?.controller) {
    return installSiriRpc(ctx, config.controller, config.rpcOptions, config.rpcAuthority);
  }
  return installProductionChannel(ctx, config, {
    channel: 'siri',
    rpcChannel: SIRI_RPC_CHANNEL,
    createProduction: () => createProductionController(ctx, config, config.internals),
    createHandler: controller => createSiriRpcHandler(controller, config.rpcOptions),
  });
}

export function createSiriHostPlugin(config) {
  return Object.freeze({ name, inject, apply: (ctx) => apply(ctx, config) });
}

export { createProductionController } from './production.mjs';
export { SIRI_ENDPOINTS, SIRI_RPC_CHANNEL, SIRI_RPC_ENDPOINTS, createSiriRpcHandler, installSiriRpc } from './rpc.mjs';
export { SiriController } from '../../../../src/channels/siri/siri-controller.mjs';
export { SiriRuntime } from '../../../../src/channels/siri/siri-runtime.mjs';
