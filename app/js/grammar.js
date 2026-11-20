// Grammar points (issue #30). Pure logic, no DOM. Progress is read from the answer log: no separate store.
// A point's drills have ids "g-<point>-<n>"; the latest answer to each drill counts.

const POINT_OF = /^g-(.+)-\d+$/;
export const MASTERY_PCT = 80;

/** Point id of a drill question id, or null. */
export function pointOfQuestion(id) {
  const m = POINT_OF.exec(id ?? "");
  return m ? m[1] : null;
}

/** Per point: { done (drills answered at least once), total, ok (latest answer right), pct, mastered, t (last answer) }. */
export function grammarProgress(points, events) {
  const latest = new Map();                                   // drill id -> latest event
  for (const e of events) if (pointOfQuestion(e.id) && !e.un && (!latest.has(e.id) || e.t >= latest.get(e.id).t)) latest.set(e.id, e);
  const out = {};
  for (const p of points) {
    const evs = p.drills.map((d) => latest.get(d.id)).filter(Boolean);
    const ok = evs.filter((e) => e.ok).length;
    const pct = evs.length ? Math.round((100 * ok) / evs.length) : null;
    out[p.id] = { done: evs.length, total: p.drills.length, ok, pct, mastered: evs.length === p.drills.length && pct >= MASTERY_PCT, t: evs.reduce((a, e) => Math.max(a, e.t), 0) || null };
  }
  return out;
}

/** Status label for a point card. */
export function statusOf(pr) {
  if (!pr || !pr.done) return { key: "new", label: "Belum dilatih" };
  if (pr.mastered) return { key: "ok", label: "Dikuasai ✓" };
  return { key: "doing", label: `${pr.pct}% benar (${pr.done}/${pr.total} soal)` };
}

/** Points grouped by level, in teaching order: [{ level, points }]. */
export function groupPoints(points) {
  const by = new Map();
  for (const p of [...points].sort((a, b) => a.level - b.level || a.seq - b.seq)) (by.get(p.level) ?? by.set(p.level, []).get(p.level)).push(p);
  return [...by.entries()].map(([level, ps]) => ({ level, points: ps }));
}

/** The point to continue: the first one not mastered in teaching order among `levels` (all when empty). */
export function nextPoint(points, progress, levels = []) {
  const lv = new Set(levels);
  return groupPoints(points).flatMap((g) => g.points).find((p) => (!lv.size || lv.has(p.level)) && !progress[p.id]?.mastered) ?? null;
}

/** Accuracy per grammar point over the answer log: practice/exam items tagged "g" (questions.json) and the point's
 *  own drills. `index` = Map id -> question (bank, lessons, grammar drills). Weakest first, with >= minN answers. */
export function weakestPoints(events, index, points, minN = 3) {
  const known = new Map(points.map((p) => [p.id, p]));
  const acc = new Map();
  for (const e of events) {
    if (e.un || !e.id) continue;
    const ids = index.get(e.id)?.g ?? (pointOfQuestion(e.id) ? [pointOfQuestion(e.id)] : []);
    for (const g of ids) {
      if (!known.has(g)) continue;
      const a = acc.get(g) ?? { n: 0, ok: 0 };
      a.n++; if (e.ok) a.ok++;
      acc.set(g, a);
    }
  }
  return [...acc].filter(([, a]) => a.n >= minN)
    .map(([id, a]) => ({ id, title: known.get(id).title, level: known.get(id).level, n: a.n, ok: a.ok, pct: Math.round((100 * a.ok) / a.n) }))
    .sort((x, y) => x.pct - y.pct || y.n - x.n);
}
