import test from "node:test";
import assert from "node:assert/strict";
import { parseDateKey, daysUntil, normalizePlan, countdown, countdownText, formatDateId, hasTarget, DEFAULT_PLAN } from "../../app/js/plan.js";
import { Store } from "../../app/js/store.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const at = (y, mo, d, hh = 9, mm = 0) => new Date(y, mo - 1, d, hh, mm).getTime();   // local time

test("parseDateKey accepts real dates only", () => {
  assert.deepEqual(parseDateKey("2026-12-13"), { y: 2026, m: 12, d: 13 });
  assert.deepEqual(parseDateKey("2028-02-29"), { y: 2028, m: 2, d: 29 });
  for (const bad of ["", "2026-02-30", "2027-02-29", "2026-13-01", "2026-1-5", "13/12/2026", null, undefined, 20261213]) assert.equal(parseDateKey(bad), null, String(bad));
});

test("daysUntil counts local calendar days", () => {
  const now = at(2026, 11, 17);
  assert.equal(daysUntil("2026-11-17", now), 0);
  assert.equal(daysUntil("2026-11-18", now), 1);
  assert.equal(daysUntil("2026-11-16", now), -1);
  assert.equal(daysUntil("2026-12-13", now), 26);
  assert.equal(daysUntil("2027-01-01", now), 45);                       // across the year boundary
  assert.equal(daysUntil("bad", now), null);
});

test("daysUntil does not depend on the time of day", () => {
  for (const [hh, mm] of [[0, 0], [0, 30], [12, 0], [23, 59]]) assert.equal(daysUntil("2026-11-18", at(2026, 11, 17, hh, mm)), 1, `${hh}:${mm}`);
  // around daylight-saving changes in zones that have them (no-op where they do not)
  assert.equal(daysUntil("2026-03-30", at(2026, 3, 28, 23, 30)), 2);
  assert.equal(daysUntil("2026-11-02", at(2026, 10, 31, 0, 15)), 2);
});

test("normalizePlan repairs bad or old data", () => {
  assert.deepEqual(normalizePlan(undefined), { ...DEFAULT_PLAN });
  assert.deepEqual(normalizePlan(null), { ...DEFAULT_PLAN });
  assert.deepEqual(normalizePlan({ level: "3", examDate: "2026-12-13", minutes: "45", extra: 1 }), { level: 3, examDate: "2026-12-13", minutes: 45 });
  assert.deepEqual(normalizePlan({ level: 7, examDate: "2026-02-30", minutes: 20 }), { level: null, examDate: "", minutes: 30 });
  assert.deepEqual(normalizePlan({ level: 0 }), { ...DEFAULT_PLAN });
});

test("countdown states", () => {
  const now = at(2026, 11, 17);
  assert.equal(countdown({}, now).state, "none");
  assert.equal(hasTarget(normalizePlan({ minutes: 60 })), false);       // minutes alone is not a target
  assert.deepEqual(countdown({ level: 3 }, now), { state: "nodate", level: 3, days: null, examDate: "" });
  assert.deepEqual(countdown({ level: 3, examDate: "2026-12-13" }, now), { state: "upcoming", level: 3, days: 26, examDate: "2026-12-13" });
  assert.equal(countdown({ level: 3, examDate: "2026-11-17" }, now).state, "today");
  assert.equal(countdown({ level: 3, examDate: "2026-11-01" }, now).state, "past");
  assert.equal(countdown({ examDate: "2026-12-13" }, now).state, "upcoming");   // date without level still counts down
});

test("countdownText", () => {
  const now = at(2026, 11, 17);
  const t = (p) => countdownText(countdown(p, now));
  assert.deepEqual(t({ level: 3, examDate: "2026-12-13" }), { title: "HSK 3 · 26 hari lagi", detail: "13 Desember 2026 · sekitar 3 minggu lagi" });
  assert.deepEqual(t({ level: 1, examDate: "2026-11-25" }), { title: "HSK 1 · 8 hari lagi", detail: "25 November 2026" });
  assert.equal(t({ level: 2, examDate: "2026-11-18" }).title, "HSK 2 · besok");
  assert.equal(t({ level: 2, examDate: "2026-11-17" }).title, "HSK 2 · hari ini");
  assert.equal(t({ level: 2, examDate: "2026-11-01" }).title, "Tanggal HSK 2 sudah lewat");
  assert.equal(t({ examDate: "2026-12-13" }).title, "Ujian · 26 hari lagi");
  assert.equal(t({ level: 4 }).title, "Target: HSK 4");
  assert.equal(t({}).title, "Belum ada target ujian");
  assert.equal(formatDateId("2027-01-05"), "5 Januari 2027");
});

test("Store.plan: default for old data, persisted, kept by export/import", () => {
  const storage = mem();
  const s = new Store(storage);
  assert.deepEqual(s.plan, { ...DEFAULT_PLAN });
  s.setPlan({ level: 3, examDate: "2026-12-13" });
  s.setPlan({ minutes: 45 });                                            // patches merge
  assert.deepEqual(new Store(storage).plan, { level: 3, examDate: "2026-12-13", minutes: 45 });
  s.setPlan({ examDate: "not a date" });
  assert.equal(s.plan.examDate, "");
  s.setPlan({ examDate: "2026-12-13" });

  const other = new Store(mem());
  other.import(s.export());
  assert.deepEqual(other.plan, { level: 3, examDate: "2026-12-13", minutes: 45 });

  const old = new Store(mem());                                          // export made before plans existed
  old.import(JSON.stringify({ version: 1, cards: {}, settings: {}, daily: { date: "", introduced: 0 }, log: {} }));
  assert.deepEqual(old.plan, { ...DEFAULT_PLAN });
  s.reset();
  assert.deepEqual(s.plan, { ...DEFAULT_PLAN });
});
