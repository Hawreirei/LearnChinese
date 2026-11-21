// Buku kesalahan / 错题本 (issue #25): questions answered wrong come back until they are answered right twice,
// on two different days. Pure logic over the saved book { "<question id>": entry }; no DOM.
//
// entry = { added, due, streak, src, day }
//   added   time first put in the book
//   due     start of the local day from which it is shown again
//   streak  correct answers in a row (each on a new day)
//   src     where it came from: "practice" | "lesson" | "exam" | "manual"
//   day     local day ("YYYY-MM-DD") of the last answer that counted, so two right answers on one day count once

import { dayKeyOf } from "./plan.js";

export const MAX_MISTAKES = 500;
/** Days until the next showing: after a wrong answer, then after the first right one. Two right answers = out. */
export const AFTER_WRONG_DAYS = 1;
export const AFTER_RIGHT_DAYS = 3;
export const RIGHT_TO_CLEAR = 2;

/** Start of the local day `days` after the day of `t`. */
export function dayStart(t, days = 0) {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

const srcOf = (id, k) => (k === "exam" ? "exam" : String(id).startsWith("ls-") ? "lesson" : "practice");

/** Keep the book within MAX_MISTAKES by dropping the entries added first. */
function trim(book) {
  const ids = Object.keys(book);
  if (ids.length <= MAX_MISTAKES) return book;
  const drop = new Set(ids.sort((a, b) => book[a].added - book[b].added).slice(0, ids.length - MAX_MISTAKES));
  return Object.fromEntries(Object.entries(book).filter(([id]) => !drop.has(id)));
}

/** Put a question in the book (or send it back to the start if it is already there). */
export function addMistake(book, id, t = Date.now(), src = "manual") {
  const prev = book[id];
  return trim({ ...book, [id]: { added: prev?.added ?? t, due: dayStart(t, AFTER_WRONG_DAYS), streak: 0, src: prev?.src ?? src, day: dayKeyOf(t) } });
}

export function removeMistake(book, id) {
  if (!book[id]) return book;
  const { [id]: _, ...rest } = book;
  return rest;
}

/** Apply one recorded answer { id, ok, t, k, un }. Wrong → into the book (or back to the start).
 *  Right → counts only for questions already in the book, at most once per day; the second one removes it.
 *  Unanswered exam items (time ran out) and speaking are ignored. */
export function applyAnswer(book, { id, ok, t = Date.now(), k = "practice", un = false, skill = null }) {
  if (id == null || un || skill === "speaking") return book;
  if (!ok) return addMistake(book, id, t, srcOf(id, k));
  const e = book[id];
  if (!e) return book;
  const day = dayKeyOf(t);
  if (day === e.day) return book;                                      // same day as the mistake or the last right answer
  const streak = e.streak + 1;
  if (streak >= RIGHT_TO_CLEAR) return removeMistake(book, id);
  return { ...book, [id]: { ...e, streak, day, due: dayStart(t, AFTER_RIGHT_DAYS) } };
}

/** Ids due now, oldest due first (ties: added first). */
export function dueIds(book, now = Date.now()) {
  return Object.entries(book).filter(([, e]) => e.due <= now)
    .sort((a, b) => a[1].due - b[1].due || a[1].added - b[1].added).map(([id]) => id);
}

/** Every id in the book, the ones due soonest first. */
export function allIds(book) {
  return Object.entries(book).sort((a, b) => a[1].due - b[1].due || a[1].added - b[1].added).map(([id]) => id);
}

/** Questions for a session: ids looked up in `index` (Map id → question). Ids whose question no longer exists
 *  (the bank changed) are skipped. */
export function mistakeQuestions(ids, index, limit = Infinity) {
  const out = [];
  for (const id of ids) {
    const q = index.get(id);
    if (q) out.push(q);
    if (out.length >= limit) break;
  }
  return out;
}

/** Counts for buttons: { total, due } over questions that still exist. */
export function mistakeCounts(book, index, now = Date.now()) {
  const ids = Object.keys(book).filter((id) => index.has(id));
  return { total: ids.length, due: ids.filter((id) => book[id].due <= now).length };
}

/** id → question for every question the book can hold: the practice bank, lesson questions and grammar drills. */
export function indexQuestions(questions, lessons = [], grammar = []) {
  const all = [...questions, ...lessons.flatMap((l) => Object.values(l.steps ?? {}).flat()), ...grammar.flatMap((p) => p.drills ?? [])];
  return new Map(all.filter((q) => q?.id).map((q) => [q.id, q]));
}
