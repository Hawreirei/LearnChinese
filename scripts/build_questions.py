#!/usr/bin/env python3
"""Generate practice questions (data/hsk3/questions.json) for HSK 1-2.

Types (names follow blueprints/hsk3.0):
  cloze_wordbank              reading   fill the blank in an example sentence (4 options, 1 correct)
  write_hanzi_from_pinyin     writing   type the missing hanzi given its pinyin
  order_sentence              writing   put shuffled word/punctuation pieces of an example sentence in order
  audio_question_pick_answer  listening hear a question (TTS), pick the answer (3 options)
  audio_statement_question_mcq listening hear a short statement and a question about it (HSK 1 part 4)
  match_question_to_answer    reading   groups of 5 questions + 6 answers (one extra); each question is one item
  choose_missing_character_component writing  a handwriting character with one component hidden; pick it (3 options)
  write_sentence_from_picture_and_word writing  picture + required word -> write one sentence (checked locally, model answers)

Sources are the hand-written, level-linted sentences (content/id/level-*.psv -> vocab_id.json) and the
hand-written Q&A pairs (content/id/qa-level-*.psv). Everything is deterministic (seeded by word id).
Quality rules are enforced here and re-checked in tests/test_questions.py.

Usage: python3 -I scripts/build_questions.py
"""
import importlib.util
import json
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("build_id", ROOT / "scripts" / "build_id.py")
bid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bid)

HAN = re.compile(r"[一-鿿]")
BLANK = "（　）"
# Coarse grammatical classes: a cloze distractor must come from a class the answer does NOT belong to,
# so only the answer fits the slot. Predicates (verbs/adjectives) are one group.
CLASS = {"名": "N", "代": "N", "数": "N", "量": "N", "数量": "N", "动": "P", "形": "P", "副": "D",
         "助": "F", "介": "F", "连": "F", "叹": "F", "前缀": "F", "后缀": "F", "拟声": "F"}
NO_BLANK_CHARS = set("的了们吗吧呢子儿")
# Words that can often fill a slot that "looks" wrong (sentence-final particles; adverbs such as 只/就/也/都
# are valid in many predicate slots), so they are never used as distractors for non-adverb/non-particle answers.
SLOT_FLEXIBLE = set("吗吧呢啊")


def classes(pos):
    """Classes of the non-parenthesised POS tags, e.g. '动、（名）' -> {'P'}; None if unknown."""
    toks = [t for t in re.findall(r"（[^）]*）|[^、（）]+", pos or "") if not t.startswith("（")]
    cl = {CLASS[t] for t in toks if t in CLASS}
    return cl or None


def load_all():
    vocab = {w["id"]: w for w in bid.load("vocab.json")}
    ent = {int(k): v for k, v in bid.load("vocab_id.json").items()}
    return vocab, ent


def label(w):
    return w["word"]


def word_classes(vocab):
    """word -> union of classes over ALL entries with that spelling (homographs like 花1 动 / 花2 名)."""
    wc = {}
    for w in vocab.values():
        wc.setdefault(w["word"], set()).update(classes(w["pos"]) or set())
    return wc


def make_cloze(vocab, ent):
    wc = word_classes(vocab)
    out = []
    for wid, e in sorted(ent.items()):
        w = vocab[wid]
        zh = e["contoh"]["zh"]
        cl = classes(w["pos"])
        if not cl or zh.count(w["word"]) != 1 or len(HAN.findall(zh)) < 4:
            continue
        rng = random.Random(wid)
        pool = [x for x in vocab.values()
                if x["level"] <= w["level"] and x["id"] != wid and x["word"] not in zh
                and x["word"] != w["word"] and classes(x["pos"]) and not (wc[x["word"]] & wc[w["word"]])
                and "、" not in x["word"] and len(x["word"]) <= 3
                and (x["word"] not in SLOT_FLEXIBLE or "F" in cl)
                and ("D" not in wc[x["word"]] or "D" in cl)]
        same_len = [x for x in pool if len(x["word"]) == len(w["word"])]
        src = same_len if len(same_len) >= 3 else pool
        picks, seen = [], {w["word"]}
        for x in rng.sample(src, len(src)):
            if x["word"] not in seen:
                picks.append(x)
                seen.add(x["word"])
            if len(picks) == 3:
                break
        if len(picks) < 3:
            continue
        opts = [w] + picks
        rng.shuffle(opts)
        out.append({
            "id": f"c{wid}", "type": "cloze_wordbank", "skill": "reading", "level": w["level"],
            "stem": zh.replace(w["word"], BLANK, 1),
            "options": [{"word": o["word"], "pinyin": o["pinyin"]} for o in opts],
            "answer": w["word"],
            "explain": {"zh": zh, "pinyin": e["contoh"]["pinyin"], "id": e["contoh"]["id"],
                        "word": w["word"], "word_pinyin": w["pinyin"], "arti": e["arti"]},
        })
    return out


def make_write(vocab, ent):
    """Blank one hanzi of the target word; keep only chars whose syllable is unique among the chars
    allowed at that level (no homophone could fill the slot)."""
    from pypinyin import Style, pinyin
    allowed = bid.allowed_chars(vocab)
    readings = {}

    def reads(ch):
        if ch not in readings:
            readings[ch] = {r[0] if isinstance(r, list) else r for r in pinyin(ch, style=Style.TONE, heteronym=True)[0]}
        return readings[ch]

    out = []
    for wid, e in sorted(ent.items()):
        w = vocab[wid]
        zh = e["contoh"]["zh"]
        word = w["word"]
        if "/" in w["pinyin"] or word.endswith("儿"):
            continue
        sylls = bid._split_official(w["pinyin"], len(word), [p[0] for p in pinyin(word, style=Style.TONE)])
        if not sylls:
            continue
        cands = []
        for i, ch in enumerate(word):
            syl = sylls[i]
            if not HAN.match(ch) or ch in NO_BLANK_CHARS or zh.count(ch) != 1:
                continue
            base = bid._base(syl)
            if syl.lower() == base:  # neutral tone: ambiguous
                continue
            others = [c for c in allowed[w["level"]] if c != ch and syl.lower() in {r.lower() for r in reads(c)}]
            if not others:
                cands.append((i, ch, syl.lower()))
        if not cands:
            continue
        i, ch, syl = cands[0]
        out.append({
            "id": f"w{wid}", "type": "write_hanzi_from_pinyin", "skill": "writing", "level": w["level"],
            "stem": zh.replace(ch, BLANK, 1), "hint_pinyin": syl, "answer": ch,
            "explain": {"zh": zh, "pinyin": e["contoh"]["pinyin"], "id": e["contoh"]["id"],
                        "word": word, "word_pinyin": w["pinyin"], "arti": e["arti"]},
        })
    return out


# Words that can move around in a Chinese sentence (time words) or join lists, so more than one order would be
# correct. Sentences containing them are never used for ordering items.
ORDER_AMBIGUOUS = {"今天", "明天", "昨天", "现在", "早上", "上午", "中午", "下午", "晚上", "每天", "以前", "以后",
                   "和", "或者", "还是", "一起", "已经", "刚才", "后天", "前天", "今年", "明年", "去年"}
PUNCT = "，。？！"
NUMBER_PIECES = set("一二三四五六七八九十百千万零两块毛元分个")


def segment(zh, words):
    """Forward maximum matching over `words` (a set of pure-hanzi syllabus words); punctuation is its own piece,
    an unknown hanzi becomes a one-character piece."""
    longest = max(map(len, words))
    out, i = [], 0
    while i < len(zh):
        if not HAN.match(zh[i]):
            out.append(zh[i])
            i += 1
            continue
        for n in range(min(longest, len(zh) - i), 0, -1):
            piece = zh[i:i + n]
            if n == 1 or (piece in words and all(HAN.match(c) for c in piece)):
                out.append(piece)
                i += n
                break
    return out


def make_order(vocab, ent):
    """One ordering item per example sentence with 3-7 word pieces and (practically) one valid order.
    Pieces are words of the syllabus up to the sentence's level; the answer is the audited sentence itself."""
    out, seen, by_level = [], set(), {}
    for wid, e in sorted(ent.items()):
        w = vocab[wid]
        zh = e["contoh"]["zh"]
        if zh in seen:
            continue
        words = by_level.get(w["level"])
        if words is None:
            words = by_level[w["level"]] = {x["word"] for x in vocab.values() if x["level"] <= w["level"] and all(HAN.match(c) for c in x["word"])}
        pieces = segment(zh, words)
        body = [t for t in pieces if t not in PUNCT]
        if "".join(pieces) != zh or not 3 <= len(body) <= 7 or not set(zh) - set(PUNCT):
            continue
        if sum(1 for t in body if t in NUMBER_PIECES) >= 3:
            continue                      # price/number strings (三块五毛): the pieces read as noise
        if any(t in ORDER_AMBIGUOUS for t in pieces) or any(not HAN.match(c) and c not in PUNCT for c in zh):
            continue
        clauses, cur = [], 0               # word pieces per comma-separated clause
        for t in pieces:
            if t == "，":
                clauses.append(cur)
                cur = 0
            elif t not in PUNCT:
                cur += 1
        clauses.append(cur)
        if sum(1 for n in clauses if n >= 2) > 1:
            continue                      # two full clauses could swap places
        seen.add(zh)
        out.append({
            "id": f"o{wid}", "type": "order_sentence", "skill": "writing", "level": w["level"],
            "stem": e["contoh"]["id"], "tokens": pieces, "answer": zh,
            "explain": {"zh": zh, "pinyin": e["contoh"]["pinyin"], "id": e["contoh"]["id"],
                        "word": w["word"], "word_pinyin": w["pinyin"], "arti": e["arti"]},
        })
    return out


def parse_qa(path, allowed, problems):
    items = []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        f = [x.strip() for x in line.split("|")]
        loc = f"{Path(path).name}:{n}"
        if len(f) != 7:
            problems.append(f"{loc}: expected 7 fields")
            continue
        level, q, ok, w1, w2, tq, ta = f
        level = int(level)
        opts = [ok, w1, w2]
        if len(set(opts)) != 3:
            problems.append(f"{loc}: options not distinct")
        for t in [q] + opts:
            bad = sorted({c for c in t if HAN.match(c) and c not in allowed[level]})
            if bad:
                problems.append(f"{loc}: chars above level {level}: {''.join(bad)} in {t!r}")
        items.append({"level": level, "q": q, "ok": ok, "wrong": [w1, w2], "tq": tq, "ta": ta})
    return items


def make_listen(allowed, problems):
    from pypinyin import Style, lazy_pinyin
    out, seen = [], set()
    for path in sorted((ROOT / "content" / "id").glob("qa-level-*.psv")):
        for it in parse_qa(path, allowed, problems):
            if it["q"] in seen:
                problems.append(f"duplicate question {it['q']!r}")
            seen.add(it["q"])
            rng = random.Random(it["q"])
            opts = [it["ok"]] + it["wrong"]
            rng.shuffle(opts)
            out.append({
                "id": f"l{len(out) + 1}", "type": "audio_question_pick_answer", "skill": "listening",
                "level": it["level"], "audio": it["q"],
                "audio_pinyin": bid.pinyin_line(it["q"], Style, lazy_pinyin),
                "options": [{"zh": o, "pinyin": bid.pinyin_line(o, Style, lazy_pinyin)} for o in opts],
                "answer": it["ok"],
                "explain": {"question_id": it["tq"], "answer_id": it["ta"]},
            })
    return out


SPEAKER = re.compile(r"^(男|女)：")

# ----------------------------------------------------------------------------------------------
# Picture questions (emoji "pictures": own-made, licence-free; swap in real images later via `src`)
# and reading-text questions (short texts for HSK 1-2, paragraphs for HSK 3).
# ----------------------------------------------------------------------------------------------
OBJECTS = [  # (noun, measure, emoji, Indonesian name)
    ("苹果", "个", "🍎", "apel"), ("猫", "只", "🐱", "kucing"), ("狗", "只", "🐶", "anjing"), ("书", "本", "📖", "buku"),
    ("鸡蛋", "个", "🥚", "telur"), ("饺子", "个", "🥟", "pangsit"), ("茶", "杯", "🍵", "cangkir teh"),
    ("面包", "个", "🍞", "roti"), ("牛奶", "杯", "🥛", "gelas susu"),
]
NUMS = {1: "一", 2: "两", 3: "三", 4: "四", 5: "五"}


def load_scenes(problems):
    path = ROOT / "content" / "pic" / "scenes.json"
    scenes = json.loads(path.read_text(encoding="utf-8"))
    allowed = bid.allowed_chars()
    ids = set()
    for sc in scenes:
        if sc["id"] in ids:
            problems.append(f"scenes.json: duplicate id {sc['id']}")
        ids.add(sc["id"])
        for st in sc["sentences"]:
            bad = sorted({c for c in st["zh"] if HAN.match(c) and c not in allowed[st["lvl"]]})
            if bad:
                problems.append(f"scenes.json: {sc['id']} sentence {st['zh']!r} uses chars above level {st['lvl']}: {''.join(bad)}")
            if sc["emoji"] == "" or not st["id"]:
                problems.append(f"scenes.json: {sc['id']} missing emoji/translation")
    if len({sc["group"] for sc in scenes}) < 8:
        problems.append("scenes.json: need at least 8 groups")
    return {sc["id"]: sc for sc in scenes}


def pic_option(sc):
    return {"key": sc["id"], "emoji": sc["emoji"], "alt": sc["alt"]}


def other_scenes(scenes, answer_id, k, rng):
    """k scenes from k DIFFERENT groups, none in the answer's group: at most one picture can fit the text."""
    groups = {}
    for sc in scenes.values():
        if sc["group"] != scenes[answer_id]["group"]:
            groups.setdefault(sc["group"], []).append(sc)
    chosen = rng.sample(sorted(groups), k)
    return [rng.choice(groups[g]) for g in chosen]


def make_pictures(problems):
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    allowed = bid.allowed_chars()
    scenes = load_scenes(problems)
    out = []
    nid = [0]

    def add(item):
        nid[0] += 1
        item["id"] = f"p{nid[0]}"
        out.append(item)

    # 1) hear a counted phrase, pick the picture (HSK 1)
    for noun, mw, emoji, alt in OBJECTS:
        for n in range(1, 6):
            phrase = f"{NUMS[n]}{mw}{noun}"
            for t in [phrase]:
                bad = sorted({c for c in t if HAN.match(c) and c not in allowed[1]})
                if bad:
                    problems.append(f"phrase {t!r} chars above level 1: {''.join(bad)}")
            rng = random.Random(phrase)
            wrong_n = rng.choice([x for x in range(1, 6) if x != n])
            other = rng.choice([o for o in OBJECTS if o[0] != noun])
            opts = [
                {"key": f"{noun}|{n}", "emoji": emoji * n, "alt": f"{n} {alt}"},
                {"key": f"{noun}|{wrong_n}", "emoji": emoji * wrong_n, "alt": f"{wrong_n} {alt}"},
                {"key": f"{other[0]}|{n}", "emoji": other[2] * n, "alt": f"{n} {other[3]}"},
            ]
            rng.shuffle(opts)
            add({"type": "audio_phrase_pick_picture", "skill": "listening", "level": 1, "audio": phrase, "audio_pinyin": py(phrase),
                 "dedupe": phrase, "options": opts, "answer": f"{noun}|{n}", "explain": {"audio_id": f"{n} {alt}"}})

    # 2) read a sentence, match the picture (reading) and 3) hear a sentence, pick the picture (listening)
    for sc in scenes.values():
        for st in sc["sentences"]:
            lvl = st["lvl"]
            if lvl > 2:
                continue
            rng = random.Random("r" + sc["id"] + st["zh"])
            opts = [pic_option(sc)] + [pic_option(o) for o in other_scenes(scenes, sc["id"], 5, rng)]
            rng.shuffle(opts)
            add({"type": "sentence_match_picture", "skill": "reading", "level": lvl, "sentence": st["zh"], "sentence_pinyin": py(st["zh"]),
                 "dedupe": "r:" + st["zh"], "options": opts, "answer": sc["id"], "explain": {"sentence_id": st["id"]}})
            rng = random.Random("a" + sc["id"] + st["zh"])
            opts = [pic_option(sc)] + [pic_option(o) for o in other_scenes(scenes, sc["id"], 2, rng)]
            rng.shuffle(opts)
            add({"type": "audio_sentence_pick_picture", "skill": "listening", "level": 2, "audio": st["zh"], "audio_pinyin": py(st["zh"]),
                 "dedupe": "a:" + st["zh"], "options": opts, "answer": sc["id"], "explain": {"audio_id": st["id"]}})

    # 4) hear a short dialog, match the picture (6 options)
    path = ROOT / "content" / "pic" / "dialogs.psv"
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        f = [x.strip() for x in line.split("|")]
        loc = f"dialogs.psv:{n}"
        if len(f) != 4 or f[1] not in scenes:
            problems.append(f"{loc}: bad line or unknown scene")
            continue
        lvl, sid, text, tr = int(f[0]), f[1], f[2], f[3]
        bad = sorted({c for c in text.replace("/", "") if HAN.match(c) and c not in allowed[lvl]})
        if bad:
            problems.append(f"{loc}: chars above level {lvl}: {''.join(bad)}")
        turns = []
        for part in text.split("/"):
            m = SPEAKER.match(part)
            if not m:
                problems.append(f"{loc}: every turn needs 男：/女：")
                continue
            turns.append({"who": m.group(1), "zh": SPEAKER.sub("", part), "pinyin": py(SPEAKER.sub("", part))})
        rng = random.Random("d" + text)
        opts = [pic_option(scenes[sid])] + [pic_option(o) for o in other_scenes(scenes, sid, 5, rng)]
        rng.shuffle(opts)
        add({"type": "audio_dialog_match_picture", "skill": "listening", "level": lvl, "turns": turns, "dedupe": "d:" + text,
             "options": opts, "answer": sid, "explain": {"text_id": tr}})
    return out


def make_texts(allowed, problems):
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    out = []
    for lvl in (1, 2, 3):
        path = ROOT / "content" / "id" / f"reading-level-{lvl}.psv"
        if not path.exists():
            continue
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            f = [x.strip() for x in line.split("|")]
            loc = f"{path.name}:{n}"
            if len(f) != 9:
                problems.append(f"{loc}: expected 9 fields, got {len(f)}")
                continue
            level, text, q, ok, w1, w2, t_text, t_q, t_ok = f
            level = int(level)
            opts = [ok, w1, w2]
            if len(set(opts)) != 3:
                problems.append(f"{loc}: options not distinct")
            if not q.startswith("★"):
                problems.append(f"{loc}: question must start with ★")
            for t in [text, q.lstrip("★ ")] + opts:
                bad = sorted({c for c in t if HAN.match(c) and c not in allowed[level]})
                if bad:
                    problems.append(f"{loc}: chars above level {level}: {''.join(bad)}")
            rng = random.Random(text + q)
            shuffled = opts[:]
            rng.shuffle(shuffled)
            out.append({
                "id": f"t{len(out) + 1}", "type": "short_text_mcq" if level < 3 else "passage_mcq", "skill": "reading", "level": level,
                "text": text, "text_pinyin": py(text), "question": q, "question_pinyin": py(q.lstrip("★ ")),
                "dedupe": "t:" + text + q, "options": [{"zh": o, "pinyin": py(o)} for o in shuffled], "answer": ok,
                "explain": {"text_id": t_text, "question_id": t_q, "answer_id": t_ok},
            })
    return out



def make_dialogs(allowed, problems, start_id):
    """HSK 2-3 listening: dialogs (audio_dialog_question_mcq) and short passages (audio_passage_question_mcq)."""
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    out = []
    seen = set()
    # dialog-level-3.psv first so the ids it has always had (d1...) stay stable for saved reviews and mistakes
    first = ROOT / "content" / "id" / "dialog-level-3.psv"
    paths = [first] + sorted(p for p in (ROOT / "content" / "id").glob("dialog-level-*.psv") if p != first)
    for path, n, line in ((p, n, line) for p in paths if p.exists() for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1)):
        if not line.strip() or line.startswith("#"):
            continue
        f = [x.strip() for x in line.split("|")]
        loc = f"{path.name}:{n}"
        if len(f) != 9:
            problems.append(f"{loc}: expected 9 fields, got {len(f)}")
            continue
        level, text, q, ok, w1, w2, t_text, t_q, t_ok = f
        level = int(level)
        opts = [ok, w1, w2]
        if len(set(opts)) != 3:
            problems.append(f"{loc}: options not distinct")
        if text in seen:
            problems.append(f"{loc}: duplicate text")
        seen.add(text)
        for t in [text.replace("/", ""), q] + opts:
            bad = sorted({c for c in t if HAN.match(c) and c not in allowed[level]})
            if bad:
                problems.append(f"{loc}: chars above level {level}: {''.join(bad)}")
        turns = []
        for part in text.split("/"):
            m = SPEAKER.match(part)
            turns.append({"who": m.group(1) if m else "", "zh": SPEAKER.sub("", part), "pinyin": py(SPEAKER.sub("", part))})
        dialog = len(turns) > 1 and all(t["who"] for t in turns)
        rng = random.Random(text)
        shuffled = opts[:]
        rng.shuffle(shuffled)
        out.append({
            "id": f"d{start_id + len(out)}",
            "type": "audio_dialog_question_mcq" if dialog else "audio_passage_question_mcq",
            "skill": "listening", "level": level, "turns": turns, "question": q, "question_pinyin": py(q),
            "options": [{"zh": o, "pinyin": py(o)} for o in shuffled], "answer": ok,
            "explain": {"text_id": t_text, "question_id": t_q, "answer_id": t_ok},
        })
    return out


# ----------------------------------------------------------------------------------------------
# Matching (match_question_to_answer) and statement listening (audio_statement_question_mcq).
# ----------------------------------------------------------------------------------------------
# What a question asks for, from its question word. Inside one matching group every question must ask for a
# different thing, and the extra answer must answer yet another kind, so each answer fits exactly one question.
QTAGS = [
    ("pilihan", r"还是"), ("mengapa", r"为什么"), ("harga", r"多少钱|怎么卖"), ("siapa", r"谁"),
    ("kapan", r"什么时候|几点|几号|几月|星期几|哪天|哪年"), ("durasi", r"多长时间|多久"), ("ukuran", r"多重|多高|多远|多长(?!时间)"),
    ("tempat", r"哪儿|哪里|在哪"), ("kondisi", r"怎么样"), ("cara", r"怎么"), ("jumlah", r"几|多少|多大"),
    ("yang-mana", r"哪"), ("apa", r"什么"), ("ya-tidak", r"吗[？?]?$|(.)不\1"),
]


def question_tag(q):
    q = q.lstrip("*").strip()
    for tag, pat in QTAGS:
        if re.search(pat, q):
            return tag
    return "lain"


def make_match(allowed, problems):
    """5 questions + 1 extra answer per group. Every question becomes one item whose options are the group's six
    answers in one fixed order (A-F), so consecutive items of a group read like the official matching part."""
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    out, seen = [], set()
    for path in sorted((ROOT / "content" / "id").glob("match-level-*.psv")):
        groups = {}
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            f = [x.strip() for x in line.split("|")]
            loc = f"{path.name}:{n}"
            if len(f) != 6:
                problems.append(f"{loc}: expected 6 fields, got {len(f)}")
                continue
            level, gid, q, a, tq, ta = f
            level = int(level)
            for t in [q.lstrip("*"), a]:
                bad = sorted({c for c in t if HAN.match(c) and c not in allowed[level]})
                if bad:
                    problems.append(f"{loc}: chars above level {level}: {''.join(bad)} in {t!r}")
            g = groups.setdefault((level, gid), {"pairs": [], "extra": [], "loc": loc})
            (g["extra"] if q.startswith("*") else g["pairs"]).append({"q": q, "a": a, "tq": tq, "ta": ta, "loc": loc})
        for (level, gid), g in groups.items():
            where = f"{path.name} group {gid}"
            if len(g["pairs"]) != 5 or len(g["extra"]) != 1:
                problems.append(f"{where}: need 5 pairs and 1 extra answer, got {len(g['pairs'])} + {len(g['extra'])}")
                continue
            tags = [question_tag(p["q"]) for p in g["pairs"]]
            extra_tag = question_tag(g["extra"][0]["q"])
            if len(set(tags)) != 5 or "lain" in tags:
                problems.append(f"{where}: questions must ask for 5 different things, got {tags}")
            if extra_tag in tags or extra_tag == "lain":
                problems.append(f"{where}: the extra answer ({extra_tag}) could answer one of the questions {tags}")
            answers = [p["a"] for p in g["pairs"]] + [g["extra"][0]["a"]]
            if len(set(answers)) != 6:
                problems.append(f"{where}: answers not distinct")
            rng = random.Random(f"{level}{gid}{answers[0]}")
            order = answers[:]
            rng.shuffle(order)
            options = [{"zh": a, "pinyin": py(a)} for a in order]
            for p in g["pairs"]:
                if p["q"] in seen:
                    problems.append(f"{p['loc']}: duplicate question {p['q']!r}")
                seen.add(p["q"])
                out.append({
                    "id": f"m{len(out) + 1}", "type": "match_question_to_answer", "skill": "reading", "level": level,
                    "group": f"{level}{gid}", "stem": p["q"], "stem_pinyin": py(p["q"]), "dedupe": "m:" + p["q"],
                    "options": options, "answer": p["a"],
                    "explain": {"question_id": p["tq"], "answer_id": p["ta"]},
                })
    return out


def make_statements(allowed, problems):
    """HSK 1 listening part 4: a short statement and a question about it, three short answers."""
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    out, seen = [], set()
    for path in sorted((ROOT / "content" / "id").glob("statement-level-*.psv")):
        for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if not line.strip() or line.startswith("#"):
                continue
            f = [x.strip() for x in line.split("|")]
            loc = f"{path.name}:{n}"
            if len(f) != 9:
                problems.append(f"{loc}: expected 9 fields, got {len(f)}")
                continue
            level, text, q, ok, w1, w2, t_text, t_q, t_ok = f
            level = int(level)
            opts = [ok, w1, w2]
            if len(set(opts)) != 3:
                problems.append(f"{loc}: options not distinct")
            if text in seen:
                problems.append(f"{loc}: duplicate statement")
            seen.add(text)
            for t in [text, q] + opts:
                bad = sorted({c for c in t if HAN.match(c) and c not in allowed[level]})
                if bad:
                    problems.append(f"{loc}: chars above level {level}: {''.join(bad)} in {t!r}")
            rng = random.Random(text)
            shuffled = opts[:]
            rng.shuffle(shuffled)
            out.append({
                "id": f"s{len(out) + 1}", "type": "audio_statement_question_mcq", "skill": "listening", "level": level,
                "turns": [{"who": "", "zh": text, "pinyin": py(text)}], "question": q, "question_pinyin": py(q),
                "dedupe": "s:" + text, "options": [{"zh": o, "pinyin": py(o)} for o in shuffled], "answer": ok,
                "explain": {"text_id": t_text, "question_id": t_q, "answer_id": t_ok},
            })
    return out


# ----------------------------------------------------------------------------------------------
# Choose the missing component (choose_missing_character_component), HSK 2 writing part 1.
# Splits come from data/hsk3/components.json (Make Me a Hanzi, LGPL; scripts/build_components.py); the app draws
# the character from its stroke data with the hidden component's strokes left out.
# ----------------------------------------------------------------------------------------------
# Components learners mix up; tried first as distractors (only those that are components somewhere in the list).
LOOKALIKE_PARTS = {
    "氵": "冫讠彳", "冫": "氵讠", "讠": "氵冫亻", "亻": "彳讠扌", "彳": "亻氵", "扌": "木才亻", "木": "禾扌米",
    "禾": "木米", "米": "木禾", "日": "目月口", "目": "日月", "月": "日目", "口": "日囗", "囗": "口日", "女": "子",
    "子": "女了", "宀": "冖穴", "冖": "宀", "艹": "竹", "忄": "亻彳", "心": "忄必", "土": "士王工", "王": "土玉",
    "钅": "饣车", "饣": "钅讠", "纟": "饣钅", "辶": "廴走", "力": "刀九", "刀": "力", "又": "叉文", "寸": "才丁",
    "门": "冂问", "田": "由甲", "夕": "歹久", "马": "鸟与", "白": "日自", "山": "出", "火": "灬人", "灬": "火",
    "车": "东", "阝": "卩", "广": "厂疒", "厂": "广", "疒": "广", "页": "贝见", "贝": "见页", "见": "贝",
}


def make_components(vocab, ent, problems):
    comps = json.loads((ROOT / "data" / "hsk3" / "components.json").read_text("utf-8"))
    hand = json.loads((ROOT / "data" / "hsk3" / "handwriting.json").read_text("utf-8"))
    level_of = {x["char"]: x["level"] for x in hand}
    cjk = lambda c: len(c) == 1 and "\u4e00" <= c <= "\u9fff"
    # (IDS operator, parts) -> character, to reject a distractor that spells another character of the list
    built = {}
    for ch, e in comps.items():
        if e["p"]:
            built[(e["d"][0], tuple(p["c"] for p in e["p"]))] = ch
    # components seen at each position (operator, index), with their stroke counts, for extra distractors
    at_pos = {}
    for ch, e in comps.items():
        for i, p in enumerate(e["p"]):
            if cjk(p["c"]) and len(p["s"]) >= 2:
                at_pos.setdefault((e["d"][0], i), {})[p["c"]] = len(p["s"])
    words = sorted(vocab.values(), key=lambda w: (len(w["word"]), w["level"], w["id"]))
    out = []
    for x in hand:
        ch, level = x["char"], x["level"]
        if level > 3 or ch not in comps or not comps[ch]["p"]:
            continue
        e = comps[ch]
        parts = e["p"]
        ok = [i for i, p in enumerate(parts) if cjk(p["c"]) and len(p["s"]) >= 2
              and all(len(q["s"]) >= 2 for j, q in enumerate(parts) if j != i)]
        if not ok or len({p["c"] for p in parts}) < len(parts):   # 比 匕+匕, 多 夕+夕: the answer would be in sight
            continue
        k = next((i for i in ok if parts[i]["c"] == e["r"]), ok[0])     # the radical when it can be hidden
        ans, op = parts[k]["c"], e["d"][0]
        rng = random.Random(f"k{ch}")

        def spells_other(c):
            alt = tuple(c if j == k else q["c"] for j, q in enumerate(parts))
            return built.get((op, alt)) not in (None, ch)

        pool = [c for c in LOOKALIKE_PARTS.get(ans, "") if c != ans]
        near = sorted(at_pos.get((op, k), {}).items(), key=lambda kv: (abs(kv[1] - len(parts[k]["s"])), kv[0]))
        pool += [c for c, _ in near if c != ans and c not in pool]
        distractors = [c for c in pool if not spells_other(c)][:2]
        if len(distractors) < 2:          # rare shapes (e.g. 区) have no believable look-alike: no question
            continue
        w = next((w for w in words if ch in w["word"] and w["level"] <= max(level, 1) and w["id"] in ent), None)
        if not w:
            continue
        opts = [ans] + distractors
        rng.shuffle(opts)
        out.append({
            "id": f"k{len(out) + 1}", "type": "choose_missing_character_component", "skill": "writing", "level": max(level, 2),
            "char": ch, "part": k, "dedupe": "k:" + ch,
            "word": w["word"].replace(ch, "□"), "word_pinyin": w["pinyin"], "word_arti": ent[w["id"]]["arti"],
            "options": [{"zh": c} for c in opts], "answer": ans,
            "explain": {"char": ch, "parts": " + ".join(p["c"] for p in parts), "word": w["word"], "word_pinyin": w["pinyin"], "arti": ent[w["id"]]["arti"]},
        })
    return out


# ----------------------------------------------------------------------------------------------
# Write a sentence from a picture and a word (write_sentence_from_picture_and_word), HSK 3 writing part 2.
# Free writing cannot be marked like a choice: the app checks it locally (essay.js) and shows model answers.
# ----------------------------------------------------------------------------------------------
END_PUNCT = "。！？"


def make_sentence_tasks(vocab, allowed, problems):
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    scenes = {sc["id"]: sc for sc in json.loads((ROOT / "content" / "pic" / "scenes.json").read_text("utf-8"))}
    out, seen = [], set()
    for path in sorted((ROOT / "content" / "writing").glob("level-*.json")):
        data = json.loads(path.read_text("utf-8"))
        level = data["level"]
        for n, t in enumerate(data["tasks"], 1):
            loc = f"{path.name} task {n} ({t.get('word')})"
            sc, word = scenes.get(t["scene"]), t["word"]
            if not sc:
                problems.append(f"{loc}: unknown scene {t['scene']!r}")
                continue
            w = next((v for v in sorted(vocab.values(), key=lambda v: v["level"]) if v["word"] == word and v["level"] <= level), None)
            if not w:
                problems.append(f"{loc}: {word!r} is not a syllabus word up to HSK {level}")
                continue
            if (t["scene"], word) in seen:
                problems.append(f"{loc}: duplicate task")
            seen.add((t["scene"], word))
            models = t["models"]
            if len(models) != 3 or len({m[0] for m in models}) != 3:
                problems.append(f"{loc}: need 3 different model answers")
            for zh, tr in models:
                if word not in zh:
                    problems.append(f"{loc}: model answer without the word: {zh}")
                if zh[-1] not in END_PUNCT:
                    problems.append(f"{loc}: model answer must end with {END_PUNCT}: {zh}")
                if not tr.strip():
                    problems.append(f"{loc}: missing translation for {zh}")
                bad = sorted({c for c in zh if HAN.match(c) and c not in allowed[level]})
                if bad:
                    problems.append(f"{loc}: chars above level {level}: {''.join(bad)} in {zh}")
            ms = [{"zh": zh, "pinyin": py(zh), "id": tr} for zh, tr in models]
            out.append({
                "id": f"x{len(out) + 1}", "type": "write_sentence_from_picture_and_word", "skill": "writing", "level": level,
                "picture": {"key": sc["id"], "emoji": sc["emoji"], "alt": sc["alt"]}, "word": word, "word_pinyin": w["pinyin"],
                "dedupe": f"x:{sc['id']}:{word}", "answer": ms[0]["zh"], "models": ms,
            })
    return out


# ----------------------------------------------------------------------------------------------
# Grammar tags (issue #31): sentence items get "g": [grammar point ids] when their full sentence shows a pattern
# (the point's "detect" regex in content/grammar/<id>.json) at or below the item's level. Used by Kemajuan
# ("pola terlemah") and to link explanations to the grammar page. Ids are not affected.
# ----------------------------------------------------------------------------------------------
TAGGED_TYPES = {"cloze_wordbank", "write_hanzi_from_pinyin", "order_sentence"}


def grammar_patterns():
    out = []
    for path in sorted((ROOT / "content" / "grammar").glob("*.json")):
        p = json.loads(path.read_text("utf-8"))
        if p.get("detect"):
            out.append((p["id"], p["level"], re.compile(p["detect"])))
    return out


def tag_grammar(items):
    pats = grammar_patterns()
    for it in items:
        if it["type"] not in TAGGED_TYPES:
            continue
        zh = it.get("explain", {}).get("zh") or it.get("answer", "")
        tags = [pid for pid, lvl, rx in pats if lvl <= it["level"] and rx.search(zh)]
        if tags:
            it["g"] = tags
    return items


def main():
    vocab, ent = load_all()
    problems = []
    allowed = bid.allowed_chars(vocab)
    items = make_cloze(vocab, ent) + make_write(vocab, ent) + make_order(vocab, ent) + make_listen(allowed, problems)
    items += make_dialogs(allowed, problems, 1)
    items += make_pictures(problems)
    items += make_texts(allowed, problems)
    items += make_match(allowed, problems)
    items += make_statements(allowed, problems)
    items += make_components(vocab, ent, problems)
    items += make_sentence_tasks(vocab, allowed, problems)
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    tag_grammar(items)
    path = ROOT / "data" / "hsk3" / "questions.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, separators=(",", ":"))
    from collections import Counter
    print(len(items), "questions", dict(Counter((i["type"], i["level"]) for i in items)))


if __name__ == "__main__":
    main()
