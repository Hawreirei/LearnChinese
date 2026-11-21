// Speaking simulation (issue #29). Pure logic, no DOM: build a paper from data/hsk3/speaking.json, lay it out as
// steps with timed phases, and summarise the result. The format comes from an unofficial blueprint (verified: false).
import { shuffle } from "./deck.js";
import { cleanZh } from "./speech.js";

export const TASK_LABEL = {
  repeat_sentence: "Ulangi kalimat",
  describe_picture: "Bicara tentang gambar",
  answer_question: "Jawab pertanyaan",
};
export const TASK_HELP = {
  repeat_sentence: "Dengarkan kalimatnya (hanya sekali), lalu ucapkan kembali persis sama.",
  describe_picture: "Lihat gambarnya, siapkan diri, lalu ucapkan satu atau dua kalimat tentang gambar itu.",
  answer_question: "Baca dan dengarkan pertanyaannya, siapkan jawaban, lalu jawab dengan beberapa kalimat.",
};

/** Four dimensions, rated 1-3 by the learner after listening to their own recording and the model answers. */
export const RUBRIC = [
  { key: "pron", label: "Pelafalan dan nada", hint: "Bunyi dan nada jelas, mudah dipahami." },
  { key: "fluency", label: "Kelancaran", hint: "Bicara tanpa banyak berhenti atau mengulang." },
  { key: "accuracy", label: "Ketepatan kata dan tata bahasa", hint: "Kata dan urutan kalimat tepat." },
  { key: "content", label: "Isi", hint: "Menjawab pertanyaan atau sesuai gambar, cukup panjang." },
];
export const RUBRIC_SCALE = [{ v: 1, label: "Kurang" }, { v: 2, label: "Cukup" }, { v: 3, label: "Baik" }];

const POOL = { repeat_sentence: "repeat", describe_picture: "pictures", answer_question: "questions" };

/** A paper: per blueprint part, `count` different items drawn from the level's pool. */
export function buildPaper(data, rand = Math.random) {
  const bp = data.blueprint;
  return {
    level: bp.level, verified: !!bp.verified, total_time_min: bp.total_time_min,
    parts: bp.parts.map((p) => ({ ...p, items: shuffle(data[POOL[p.type]], rand).slice(0, p.count) })),
  };
}

/** Steps in order. Phases: "listen" (audio, no clock), "prep" and "speak" (timed). Open questions are heard first. */
export function stepsOf(paper) {
  return paper.parts.flatMap((p, pi) => p.items.map((item, k) => {
    const phases = [];
    if (p.type !== "describe_picture") phases.push({ kind: "listen" });
    if (p.prep_s > 0) phases.push({ kind: "prep", ms: p.prep_s * 1000 });
    phases.push({ kind: "speak", ms: p.speak_s * 1000 });
    return { part: pi, partId: p.id, type: p.type, n: k + 1, count: p.items.length, item, phases, firstOfPart: k === 0 };
  }));
}

/** Time left in a timed phase started at `startedAt`. */
export function timeLeft(phase, startedAt, now = Date.now()) {
  const left = Math.max(0, (phase.ms ?? 0) - (now - startedAt));
  return { leftMs: left, over: left === 0 };
}

/** Total planned time (listen phases estimated from the text length), for the intro screen. */
export function plannedMs(paper) {
  return stepsOf(paper).reduce((a, s) => a + s.phases.reduce((b, ph) => b + (ph.ms ?? 1500 + [...(s.item.zh ?? "")].length * 400), 0), 0);
}

/** Syllabus words in a transcript, longest match first. `words`: [{word, level}] up to the exam level. */
export function wordsUsed(transcript, words) {
  const text = cleanZh(transcript ?? "");
  const byLen = new Map();
  for (const w of words) if (w.word.length > 0) (byLen.get(w.word.length) ?? byLen.set(w.word.length, new Map()).get(w.word.length)).set(w.word, w.level);
  const lens = [...byLen.keys()].sort((a, b) => b - a);
  const found = new Map();
  const chars = [...text];
  for (let i = 0; i < chars.length;) {
    let hit = null;
    for (const n of lens) {
      const s = chars.slice(i, i + n).join("");
      if (s.length === n && byLen.get(n).has(s)) { hit = s; break; }
    }
    if (hit) { found.set(hit, byLen.get([...hit].length).get(hit)); i += [...hit].length; } else i++;
  }
  return [...found.entries()].map(([word, level]) => ({ word, level }));
}

/** Numbers for an open answer: hanzi heard, hanzi per minute of speaking, and syllabus words used. */
export function openStats(transcript, durationMs, words, level) {
  const hanzi = [...cleanZh(transcript ?? "")].length;
  const minutes = durationMs / 60000;
  const used = wordsUsed(transcript, words);
  return { hanzi, perMin: minutes > 0.05 ? Math.round(hanzi / minutes) : null, words: used, atLevel: used.filter((w) => w.level === level).length };
}

/** Rubric ratings { key: 1..3 } -> percent, or null until every dimension is rated. */
export function rubricPct(ratings) {
  const v = RUBRIC.map((r) => ratings?.[r.key]);
  if (v.some((x) => !(x >= 1 && x <= 3))) return null;
  return Math.round((100 * v.reduce((a, b) => a + b, 0)) / (3 * RUBRIC.length));
}

/** Summary. results[i] = { type, pct? (repeat score), transcript?, durationMs?, audio? }.
 *  estimate = repeat average and rubric, weighted by how many items each covers; null when neither exists. */
export function summarize(results, ratings = null) {
  const rep = results.filter((r) => r.type === "repeat_sentence");
  const scored = rep.filter((r) => typeof r.pct === "number");
  const open = results.filter((r) => r.type !== "repeat_sentence");
  const repeatPct = scored.length ? Math.round(scored.reduce((a, r) => a + r.pct, 0) / scored.length) : null;
  const rub = rubricPct(ratings);
  const parts = [[repeatPct, rep.length], [rub, open.length]].filter(([p, n]) => p != null && n > 0);
  const n = parts.reduce((a, [, k]) => a + k, 0);
  return {
    repeat: { n: rep.length, scored: scored.length, pct: repeatPct },
    open: { n: open.length, answered: open.filter((r) => r.audio || (r.transcript ?? "").trim()).length },
    rubricPct: rub,
    estimate: n ? Math.round(parts.reduce((a, [p, k]) => a + p * k, 0) / n) : null,
  };
}
