import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyAnswer, addMistake, removeMistake, dueIds, allIds, mistakeQuestions, mistakeCounts, indexQuestions, dayStart, MAX_MISTAKES } from "../../app/js/mistakes.js";
import { Store } from "../../app/js/store.js";

const at = (d, hh = 10) => new Date(2026, 10, d, hh).getTime();       // November 2026, local time
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test("wrong answer: into the book, due the next day", () => {
  const b = applyAnswer({}, { id: "c1", ok: false, t: at(17, 21) });
  assert.deepEqual(b.c1, { added: at(17, 21), due: dayStart(at(17), 1), streak: 0, src: "practice", day: "2026-11-17" });
  assert.deepEqual(dueIds(b, at(17, 23)), []);
  assert.deepEqual(dueIds(b, at(18, 0)), ["c1"]);
  assert.equal(applyAnswer({}, { id: "ls-sapaan-l1", ok: false, t: at(17) })["ls-sapaan-l1"].src, "lesson");
  assert.equal(applyAnswer({}, { id: "c2", ok: false, t: at(17), k: "exam" }).c2.src, "exam");
});

test("right answers: once per day, not on the day of the mistake; two in a row clear it", () => {
  let b = applyAnswer({}, { id: "c1", ok: false, t: at(17, 9) });
  b = applyAnswer(b, { id: "c1", ok: true, t: at(17, 20) });                   // same day as the mistake: ignored
  assert.equal(b.c1.streak, 0);
  b = applyAnswer(b, { id: "c1", ok: true, t: at(18) });                       // first right on a new day
  assert.deepEqual([b.c1.streak, b.c1.due, b.c1.day], [1, dayStart(at(18), 3), "2026-11-18"]);
  b = applyAnswer(b, { id: "c1", ok: true, t: at(18, 22) });                   // same day again: ignored
  assert.equal(b.c1.streak, 1);
  b = applyAnswer(b, { id: "c1", ok: true, t: at(21) });                       // second right on another day: out
  assert.equal(b.c1, undefined);
});

test("a wrong answer resets the streak; added time and source are kept", () => {
  let b = applyAnswer({}, { id: "c1", ok: false, t: at(10) });
  b = applyAnswer(b, { id: "c1", ok: true, t: at(11) });
  b = applyAnswer(b, { id: "c1", ok: false, t: at(14), k: "exam" });
  assert.deepEqual(b.c1, { added: at(10), due: dayStart(at(14), 1), streak: 0, src: "practice", day: "2026-11-14" });
});

test("ignored: right answers for questions not in the book, blanks, speaking, no id", () => {
  assert.deepEqual(applyAnswer({}, { id: "c1", ok: true, t: at(17) }), {});
  assert.deepEqual(applyAnswer({}, { id: "c1", ok: false, un: true, t: at(17) }), {});
  assert.deepEqual(applyAnswer({}, { id: "ls-x-s1", ok: false, skill: "speaking", t: at(17) }), {});
  assert.deepEqual(applyAnswer({}, { id: null, ok: false, t: at(17) }), {});
});

test("manual add / remove, order, cap", () => {
  let b = addMistake({}, "c2", at(12), "manual");
  b = addMistake(b, "c1", at(10));
  assert.equal(b.c2.src, "manual");
  assert.deepEqual(allIds(b), ["c1", "c2"]);
  assert.deepEqual(dueIds(b, at(20)), ["c1", "c2"]);
  assert.deepEqual(removeMistake(b, "c1"), { c2: b.c2 });
  assert.equal(removeMistake(b, "zz"), b);
  let big = {};
  for (let i = 0; i < MAX_MISTAKES + 5; i++) big = addMistake(big, `c${i}`, at(1) + i);
  assert.equal(Object.keys(big).length, MAX_MISTAKES);
  assert.equal(big.c0, undefined, "oldest dropped");
  assert.ok(big[`c${MAX_MISTAKES + 4}`]);
});

test("questions that left the bank are skipped", () => {
  const Q = JSON.parse(readFileSync(new URL("../../data/hsk3/questions.json", import.meta.url), "utf-8"));
  const L = JSON.parse(readFileSync(new URL("../../data/hsk3/lessons.json", import.meta.url), "utf-8"));
  const index = indexQuestions(Q, L);
  assert.ok(index.get("c1") && index.get("ls-sapaan-l1"), "bank and lesson questions are indexed");
  let b = addMistake({}, "c1", at(10));
  b = addMistake(b, "gone-1", at(10));
  b = addMistake(b, "ls-sapaan-l1", at(16));
  assert.deepEqual(mistakeQuestions(allIds(b), index).map((q) => q.id), ["c1", "ls-sapaan-l1"]);
  assert.deepEqual(mistakeQuestions(allIds(b), index, 1).map((q) => q.id), ["c1"]);
  assert.deepEqual(mistakeCounts(b, index, at(16, 12)), { total: 2, due: 1 });
});

test("Store.recordAnswer keeps the book up to date and it survives export/import", () => {
  const s = new Store(mem());
  s.recordAnswer("reading", false, { k: "practice", id: "c1", t: at(17) });
  s.recordAnswer("reading", true, { k: "practice", id: "c2", t: at(17) });
  s.recordAnswer("listening", false, { k: "exam", id: "l3", t: at(17), un: true });
  s.recordAnswer("reading", true, { k: "practice", id: "c1", t: at(18), mb: true });
  assert.deepEqual(Object.keys(s.mistakes), ["c1"]);
  assert.equal(s.mistakes.c1.streak, 1);
  assert.equal(s.events.at(-1).mb, 1);
  s.addMistake("c9", at(18));
  const other = new Store(mem());
  other.import(s.export());
  assert.deepEqual(Object.keys(other.mistakes).sort(), ["c1", "c9"]);
  other.clearMistakes();
  assert.deepEqual(other.mistakes, {});
  s.removeMistake("c9");
  assert.deepEqual(Object.keys(s.mistakes), ["c1"]);
});
