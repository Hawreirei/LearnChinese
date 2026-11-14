#!/usr/bin/env python3
"""Build data/hsk3/chars.json from scripts/data/chars_extra.txt.

Some handwriting characters (耳, 爸, 春 ...) never occur as a one-character word in vocab.json, or the word has no gloss, so the
Tulis tab had no pinyin/meaning for them. chars_extra.txt (one `hanzi|pinyin|arti` line each) fills that gap.
Every pinyin is checked against the compound words of vocab.json that contain the hanzi.

Usage: python3 -I scripts/build_chars.py
"""
import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
base = lambda s: "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).lower()


def main():
    vocab = json.loads((ROOT / "data/hsk3/vocab.json").read_text(encoding="utf-8"))
    hw = {x["char"] for x in json.loads((ROOT / "data/hsk3/handwriting.json").read_text(encoding="utf-8"))}
    out = {}
    for n, line in enumerate((ROOT / "scripts/data/chars_extra.txt").read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        ch, py, arti = (p.strip() for p in line.split("|"))
        assert ch in hw and ch not in out, f"line {n}: {ch} unknown or duplicated"
        assert py and arti, f"line {n}: empty field"
        readings = [w["pinyin"] for w in vocab if ch in w["word"]]
        assert any(base(py) in base(r) for r in readings), f"line {n}: {ch} {py} not found in {readings[:3]}"
        out[ch] = {"pinyin": py, "arti": arti}
    (ROOT / "data/hsk3/chars.json").write_text(json.dumps(out, ensure_ascii=False, indent=0, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"chars.json: {len(out)} characters")


if __name__ == "__main__":
    main()
