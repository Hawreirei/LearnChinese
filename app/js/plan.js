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
