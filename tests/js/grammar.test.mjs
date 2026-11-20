import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pointOfQuestion, grammarProgress, statusOf, groupPoints, nextPoint, weakestPoints } from "../../app/js/grammar.js";
import { check } from "../../app/js/practice.js";
import { indexQuestions } from "../../app/js/mistakes.js";
import { optionKey } from "../../app/js/review.js";

const G = JSON.parse(readFileSync(new URL("../../data/hsk3/grammar.json", import.meta.url), "utf-8"));
const P = { id: "x", level: 1, seq: 1, drills: [1, 2, 3, 4, 5].map((n) => ({ id: `g-x-${n}` })) };

test("pointOfQuestion", () => {
  assert.equal(pointOfQuestion("g-hen-adj-3"), "hen-adj");
  assert.equal(pointOfQuestion("g-zai-place-12"), "zai-place");
  assert.equal(pointOfQuestion("c12"), null);
  assert.equal(pointOfQuestion(undefined), null);
});

test("progress: latest answer per drill counts; mastered needs all drills and >= 80%", () => {
  const ev = (n, ok, t) => ({ id: `g-x-${n}`, ok, t });
  assert.deepEqual(grammarProgress([P], [])["x"], { done: 0, total: 5, ok: 0, pct: null, mastered: false, t: null });
  let pr = grammarProgress([P], [ev(1, 0, 1), ev(1, 1, 2), ev(2, 1, 3)])["x"];
  assert.deepEqual([pr.done, pr.ok, pr.pct, pr.mastered, pr.t], [2, 2, 100, false, 3]);
  pr = grammarProgress([P], [1, 2, 3, 4, 5].map((n) => ev(n, n !== 5 ? 1 : 0, n)))["x"];
  assert.deepEqual([pr.pct, pr.mastered], [80, true]);
  pr = grammarProgress([P], [1, 2, 3, 4, 5].map((n) => ev(n, n < 4 ? 1 : 0, n)))["x"];
  assert.equal(pr.mastered, false);
  assert.equal(grammarProgress([P], [{ id: "g-x-1", ok: 1, t: 1, un: 1 }])["x"].done, 0, "unanswered exam items do not count");
  assert.equal(statusOf(null).key, "new");
  assert.equal(statusOf({ done: 5, total: 5, pct: 100, mastered: true }).key, "ok");
  assert.equal(statusOf({ done: 2, total: 5, pct: 50, mastered: false }).label, "50% benar (2/5 soal)");
});

test("groups and next point in teaching order", () => {
  const groups = groupPoints(G);
  assert.equal(groups[0].level, 1);
  assert.deepEqual(groups[0].points.slice(0, 2).map((p) => p.id), ["shi", "hen-adj"]);
  const pr = grammarProgress(G, []);
  assert.equal(nextPoint(G, pr, [1]).id, "shi");
  pr.shi.mastered = true;
  assert.equal(nextPoint(G, pr, [1]).id, "hen-adj");
});

/** Can `target` be built by using every piece exactly once? (backtracking; pieces are few) */
function canForm(pieces, target, used = new Set()) {
  if (used.size === pieces.length) return target === "";
  return pieces.some((p, i) => !used.has(i) && target.startsWith(p) && canForm(pieces, target.slice(p.length), new Set([...used, i])));
}

test("every drill: the key is right, every other option is wrong, order drills accept alt", () => {
  for (const p of G) for (const q of p.drills) {
    if (q.type === "order_sentence") {
      assert.ok(check(q, q.tokens).correct, q.id);
      for (const a of q.alt ?? []) {
        assert.ok(check(q, [...a]).correct, `${q.id} alt ${a}`);
        assert.ok(canForm(q.tokens, a), `${q.id}: alt ${a} cannot be built from the pieces`);
      }
      continue;
    }
    const keys = q.options.map(optionKey);
    assert.ok(keys.includes(q.answer), q.id);
    for (const o of q.options) assert.equal(check(q, o).correct, optionKey(o) === q.answer, `${q.id} ${optionKey(o)}`);
  }
});

test("grammar drills can be held by the buku kesalahan", () => {
  const index = indexQuestions([], [], G);
  assert.ok(index.get("g-shi-1"));
  assert.equal(index.size, G.reduce((a, p) => a + p.drills.length, 0));
});

test("weakest points: tagged bank items and the point's own drills, >= 3 answers, weakest first", () => {
  const pts = [{ id: "bi", title: "比", level: 2, drills: [] }, { id: "ba", title: "把", level: 3, drills: [] }];
  const index = new Map([["c1", { g: ["bi"] }], ["c2", { g: ["bi", "ba"] }], ["c3", {}]]);
  const ev = [
    { id: "c1", ok: 1 }, { id: "c1", ok: 0 }, { id: "c2", ok: 0 }, { id: "c3", ok: 0 },
    { id: "g-ba-1", ok: 1 }, { id: "g-ba-2", ok: 1 }, { id: "c2", ok: 0, un: 1 },
  ];
  assert.deepEqual(weakestPoints(ev, index, pts), [
    { id: "bi", title: "比", level: 2, n: 3, ok: 1, pct: 33 },
    { id: "ba", title: "把", level: 3, n: 3, ok: 2, pct: 67 },
  ]);
  assert.deepEqual(weakestPoints(ev, index, pts, 4), []);
});

test("HSK 2 and 3 points exist and every lesson link points to an existing point at or below its level", () => {
  const L = JSON.parse(readFileSync(new URL("../../data/hsk3/lessons.json", import.meta.url), "utf-8"));
  const byId = new Map(G.map((p) => [p.id, p]));
  assert.ok(G.filter((p) => p.level === 2).length >= 25 && G.filter((p) => p.level === 3).length >= 30);
  for (const l of L) for (const g of l.grammar ?? []) assert.ok(byId.get(g)?.level <= l.level, `${l.id} ${g}`);
  assert.ok(L.filter((l) => l.level <= 3).every((l) => l.grammar?.length), "every HSK 1-3 lesson names its grammar");
});
