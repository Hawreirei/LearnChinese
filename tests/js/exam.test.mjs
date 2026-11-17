import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { availability, examAvailable, buildExam, formatClock, gradeSection, summarizeExam } from "../../app/js/exam.js";
import { check, questionKey } from "../../app/js/practice.js";

const Q = JSON.parse(readFileSync(new URL("../../data/hsk3/questions.json", import.meta.url), "utf-8"));
const BP = JSON.parse(readFileSync(new URL("../../data/hsk3/blueprints.json", import.meta.url), "utf-8"));

test("official blueprints are loaded for levels 1-6", () => {
  assert.deepEqual(Object.keys(BP), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(BP[3].sections.map((s) => [s.skill, s.count, s.time_min]), [["listening", 30, 23], ["reading", 30, 30], ["writing", 10, 20]]);
});

test("exam available for HSK 1-3 only (bank has no higher-level questions)", () => {
  for (const l of [1, 2, 3]) assert.ok(examAvailable(Q, BP[l]), `level ${l}: ${JSON.stringify(availability(Q, BP[l]))}`);
  for (const l of [4, 5, 6]) assert.equal(examAvailable(Q, BP[l]), false);
});

test("buildExam uses official counts and times, unique questions, never above the exam level", () => {
  for (const l of [1, 2, 3]) {
    const ex = buildExam(Q, BP[l]);
    assert.equal(ex.total, BP[l].total_questions);
    assert.deepEqual(ex.sections.map((s) => s.items.length), BP[l].sections.map((s) => s.count));
    assert.deepEqual(ex.sections.map((s) => s.time_ms), BP[l].sections.map((s) => s.time_min * 60_000));
    const ids = ex.sections.flatMap((s) => s.items.map((q) => q.id));
    assert.equal(new Set(ids).size, ids.length);
    const keys = ex.sections.flatMap((s) => s.items.map(questionKey));
    assert.equal(new Set(keys).size, keys.length);
    assert.ok(ex.sections.every((s) => s.items.every((q) => q.level <= l && q.skill === s.skill)));
  }
  assert.throws(() => buildExam(Q, BP[5]));
});

test("parts use their official question type whenever the bank has it", () => {
  const ex = buildExam(Q, BP[1]);
  const [lis, rea] = ex.sections;
  const byPart = (sec) => Object.fromEntries(BP[1].sections.find((s) => s.skill === sec.skill).parts.map((p) => [p.id, sec.items.filter((q) => q.part.id === p.id)]));
  const l = byPart(lis), r = byPart(rea);
  assert.ok(l.L1.every((q) => q.type === "audio_phrase_pick_picture" && q.part.official));        // 三个苹果 -> picture
  assert.ok(l.L3.every((q) => q.type === "audio_dialog_match_picture" && q.part.official));
  assert.ok(r.R1.every((q) => q.type === "sentence_match_picture" && q.part.official));
  assert.ok(r.R3.every((q) => q.type === "cloze_wordbank" && q.part.official));
  assert.ok(r.R4.every((q) => q.type === "short_text_mcq" && q.part.official));
  assert.ok(r.R2.every((q) => q.type === "match_question_to_answer" && q.part.official));
  assert.ok(l.L4.every((q) => q.type === "audio_statement_question_mcq" && q.part.official));
  const ex3 = buildExam(Q, BP[3]);
  const types = (i) => new Set(ex3.sections[0].items.filter((q) => q.part.official).map((q) => q.type));
  assert.ok(types().has("audio_passage_question_mcq") && types().has("audio_dialog_question_mcq") && types().has("audio_dialog_match_picture"));
  assert.ok(ex3.sections[1].items.some((q) => q.type === "passage_mcq"));
  assert.ok(ex.official_items > 25 && ex3.official_items > 40);
});

test("formatClock", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(61_000), "01:01");
  assert.equal(formatClock(23 * 60_000), "23:00");
  assert.equal(formatClock(-5), "00:00");
  assert.equal(formatClock(1), "00:01");
});

const right = (q) => (q.type === "write_hanzi_from_pinyin" ? q.answer : q.options.find((o) => (o.word ?? o.zh ?? o.key) === q.answer));
const wrong = (q) => (q.type === "write_hanzi_from_pinyin" ? "x" : q.options.find((o) => (o.word ?? o.zh ?? o.key) !== q.answer));

test("gradeSection and summarizeExam: unanswered counts wrong, partial credit per section", () => {
  const ex = buildExam(Q, BP[1]);
  const sec = ex.sections[1];
  const responses = sec.items.map((q, i) => (i < 10 ? right(q) : i < 12 ? wrong(q) : undefined));
  const g = gradeSection(sec, responses, check);
  assert.deepEqual([g.total, g.answered, g.correct], [20, 12, 10]);
  const lis = gradeSection(ex.sections[0], ex.sections[0].items.map(right), check);
  assert.equal(lis.correct, 20);
  const s = summarizeExam([lis, g], [60_000, 120_000]);
  assert.deepEqual([s.total, s.correct, s.pct], [40, 30, 75]);
  assert.deepEqual(s.sections.map((x) => x.pct), [100, 50]);
  assert.equal(s.sections[1].ms, 120_000);
});

test("a matching part takes whole groups, in one A-F order, never two groups mixed in a block of five", () => {
  for (let seed = 1; seed <= 20; seed++) {
    let x = seed;
    const rand = () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (const level of [1, 2, 3]) {
      const ex = buildExam(Q, BP[level], rand);
      const items = ex.sections.flatMap((s) => s.items).filter((q) => q.type === "match_question_to_answer");
      const count = BP[level].sections.flatMap((s) => s.parts).filter((p) => p.type === "match_question_to_answer").reduce((a, p) => a + p.count, 0);
      assert.equal(items.length, count, `level ${level}`);
      for (let i = 0; i < items.length; i += 5) {
        const block = items.slice(i, i + 5);
        assert.equal(new Set(block.map((q) => q.group)).size, 1, `level ${level} seed ${seed}: one group per block`);
        assert.ok(block.every((q) => JSON.stringify(q.options) === JSON.stringify(block[0].options)), "same option order");
        assert.equal(new Set(block.map((q) => q.answer)).size, 5);
      }
    }
  }
});

test("HSK 1-3 papers: only the parts still waiting for content use substitutes", () => {
  const waiting = new Set(["choose_missing_character_component", "write_sentence_from_picture_and_word"]);
  for (const level of [1, 2, 3]) {
    const ex = buildExam(Q, BP[level]);
    for (const q of ex.sections.flatMap((s) => s.items)) assert.equal(q.part.official, !waiting.has(q.part.type), `${level} ${q.part.id} ${q.part.type}`);
  }
});
