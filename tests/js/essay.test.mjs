import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkSentence, allowedChars, hanziCount } from "../../app/js/essay.js";
import { check } from "../../app/js/practice.js";

const Q = JSON.parse(readFileSync(new URL("../../data/hsk3/questions.json", import.meta.url), "utf-8"));
const V = JSON.parse(readFileSync(new URL("../../data/hsk3/vocab.json", import.meta.url), "utf-8"));
const ids = (r) => r.checks.map((c) => c.id);

test("errors: empty, required word missing, no final punctuation", () => {
  assert.deepEqual(checkSentence("", { word: "饱" }), { ok: false, hanzi: 0, checks: [{ id: "empty", level: "error", msg: "Belum ada kalimat." }], above: [] });
  assert.deepEqual(ids(checkSentence("我已经吃了很多饭。", { word: "饱" })), ["word"]);
  const noEnd = checkSentence("我已经吃饱了", { word: "饱" });
  assert.equal(noEnd.ok, false);
  assert.deepEqual(ids(noEnd), ["end"]);
  assert.match(checkSentence("我已经吃饱了.", { word: "饱" }).checks[0].msg, /bukan \. ! \?/);
  assert.equal(checkSentence("  我已经吃饱了。 ", { word: "饱" }).ok, true);
  assert.equal(checkSentence("你吃饱了吗？", { word: "饱" }).ok, true);
});

test("warnings do not fail the sentence", () => {
  const r = checkSentence("饱了。", { word: "饱" });
  assert.equal(r.ok, true);
  assert.deepEqual(ids(r), ["short"]);
  assert.deepEqual(ids(checkSentence("我吃饱了, 很好。", { word: "饱" })), ["comma"]);
  assert.deepEqual(ids(checkSentence("我今天吃饱了OK。", { word: "饱" })), ["latin"]);
  const long = checkSentence("我".repeat(40) + "饱。", { word: "饱" });
  assert.deepEqual(ids(long), ["long"]);
});

test("level check uses the allowed hanzi", () => {
  const a1 = allowedChars(V, 1);
  const r = checkSentence("我们在饭店吃饭，非常饱。", { word: "饱", allowed: a1 });
  assert.deepEqual(r.above, ["饱"]);
  assert.ok(ids(r).includes("above"));
  assert.equal(r.ok, true);
});

test("common slips are warned about, correct uses are not", () => {
  const slip = (t) => ids(checkSentence(t, { word: "" })).includes("slip");
  for (const t of ["明天在见。", "我再家看书。", "我在写做业。", "妈妈在作饭。", "他跑的很快。", "我是很忙。"]) assert.ok(slip(t), t);
  for (const t of ["明天再见。", "我在家看书。", "我在写作业。", "妈妈在做饭。", "他跑得很快。", "我的很多朋友都来了。", "这是很好的办法。", "我很忙。"]) assert.ok(!slip(t), t);
});

test("hanziCount ignores punctuation and Latin", () => {
  assert.equal(hanziCount("我吃饱了。OK"), 4);
});

test("every model answer passes the check at its level without errors or above-level hanzi", () => {
  const items = Q.filter((q) => q.type === "write_sentence_from_picture_and_word");
  assert.ok(items.length >= 40);
  const allowed = allowedChars(V, 3);
  for (const q of items) for (const m of q.models) {
    const r = checkSentence(m.zh, { word: q.word, allowed });
    assert.ok(r.ok, `${q.id} ${m.zh} ${JSON.stringify(r.checks)}`);
    assert.deepEqual(r.above, [], `${q.id} ${m.zh}`);
    assert.ok(!ids(r).includes("slip"), `${q.id} ${m.zh}`);
  }
});

test("practice check: the local check decides (exam estimate)", () => {
  const q = Q.find((x) => x.type === "write_sentence_from_picture_and_word");
  assert.equal(check(q, q.models[1].zh).correct, true);
  assert.equal(check(q, "我很喜欢。").correct, false);
  assert.equal(check(q, "").correct, false);
});
