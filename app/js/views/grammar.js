// Tata bahasa (issue #30): grammar points per level, a page per point, and its drills run in Latihan.
// Explanations are our own (Indonesian), examples stay within the level's vocabulary; progress comes from the log.
import { h, btn, speak } from "../ui.js";
import { LEVEL_LABEL, shuffle } from "../deck.js";
import { withTiles } from "../practice.js";
import { grammarProgress, statusOf, groupPoints, nextPoint } from "../grammar.js";
import { startPracticeWith } from "./practice.js";

let G = { screen: "list", id: null, level: null };

/** Open one point (from links in lessons, explanations, or other points). */
export function openGrammar(app, id) {
  G = { ...G, screen: "point", id };
  app.go("grammar");
  window.scrollTo(0, 0);
}

export function viewGrammar(app) {
  if (!app.grammar?.length) return app.render(h("p", { class: "notice" }, "Data tata bahasa belum termuat."));
  const point = G.screen === "point" && app.grammar.find((p) => p.id === G.id);
  return point ? pointView(app, point) : listView(app);
}

function practise(app, p) {
  const set = shuffle(p.drills).map((q) => withTiles(q.options ? { ...q, options: shuffle(q.options) } : q, app.questions));   // order items get their pieces
  app.go("practice");
  startPracticeWith(app, set, { label: `← Kembali ke ${p.title.split(":")[0]}`, go: () => openGrammar(app, p.id) });
}

function listView(app) {
  const progress = grammarProgress(app.grammar, app.store.events);
  const groups = groupPoints(app.grammar);
  const levels = groups.map((g) => g.level);
  if (G.level == null || !levels.includes(G.level)) G.level = levels.find((l) => app.store.settings.levels.includes(l)) ?? levels[0];
  const next = nextPoint(app.grammar, progress, [G.level]);
  const chips = h("div", { class: "chips", role: "group", "aria-label": "Level" }, ...groups.map((g) => {
    const mastered = g.points.filter((p) => progress[p.id].mastered).length;
    return h("button", { type: "button", class: `chip-btn${g.level === G.level ? " on" : ""}`, "aria-pressed": String(g.level === G.level), onclick: () => { G.level = g.level; viewGrammar(app); } },
      `${LEVEL_LABEL[g.level]} · ${mastered}/${g.points.length}`);
  }));
  const shown = groups.find((g) => g.level === G.level)?.points ?? [];
  app.render(
    h("div", { class: "pagehead" }, h("div", {}, h("h2", {}, "Tata bahasa 语法"),
      h("p", { class: "hint" }, "Pola kalimat per level dengan penjelasan bahasa Indonesia, contoh di dalam kosakata level itu, kesalahan umum penutur Indonesia, dan latihan. Ditulis sendiri, belum direview penutur asli."))),
    chips,
    next ? h("div", { class: "target-card" }, h("div", { class: "tc-main" }, h("div", { class: "eyebrow" }, "Berikutnya"), h("strong", {}, next.title), h("p", { class: "hint", lang: "zh-Hans" }, next.pattern)),
      btn("Buka", () => openGrammar(app, next.id), "btn primary")) : h("p", { class: "ok" }, `Semua pola ${LEVEL_LABEL[G.level]} sudah dikuasai ✓`),
    h("div", { class: "gram-grid" }, ...shown.map((p, i) => {
      const st = statusOf(progress[p.id]);
      return h("button", { type: "button", class: `gram-card ${st.key}`, onclick: () => openGrammar(app, p.id) },
        h("span", { class: "gnum" }, String(i + 1)),
        h("strong", {}, p.title), h("span", { class: "gpat", lang: "zh-Hans" }, p.pattern),
        h("span", { class: `badge ${st.key === "ok" ? "ok" : ""}` }, st.label));
    })));
}

function pointView(app, p) {
  const pr = grammarProgress([p], app.store.events)[p.id];
  const st = statusOf(pr);
  const byId = new Map(app.grammar.map((x) => [x.id, x]));
  const say = (t) => btn("🔊", () => speak(t), "btn spplay", { "aria-label": `Dengar ${t}` });
  app.render(
    h("div", { class: "row left" }, btn("← Semua pola", () => { G.screen = "list"; viewGrammar(app); }, "btn")),
    h("div", { class: "eyebrow" }, `${LEVEL_LABEL[p.level]} · tata bahasa`),
    h("h2", {}, p.title),
    h("div", { class: "gpattern", lang: "zh-Hans" }, p.pattern),
    ...p.explain.map((t) => h("p", {}, t)),
    h("h3", {}, "Contoh"),
    h("div", { class: "glist" }, ...p.examples.map((e) => h("div", { class: "spmodel" }, say(e.zh),
      h("div", {}, h("div", { class: "zh", lang: "zh-Hans" }, e.zh), h("div", { class: "py" }, e.pinyin), h("div", { class: "tr" }, e.id))))),
    p.pitfalls.length ? h("h3", {}, "Kesalahan umum") : null,
    p.pitfalls.length ? h("div", { class: "glist" }, ...p.pitfalls.map((f) => h("div", { class: "gpit" },
      h("div", { class: "bad", lang: "zh-Hans" }, `✘ ${f.wrong}`), h("div", { class: "ok", lang: "zh-Hans" }, `✔ ${f.right}`),
      h("div", { class: "py" }, f.right_pinyin), h("div", { class: "hint" }, f.why)))) : null,
    p.contrast.length ? h("p", { class: "hint" }, "Bandingkan dengan: ", ...p.contrast.filter((c) => byId.has(c)).map((c) =>
      btn(byId.get(c).title, () => openGrammar(app, c), "btn mini-text"))) : null,
    h("div", { class: "panel" }, h("h2", {}, `Latihan (${p.drills.length} soal)`),
      h("p", { class: "hint" }, `${st.label}. Dikuasai bila semua soal sudah dijawab dan jawaban terakhir ≥80% benar. Soal yang salah masuk buku kesalahan.`),
      h("div", { class: "row left" }, btn(pr.done ? "Latihan lagi" : "Mulai latihan", () => practise(app, p), "btn primary", { id: "g-practice" }))));
}
