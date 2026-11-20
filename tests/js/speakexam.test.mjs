import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPaper, stepsOf, timeLeft, plannedMs, wordsUsed, openStats, rubricPct, summarize, RUBRIC } from "../../app/js/speakexam.js";
import { Store } from "../../app/js/store.js";

const SP = JSON.parse(readFileSync(new URL("../../data/hsk3/speaking.json", import.meta.url), "utf-8"));
const V = JSON.parse(readFileSync(new URL("../../data/hsk3/vocab.json", import.meta.url), "utf-8"));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test("HSK 3 speaking data: unofficial blueprint, enough items for several papers", () => {
  const d = SP["3"];
  assert.equal(d.blueprint.verified, false);
  for (const p of d.blueprint.parts) {
    const pool = { repeat_sentence: d.repeat, describe_picture: d.pictures, answer_question: d.questions }[p.type];
    assert.ok(pool.length >= 2 * p.count, p.id);
  }
});

test("buildPaper: counts from the blueprint, no repeats inside a paper", () => {
  const paper = buildPaper(SP["3"]);
  assert.deepEqual(paper.parts.map((p) => [p.id, p.items.length]), SP["3"].blueprint.parts.map((p) => [p.id, p.count]));
  for (const p of paper.parts) assert.equal(new Set(p.items.map((i) => i.id)).size, p.items.length);
});

test("stepsOf: phases per task type", () => {
  const steps = stepsOf(buildPaper(SP["3"]));
  const by = (t) => steps.find((s) => s.type === t).phases;
  assert.deepEqual(by("repeat_sentence"), [{ kind: "listen" }, { kind: "speak", ms: 15000 }]);
  assert.deepEqual(by("describe_picture"), [{ kind: "prep", ms: 15000 }, { kind: "speak", ms: 30000 }]);
  assert.deepEqual(by("answer_question"), [{ kind: "listen" }, { kind: "prep", ms: 180000 }, { kind: "speak", ms: 90000 }]);
  assert.equal(steps.length, 15);
  assert.deepEqual(steps.filter((s) => s.firstOfPart).map((s) => s.partId), ["S1", "S2", "S3"]);
  const mins = plannedMs(buildPaper(SP["3"])) / 60000;
  assert.ok(mins > 12 && mins < 18, String(mins));
});

test("timeLeft with a fake clock", () => {
  const ph = { kind: "prep", ms: 15000 };
  assert.deepEqual(timeLeft(ph, 1000, 1000), { leftMs: 15000, over: false });
  assert.deepEqual(timeLeft(ph, 1000, 11000), { leftMs: 5000, over: false });
  assert.deepEqual(timeLeft(ph, 1000, 16000), { leftMs: 0, over: true });
  assert.deepEqual(timeLeft(ph, 1000, 99000), { leftMs: 0, over: true });
});

test("open answer numbers: words used (longest match), speed", () => {
  const words = V.filter((w) => w.level <= 3);
  const used = wordsUsed("我最喜欢秋天，因为秋天不冷也不热。", words).map((w) => w.word);
  assert.ok(used.includes("秋天") && used.includes("因为") && used.includes("喜欢"));
  assert.ok(!used.includes("秋"), "longest match wins");
  const st = openStats("我最喜欢秋天，因为秋天不冷也不热。", 30000, words, 3);
  assert.equal(st.hanzi, 15);
  assert.equal(st.perMin, 30);
  assert.deepEqual(openStats("", 0, words, 3), { hanzi: 0, perMin: null, words: [], atLevel: 0 });
});

test("rubric and summary", () => {
  assert.equal(rubricPct({}), null);
  assert.equal(rubricPct({ pron: 3, fluency: 3, accuracy: 3 }), null);
  assert.equal(rubricPct(Object.fromEntries(RUBRIC.map((r) => [r.key, 3]))), 100);
  assert.equal(rubricPct({ pron: 1, fluency: 2, accuracy: 2, content: 3 }), 67);
  const results = [
    { type: "repeat_sentence", pct: 80 }, { type: "repeat_sentence", pct: 60 }, { type: "repeat_sentence" },
    { type: "describe_picture", transcript: "他在吃饭。", audio: "blob:x" }, { type: "answer_question", transcript: "" },
  ];
  const noRate = summarize(results);
  assert.deepEqual(noRate.repeat, { n: 3, scored: 2, pct: 70 });
  assert.deepEqual(noRate.open, { n: 2, answered: 1 });
  assert.equal(noRate.estimate, 70);
  const rated = summarize(results, { pron: 2, fluency: 2, accuracy: 2, content: 2 });   // 67% on 2 open items, 70% on 3 repeat items
  assert.equal(rated.rubricPct, 67);
  assert.equal(rated.estimate, Math.round((70 * 3 + 67 * 2) / 5));
  assert.equal(summarize([{ type: "repeat_sentence" }]).estimate, null);
});

test("Store.recordSpeaking replaces a record with the same time", () => {
  const s = new Store(mem());
  s.recordSpeaking({ t: 1, level: 3, estimate: null });
  s.recordSpeaking({ t: 1, level: 3, estimate: 70 });
  s.recordSpeaking({ t: 2, level: 3, estimate: 50 });
  assert.deepEqual(s.speakingExams.map((x) => [x.t, x.estimate]), [[1, 70], [2, 50]]);
});
