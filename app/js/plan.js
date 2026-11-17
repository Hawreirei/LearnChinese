// Exam target (issue #22): level, exam date, minutes per day, and the countdown shown on Beranda.
// Pure logic, no DOM. Dates are local calendar days ("YYYY-MM-DD"), never instants, so the countdown
// does not jump at midnight UTC or across daylight-saving changes.

export const PLAN_LEVELS = [1, 2, 3, 4, 5, 6];
export const PLAN_MINUTES = [15, 30, 45, 60];
export const DEFAULT_PLAN = Object.freeze({ level: null, examDate: "", minutes: 30 });

const DAY_MS = 86400000;

/** "YYYY-MM-DD" → { y, m, d } for a real calendar date, else null (rejects 2026-02-30, "", junk). */
export function parseDateKey(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === "string" ? s.trim() : "");
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** Whole calendar days from the local day of `now` to `dateKey`: today = 0, tomorrow = 1, yesterday = -1.
 *  null when the date is invalid. */
export function daysUntil(dateKey, now = Date.now()) {
  const p = parseDateKey(dateKey);
  if (!p) return null;
  const n = new Date(now);
  const today = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - today) / DAY_MS);
}

/** Any stored value (old data, hand-edited import) → a valid plan. Unknown fields are dropped. */
export function normalizePlan(p) {
  const src = p && typeof p === "object" ? p : {};
  const level = PLAN_LEVELS.includes(Number(src.level)) ? Number(src.level) : null;
  const examDate = parseDateKey(src.examDate) ? String(src.examDate).trim() : "";
  const minutes = PLAN_MINUTES.includes(Number(src.minutes)) ? Number(src.minutes) : DEFAULT_PLAN.minutes;
  return { level, examDate, minutes };
}

/** True once the learner has set a level or a date. */
export function hasTarget(plan) {
  return plan.level != null || plan.examDate !== "";
}

/** State for the Beranda card: "none" (no target), "nodate" (level only), "upcoming", "today", "past". */
export function countdown(plan, now = Date.now()) {
  const p = normalizePlan(plan);
  if (!hasTarget(p)) return { state: "none", level: null, days: null, examDate: "" };
  const days = p.examDate ? daysUntil(p.examDate, now) : null;
  const state = days == null ? "nodate" : days > 0 ? "upcoming" : days === 0 ? "today" : "past";
  return { state, level: p.level, days, examDate: p.examDate };
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-12-13" → "13 Desember 2026" (no Intl, so tests do not depend on the runtime's locale data). */
export function formatDateId(dateKey) {
  const p = parseDateKey(dateKey);
  return p ? `${p.d} ${MONTHS[p.m - 1]} ${p.y}` : "";
}

/** Texts for the Beranda card: { title, detail }. */
export function countdownText(c) {
  const exam = c.level ? `HSK ${c.level}` : "Ujian";
  const date = formatDateId(c.examDate);
  switch (c.state) {
    case "upcoming": {
      const weeks = Math.floor(c.days / 7);
      const detail = c.days >= 14 ? `${date} · sekitar ${weeks} minggu lagi` : date;
      return { title: c.days === 1 ? `${exam} · besok` : `${exam} · ${c.days} hari lagi`, detail };
    }
    case "today": return { title: `${exam} · hari ini`, detail: `${date}. Semoga lancar! 加油！` };
    case "past": return { title: `Tanggal ${exam} sudah lewat`, detail: `${date}. Perbarui tanggal bila Anda mendaftar ujian berikutnya.` };
    case "nodate": return { title: `Target: ${exam}`, detail: "Isi tanggal ujian agar hitung mundur dan rencana harian bisa dibuat." };
    default: return { title: "Belum ada target ujian", detail: "Tentukan level dan tanggal ujian HSK Anda." };
  }
}

// ---------- daily plan (issue #23) ----------
// Heuristics, not research results: they are tuned so a learner who follows them finishes the new words
// two weeks before the exam and spends the last week only reviewing and taking mock exams.

export const FINAL_WEEK = 7;          // last days: no new words
export const RESERVE_DAYS = 14;       // days kept free of new words when there is enough time
/** New words per day that fit the daily minutes, counting the reviews they cause later. */
export const NEW_CAP = { 15: 8, 30: 15, 45: 25, 60: 35 };
const PRACTICE_N = { 15: 5, 30: 10, 45: 15, 60: 20 };
const WRITE_N = { 15: 3, 30: 5, 45: 8, 60: 10 };

/** New words per day so the remaining words are done before the reserve.
 *  { perDay, needed, capped, phase: "learn" | "final" | "done" } or null without a future exam date. */
export function newWordRate({ remaining, days, minutes = DEFAULT_PLAN.minutes }) {
  if (days == null || days <= 0) return null;
  if (days <= FINAL_WEEK) return { perDay: 0, needed: 0, capped: false, phase: "final" };
  if (remaining <= 0) return { perDay: 0, needed: 0, capped: false, phase: "done" };
  const reserve = days > RESERVE_DAYS + FINAL_WEEK ? RESERVE_DAYS : FINAL_WEEK;
  const needed = Math.ceil(remaining / (days - reserve));
  const cap = NEW_CAP[minutes] ?? NEW_CAP[DEFAULT_PLAN.minutes];
  return { perDay: Math.min(needed, cap), needed, capped: needed > cap, phase: "learn" };
}

/** The daily new-word limit the study queue uses: the plan's rate when it is on and the exam date is
 *  in the future, else the manual setting. `remaining` = target words not started yet (counting today's). */
export function dailyNewLimit(plan, settings, remaining, now = Date.now()) {
  const p = normalizePlan(plan);
  const manual = { perDay: settings.newPerDay, source: "manual", rate: null };
  if (settings.newPerDayAuto === false || !p.examDate) return manual;
  const rate = newWordRate({ remaining, days: daysUntil(p.examDate, now), minutes: p.minutes });
  return rate ? { perDay: rate.perDay, source: "plan", rate } : manual;
}

/** Days between mock exams: every 10 days, weekly in the last three weeks, every 3 days in the last week. */
export function mockInterval(days) {
  return days != null && days <= FINAL_WEEK ? 3 : days != null && days <= 21 ? 7 : 10;
}

/** Is a full mock exam due today? `lastMockDays` = days since the last one for this level (null = never). */
export function mockDue(days, lastMockDays) {
  if (days != null && days < 0) return false;
  return lastMockDays == null || lastMockDays >= mockInterval(days);
}

const sameDay = (t, now) => t != null && daysUntil(dayKeyOf(t), now) === 0;
function dayKeyOf(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** What the learner already did today, read from the saved progress (`store.data`). */
export function dayActivity(data, level, now = Date.now()) {
  const events = data.events || [];
  const practice = events.filter((e) => e.k === "practice" && !String(e.id ?? "").startsWith("ls-") && sameDay(e.t, now)).length;
  const lessonSteps = Object.values(data.lessons || {}).reduce((n, l) => n + Object.values(l.steps || {}).filter((s) => sameDay(s.t, now)).length, 0);
  const writing = Object.values(data.writing || {}).filter((r) => sameDay(r.t, now)).length;
  const exams = (data.exams || []).filter((x) => level == null || x.level === level);
  const last = exams.length ? Math.max(...exams.map((x) => x.t)) : null;
  return {
    practice, lessonSteps, writing,
    examToday: last != null && sameDay(last, now),
    lastMockDays: last == null ? null : -daysUntil(dayKeyOf(last), now),
  };
}

/** The "Hari ini" checklist. Every task is marked done from recorded activity, never by hand.
 *  ctx: { plan, days, queue: {due, fresh}, act (dayActivity), lesson (next lesson or null),
 *         practiceAvailable, writingAvailable, examAvailable } */
export function todayTasks(ctx) {
  const p = normalizePlan(ctx.plan);
  const final = ctx.days != null && ctx.days >= 0 && ctx.days <= FINAL_WEEK;
  const tasks = [];
  const cards = ctx.queue.due + ctx.queue.fresh;
  tasks.push({ id: "study", tab: "study", label: "Hafalan",
    detail: cards ? `${cards} kartu (${ctx.queue.due} ulangan, ${ctx.queue.fresh} baru)` : "Semua kartu hari ini sudah selesai",
    done: cards === 0 });
  if (ctx.lesson && !final) tasks.push({ id: "lesson", label: "Pelajaran", lessonId: ctx.lesson.id,
    detail: `${ctx.lesson.zh} · ${ctx.lesson.title}`, done: ctx.act.lessonSteps > 0 });
  if (ctx.practiceAvailable) {
    const n = Math.round(PRACTICE_N[p.minutes] * (final ? 1.5 : 1));
    tasks.push({ id: "practice", label: "Latihan kelemahan", target: n,
      detail: `${Math.min(ctx.act.practice, n)}/${n} soal`, done: ctx.act.practice >= n });
  }
  if (ctx.writingAvailable && !final) {
    const n = WRITE_N[p.minutes];
    tasks.push({ id: "write", tab: "write", label: "Menulis hanzi", target: n,
      detail: `${Math.min(ctx.act.writing, n)}/${n} hanzi`, done: ctx.act.writing >= n });
  }
  if (ctx.examAvailable && (ctx.act.examToday || mockDue(ctx.days, ctx.act.lastMockDays))) {
    tasks.push({ id: "exam", tab: "exam", label: "Simulasi ujian", level: p.level,
      detail: ctx.act.lastMockDays == null ? "Simulasi pertama sebagai patokan awal" : `Terakhir ${ctx.act.lastMockDays} hari lalu`,
      done: ctx.act.examToday });
  }
  return tasks;
}

/** True when the target level is not among the levels Hafalan studies, so the plan's words never come up. */
export function targetLevelMissing(plan, levels) {
  const p = normalizePlan(plan);
  return p.level != null && !levels.includes(p.level);
}
