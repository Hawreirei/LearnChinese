// Speaking simulation (issue #29), opened from the Ujian tab. Format from an UNOFFICIAL blueprint (verified: false).
// Flow per step: listen (TTS) -> prepare (countdown) -> speak (recording starts and stops by itself).
// Recordings live only in memory (blob URLs, revoked when leaving); nothing is uploaded by the app. With speech
// recognition on (Pengaturan), the browser's recognizer gives a transcript: repeat items are scored like lesson
// speaking, open answers get a transcript, speed and the syllabus words used. Open answers are rated by the learner.
import { h, btn, speak, speakThen, stopSpeaking } from "../ui.js";
import { LEVEL_LABEL } from "../deck.js";
import { startAttempt, scoreAttempt, recognitionSupported, recorderSupported, errorMessage, PASS_PCT } from "../speech.js";
import { buildPaper, stepsOf, timeLeft, plannedMs, openStats, summarize, rubricPct, TASK_LABEL, TASK_HELP, RUBRIC, RUBRIC_SCALE } from "../speakexam.js";
import { formatClock } from "../exam.js";

let SP = { phase: "off" };
let timer = null;

const scoring = (app) => recognitionSupported() && app.store.settings.scoreSpeech;
export const speakingActive = () => SP.phase !== "off";
export const speakingRunning = () => SP.phase === "running" || SP.phase === "part";

/** Free everything that is live: clock, voice, microphone, recordings. */
function release() {
  clearInterval(timer); timer = null;
  SP.cancelTts?.(); stopSpeaking();
  SP.attempt?.stop();
  for (const r of SP.results ?? []) if (r?.audio) URL.revokeObjectURL(r.audio);
}
/** Leaving the Ujian tab (or aborting): stop and forget the session. */
export function leaveSpeaking() { if (SP.phase !== "off") { release(); SP = { phase: "off" }; } }

export function openSpeaking(app, level) {
  leaveSpeaking();
  SP = { phase: "intro", level };
  app.render(...introNodes(app));
}

export function viewSpeaking(app) {
  if (SP.phase === "intro") return app.render(...introNodes(app));
  if (SP.phase === "part") return partIntro(app);
  if (SP.phase === "running") return running(app);
  return resultView(app);
}

/* ---------- intro ---------- */
function introNodes(app) {
  const data = app.speaking[String(SP.level)];
  const bp = data.blueprint;
  const paper = buildPaper(data);
  const mic = h("div", {});
  const micTest = btn("🎙️ Tes mikrofon (3 detik)", async () => {
    mic.replaceChildren(h("p", { class: "hint", role: "status" }, "Merekam… ucapkan 你好"));
    const r = await startAttempt({ recognize: false, record: true, maxMs: 3000 }).result;
    mic.replaceChildren(r.audioUrl ? h("audio", { controls: true, src: r.audioUrl }) : h("p", { class: "notice" }, errorMessage(r.error)));
  }, "btn", { disabled: !recorderSupported() });
  return [
    h("div", { class: "pagehead" }, h("div", {}, h("h2", {}, `Simulasi Speaking ${LEVEL_LABEL[SP.level]}`),
      h("p", { class: "hint" }, `±${bp.total_time_min} menit, ${paper.parts.reduce((a, p) => a + p.count, 0)} tugas. Waktu persiapan dan bicara berjalan sendiri, seperti ujian.`))),
    h("p", { class: "notice" }, "Format belum resmi: dokumen struktur ujian CTI untuk HSK 1–6 tidak memuat speaking. Bentuk ini mengikuti panduan pihak ketiga dan akan diganti saat contoh soal resmi terbit. Hasilnya perkiraan latihan."),
    h("div", { class: "split even" },
      h("div", { class: "panel" }, h("h2", {}, "Bagian"),
        h("div", { class: "tablewrap" }, h("table", {}, h("thead", {}, h("tr", {}, ...["Bagian", "Tugas", "Jumlah", "Persiapan", "Bicara"].map((t) => h("th", {}, t)))),
          h("tbody", {}, ...bp.parts.map((p) => h("tr", {}, h("td", {}, p.id), h("td", {}, TASK_LABEL[p.type]), h("td", {}, p.count),
            h("td", {}, p.prep_s ? `${p.prep_s} dtk` : "–"), h("td", {}, `${p.speak_s} dtk`)))))),
        h("p", { class: "hint" }, `Perkiraan total waktu: ${Math.round(plannedMs(paper) / 60000)} menit.`)),
      h("div", { class: "panel" }, h("h2", {}, "Sebelum mulai"),
        h("ul", { class: "kv" },
          h("li", {}, h("span", {}, "Perekaman"), h("span", { class: recorderSupported() ? "ok" : "bad" }, recorderSupported() ? "tersedia" : "tidak tersedia")),
          h("li", {}, h("span", {}, "Pengenalan ucapan"), h("span", { class: scoring(app) ? "ok" : "muted" }, scoring(app) ? "aktif (kalimat ulang dinilai otomatis)" : "mati / tidak didukung (nilai sendiri)"))),
        micTest, mic,
        h("p", { class: "hint" }, "Rekaman hanya ada di halaman ini dan hilang saat Anda keluar; aplikasi tidak menyimpan atau mengirimnya. Di Chrome/Edge, pengenalan ucapan diproses penyedia browser lewat internet (bisa dimatikan di Pengaturan)."))),
    recorderSupported() || scoring(app) ? null : h("p", { class: "notice" }, "Perangkat atau browser ini tidak bisa merekam suara maupun mengenali ucapan, jadi simulasi speaking tidak bisa dijalankan. Coba Chrome, Edge, atau Safari terbaru."),
    h("div", { class: "row" },
      btn("Mulai simulasi speaking", () => start(app, paper), "btn primary", { id: "sp-start", disabled: !(recorderSupported() || scoring(app)) }),
      btn("Kembali", () => { leaveSpeaking(); app.go("exam"); }, "btn")),
  ];
}

function start(app, paper) {
  SP = { phase: "part", level: SP.level, paper, steps: stepsOf(paper), i: 0, results: [], startedAt: Date.now() };
  viewSpeaking(app);
}

/* ---------- running ---------- */
function partIntro(app) {
  const s = SP.steps[SP.i];
  const p = SP.paper.parts[s.part];
  app.render(
    h("h2", {}, `Bagian ${s.part + 1} dari ${SP.paper.parts.length}: ${TASK_LABEL[s.type]}`),
    h("div", { class: "card" }, h("p", {}, TASK_HELP[s.type]),
      h("p", { class: "hint" }, `${p.count} tugas · ${p.prep_s ? `persiapan ${p.prep_s} detik, ` : ""}bicara ${p.speak_s} detik.`)),
    h("div", { class: "row" }, btn("Mulai bagian ini", () => { SP.phase = "running"; enterPhase(app, 0); }, "btn primary", { id: "sp-part" })));
}

function enterPhase(app, k) {
  const s = SP.steps[SP.i];
  SP.ph = k; SP.phaseStart = Date.now();
  const phase = s.phases[k];
  clearInterval(timer); timer = null;
  if (phase.kind === "listen") {
    SP.cancelTts = speakThen(s.item.zh, () => { SP.cancelTts = null; if (SP.phase === "running" && SP.steps[SP.i] === s && SP.ph === k) enterPhase(app, k + 1); });
  } else if (phase.kind === "prep") {
    timer = setInterval(() => { if (timeLeft(phase, SP.phaseStart).over) enterPhase(app, k + 1); else tick(phase); }, 250);
  } else {
    record(app, s, phase);
    timer = setInterval(() => tick(phase), 250);
  }
  viewSpeaking(app);
}

function tick(phase) {
  const el = document.getElementById("spclock");
  if (!el) return;
  const { leftMs } = timeLeft(phase, SP.phaseStart);
  el.textContent = formatClock(leftMs);
  el.classList.toggle("bad", leftMs < 10_000);
}

async function record(app, s, phase) {
  const useScore = scoring(app);
  const ctl = startAttempt({ recognize: useScore, record: true, maxMs: phase.ms, continuous: s.type !== "repeat_sentence" });
  SP.attempt = ctl;
  const t0 = Date.now();
  const r = await ctl.result;
  if (SP.attempt !== ctl) { if (r.audioUrl) URL.revokeObjectURL(r.audioUrl); return; }   // aborted or left meanwhile
  SP.attempt = null;
  const res = { type: s.type, item: s.item, audio: r.audioUrl, durationMs: Date.now() - t0, error: r.error && !r.alternatives.length ? r.error : null };
  if (s.type === "repeat_sentence" && useScore) {
    if (r.alternatives.length) { res.score = scoreAttempt(s.item, r.alternatives); res.pct = res.score.pct; }
    else if (!r.error || r.error === "no-speech") res.pct = 0;      // nothing heard counts as 0; a failed recognizer (network…) is not scored
  } else res.transcript = r.alternatives[0] ?? "";
  SP.results[SP.i] = res;
  nextStep(app);
}

function nextStep(app) {
  clearInterval(timer); timer = null;
  SP.i += 1;
  if (SP.i >= SP.steps.length) return finish(app);
  SP.phase = SP.steps[SP.i].firstOfPart ? "part" : "running";
  if (SP.phase === "running") enterPhase(app, 0); else viewSpeaking(app);
}

function running(app) {
  const s = SP.steps[SP.i];
  const phase = s.phases[SP.ph];
  const label = { listen: "🎧 Dengarkan…", prep: "Persiapan", speak: "● Merekam — bicara sekarang" }[phase.kind];
  const clock = phase.ms ? h("div", { id: "spclock", class: "clock", role: "timer", "aria-live": "off" }, formatClock(timeLeft(phase, SP.phaseStart).leftMs)) : null;
  const body = s.type === "repeat_sentence"
    ? h("div", { class: "card" }, h("div", { class: "emoji big", "aria-hidden": "true" }, "🎧"), h("p", {}, "Dengarkan, lalu ulangi kalimatnya. Teks tidak ditampilkan."))
    : s.type === "describe_picture"
      ? h("div", { class: "card sentcard" }, h("span", { class: "emoji big", role: "img", "aria-label": s.item.alt }, s.item.emoji), h("p", { class: "hint" }, s.item.alt))
      : h("div", { class: "card" }, h("div", { class: "stem", lang: "zh-Hans" }, s.item.zh), h("div", { class: "pinyin" }, s.item.pinyin));
  const action = phase.kind === "prep" ? btn("Mulai bicara sekarang", () => enterPhase(app, SP.ph + 1), "btn", { id: "sp-skip" })
    : phase.kind === "speak" ? btn("Selesai bicara", () => SP.attempt?.stop(), "btn primary", { id: "sp-done" }) : null;
  app.render(
    h("div", { class: "examtop" },
      h("div", {}, h("strong", {}, `Speaking ${LEVEL_LABEL[SP.level]} · ${TASK_LABEL[s.type]}`), h("div", { class: "hint" }, `Bagian ${s.part + 1}/${SP.paper.parts.length} · tugas ${s.n}/${s.count}`)),
      clock),
    h("p", { class: `spphase ${phase.kind}`, role: "status" }, label),
    body,
    h("div", { class: "row" }, action));
}

/* ---------- result ---------- */
function finish(app) {
  clearInterval(timer); timer = null;
  SP.phase = "result";
  SP.t = Date.now();
  SP.ratings = {};
  for (const r of SP.results) {
    if (r?.type === "repeat_sentence" && typeof r.pct === "number") app.store.recordAnswer("speaking", r.pct >= PASS_PCT, { k: "speak", l: SP.level, ty: "repeat_sentence", id: r.item.id });
  }
  save(app);
  viewSpeaking(app);
}

function save(app) {
  const sum = summarize(SP.results.filter(Boolean), SP.ratings);
  app.store.recordSpeaking({ t: SP.t, level: SP.level, repeatPct: sum.repeat.pct, rubricPct: sum.rubricPct, estimate: sum.estimate, ratings: { ...SP.ratings } });
  return sum;
}

function audioOf(r) { return r?.audio ? h("audio", { controls: true, src: r.audio, preload: "none" }) : h("span", { class: "hint" }, r?.error ? errorMessage(r.error) : "Tidak ada rekaman."); }

function resultItem(app, r, words) {
  const it = r.item;
  const models = (it.models ?? []).map((m) => h("div", { class: "spmodel" }, btn("🔊", () => speak(m.zh), "btn spplay", { "aria-label": `Dengar contoh ${m.zh}` }),
    h("div", {}, h("div", { class: "zh", lang: "zh-Hans" }, m.zh), h("div", { class: "py" }, m.pinyin), h("div", { class: "tr" }, m.id))));
  if (r.type === "repeat_sentence") {
    return h("article", { class: "review-item" },
      h("div", { class: "review-head" }, h("strong", {}, TASK_LABEL[r.type]), typeof r.pct === "number" ? h("span", { class: `badge ${r.pct >= PASS_PCT ? "ok" : "bad"}` }, `${r.pct}%`) : h("span", { class: "badge" }, "tidak dinilai")),
      h("div", { class: "spmodel" }, btn("🔊", () => speak(it.zh), "btn spplay", { "aria-label": `Dengar ${it.zh}` }),
        h("div", {}, h("div", { class: "zh", lang: "zh-Hans" }, it.zh), h("div", { class: "py" }, it.pinyin), h("div", { class: "tr" }, it.id))),
      r.score ? h("p", { class: "hint" }, `Terdengar: ${r.score.heard || "—"}`) : r.pct === 0 ? h("p", { class: "hint" }, "Tidak ada suara yang terdengar.") : r.error ? h("p", { class: "hint" }, errorMessage(r.error)) : null,
      h("div", {}, h("span", { class: "hint" }, "Rekamanku: "), audioOf(r)));
  }
  const st = openStats(r.transcript, r.durationMs ?? 0, words, SP.level);
  return h("article", { class: "review-item" },
    h("div", { class: "review-head" }, h("strong", {}, TASK_LABEL[r.type])),
    r.type === "describe_picture" ? h("div", { class: "sentcard" }, h("span", { class: "emoji big", "aria-hidden": "true" }, it.emoji), h("span", { class: "hint" }, it.alt))
      : h("div", {}, h("div", { class: "zh", lang: "zh-Hans" }, it.zh), h("div", { class: "tr" }, it.id)),
    h("div", {}, h("span", { class: "hint" }, "Rekamanku: "), audioOf(r)),
    r.transcript ? h("p", {}, h("span", { class: "hint" }, "Transkrip (pengenal ucapan): "), h("span", { lang: "zh-Hans" }, r.transcript)) : h("p", { class: "hint" }, scoring(app) ? "Pengenal ucapan tidak menangkap kata apa pun." : "Tanpa transkrip (pengenalan ucapan mati)."),
    r.transcript ? h("p", { class: "hint" }, `${st.hanzi} hanzi${st.perMin ? ` · ±${st.perMin} hanzi/menit` : ""} · ${st.words.length} kata silabus, ${st.atLevel} di antaranya kata HSK ${SP.level}${st.atLevel ? `: ${st.words.filter((w) => w.level === SP.level).map((w) => w.word).join("、")}` : ""}`) : null,
    h("div", { class: "hint" }, "Contoh jawaban:"), ...models);
}

function resultView(app) {
  const res = SP.results.filter(Boolean);
  const sum = summarize(res, SP.ratings);
  const words = app.vocab.filter((w) => w.level <= SP.level);
  const rubric = h("div", { class: "panel" }, h("h2", {}, "Nilai jawaban terbuka Anda (gambar dan pertanyaan)"),
    h("p", { class: "hint" }, "Dengarkan rekaman Anda dan contoh jawaban, lalu nilai sendiri. Penguji sungguhan menilai dimensi serupa; skala resminya belum diumumkan."),
    ...RUBRIC.map((d) => h("fieldset", { class: "rubric" }, h("legend", {}, d.label, h("span", { class: "hint" }, ` — ${d.hint}`)),
      h("div", { class: "seg", role: "radiogroup", "aria-label": d.label }, ...RUBRIC_SCALE.map((o) =>
        h("label", {}, h("input", { type: "radio", name: `rb-${d.key}`, value: o.v, checked: SP.ratings[d.key] === o.v, onchange: () => { SP.ratings[d.key] = o.v; save(app); viewSpeaking(app); } }), h("span", {}, `${o.v} ${o.label}`)))))),
    rubricPct(SP.ratings) == null ? h("p", { class: "hint" }, "Isi keempat dimensi untuk menghitung perkiraan nilai.") : null);
  app.render(
    h("h2", {}, `Hasil Simulasi Speaking ${LEVEL_LABEL[SP.level]}`),
    h("div", { class: "card" },
      h("div", { class: "hanzi" }, sum.estimate == null ? "—" : `${sum.estimate}%`),
      h("div", { class: "gloss" }, "perkiraan"),
      h("p", { class: "hint" }, [
        sum.repeat.pct != null ? `Ulangi kalimat: rata-rata ${sum.repeat.pct}% hanzi terdengar (${sum.repeat.scored}/${sum.repeat.n} dinilai).` : `Ulangi kalimat: tidak dinilai otomatis${scoring(app) ? "" : " (pengenalan ucapan mati)"}.`,
        sum.rubricPct != null ? `Jawaban terbuka: ${sum.rubricPct}% menurut penilaian Anda.` : "Jawaban terbuka: belum dinilai.",
      ].join(" "))),
    rubric,
    ...SP.paper.parts.flatMap((p, pi) => [h("h3", { class: "review-sec" }, `${p.id} · ${TASK_LABEL[p.type]}`),
      ...SP.results.flatMap((r, i) => (r && SP.steps[i].part === pi ? [resultItem(app, r, words)] : []))]),
    h("p", { class: "hint" }, "Format belum resmi; nilai ini perkiraan latihan, bukan skor HSK."),
    h("div", { class: "row" },
      btn("Simulasi speaking lagi", () => { const lvl = SP.level; leaveSpeaking(); openSpeaking(app, lvl); }, "btn primary", { id: "sp-again" }),
      btn("Kembali ke Ujian", () => { leaveSpeaking(); app.go("exam"); }, "btn")));
}
