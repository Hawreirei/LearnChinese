import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/hsk3/grammar.json"


class GrammarTests(unittest.TestCase):
    def test_committed_data_is_current(self):
        """grammar.json must be what content/grammar builds to (run `npm run build`)."""
        before = DATA.read_text("utf-8")
        try:
            subprocess.run([sys.executable, "-I", str(ROOT / "scripts/build_grammar.py")], check=True, capture_output=True)
            self.assertEqual(DATA.read_text("utf-8"), before)
        finally:
            DATA.write_text(before, encoding="utf-8")

    def test_points(self):
        g = json.loads(DATA.read_text("utf-8"))
        self.assertGreaterEqual(len([p for p in g if p["level"] == 1]), 24)
        ids = [d["id"] for p in g for d in p["drills"]]
        self.assertEqual(len(ids), len(set(ids)))
        for p in g:
            self.assertGreaterEqual(len(p["examples"]), 3, p["id"])
            self.assertGreaterEqual(len(p["drills"]), 5, p["id"])
            self.assertTrue(p["explain"] and p["pattern"] and p["title"], p["id"])
            kinds = {d["type"] for d in p["drills"]}
            self.assertGreaterEqual(len(kinds), 2, p["id"])           # at least two kinds of drill per point
            for d in p["drills"]:
                self.assertEqual(d["g"], [p["id"]])
                if d["type"] == "grammar_choose":
                    self.assertEqual(d["stem"].count("（　）"), 1, d["id"])
                    self.assertEqual(d["stem"].replace("（　）", d["answer"], 1), d["explain"]["zh"], d["id"])
                    self.assertTrue(d["stem_id"], d["id"])
                if d["type"] == "error_spot":
                    self.assertEqual(len(d["options"]), 4, d["id"])
                    self.assertEqual(sum(o["zh"] == d["answer"] for o in d["options"]), 1, d["id"])
                    self.assertTrue(d["explain"]["fix"] and d["explain"]["why"], d["id"])
                if d["type"] == "order_sentence":
                    self.assertEqual("".join(d["tokens"]), d["answer"], d["id"])


if __name__ == "__main__":
    unittest.main()
