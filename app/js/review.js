// Exam review (issue #24): keep the last mock exam of each level in a compact form and rebuild it later.
// Pure logic, no DOM. A saved item holds only what cannot be rebuilt from questions.json: the question id,
// the learner's response, and the order of options/tiles/pieces the learner actually saw.

/** The identity of an option, whatever its kind (cloze word, listening/text answer, picture key). */
export const optionKey = (o) => o?.word ?? o?.zh ?? o?.key ?? null;

export const REVIEW_VERSION = 1;

/** A response as plain JSON: an option becomes its key, typed hanzi and order pieces stay as they are. */
function packResponse(r) {
  if (r === undefined || r === null || r === "") return null;
  if (Array.isArray(r) || typeof r !== "object") return r;
  return optionKey(r);
}

/** graded = gradeSection() results of one finished exam. Returns the record saved in store.data.examReviews[level]. */
export function packReview({ t, level, graded }) {
  return {
    v: REVIEW_VERSION, t, level,
    sections: graded.map((g) => ({
      skill: g.skill,
      items: g.rows.map(({ q, response, answered, correct }) => {
        const it = { id: q.id, r: packResponse(response), a: answered ? 1 : 0, ok: correct ? 1 : 0 };
        if (q.options) it.o = q.options.map(optionKey);
        if (q.tiles) it.tiles = q.tiles;
        if (q.choices) it.choices = q.choices;
        if (q.bank) it.bank = q.bank;
        if (q.part && !q.part.official) it.sub = 1;                     // stand-in for an official type we lack
        return it;
      }),
    })),
  };
}

/** Rebuild the review from a saved record. Questions that no longer exist (content was edited) are left out and
 *  counted in `missing`. Rows: { n (number in its section), q, response, answered, correct, substitute }. */
export function unpackReview(rec, questionsById) {
  if (!rec || rec.v !== REVIEW_VERSION || !Array.isArray(rec.sections)) return null;
  let missing = 0;
  const sections = rec.sections.map((s) => ({
    skill: s.skill,
    rows: s.items.flatMap((it, i) => {
      const base = questionsById.get(it.id);
      if (!base) { missing++; return []; }
      const q = { ...base };
      if (it.o && base.options) {
        const byKey = new Map(base.options.map((o) => [optionKey(o), o]));
        const opts = it.o.map((k) => byKey.get(k)).filter(Boolean);
        if (opts.length === base.options.length) q.options = opts;
      }
      for (const k of ["tiles", "choices", "bank"]) if (it[k]) q[k] = it[k];
      const response = it.r != null && q.options && !Array.isArray(it.r) ? (q.options.find((o) => optionKey(o) === it.r) ?? null) : it.r;
      return [{ n: i + 1, q, response, answered: !!it.a, correct: !!it.ok, substitute: !!it.sub }];
    }),
  }));
  return { t: rec.t, level: rec.level, sections, missing };
}

export const REVIEW_FILTERS = ["wrong", "blank", "all"];
const KEEP = { wrong: (r) => !r.correct, blank: (r) => !r.answered, all: () => true };

/** Rows of every section that pass the filter: "wrong" = wrong or blank, "blank" = not answered, "all". */
export function filterReview(review, filter = "wrong") {
  const keep = KEEP[filter] ?? KEEP.wrong;
  return review.sections.map((s) => ({ ...s, rows: s.rows.filter(keep) }));
}

/** Counts for the filter buttons. */
export function reviewCounts(review) {
  const rows = review.sections.flatMap((s) => s.rows);
  return { all: rows.length, wrong: rows.filter(KEEP.wrong).length, blank: rows.filter(KEEP.blank).length };
}

/** "Jawaban Anda" as text: an option's word/sentence/picture name, typed hanzi, or the arranged pieces. */
export function responseText(q, response) {
  if (response === undefined || response === null || response === "" || (Array.isArray(response) && !response.length)) return "—";
  if (Array.isArray(response)) return response.join("");
  if (typeof response === "object") return response.alt ? `${response.emoji ?? ""} ${response.alt}`.trim() : (response.word ?? response.zh ?? optionKey(response) ?? "—");
  return String(response);
}
