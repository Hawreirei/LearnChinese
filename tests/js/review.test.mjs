import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildExam, gradeSection } from "../../app/js/exam.js";
import { check } from "../../app/js/practice.js";
import { packReview, unpackReview, filterReview, reviewCounts, responseText, optionKey, REVIEW_VERSION } from "../../app/js/review.js";
import { Store } from "../../app/js/store.js";

const Q = JSON.parse(readFileSync(new URL("../../data/hsk3/questions.json", import.meta.url), "utf-8"));
const BP = JSON.parse(readFileSync(new URL("../../data/hsk3/blueprints.json", import.meta.url), "utf-8"));
const byId = new Map(Q.map((q) => [q.id, q]));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

/** Deterministic rand so the test is repeatable. */
function seeded(seed = 7) { let s = seed; return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

/** A finished exam where the learner answers right, wrong, or not at all in turn (by item index). */
function finishedExam(level) {
  const exam = buildExam(Q, BP[level], seeded(level));
  const graded = exam.sections.map((sec) => gradeSection(sec, sec.items.map((q, i) => {
    const mode = i % 3;                                    // 0 right, 1 wrong, 2 blank
    if (mode === 2) return undefined;
    if (q.type === "order_sentence") return mode === 0 ? [...q.tokens] : [...q.tokens].reverse();
    if (q.type === "write_hanzi_from_pinyin") return mode === 0 ? q.answer : (q.tiles.find((t) => t !== q.answer));
    return mode === 0 ? q.options.find((o) => optionKey(o) === q.answer) : q.options.find((o) => optionKey(o) !== q.answer);
  }), check));
  return { exam, graded };
}

test("pack → JSON → unpack rebuilds what the learner saw, with the same grading", () => {
  for (const level of [1, 2, 3]) {
    const { graded } = finishedExam(level);
    const rec = JSON.parse(JSON.stringify(packReview({ t: 1, level, graded })));
    assert.equal(rec.v, REVIEW_VERSION);
    const R = unpackReview(rec, byId);
    assert.equal(R.missing, 0);
    assert.deepEqual(R.sections.map((s) => s.rows.length), graded.map((g) => g.rows.length));
    R.sections.forEach((s, si) => s.rows.forEach((row, i) => {
      const orig = graded[si].rows[i];
      assert.equal(row.q.id, orig.q.id);
      assert.equal(row.n, i + 1);
      if (orig.q.options) assert.deepEqual(row.q.options.map(optionKey), orig.q.options.map(optionKey), "option order kept");
      for (const k of ["tiles", "choices", "bank"]) if (orig.q[k]) assert.deepEqual(row.q[k], orig.q[k], k);
      assert.equal(row.answered, orig.answered);
      assert.equal(row.correct, orig.correct);
      if (row.answered) assert.equal(check(row.q, row.response).correct, orig.correct, `re-check ${row.q.id}`);
      if (orig.q.options && orig.answered) assert.equal(row.response, row.q.options.find((o) => optionKey(o) === optionKey(orig.response)), "response is the option object");
      assert.equal(row.substitute, !orig.q.part.official);
    }));
  }
});

test("a saved review stays small", () => {
  const { graded } = finishedExam(3);
  const size = JSON.stringify(packReview({ t: 1, level: 3, graded })).length;
  assert.ok(size < 16_000, `${size} bytes for 70 questions`);
});

test("filters and counts", () => {
  const { graded } = finishedExam(2);
  const R = unpackReview(packReview({ t: 1, level: 2, graded }), byId);
  const c = reviewCounts(R);
  const rows = graded.flatMap((g) => g.rows);
  assert.deepEqual(c, { all: rows.length, wrong: rows.filter((r) => !r.correct).length, blank: rows.filter((r) => !r.answered).length });
  const count = (f) => filterReview(R, f).reduce((a, s) => a + s.rows.length, 0);
  assert.equal(count("all"), c.all);
  assert.equal(count("wrong"), c.wrong);
  assert.equal(count("blank"), c.blank);
  assert.equal(count("nonsense"), c.wrong, "unknown filter falls back to wrong/blank");
  assert.ok(filterReview(R, "blank").every((s) => s.rows.every((r) => !r.answered)));
});

test("questions removed from the bank are skipped and counted; bad records give null", () => {
  const { graded } = finishedExam(1);
  const rec = packReview({ t: 1, level: 1, graded });
  const gone = rec.sections[0].items[0].id;
  const fewer = new Map(byId); fewer.delete(gone);
  const R = unpackReview(rec, fewer);
  assert.equal(R.missing, 1);
  assert.ok(!R.sections[0].rows.some((r) => r.q.id === gone));
  assert.equal(R.sections[0].rows[0].n, 2, "numbers stay as in the exam");
  assert.equal(unpackReview(null, byId), null);
  assert.equal(unpackReview({ ...rec, v: 99 }, byId), null);
});

test("responseText", () => {
  assert.equal(responseText({}, undefined), "—");
  assert.equal(responseText({}, ""), "—");
  assert.equal(responseText({}, []), "—");
  assert.equal(responseText({}, "爱"), "爱");
  assert.equal(responseText({}, ["我", "爱", "你", "。"]), "我爱你。");
  assert.equal(responseText({}, { word: "爱", pinyin: "ài" }), "爱");
  assert.equal(responseText({}, { zh: "我是学生。" }), "我是学生。");
  assert.equal(responseText({}, { key: "eat", emoji: "🍚", alt: "makan" }), "🍚 makan");
});

test("Store keeps the last review per level and exports it", () => {
  const s = new Store(mem());
  assert.equal(s.examReview(3), null);
  s.saveExamReview({ v: 1, t: 1, level: 3, sections: [] });
  s.saveExamReview({ v: 1, t: 2, level: 3, sections: [] });
  s.saveExamReview({ v: 1, t: 3, level: 1, sections: [] });
  assert.equal(s.examReview(3).t, 2);
  assert.equal(Object.keys(s.data.examReviews).length, 2);
  const other = new Store(mem());
  other.import(s.export());
  assert.equal(other.examReview(1).t, 3);
});
