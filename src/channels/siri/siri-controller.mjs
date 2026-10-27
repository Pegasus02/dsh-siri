// siri-controller.mjs — settings, API key and lifecycle of the Siri channel.
//
// Siri is a channel of its own: it needs no bot token and no third-party
// service, so it is "connected" as soon as its listener is bound and the
// Harness is reachable. The status keeps the shape the other channels report
// (`bots` and `totals`) so the shared supervisor and the management UI read it
// the same way.

import { randomBytes } from 'node:crypto';

import {
  DEFAULT_SIRI_PORT,
  MAX_SIRI_TIMEOUT_MS,
  MIN_SIRI_TIMEOUT_MS,
  MAX_SIRI_ALIAS_LENGTH,
  MAX_SIRI_GUIDANCE_LENGTH,
  MAX_SIRI_RATE_PER_MINUTE,
  SIRI_BOT_ID,
  validSiriAllowedAddress,
} from './config-store.mjs';
import { createConnectionDiagnostics } from '../shared/connection-error.mjs';

function generateApiKey() {
  return `siri_${randomBytes(24).toString('base64url')}`;
}

export class SiriController {
  #credentials;
  #configStore;
  #createRuntime;
  #logger;
  #env;
  #diagnostics;
  #runtime = null;
  #apiKey = '';
  #error = null;
  #closed = false;
  #transition = Promise.resolve();
  #dsBot = null;

  constructor({ credentials, configStore, createRuntime, logger = console, env = process.env }) {
    if (!credentials || typeof credentials.resolve !== 'function' || typeof credentials.set !== 'function') {
      throw new TypeError('SiriController requires a credential store');
    }
    this.#credentials = credentials;
    this.#configStore = configStore;
    this.#createRuntime = createRuntime;
    this.#logger = logger;
    this.#env = env;
    this.#diagnostics = createConnectionDiagnostics({ channel: 'siri', logger });
  }

  get diagnostics() { return this.#diagnostics; }

  #serial(task) {
    const run = this.#transition.catch(() => undefined).then(task);
    this.#transition = run;
    return run;
  }

  async #ensureApiKey() {
    const config = this.#configStore.get();
    const fromEnv = typeof this.#env?.SIRI_API_KEY === 'string' ? this.#env.SIRI_API_KEY.trim() : '';
    if (fromEnv) return fromEnv;
    const stored = await this.#credentials.resolve(config.apiKeyRef);
    if (typeof stored === 'string' && stored) return stored;
    const created = generateApiKey();
    await this.#credentials.set(config.apiKeyRef, created);
    return created;
  }

  async initialize() {
    return this.#serial(async () => {
      if (this.#closed) return this.status();
      const config = this.#configStore.get();
      if (!config.enabled) {
        await this.#stopRuntime();
        return this.status();
      }
      if (this.#runtime?.status?.ready) return this.status();
      try {
        this.#apiKey = await this.#ensureApiKey();
        await this.#stopRuntime();
        const runtime = await this.#createRuntime({
          config, getApiKey: () => this.#apiKey,
        });
        await runtime.start();
        this.#runtime = runtime;
        this.#error = null;
      } catch (error) {
        this.#error = this.#diagnostics.report(error, {
          reuse: true, stage: 'connection.start',
          publicError: {
            code: error?.code === 'EADDRINUSE' ? 'port-in-use' : 'connection-failed',
            message: error?.code === 'EADDRINUSE'
              ? `端口 ${config.port} 已被占用，请在 Siri 设置里换一个端口。`
              : 'Siri 接口启动失败，插件会自动重试。',
          },
        }).publicError;
      }
      return this.status();
    });
  }

  status() {
    const config = this.#configStore.get();
    const runtimeStatus = this.#runtime?.status ?? { ready: false, listening: false, port: null };
    const connected = Boolean(runtimeStatus.ready);
    return {
      bots: [{
        botId: SIRI_BOT_ID,
        name: config.name,
        enabled: config.enabled,
        connected,
        host: config.host,
        port: config.port,
        timeoutMs: config.timeoutMs,
        guidance: config.guidance,
        rateLimitPerMinute: config.rateLimitPerMinute,
        allowedAddresses: config.allowedAddresses,
        apiKey: this.#apiKey || null,
        endpoint: `http://<本机地址>:${config.port}/siri`,
        ...(this.#error && config.enabled ? { error: this.#error } : {}),
      }],
      totals: { configured: config.enabled ? 1 : 0, connected: connected ? 1 : 0 },
    };
  }

  async updateSettings({ port, host, timeoutMs, enabled, name, guidance, rateLimitPerMinute, allowedAddresses } = {}) {
    const patch = {};
    if (port !== undefined) {
      if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new TypeError('Invalid Siri port');
      patch.port = port;
    }
    if (host !== undefined) {
      if (typeof host !== 'string' || !host.trim()) throw new TypeError('Invalid Siri host');
      patch.host = host.trim();
    }
    if (timeoutMs !== undefined) {
      if (timeoutMs !== null && (!Number.isSafeInteger(timeoutMs)
        || timeoutMs < MIN_SIRI_TIMEOUT_MS || timeoutMs > MAX_SIRI_TIMEOUT_MS)) {
        throw new TypeError('Invalid Siri timeout');
      }
      patch.timeoutMs = timeoutMs;
    }
    if (enabled !== undefined) patch.enabled = enabled === true;
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > MAX_SIRI_ALIAS_LENGTH) {
        throw new TypeError('Invalid Siri name');
      }
      patch.name = name.trim();
    }
    if (guidance !== undefined) {
      if (typeof guidance !== 'string' || guidance.length > MAX_SIRI_GUIDANCE_LENGTH) {
        throw new TypeError('Invalid Siri guidance');
      }
      patch.guidance = guidance;
    }
    if (rateLimitPerMinute !== undefined) {
      if (!Number.isSafeInteger(rateLimitPerMinute) || rateLimitPerMinute < 0
        || rateLimitPerMinute > MAX_SIRI_RATE_PER_MINUTE) throw new TypeError('Invalid Siri rate limit');
      patch.rateLimitPerMinute = rateLimitPerMinute;
    }
    if (allowedAddresses !== undefined) {
      if (!Array.isArray(allowedAddresses) || !allowedAddresses.every(validSiriAllowedAddress)) {
        throw new TypeError('Invalid Siri allowed address');
      }
      patch.allowedAddresses = allowedAddresses;
    }
    await this.#serial(async () => {
      await this.#configStore.save(patch);
      await this.#stopRuntime();
    });
    return this.initialize();
  }

  /** DS Bot binding lives with the workspace store, so the Host hands a service in. */
  attachDsBotService(service) { this.#dsBot = service; }

  #dsBotService() {
    if (!this.#dsBot) throw Object.assign(new Error('DS Bot is unavailable'), { code: 'ds-bot-unavailable' });
    return this.#dsBot;
  }

  dsBotStatus() { return this.#dsBotService().status(); }
  bindDsBot(dsBotId) { return this.#dsBotService().bind(dsBotId); }
  unbindDsBot() { return this.#dsBotService().unbind(); }

  async resetApiKey() {
    await this.#serial(async () => {
      const { apiKeyRef } = this.#configStore.get();
      this.#apiKey = generateApiKey();
      await this.#credentials.set(apiKeyRef, this.#apiKey);
    });
    return this.status();
  }

  /** The Siri channel has one entry point, so a reconnect is a restart of its listener. */
  async reconnect() {
    await this.#serial(() => this.#stopRuntime());
    return this.initialize();
  }

  async #stopRuntime() {
    const runtime = this.#runtime;
    this.#runtime = null;
    await runtime?.stop();
  }

  async close() {
    this.#closed = true;
    await this.#serial(() => this.#stopRuntime());
  }
}

export { DEFAULT_SIRI_PORT };
