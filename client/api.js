export const SIRI_RPC_CHANNEL = '/siri';
export const SIRI_ENDPOINTS = Object.freeze({
  status: 'connection.status',
  updateSettings: 'siri.settings.update',
  resetApiKey: 'siri.api-key.reset',
  reconnect: 'bot.reconnect',
});

/** Unwrap a management RPC result; throws an Error carrying the Host's message. */
export function unwrapSiriResult(result) {
  if (result?.ok === true) return result.value;
  const error = new Error(result?.error?.message || 'Siri 操作失败，请稍后重试。');
  error.code = result?.error?.code;
  throw error;
}

/** The one Siri entry point in a status snapshot, or null while the Host has none. */
export function siriBot(snapshot) {
  const bot = Array.isArray(snapshot?.bots) ? snapshot.bots[0] : null;
  return bot && typeof bot === 'object' ? bot : null;
}
