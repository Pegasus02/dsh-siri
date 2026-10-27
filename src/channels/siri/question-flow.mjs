// question-flow.mjs — a DS Bot's ask_user card, spoken and answered by voice.
//
// ask_user ends the Bot's turn and stores a card (question, options). Siri
// reads the card out after the turn; the next thing the caller says is taken
// as the answer to that card, handed to the Bot, and the Bot's follow-up turn
// is read back the same way.

import { followUpOutcome, latestTurnNumber } from './turn-answer.mjs';

const DIGITS = new Map(Object.entries({
  '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
}));
const SPOKEN_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
const FILLER = /选择|选项|选|第|个|项|号|条|我|要|就|吧|的|和|跟|与|还有|以及|还|再|、|，|,|。|\.|\s/gu;

/** How the card sounds when read out. */
export function speakQuestion(card) {
  const lines = [String(card.question ?? '').trim()];
  if (card.detail) lines.push(String(card.detail).trim());
  const options = Array.isArray(card.options) ? card.options : [];
  if (options.length > 0) {
    lines.push(`选项有：${options.map((option, index) => `第${SPOKEN_NUMBERS[index] ?? index + 1}，${option.label}`).join('；')}。`);
    lines.push(card.multiSelect === true
      ? '可以选多个，说出序号或内容，也可以直接说你的想法。'
      : '请说出选项序号或内容，也可以直接说你的想法。');
  } else {
    lines.push('请直接说出你的回答。');
  }
  return lines.filter(Boolean).join('\n');
}

function indexesFrom(text, count) {
  const rest = text.replace(FILLER, '');
  if (!rest || !/^[0-9一二两三四五六七八九十]+$/u.test(rest)) return null;
  const found = [];
  const pattern = /[0-9]{1,2}|十|[一二两三四五六七八九]/gu;
  for (const match of text.replace(FILLER, ' ').matchAll(pattern)) {
    const value = /^[0-9]+$/u.test(match[0]) ? Number(match[0]) : DIGITS.get(match[0]);
    if (value >= 1 && value <= count) found.push(value - 1);
    else return null;
  }
  return found.length > 0 ? [...new Set(found)] : null;
}

/** What the caller said, as the answer object a DS Bot card takes. */
export function parseSpokenAnswer(card, spoken) {
  const text = String(spoken ?? '').trim();
  const options = Array.isArray(card.options) ? card.options : [];
  if (options.length > 0) {
    const byNumber = text.length <= 16 ? indexesFrom(text, options.length) : null;
    const chosen = byNumber
      ?? (() => {
        const lower = text.toLowerCase();
        const hits = options.map((option, index) => ({ index, label: String(option.label ?? '').toLowerCase() }))
          .filter(({ label }) => label && (lower.includes(label) || (lower.length >= 2 && label.includes(lower))))
          .map(({ index }) => index);
        return hits.length > 0 ? hits : null;
      })();
    if (chosen) {
      const picked = card.multiSelect === true ? chosen : chosen.slice(0, 1);
      return { selected: picked.map((index) => options[index].label) };
    }
  }
  return { selected: [], custom: text };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createSiriQuestionFlow({ dsBot, harness, sessionOf, pollMs = 1_000, logger = console }) {
  const history = (sessionId) => harness.readSessionHistory(sessionId, { maxMessages: 100 });

  /** The open question of the DS Bot a conversation is bound to, or null. */
  async function pending(conversationKey) {
    if (!dsBot || typeof dsBot.question !== 'function') return null;
    const sessionId = sessionOf(conversationKey);
    if (!sessionId) return null;
    try {
      const card = await dsBot.question(sessionId);
      return card ? { conversationKey, sessionId, card } : null;
    } catch (error) {
      logger.warn?.('Siri could not read the DS Bot question:', error?.code ?? error?.message ?? error);
      return null;
    }
  }

  /**
   * Hand the caller's words to the Bot as the answer and return what the Bot
   * says next (its follow-up, plus the next question when it asks one).
   * Returns null when the card is gone, so the words are treated as a new message.
   */
  async function answer(open, spoken, { waitMs = 600_000 } = {}) {
    const { sessionId, card } = open;
    const baseline = latestTurnNumber(await history(sessionId));
    const given = parseSpokenAnswer(card, spoken);
    try {
      await dsBot.answerQuestion(sessionId, card.id, { id: card.id, ...given });
    } catch (error) {
      if (error?.code === 'interaction-not-pending') return null;
      throw error;
    }
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await sleep(pollMs);
      const outcome = followUpOutcome(await history(sessionId), baseline);
      if (outcome.state === 'failed') {
        throw Object.assign(new Error('DS Bot follow-up turn failed'), { code: 'turn-failed' });
      }
      if (outcome.state === 'done') {
        const next = await pending(open.conversationKey);
        return [outcome.text, next ? speakQuestion(next.card) : ''].filter(Boolean).join('\n\n');
      }
    }
    throw Object.assign(new Error('DS Bot follow-up turn timed out'), { code: 'turn-timeout' });
  }

  return Object.freeze({ pending, answer, speak: speakQuestion });
}
