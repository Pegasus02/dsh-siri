import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const SIRI_BOT_ID = 'siri-default';
/** Credential refs must match the credential store's /^[A-Za-z_][A-Za-z0-9_]*$/ rule. */
export const SIRI_API_KEY_REF = 'DSH_SIRI_API_KEY';
const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const SIRI_CONVERSATION_KEY = 'direct:siri';
export const DEFAULT_SIRI_PORT = 8000;
export const DEFAULT_SIRI_HOST = '0.0.0.0';
export const MAX_SIRI_GUIDANCE_LENGTH = 2_000;
export const MAX_SIRI_ALIAS_LENGTH = 80;
export const MAX_SIRI_RATE_PER_MINUTE = 600;
export const MIN_SIRI_TIMEOUT_MS = 1_000;
export const MAX_SIRI_TIMEOUT_MS = 120_000;

function portOrDefault(value) {
  const port = Number(value);
  return Number.isSafeInteger(port) && port > 0 && port < 65_536 ? port : DEFAULT_SIRI_PORT;
}

function timeoutOrNull(value) {
  const timeout = Number(value);
  return Number.isSafeInteger(timeout)
    && timeout >= MIN_SIRI_TIMEOUT_MS && timeout <= MAX_SIRI_TIMEOUT_MS ? timeout : null;
}

/** One IPv4 address or IPv4 CIDR block, or one IPv6 address. */
export function validSiriAllowedAddress(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/u.exec(text);
  if (v4) {
    return v4.slice(1, 5).every((part) => Number(part) <= 255)
      && (v4[5] === undefined || Number(v4[5]) <= 32);
  }
  return /^[0-9a-fA-F:]+$/u.test(text) && text.includes(':') && text.length <= 45;
}

function allowedAddresses(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(validSiriAllowedAddress).map((item) => item.trim()))].slice(0, 64);
}

export function normalizeSiriConfig(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    botId: SIRI_BOT_ID,
    name: typeof source.name === 'string' && source.name.trim()
      ? source.name.trim().slice(0, MAX_SIRI_ALIAS_LENGTH) : 'Siri',
    guidance: typeof source.guidance === 'string' ? source.guidance.trim().slice(0, MAX_SIRI_GUIDANCE_LENGTH) : '',
    rateLimitPerMinute: Number.isSafeInteger(source.rateLimitPerMinute)
      && source.rateLimitPerMinute >= 0 && source.rateLimitPerMinute <= MAX_SIRI_RATE_PER_MINUTE
      ? source.rateLimitPerMinute : 0,
    allowedAddresses: allowedAddresses(source.allowedAddresses),
    enabled: source.enabled !== false,
    host: typeof source.host === 'string' && source.host.trim() ? source.host.trim() : DEFAULT_SIRI_HOST,
    port: portOrDefault(source.port),
    timeoutMs: timeoutOrNull(source.timeoutMs),
    apiKeyRef: typeof source.apiKeyRef === 'string' && CREDENTIAL_REF.test(source.apiKeyRef)
      ? source.apiKeyRef : SIRI_API_KEY_REF,
    createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(),
  };
}

/** The one Siri entry point's settings. The API key itself lives in the credential store. */
export class SiriConfigStore {
  #path;
  #config = normalizeSiriConfig(null);
  #writeQueue = Promise.resolve();

  constructor(path) { this.#path = path; }

  async load() {
    try {
      this.#config = normalizeSiriConfig(JSON.parse(await readFile(this.#path, 'utf8')));
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.#config = normalizeSiriConfig(null);
      await this.#persist();
    }
    return this;
  }

  get() { return structuredClone(this.#config); }

  async save(patch) {
    this.#config = normalizeSiriConfig({ ...this.#config, ...patch });
    await this.#persist();
    return this.get();
  }

  async #persist() {
    const snapshot = `${JSON.stringify(this.#config, null, 2)}\n`;
    const operation = this.#writeQueue.then(async () => {
      await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
      const temporary = `${this.#path}.tmp`;
      await writeFile(temporary, snapshot, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.#path);
    });
    this.#writeQueue = operation.then(() => undefined, () => undefined);
    await operation;
  }
}
