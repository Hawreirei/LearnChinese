#!/usr/bin/env python3
"""Build data/hsk3/grammar.json from content/grammar/<id>.json (issue #30).

A point: id, level, seq, title, pattern, explain[], examples[[zh, id]], pitfalls[{wrong, right, why}], contrast[ids],
drills[], readings{text: pinyin} (optional, forces readings the pinyin library gets wrong, as in lessons). Drill kinds in the source and the question types they become:
  choose {zh, blank, options, id}          -> grammar_choose (fill the blank; the translation is shown)
  spot   {right[3], wrong, fix, why}       -> error_spot     (pick the WRONG sentence among four)
  order  {zh, pieces, id, alt?}            -> order_sentence (same type as Latihan)
Checks: hanzi within the level everywhere (pitfalls included), the blank in its sentence, one answer among distinct
options, pieces that join to the sentence (<= 8), contrast ids that exist, >= 3 examples and >= 5 drills.
The texts are our own; the official syllabus grammar list is not copied (see docs/sources.md).

Usage: python3 -I scripts/build_grammar.py
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
spec_l = importlib.util.spec_from_file_location("build_lessons", ROOT / "scripts" / "build_lessons.py")
bl = importlib.util.module_from_spec(spec_l)
spec_l.loader.exec_module(bl)
HAN = re.compile(r"[一-鿿]")
BLANK = "（　）"
OUT = ROOT / "data" / "hsk3" / "grammar.json"


def main():
    from pypinyin import Style, lazy_pinyin
    vocab = {w["id"]: w for w in bid.load("vocab.json")}
    allowed = bid.allowed_chars(vocab)
    problems, points = [], []
    for path in sorted((ROOT / "content" / "grammar").glob("*.json")):
        p = json.loads(path.read_text("utf-8"))
        pid, level, where = p["id"], p["level"], path.name
        readings, used = p.get("readings", {}), set()      # forced readings where the pinyin library guesses wrong (两只 zhī)

        def py(t):
            used.update(k for k in readings if k in t)
            return bl.apply_readings(t, bid.pinyin_line(t, Style, lazy_pinyin), readings)
        if pid != path.stem:
            problems.append(f"{where}: id {pid!r} must match the file name")

        def lint(text, loc):
            bad = sorted({c for c in text if HAN.match(c) and c not in allowed[level]})
            if bad:
                problems.append(f"{where} {loc}: chars above level {level}: {''.join(bad)} in {text}")

        for k in ("title", "pattern"):
            if not p.get(k):
                problems.append(f"{where}: missing {k}")
        if len(p["examples"]) < 3:
            problems.append(f"{where}: needs >= 3 examples")
        if len(p["drills"]) < 5:
            problems.append(f"{where}: needs >= 5 drills")
        examples = []
        for zh, tr in p["examples"]:
            lint(zh, "example")
            examples.append({"zh": zh, "pinyin": py(zh), "id": tr})
        pitfalls = []
        for pf in p.get("pitfalls", []):
            lint(pf["wrong"], "pitfall"); lint(pf["right"], "pitfall")
            pitfalls.append({**pf, "right_pinyin": py(pf["right"])})
        drills = []
        for n, d in enumerate(p["drills"], 1):
            qid, loc = f"g-{pid}-{n}", f"drill {n}"
            base = {"id": qid, "level": level, "g": [pid], "dedupe": qid}
            rng = random.Random(qid)
            if d["type"] == "choose":
                zh, blank, opts = d["zh"], d["blank"], d["options"]
                lint(zh, loc); [lint(o, loc) for o in opts]
                if blank not in zh:
                    problems.append(f"{where} {loc}: blank {blank!r} not in {zh}")
                if blank not in opts or len(set(opts)) != len(opts) or not 3 <= len(opts) <= 4:
                    problems.append(f"{where} {loc}: options must be 3-4 distinct and include {blank!r}")
                order = opts[:]
                rng.shuffle(order)
                drills.append({**base, "type": "grammar_choose", "skill": "reading", "stem": zh.replace(blank, BLANK, 1), "stem_id": d["id"],
                               "options": [{"zh": o, "pinyin": py(o)} for o in order], "answer": blank,
                               "explain": {"zh": zh, "pinyin": py(zh), "id": d["id"], "rule": p["title"]}})
            elif d["type"] == "spot":
                right, wrong = d["right"], d["wrong"]
                for t in right + [wrong, d["fix"]]:
                    lint(t, loc)
                if len(set(right)) != 3 or wrong in right:
                    problems.append(f"{where} {loc}: need 3 distinct right sentences and a different wrong one")
                if d["fix"] == wrong:
                    problems.append(f"{where} {loc}: fix equals the wrong sentence")
                order = right + [wrong]
                rng.shuffle(order)
                drills.append({**base, "type": "error_spot", "skill": "reading", "options": [{"zh": o, "pinyin": py(o)} for o in order], "answer": wrong,
                               "explain": {"wrong": wrong, "fix": d["fix"], "fix_pinyin": py(d["fix"]), "why": d["why"], "rule": p["title"]}})
            elif d["type"] == "order":
                zh, pieces = d["zh"], d["pieces"]
                lint(zh, loc)
                if "".join(pieces) != zh:
                    problems.append(f"{where} {loc}: pieces do not join to {zh}")
                if len(pieces) > 8:
                    problems.append(f"{where} {loc}: more than 8 pieces")
                for a in d.get("alt", []):
                    if sorted(a) != sorted(zh) or a == zh:
                        problems.append(f"{where} {loc}: alt {a!r} must rearrange the same hanzi")
                q = {**base, "type": "order_sentence", "skill": "writing", "stem": d["id"], "tokens": pieces, "answer": zh,
                     "explain": {"zh": zh, "pinyin": py(zh), "id": d["id"]}}
                if d.get("alt"):
                    q["alt"] = d["alt"]
                drills.append(q)
            else:
                problems.append(f"{where} {loc}: unknown drill type {d['type']!r}")
        for k in set(readings) - used:
            problems.append(f"{where}: reading {k!r} is not used")
        points.append({"id": pid, "level": level, "seq": p.get("seq", 100), "title": p["title"], "pattern": p["pattern"],
                       "explain": p["explain"], "examples": examples, "pitfalls": pitfalls, "contrast": p.get("contrast", []), "drills": drills})
    ids = {p["id"] for p in points}
    for p in points:
        for c in p["contrast"]:
            if c not in ids:
                problems.append(f"{p['id']}: contrast {c!r} does not exist")
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    points.sort(key=lambda p: (p["level"], p["seq"], p["id"]))
    OUT.write_text(json.dumps(points, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(points)} grammar points, {sum(len(p['drills']) for p in points)} drills -> {OUT}")


if __name__ == "__main__":
    main()
