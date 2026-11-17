import test from "node:test";
import assert from "node:assert/strict";
import { parseDateKey, daysUntil, normalizePlan, countdown, countdownText, formatDateId, hasTarget, DEFAULT_PLAN,
  newWordRate, dailyNewLimit, mockInterval, mockDue, dayActivity, todayTasks, targetLevelMissing, NEW_CAP } from "../../app/js/plan.js";
import { buildQueue, answer } from "../../app/js/session.js";
import { RATING } from "../../app/js/srs.js";
import { readFileSync } from "node:fs";
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

// ---------- daily plan (#23) ----------
const vocab = JSON.parse(readFileSync(new URL("../../data/hsk3/vocab.json", import.meta.url), "utf-8"));

test("newWordRate: spread remaining words before the reserve, capped by minutes", () => {
  assert.equal(newWordRate({ remaining: 100, days: null }), null);
  assert.equal(newWordRate({ remaining: 100, days: 0 }), null);              // exam day / past: no plan
  assert.deepEqual(newWordRate({ remaining: 100, days: 7 }), { perDay: 0, needed: 0, capped: false, phase: "final" });
  assert.deepEqual(newWordRate({ remaining: 0, days: 40 }), { perDay: 0, needed: 0, capped: false, phase: "done" });
  // 1000 words, 114 days: 100 study days (14 kept free) -> 10/day
  assert.deepEqual(newWordRate({ remaining: 1000, days: 114, minutes: 30 }), { perDay: 10, needed: 10, capped: false, phase: "learn" });
  // 500 words, 26 days: 12 study days -> 42/day needed, capped at 15 for 30 minutes
  assert.deepEqual(newWordRate({ remaining: 500, days: 26, minutes: 30 }), { perDay: 15, needed: 42, capped: true, phase: "learn" });
  assert.equal(newWordRate({ remaining: 500, days: 26, minutes: 60 }).perDay, NEW_CAP[60]);
  // short runway: 10 days -> only the final week is kept free -> 3 study days
  assert.deepEqual(newWordRate({ remaining: 30, days: 10, minutes: 30 }), { perDay: 10, needed: 10, capped: false, phase: "learn" });
  assert.equal(newWordRate({ remaining: 1, days: 8 }).perDay, 1);
});

test("dailyNewLimit: plan only with a future date and the switch on", () => {
  const now = at(2026, 11, 17);
  const settings = { newPerDay: 12, newPerDayAuto: true };
  assert.deepEqual(dailyNewLimit({}, settings, 500, now), { perDay: 12, source: "manual", rate: null });
  assert.deepEqual(dailyNewLimit({ level: 3 }, settings, 500, now).source, "manual");          // no date
  assert.deepEqual(dailyNewLimit({ level: 3, examDate: "2026-11-01" }, settings, 500, now).source, "manual");   // past
  assert.equal(dailyNewLimit({ level: 3, examDate: "2026-11-17" }, settings, 500, now).source, "manual");      // exam day
  const p = dailyNewLimit({ level: 3, examDate: "2027-03-11", minutes: 30 }, settings, 1000, now);   // 114 days
  assert.equal(p.source, "plan"); assert.equal(p.perDay, 10);
  assert.equal(dailyNewLimit({ level: 3, examDate: "2027-03-11" }, { ...settings, newPerDayAuto: false }, 1000, now).perDay, 12);
  assert.equal(dailyNewLimit({ level: 3, examDate: "2026-11-20" }, settings, 1000, now).perDay, 0);           // final week
});

test("buildQueue follows the plan and stays stable during the day", () => {
  const now = at(2026, 11, 17, 8);
  const s = new Store(mem());
  s.setSettings({ levels: [1, 2, 3] });
  s.setPlan({ level: 1, examDate: "2027-03-11", minutes: 30 });          // 114 days, 300 HSK 1 words -> 3/day
  let q = buildQueue(vocab, s, now);
  assert.equal(q.limit.source, "plan");
  assert.equal(q.fresh.length, 3);
  for (let i = 0; i < 3; i++) answer(s, q.fresh[0], RATING.GOOD, now + i * 1000), (q = buildQueue(vocab, s, now + i * 1000 + 1));
  assert.equal(q.fresh.length, 0, "no extra new words after the day's quota");
  s.setPlan({ examDate: "2026-11-20" });                                 // final week: no new words, pinned still come
  s.pin([vocab.find((w) => w.level === 2).id]);
  assert.deepEqual(buildQueue(vocab, s, now + 5000).fresh.map((x) => x.w.level), [2]);
  s.setSettings({ newPerDayAuto: false });
  assert.equal(buildQueue(vocab, s, now + 6000).limit.source, "manual");
});

test("mock exam schedule", () => {
  assert.equal(mockInterval(60), 10); assert.equal(mockInterval(21), 7); assert.equal(mockInterval(7), 3); assert.equal(mockInterval(null), 10);
  assert.equal(mockDue(60, null), true);       // baseline
  assert.equal(mockDue(60, 9), false);
  assert.equal(mockDue(60, 10), true);
  assert.equal(mockDue(14, 6), false);
  assert.equal(mockDue(5, 3), true);
  assert.equal(mockDue(-1, null), false);      // after the exam
});

test("dayActivity reads today's work only", () => {
  const now = at(2026, 11, 17, 20);
  const today = at(2026, 11, 17, 9), yesterday = at(2026, 11, 16, 23, 30);
  const data = {
    events: [
      { t: today, k: "practice", id: "c1", ok: 1 }, { t: today, k: "practice", id: "c2", ok: 0 },
      { t: today, k: "practice", id: "ls-sapaan-l1", ok: 1 },       // lesson questions are not "Latihan"
      { t: today, k: "exam", id: "c3", ok: 1 }, { t: yesterday, k: "practice", id: "c4", ok: 1 },
    ],
    lessons: { sapaan: { steps: { listening: { ok: 1, n: 1, t: today }, reading: { t: yesterday } } } },
    writing: { 爱: { n: 1, t: today }, 八: { n: 2, t: yesterday } },
    exams: [{ level: 3, t: at(2026, 11, 7, 10) }, { level: 1, t: today }],
  };
  assert.deepEqual(dayActivity(data, 3, now), { practice: 2, lessonSteps: 1, writing: 1, examToday: false, lastMockDays: 10 });
  assert.equal(dayActivity(data, 1, now).examToday, true);
  assert.deepEqual(dayActivity({}, 3, now), { practice: 0, lessonSteps: 0, writing: 0, examToday: false, lastMockDays: null });
});

test("todayTasks: tasks, targets, final week", () => {
  const act = { practice: 4, lessonSteps: 0, writing: 5, examToday: false, lastMockDays: null };
  const base = { plan: { level: 3, examDate: "2026-12-13", minutes: 30 }, days: 26, queue: { due: 5, fresh: 3 }, act,
    lesson: { id: "restoran", zh: "在餐厅", title: "Di restoran" }, practiceAvailable: true, writingAvailable: true, examAvailable: true };
  const t = todayTasks(base);
  assert.deepEqual(t.map((x) => x.id), ["study", "lesson", "practice", "write", "exam"]);
  assert.deepEqual(t.map((x) => x.done), [false, false, false, true, false]);
  assert.equal(t[0].detail, "8 kartu (5 ulangan, 3 baru)");
  assert.equal(t[2].detail, "4/10 soal");
  assert.equal(t[4].detail, "Simulasi pertama sebagai patokan awal");
  assert.equal(t[4].level, 3);

  const fin = todayTasks({ ...base, days: 3, act: { ...act, lastMockDays: 1 } });
  assert.deepEqual(fin.map((x) => x.id), ["study", "practice"], "final week: no lesson/writing; mock not due yet");
  assert.equal(fin[1].target, 15);
  const done = todayTasks({ ...base, queue: { due: 0, fresh: 0 }, act: { ...act, examToday: true, lastMockDays: 0 }, lesson: null, practiceAvailable: false, writingAvailable: false });
  assert.deepEqual(done.map((x) => [x.id, x.done]), [["study", true], ["exam", true]]);
});

test("targetLevelMissing", () => {
  assert.equal(targetLevelMissing({ level: 3 }, [1, 2]), true);
  assert.equal(targetLevelMissing({ level: 3 }, [3]), false);
  assert.equal(targetLevelMissing({}, [1]), false);
});
