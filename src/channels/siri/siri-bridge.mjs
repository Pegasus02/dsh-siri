// siri-bridge.mjs — the wire-level pieces of the Siri (iPhone 快捷指令) bridge.
//
// A spoken request is an ordinary direct message as far as the Session is
// concerned: same bot workspace, same Session binding, therefore the same
// history and memory. What it cannot be is an ordinary channel turn — the caller
// has to receive the answer as text synchronously, while the Session still keeps a
// complete transcript. This module holds the parts of that contract that need no
// runtime: what a prompt may be, how long the caller waits, and how an answer is
// made readable out loud.

/** How long the HTTP caller waits before the bridge answers "still working". */
export const SIRI_REPLY_BUDGET_MS = 26_000;

/** Longest prompt accepted from the Shortcut; longer text is truncated. */
export const SIRI_MAX_PROMPT_CHARS = 4_000;

/** A spoken answer longer than this is cut at a sentence boundary. */
export const SIRI_MAX_SPEECH_CHARS = 1_200;

/** Sentinel result: the turn outlived the caller's budget. */
export const SIRI_PENDING = Symbol('siri-pending');

/** Spoken answer when the turn is still running. */
export const SIRI_PENDING_REPLY = '这个任务还在处理，稍后对我说“刚才的结果”就能听到。';

/** Spoken answer when a finished turn produced no prose at all. */
export const SIRI_EMPTY_REPLY = '这一轮已经处理完了，没有需要念出来的内容。';

/** Spoken answer when the turn failed; the log carries the detail. */
export const SIRI_FAILURE_REPLY = '抱歉，这次没能处理成功，请稍后再试。';

/** Emoji, pictographs, regional flags and the invisible joiners that build them. */
const EMOJI_PATTERN = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{2122}\u{2139}\u{E0020}-\u{E007F}]/gu;

/** A markdown link or image target: balanced one level of parentheses at most. */
const LINK_TARGET = String.raw`\((?:[^()\s]|\([^()]*\))*\)`;

/**
 * Normalise the spoken prompt.
 *
 * Returns null when nothing is left to ask, which the caller reports as an empty
 * request instead of spending a turn on whitespace.
 */
export function normalizeSiriPrompt(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/gu, '\n').trim();
  if (!text) return null;
  return text.length > SIRI_MAX_PROMPT_CHARS ? text.slice(0, SIRI_MAX_PROMPT_CHARS) : text;
}

/**
 * Turn a channel answer into text that reads well aloud.
 *
 * Siri speaks the string, so the shape of a chat reply is wrong here: code
 * blocks are formatting rather than content, links keep their label, and emoji
 * are noise in speech. The result is plain prose, cut at a sentence when it is
 * too long to listen to.
 */
export function toSpeechText(value) {
  if (typeof value !== 'string') return '';
  let text = value.replace(/\r\n?/gu, '\n');
  // A code block is dropped whole: its indentation and symbols carry the meaning.
  text = text.replace(/```[^\n]*\n?[\s\S]*?```/gu, ' ');
  text = text.replace(/~~~[^\n]*\n?[\s\S]*?~~~/gu, ' ');
  text = text.replace(/`([^`\n]*)`/gu, '$1');
  text = text.replace(new RegExp(`!\\[[^\\]]*\\]${LINK_TARGET}`, 'gu'), ' ');
  text = text.replace(new RegExp(`\\[([^\\]]*)\\]${LINK_TARGET}`, 'gu'), '$1');
  text = text.replace(/^\s{0,3}#{1,6}\s+/gmu, '');
  text = text.replace(/^\s{0,3}>\s?/gmu, '');
  text = text.replace(/^\s{0,3}(?:[-*+•]|\d{1,3}[.)])\s+/gmu, '');
  // A markdown table's rule line and pipes are separators, not words.
  text = text.replace(/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gmu, ' ');
  text = text.replace(/\|/gu, ' ');
  text = text.replace(/\*\*|__|~~|[*_]/gu, '');
  text = text.replace(EMOJI_PATTERN, '');
  text = text.replace(/[ \t\u00a0]+/gu, ' ');
  text = text.replace(/\n[ ]*\n+/gu, '\n');
  text = text.trim();
  if (!text) return '';
  return clipAtSentence(text, SIRI_MAX_SPEECH_CHARS);
}

/** Cut at the last sentence break when one is near the end, else hard-cut. */
function clipAtSentence(text, limit) {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const cut = Math.max(
    window.lastIndexOf('。'), window.lastIndexOf('，'), window.lastIndexOf('！'),
    window.lastIndexOf('？'), window.lastIndexOf('；'), window.lastIndexOf(';'),
    window.lastIndexOf('.'), window.lastIndexOf('!'), window.lastIndexOf('?'),
    window.lastIndexOf('\n'),
  );
  if (cut > limit / 3) return window.slice(0, cut + 1).trim();
  return `${window.trim()}…`;
}
