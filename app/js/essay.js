// Local checks for free writing (issue #28): one sentence from a picture and a word (HSK 3 writing part 2) now,
// short essays later (HSK 4+). Pure logic, no DOM. It cannot judge meaning or grammar; it catches the mistakes a
// machine can see for sure and warns about common slips. The learner still compares with model answers.
//
// result = { ok, hanzi, checks: [{ id, level: "error" | "warn", msg }], above: [chars above the level] }
//   ok = no "error" (errors: empty, required word missing, no final punctuation)

const HAN = /[一-鿿]/u;
const END = /[。！？]$/u;
const END_ASCII = /[.!?]$/;
const LATIN = /[A-Za-z]/;

/** Common slips a learner can be warned about. Each pattern is narrow on purpose: a warning is a hint, not a mark. */
const SLIPS = [
  { re: /在见/u, msg: "在见 → mungkin maksudnya 再见 (sampai jumpa)." },
  { re: /再(家|学校|公司|医院|这儿|那儿|哪儿|中国)/u, msg: "再 + tempat → mungkin maksudnya 在 (di)." },
  { re: /工做|做业/u, msg: "做/作: 工作 dan 作业 memakai 作." },
  { re: /作饭|作菜/u, msg: "做/作: 做饭 dan 做菜 memakai 做." },
  { re: /(跑|走|说|写|做|吃|睡|唱|跳|学|考|来|起|洗|打)的(很|非常|太|特别|真|不)/u, msg: "Kata kerja + 的 + keterangan → mungkin maksudnya 得 (mis. 跑得很快)." },
  // 我是很忙。 is a classic slip; 这是很好的办法。 is fine (the 的 phrase), so only a short adjective at the end counts
  { re: /是(很|非常|太)[^的，。！？]{1,3}[。！？]$/u, msg: "是 + 很/非常 + kata sifat biasanya salah: kata sifat langsung menjadi predikat (我很忙, bukan 我是很忙)." },
];

export function hanziCount(text) {
  return [...String(text ?? "")].filter((c) => HAN.test(c)).length;
}

/** Hanzi allowed up to `level`: every character of the syllabus words up to that level. */
export function allowedChars(vocab, level) {
  const set = new Set();
  for (const w of vocab) if (w.level <= level) for (const c of w.word) set.add(c);
  return set;
}

/** Check one sentence. opts: { word (required), allowed (Set of hanzi, optional), minHanzi, maxHanzi }. */
export function checkSentence(text, { word = "", allowed = null, minHanzi = 5, maxHanzi = 30 } = {}) {
  const t = String(text ?? "").normalize("NFC").trim();
  const checks = [];
  const add = (id, level, msg) => checks.push({ id, level, msg });
  const n = hanziCount(t);
  if (!n) {
    add("empty", "error", "Belum ada kalimat.");
    return { ok: false, hanzi: 0, checks, above: [] };
  }
  if (word && !t.includes(word)) add("word", "error", `Kata wajib ${word} belum dipakai.`);
  if (!END.test(t)) add("end", "error", END_ASCII.test(t) ? "Pakai tanda baca Tionghoa di akhir kalimat (。！？), bukan . ! ?" : "Akhiri kalimat dengan 。, ！, atau ？");
  if (n < minHanzi) add("short", "warn", `Kalimat sangat pendek (${n} hanzi). Coba tambahkan keterangan waktu, tempat, atau orang.`);
  if (n > maxHanzi) add("long", "warn", `Kalimat panjang (${n} hanzi). Di ujian cukup satu kalimat yang jelas.`);
  if (LATIN.test(t)) add("latin", "warn", "Ada huruf Latin; di ujian tulis kalimat dengan hanzi.");
  if (/[,;:]/.test(t)) add("comma", "warn", "Pakai tanda baca Tionghoa (，；：), bukan , ; :");
  const above = allowed ? [...new Set([...t].filter((c) => HAN.test(c) && !allowed.has(c)))] : [];
  if (above.length) add("above", "warn", `Hanzi di atas level ini: ${above.join(" ")}. Boleh, tetapi periksa artinya.`);
  for (const s of SLIPS) if (s.re.test(t)) add("slip", "warn", s.msg);
  return { ok: !checks.some((c) => c.level === "error"), hanzi: n, checks, above };
}
