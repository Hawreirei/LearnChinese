import { h, btn, speakSequence, stopSpeaking, listeningParts, hasChineseVoice } from "../ui.js";
import { LEVEL_LABEL } from "../deck.js";
import { check } from "../practice.js";
import { wordIdOfQuestion } from "../analytics.js";
import { availability, examAvailable, buildExam, formatClock, gradeSection, summarizeExam, SKILL_LABEL, MAX_AUDIO_PLAYS } from "../exam.js";
import { questionBody, explanation, answerLabel } from "./question.js";
import { packReview, unpackReview, filterReview, reviewCounts, responseText } from "../review.js";

let S = { phase: "intro", level: 1 };
let timer = null;

export const examRunning = () => S.phase === "running" || S.phase === "between";
/** Preselect the level on the intro screen (the "Hari ini" mock exam task). No effect while an exam runs. */
export function presetExamLevel(level) { if (S.phase === "intro" && level) S.level = level; }
export function abortExam() { clearInterval(timer); timer = null; stopSpeaking(); S = { phase: "intro", level: S.level }; }

/** Open the saved review of the last mock exam of `level` (from Kemajuan). */
export function openExamReview(app, level) {
  if (examRunning()) return;
  const review = loadReview(app, level);
  if (!review) return;
  S = { phase: "review", level, review, filter: "wrong", from: "progress" };
  app.go("exam");
}
/** Leaving the tab: a review opened from Kemajuan closes; a review opened from a result goes back to the result. */
export function leaveExam() {
  stopSpeaking();
  if (S.phase === "review") S = S.from === "result" ? { ...S, phase: "result" } : { phase: "intro", level: S.level };
}
function loadReview(app, level) {
  return unpackReview(app.store.examReview(level), new Map(app.questions.map((q) => [q.id, q])));
}

export function viewExam(app) {
  if (S.phase === "review") return reviewView(app);
  if (S.phase === "intro") return intro(app);
  if (S.phase === "between") return between(app);
  if (S.phase === "running") return running(app);
  return result(app);
}

const isBlank = (r) => r === undefined || r === null || r === "";

/* ---------- intro ---------- */
function intro(app) {
  const { render, questions, blueprints, store } = app;
  const bp = blueprints[String(S.level)];
  const avail = availability(questions, bp);
  const ok = examAvailable(questions, bp);
  const picker = h("div", { class: "seg", role: "radiogroup", "aria-label": "Level ujian" }, ...[1, 2, 3, 4, 5, 6].map((l) => {
    const can = blueprints[String(l)] && examAvailable(questions, blueprints[String(l)]);
    return h("label", { style: can ? "" : "opacity:.45" }, h("input", { type: "radio", name: "lvl", value: l, checked: S.level === l, disabled: !can, onchange: () => { S.level = l; viewExam(app); } }), h("span", {}, LEVEL_LABEL[l]));
  }));
  const prev = store.exams.filter((x) => x.level === S.level).slice(-1)[0];
  render(
    h("div", { class: "pagehead" }, h("div", {}, h("h2", {}, "Simulasi Ujian"), h("p", { class: "hint" }, "Jumlah soal, pembagian bagian, dan waktu mengikuti tabel resmi CTI. Hasilnya perkiraan latihan, bukan skor resmi."))),
    h("div", { class: "split even" },
      h("div", { style: "display:grid;gap:18px" },
        h("div", { class: "panel" }, h("h2", {}, "Pilih level"), picker,
          h("p", { class: "hint", style: "margin-top:14px" }, `Total ${bp.total_questions} soal. Waktu resmi total ±${bp.total_time_min} mnt (termasuk pengisian data diri dan lembar jawaban; di sini hanya waktu pengerjaan).`),
          prev ? h("p", { class: "hint" }, `Percobaan terakhir HSK ${S.level}: ${prev.pct}% (${new Date(prev.t).toLocaleDateString("id-ID")}).`) : null,
          ok ? null : h("p", { class: "notice" }, `Soal untuk ${LEVEL_LABEL[S.level]} belum cukup banyak.`),
          h("div", { class: "row", style: "justify-content:flex-start" }, btn("Mulai ujian", () => start(app), "btn primary", { id: "exam-start", disabled: !ok }))),
        h("p", { class: "notice" }, `Waktu tidak bisa dijeda. Setiap bagian berakhir otomatis saat waktu habis dan tidak bisa dibuka lagi. Gunakan headphone bila ada soal mendengar. Audio bisa diputar maksimal ${MAX_AUDIO_PLAYS} kali per soal (aturan resmi tidak disebutkan di dokumen CTI).`)),
      h("div", { class: "panel" }, h("h2", {}, `Struktur ${LEVEL_LABEL[S.level]}`),
        h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, ...["Bagian", "Soal", "Waktu", "Tersedia", "Jenis soal resmi"].map((t) => h("th", {}, t)))),
          h("tbody", {}, ...bp.sections.map((s, i) => h("tr", {}, h("td", {}, SKILL_LABEL[s.skill]), h("td", {}, s.count), h("td", {}, `${s.time_min} mnt`), h("td", {}, `${avail[i].have}${avail[i].ok ? " ✔" : " ✘"}`), h("td", {}, `${avail[i].officialParts}/${avail[i].totalParts} bagian`)))))),
        h("p", { class: "hint" }, "Bagian yang jenis soalnya sudah kami punya (bergambar, teks, dialog, isi kata, tulis hanzi) memakai jenis resmi; sisanya memakai pengganti terdekat. Gambar dibuat dari emoji."))));
}

function start(app) {
  const exam = buildExam(app.questions, app.blueprints[String(S.level)]);
  S = { phase: "between", level: S.level, exam, sec: 0, graded: [], durations: [], responses: exam.sections.map((s) => new Array(s.items.length).fill(undefined)), plays: {}, assisted: false, startedAt: Date.now() };
  viewExam(app);
}

/* ---------- between sections ---------- */
function between(app) {
  const sec = S.exam.sections[S.sec];
  app.render(
    h("h2", {}, `HSK ${S.level} · Bagian ${S.sec + 1} dari ${S.exam.sections.length}: ${SKILL_LABEL[sec.skill]}`),
    h("div", { class: "card" }, h("div", { class: "hanzi" }, formatClock(sec.time_ms)), h("p", {}, `${sec.items.length} soal · waktu mulai berjalan saat Anda menekan tombol di bawah.`)),
    sec.skill === "listening" && hasChineseVoice() === false ? h("p", { class: "notice" }, "Perangkat ini tidak punya suara Mandarin. Anda masih bisa membuka teks soal, tetapi hasilnya ditandai 'dibantu teks'.") : null,
    h("div", { class: "row" }, btn("Mulai bagian ini", () => beginSection(app), "btn primary", { id: "begin" })),
    S.sec > 0 ? h("p", { class: "hint" }, "Bagian sebelumnya sudah dikunci.") : null);
}

function beginSection(app) {
  const sec = S.exam.sections[S.sec];
  Object.assign(S, { phase: "running", q: 0, sectionStart: Date.now(), textShown: {}, pinyinShown: {} });
  S.deadline = S.sectionStart + sec.time_ms;
  clearInterval(timer);
  timer = setInterval(() => tick(app), 250);
  viewExam(app);
}

function tick(app) {
  const left = S.deadline - Date.now();
  const el = document.getElementById("clock");
  if (el) { el.textContent = formatClock(left); el.classList.toggle("bad", left < 60_000); }
  if (left <= 0) endSection(app);
}

function endSection(app) {
  if (S.phase !== "running") return;
  clearInterval(timer); timer = null; stopSpeaking();
  const sec = S.exam.sections[S.sec];
  S.graded.push(gradeSection(sec, S.responses[S.sec], check));
  S.durations.push(Math.min(sec.time_ms, Date.now() - S.sectionStart));
  if (S.sec + 1 >= S.exam.sections.length) return finishExam(app);
  S.sec += 1; S.phase = "between";
  viewExam(app);
}

/* ---------- running ---------- */
function running(app) {
  const sec = S.exam.sections[S.sec];
  const q = sec.items[S.q];
  const resp = S.responses[S.sec];
  const unanswered = resp.filter(isBlank).length;
  const go = (i) => { S.q = Math.max(0, Math.min(sec.items.length - 1, i)); viewExam(app); };

  const used = S.plays[q.id] || 0;
  const m = {
    kind: "exam", response: resp[S.q], reveal: false, writeMode: app.store.settings.writeMode,
    onAnswer: (r) => { resp[S.q] = r; viewExam(app); },
    onWrite: (v) => {                                           // typing must not re-render (it would drop focus)
      resp[S.q] = v;
      document.querySelector(`.navbtn:nth-child(${S.q + 1})`)?.classList.toggle("done", !!v);
    },
    listening: {
      playsLeft: MAX_AUDIO_PLAYS - used,
      play: (rate) => { S.plays[q.id] = (S.plays[q.id] || 0) + 1; speakSequence(listeningParts(q), rate); viewExam(app); },
      textShown: !!S.textShown[q.id],
      toggleText: () => { S.textShown[q.id] = !S.textShown[q.id]; if (S.textShown[q.id]) S.assisted = true; viewExam(app); },
    },
    pinyin: { shown: !!S.pinyinShown[q.id], toggle: () => { S.pinyinShown[q.id] = !S.pinyinShown[q.id]; viewExam(app); } },
  };

  const nav = h("div", { class: "navgrid", role: "navigation", "aria-label": "Nomor soal" }, ...sec.items.map((_, i) => {
    const done = !isBlank(resp[i]);
    return btn(String(i + 1), () => go(i), `btn navbtn${done ? " done" : ""}${i === S.q ? " cur" : ""}`, { "aria-label": `Soal ${i + 1}${done ? ", sudah dijawab" : ""}` });
  }));
  const top = h("div", { class: "examtop" },
    h("div", {}, h("strong", {}, `HSK ${S.level} · ${SKILL_LABEL[sec.skill]}`), h("div", { class: "hint" }, `Soal ${S.q + 1}/${sec.items.length} · belum dijawab ${unanswered}`)),
    h("div", { id: "clock", class: "clock", role: "timer", "aria-live": "off" }, formatClock(S.deadline - Date.now())));
  app.render(top, nav, ...questionBody(q, m),
    h("div", { class: "row" }, btn("← Sebelumnya", () => go(S.q - 1), "btn", { disabled: S.q === 0 }), btn("Berikutnya →", () => go(S.q + 1), "btn", { id: "next-q", disabled: S.q === sec.items.length - 1 })),
    h("div", { class: "row" }, btn("Selesai bagian ini", () => {
      if (unanswered && !confirm(`Masih ada ${unanswered} soal belum dijawab. Akhiri bagian ini? Anda tidak bisa kembali.`)) return;
      endSection(app);
    }, "btn", { id: "end-section" })));
}

/* ---------- result ---------- */
function finishExam(app) {
  const sum = summarizeExam(S.graded, S.durations);
  const { store } = app;
  const before = store.exams.filter((x) => x.level === S.level).slice(-1)[0];
  S.graded.forEach((g) => g.rows.forEach((r) => store.recordAnswer(r.q.skill, r.correct, { k: "exam", l: S.level, ty: r.q.type, id: r.q.id, w: wordIdOfQuestion(r.q), ms: 0, un: !r.answered })));
  const t = Date.now();
  store.recordExam({ t, level: S.level, pct: sum.pct, correct: sum.correct, total: sum.total, assisted: S.assisted, duration_ms: Date.now() - S.startedAt, sections: sum.sections });
  store.saveExamReview(packReview({ t, level: S.level, graded: S.graded }));
  S = { ...S, phase: "result", sum, before };
  viewExam(app);
}

function result(app) {
  const { sum, before, graded } = S;
  const delta = before ? sum.pct - before.pct : null;
  const wrong = graded.flatMap((g) => g.rows.filter((r) => !r.correct));
  app.render(
    h("h2", {}, `Hasil Simulasi HSK ${S.level}`),
    h("div", { class: "card" }, h("div", { class: "hanzi" }, `${sum.correct}/${sum.total}`), h("div", { class: "gloss" }, `${sum.pct}%`),
      delta == null ? h("p", { class: "hint" }, "Ini percobaan pertama untuk level ini.") : h("p", { class: delta >= 0 ? "ok" : "bad" }, `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)} poin dibanding percobaan sebelumnya (${before.pct}%)`),
      S.assisted ? h("p", { class: "hint" }, "Ditandai dibantu: teks audio dibuka pada sebagian soal.") : null),
    h("table", {}, h("thead", {}, h("tr", {}, ...["Bagian", "Benar", "Dijawab", "%", "Waktu"].map((t) => h("th", {}, t)))),
      h("tbody", {}, ...sum.sections.map((s) => h("tr", {}, h("td", {}, SKILL_LABEL[s.skill]), h("td", {}, `${s.correct}/${s.total}`), h("td", {}, s.answered), h("td", {}, `${s.pct}%`), h("td", {}, formatClock(s.ms)))))),
    h("p", { class: "hint" }, `${S.exam.official_items} dari ${S.exam.total} soal memakai jenis soal resmi; sisanya pengganti terdekat. Bukan skor resmi HSK: sistem penilaian resmi belum diketahui.`),
    wrong.length ? null : h("p", {}, "Semua benar. 太好了！"),
    h("div", { class: "row" },
      btn(wrong.length ? `Lihat pembahasan (${wrong.length} salah atau kosong)` : "Lihat pembahasan", () => {
        const review = loadReview(app, S.level);
        if (review) { S = { ...S, phase: "review", review, filter: wrong.length ? "wrong" : "all", from: "result" }; viewExam(app); window.scrollTo(0, 0); }
      }, "btn primary", { id: "exam-review" }),
      btn("Simulasi lagi", () => { S = { phase: "intro", level: S.level }; viewExam(app); }, "btn", { id: "exam-again" })));
}

/* ---------- review (issue #24) ---------- */
const STATUS = (r) => (r.correct ? ["benar", "ok"] : r.answered ? ["salah", "bad"] : ["tidak dijawab", "bad"]);

/** One question, drawn by question.js with the answer revealed. Toggles redraw only this item (keeps the scroll). */
function reviewItem(app, row) {
  const el = h("article", { class: "review-item" });
  let textShown = false, pinyinShown = false;
  const draw = () => {
    const { q } = row;
    const [label, cls] = STATUS(row);
    const m = {
      kind: "practice", response: row.response, reveal: true, writeMode: app.store.settings.writeMode,
      onAnswer: () => {}, onWrite: () => {},
      listening: { playsLeft: null, play: (rate) => speakSequence(listeningParts(q), rate), textShown, toggleText: () => { textShown = !textShown; draw(); } },
      pinyin: { shown: pinyinShown, toggle: () => { pinyinShown = !pinyinShown; draw(); } },
    };
    el.replaceChildren(
      h("div", { class: "review-head" }, h("strong", {}, `Soal ${row.n}`), h("span", { class: `badge ${cls}` }, label),
        row.substitute ? h("span", { class: "badge", title: "Jenis soal resmi belum tersedia; diganti jenis terdekat" }, "pengganti") : null),
      ...questionBody(q, m),
      h("p", { class: "review-answer" }, h("span", {}, "Jawaban Anda: ", h("strong", { lang: "zh-Hans" }, responseText(q, row.response))),
        h("span", {}, "Jawaban benar: ", h("strong", { lang: "zh-Hans" }, answerLabel(q)))),
      explanation(q));
  };
  draw();
  return el;
}

function reviewView(app) {
  const R = S.review;
  const counts = reviewCounts(R);
  const shown = filterReview(R, S.filter);
  const total = shown.reduce((a, s) => a + s.rows.length, 0);
  const filter = h("div", { class: "seg", role: "radiogroup", "aria-label": "Tampilkan" },
    ...[["wrong", `Salah/kosong (${counts.wrong})`], ["blank", `Kosong (${counts.blank})`], ["all", `Semua (${counts.all})`]].map(([k, label]) =>
      h("label", {}, h("input", { type: "radio", name: "rvf", value: k, checked: S.filter === k, onchange: () => { S.filter = k; stopSpeaking(); viewExam(app); } }), h("span", {}, label))));
  const back = S.from === "result"
    ? btn("← Kembali ke hasil", () => { stopSpeaking(); S = { ...S, phase: "result" }; viewExam(app); }, "btn")
    : btn("← Kembali ke Kemajuan", () => app.go("progress"), "btn");
  app.render(
    h("div", { class: "pagehead" }, h("div", {}, h("h2", {}, `Pembahasan Simulasi HSK ${R.level}`),
      h("p", { class: "hint" }, `${new Date(R.t).toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })} · audio bisa diputar ulang tanpa batas di sini.`))),
    h("div", { class: "row left" }, back),
    filter,
    R.missing ? h("p", { class: "notice" }, `${R.missing} soal tidak bisa ditampilkan karena bank soal sudah diperbarui sejak ujian ini.`) : null,
    total ? null : h("p", { class: "empty" }, S.filter === "blank" ? "Semua soal dijawab." : "Tidak ada soal yang salah. 太好了！"),
    ...shown.filter((s) => s.rows.length).flatMap((s) => [
      h("h3", { class: "review-sec" }, `${SKILL_LABEL[s.skill]} (${s.rows.length})`),
      ...s.rows.map((r) => reviewItem(app, r))]),
    total > 3 ? h("div", { class: "row left" }, back) : null);
}
