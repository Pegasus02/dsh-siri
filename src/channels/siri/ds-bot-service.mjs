// ds-bot-service.mjs — which DS Bot the Siri entry point talks to.
//
// Siri has one default conversation (`direct:siri`). Binding it to a DS Bot
// makes that conversation use the Bot's own Session, so the Bot's memory and
// role carry over. A request can also name a Bot of its own: that Bot gets a
// conversation key of its own (`direct:siri:<id>`), bound the same way.

import { SIRI_BOT_ID, SIRI_CONVERSATION_KEY } from './config-store.mjs';
import { withSessionBindingLock } from '../shared/session-binding-lock.mjs';

const BOT_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export const DS_BOT_ERROR_MESSAGES = Object.freeze({
  'ds-bot-unavailable': '暂时无法读取 DS Bot，请检查 DS Bot 插件是否已安装并启用。',
  'ds-bot-not-found': '所选 DS Bot 已不存在，请刷新后重新选择。',
  'ds-bot-binding-conflict': '所选 DS Bot 已被占用，请刷新后重试。',
});

function dsError(code) {
  return Object.assign(new Error(code), { code });
}

export function createSiriDsBotService({ workspaces, state, dsBot }) {
  const defaultBinding = () => workspaces.dsBotBindingFor(SIRI_BOT_ID, SIRI_CONVERSATION_KEY);
  const readBots = async () => (dsBot ? dsBot.status() : { state: 'unavailable', bots: [] });

  async function status() {
    const result = await readBots();
    return {
      state: result.state,
      bots: result.bots.map(({ id, name, color, avatar }) => ({
        id, name, ...(color ? { color } : {}), ...(avatar ? { avatar } : {}),
      })),
      boundId: defaultBinding()?.dsBotId ?? null,
    };
  }

  async function bind(dsBotId) {
    if (!dsBot) throw dsError('ds-bot-unavailable');
    if (typeof dsBotId !== 'string' || !BOT_ID.test(dsBotId)) throw dsError('ds-bot-not-found');
    await withSessionBindingLock(state, SIRI_CONVERSATION_KEY, async () => {
      const current = defaultBinding();
      if (current?.dsBotId === dsBotId) return;
      const bot = await dsBot.resolve(dsBotId);
      const previousSession = state.sessionFor(SIRI_CONVERSATION_KEY);
      // A Bot is bound once: release the per-request key that already holds it.
      for (const binding of workspaces.listDsBotBindings(SIRI_BOT_ID)) {
        if (binding.dsBotId === dsBotId && binding.conversationKey !== SIRI_CONVERSATION_KEY) {
          await workspaces.setDsBotBinding(SIRI_BOT_ID, binding.conversationKey, null);
          await state.clearSession(binding.conversationKey);
        }
      }
      if (current) await workspaces.setDsBotBinding(SIRI_BOT_ID, SIRI_CONVERSATION_KEY, null);
      await state.setSession(SIRI_CONVERSATION_KEY, bot.sessionId);
      try {
        await workspaces.setDsBotBinding(SIRI_BOT_ID, SIRI_CONVERSATION_KEY, dsBotId);
      } catch (error) {
        if (previousSession) await state.setSession(SIRI_CONVERSATION_KEY, previousSession);
        else await state.clearSession(SIRI_CONVERSATION_KEY);
        throw error;
      }
    });
    return status();
  }

  async function unbind() {
    await withSessionBindingLock(state, SIRI_CONVERSATION_KEY, async () => {
      if (!defaultBinding()) return;
      await state.clearSession(SIRI_CONVERSATION_KEY);
      await workspaces.setDsBotBinding(SIRI_BOT_ID, SIRI_CONVERSATION_KEY, null);
    });
    return status();
  }

  /** The conversation key a request that names a Bot (id or name) runs in. */
  async function conversationFor(selector) {
    if (!dsBot) throw dsError('ds-bot-unavailable');
    const wanted = typeof selector === 'string' ? selector.trim() : '';
    if (!wanted) throw dsError('ds-bot-not-found');
    const result = await dsBot.status();
    if (result.state !== 'ready') throw dsError('ds-bot-unavailable');
    const lower = wanted.toLowerCase();
    const partial = result.bots.filter((entry) => entry.name.toLowerCase().includes(lower));
    const bot = result.bots.find((entry) => entry.id === wanted)
      ?? result.bots.find((entry) => entry.name.toLowerCase() === lower)
      ?? (partial.length === 1 ? partial[0] : undefined);
    if (!bot) throw dsError('ds-bot-not-found');
    const held = workspaces.listDsBotBindings(SIRI_BOT_ID).find((binding) => binding.dsBotId === bot.id);
    const key = held?.conversationKey ?? `${SIRI_CONVERSATION_KEY}:${bot.id}`;
    return withSessionBindingLock(state, key, async () => {
      if (!held) await workspaces.setDsBotBinding(SIRI_BOT_ID, key, bot.id);
      if (state.sessionFor(key) !== bot.sessionId) await state.setSession(key, bot.sessionId);
      return key;
    });
  }

  /** The DS Bot Session a conversation uses, or null when it is not bound to a Bot. */
  const sessionOf = (conversationKey) => (
    workspaces.dsBotBindingFor(SIRI_BOT_ID, conversationKey) ? state.sessionFor(conversationKey) ?? null : null
  );

  return Object.freeze({ status, bind, unbind, conversationFor, sessionOf });
}
