// turn-answer.mjs — read the outcome of a Session turn out of its history.
//
// A DS Bot question is answered by queueing a follow-up on the Bot's own
// Session, so the answer to that follow-up never passes through a prompt we
// sent. It is read back from the Session history instead: the first turn that
// starts after a known turn number, and the text of its last assistant step.

import { textFromHarnessContent } from '../shared/harness-client.mjs';

function orderedEvents(history) {
  const list = Array.isArray(history?.events) ? history.events : Array.isArray(history) ? history : [];
  return list
    .map((entry) => entry?.event ?? entry)
    .filter((event) => event && typeof event === 'object' && Number.isSafeInteger(event.seq) && event.seq >= 0)
    .sort((left, right) => left.seq - right.seq);
}

/** Highest turn number the history shows, or -1 for an empty Session. */
export function latestTurnNumber(history) {
  let latest = -1;
  for (const event of orderedEvents(history)) {
    if ((event.type === 'turn/start' || event.type === 'turn/end') && Number.isSafeInteger(event.data?.turn)) {
      latest = Math.max(latest, event.data.turn);
    }
  }
  return latest;
}

/**
 * State of the first turn after `afterTurn`:
 * `waiting` (not started), `running`, `done` (completed, with `text`) or `failed`.
 */
export function followUpOutcome(history, afterTurn) {
  const events = orderedEvents(history);
  const started = events
    .filter((event) => event.type === 'turn/start' && Number.isSafeInteger(event.data?.turn) && event.data.turn > afterTurn)
    .map((event) => event.data.turn);
  if (started.length === 0) return { state: 'waiting' };
  const turn = Math.min(...started);
  const end = events.find((event) => event.type === 'turn/end' && event.data?.turn === turn);
  if (!end) return { state: 'running', turn };
  const reason = typeof end.data?.reason === 'string' ? end.data.reason : end.data?.reason?.kind;
  const steps = new Map();
  for (const event of events) {
    if (event.type !== 'assistant/message' || event.data?.turn !== turn || event.data?.interrupted === true) continue;
    steps.set(Number.isSafeInteger(event.data?.step) ? event.data.step : -1,
      textFromHarnessContent(event.data?.message?.content));
  }
  const texts = [...steps.entries()].sort((left, right) => left[0] - right[0])
    .map(([, text]) => text).filter(Boolean);
  return {
    state: reason === 'completed' ? 'done' : 'failed',
    turn, reason: reason ?? null, text: texts.at(-1) ?? '',
  };
}
