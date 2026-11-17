#!/usr/bin/env python3
"""Build data/hsk3/components.json: how each handwriting character splits into components, and which strokes
belong to which top-level component (used by the "choose the missing component" questions, HSK 2 writing part 1).

Source: dictionary.txt of Make Me a Hanzi (https://github.com/skishore/makemeahanzi), derived from Unihan and
CJKlib, licensed LGPL-3.0-or-later. The output is a derived work under the same licence; the licence text is kept
next to it in data/hsk3/components-LGPL.txt (see NOTICE.md).

  git clone --depth 1 https://github.com/skishore/makemeahanzi /tmp/mmah
  python3 -I scripts/build_components.py --src /tmp/mmah/dictionary.txt

Output, per character: {"d": decomposition (IDS), "r": radical, "p": [{"c": component, "s": [stroke indices]}]}
"p" lists the top-level components in IDS order; it is empty when a stroke is unmatched or the split is unknown.
Stroke indices follow the stroke order of data/hsk3/strokes/<hex>.json (same source, same order).
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "hsk3" / "components.json"
ARITY = {c: 2 for c in "⿰⿱⿴⿵⿶⿷⿸⿹⿺⿻"} | {"⿲": 3, "⿳": 3}


def parse_ids(s, i=0):
    """IDS string -> (tree, next index). A leaf is a character; a node is [operator, child, child(, child)]."""
    c = s[i]
    if c in ARITY:
        kids, j = [], i + 1
        for _ in range(ARITY[c]):
            kid, j = parse_ids(s, j)
            kids.append(kid)
        return [c, *kids], j
    return c, i + 1


def ids_text(t):
    return t if isinstance(t, str) else t[0] + "".join(ids_text(k) for k in t[1:])


def top_parts(entry):
    """[(component, [stroke indices])] for the top-level split, or [] when it is unknown or incomplete."""
    d, matches = entry.get("decomposition", ""), entry.get("matches") or []
    if not d or d[0] not in ARITY or any(m is None or len(m) == 0 for m in matches):
        return []
    tree, end = parse_ids(d)
    if end != len(d):
        return []
    parts = [(ids_text(k), [i for i, m in enumerate(matches) if m[0] == n]) for n, k in enumerate(tree[1:])]
    return parts if all(s for _, s in parts) else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="Make Me a Hanzi dictionary.txt")
    src = Path(ap.parse_args().src)
    want = {x["char"] for x in json.loads((ROOT / "data" / "hsk3" / "handwriting.json").read_text("utf-8"))}
    out = {}
    for line in src.read_text("utf-8").splitlines():
        e = json.loads(line)
        ch = e["character"]
        if ch not in want:
            continue
        strokes = json.loads((ROOT / "data" / "hsk3" / "strokes" / f"{ord(ch):x}.json").read_text("utf-8"))["strokes"]
        if len(e.get("matches") or []) != len(strokes):
            print(f"skip {ch}: {len(e.get('matches') or [])} matches vs {len(strokes)} strokes")
            continue
        out[ch] = {"d": e.get("decomposition", ""), "r": e.get("radical", ""), "p": [{"c": c, "s": s} for c, s in top_parts(e)]}
    missing = sorted(want - set(out))
    OUT.write_text(json.dumps(dict(sorted(out.items())), ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} characters -> {OUT} ({sum(1 for v in out.values() if v['p'])} with a top-level split); missing: {''.join(missing) or '-'}")


if __name__ == "__main__":
    main()
