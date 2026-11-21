#!/usr/bin/env python3
"""Build data/hsk3/speaking.json: speaking simulation content per level (issue #29).

Sources: blueprints/hsk3.0/speaking-level-N.yaml (format, NOT official: verified: false) and
content/speaking/level-N.json (sentences to repeat, picture tasks, open questions, all with model answers).
Checks: hanzi within the level, scenes exist, translations present, enough items for the blueprint.

Usage: python3 -I scripts/build_speaking.py
"""
import importlib.util
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("build_id", ROOT / "scripts" / "build_id.py")
bid = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bid)
HAN = re.compile(r"[一-鿿]")
OUT = ROOT / "data" / "hsk3" / "speaking.json"


def main():
    from pypinyin import Style, lazy_pinyin
    py = lambda t: bid.pinyin_line(t, Style, lazy_pinyin)
    vocab = {w["id"]: w for w in bid.load("vocab.json")}
    allowed = bid.allowed_chars(vocab)
    scenes = {s["id"]: s for s in json.loads((ROOT / "content" / "pic" / "scenes.json").read_text("utf-8"))}
    problems, out = [], {}
    for bp_path in sorted((ROOT / "blueprints" / "hsk3.0").glob("speaking-level-*.yaml")):
        bp = yaml.safe_load(bp_path.read_text("utf-8"))
        level = bp["level"]
        src = json.loads((ROOT / "content" / "speaking" / f"level-{level}.json").read_text("utf-8"))

        def lint(text, where):
            bad = sorted({c for c in text if HAN.match(c) and c not in allowed[level]})
            if bad:
                problems.append(f"{where}: chars above level {level}: {''.join(bad)} in {text}")

        def sentence(zh, tr, where):
            lint(zh, where)
            if not tr.strip():
                problems.append(f"{where}: missing translation")
            return {"zh": zh, "pinyin": py(zh), "id": tr}

        repeat = []
        for n, (zh, tr) in enumerate(src["repeat"], 1):
            s = sentence(zh, tr, f"repeat {n}")
            s["tokens"] = list(zh)                       # one piece per character: the score marks each one heard or not
            repeat.append({"id": f"sp{level}-r{n}", **s})
        pictures = []
        for n, p in enumerate(src["pictures"], 1):
            sc = scenes.get(p["scene"])
            if not sc:
                problems.append(f"picture {n}: unknown scene {p['scene']!r}")
                continue
            pictures.append({"id": f"sp{level}-p{n}", "emoji": sc["emoji"], "alt": sc["alt"],
                             "models": [sentence(zh, tr, f"picture {n}") for zh, tr in p["models"]]})
        questions = []
        for n, (q, tq, a, ta) in enumerate(src["questions"], 1):
            qs = sentence(q, tq, f"question {n}")
            questions.append({"id": f"sp{level}-q{n}", **qs, "models": [sentence(a, ta, f"question {n} answer")]})
        if len({r["zh"] for r in repeat}) != len(repeat) or len({q["zh"] for q in questions}) != len(questions):
            problems.append(f"level {level}: duplicate sentence or question")
        have = {"repeat_sentence": len(repeat), "describe_picture": len(pictures), "answer_question": len(questions)}
        for part in bp["parts"]:
            if have[part["type"]] < 2 * part["count"]:
                problems.append(f"level {level} {part['id']}: need at least two papers' worth ({2 * part['count']}), have {have[part['type']]}")
        out[str(level)] = {"blueprint": bp, "repeat": repeat, "pictures": pictures, "questions": questions}
    if problems:
        print("\n".join(problems))
        sys.exit(1)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print({lvl: {k: len(v[k]) for k in ("repeat", "pictures", "questions")} for lvl, v in out.items()}, "->", OUT)


if __name__ == "__main__":
    main()
