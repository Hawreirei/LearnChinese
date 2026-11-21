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
        self.assertGreaterEqual(len([p for p in g if p["level"] == 2]), 25)
        self.assertGreaterEqual(len([p for p in g if p["level"] == 3]), 30)
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


class GrammarTagTests(unittest.TestCase):
    """Practice items tagged with grammar points by the points' "detect" patterns (build_questions.tag_grammar)."""

    @classmethod
    def setUpClass(cls):
        import importlib.util
        spec = importlib.util.spec_from_file_location("bq", ROOT / "scripts/build_questions.py")
        cls.bq = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.bq)
        cls.Q = json.loads((ROOT / "data/hsk3/questions.json").read_text("utf-8"))
        cls.levels = {p["id"]: p["level"] for p in json.loads(DATA.read_text("utf-8"))}

    def test_tags_exist_and_fit_the_level(self):
        tagged = [q for q in self.Q if q.get("g")]
        self.assertGreater(len(tagged), 300)
        for q in tagged:
            self.assertIn(q["type"], self.bq.TAGGED_TYPES, q["id"])
            for g in q["g"]:
                self.assertLessEqual(self.levels[g], q["level"], (q["id"], g))

    def test_detect_patterns(self):
        tag = lambda zh, level=3: self.bq.tag_grammar([{"type": "order_sentence", "level": level, "explain": {"zh": zh}}])[0].get("g", [])
        self.assertIn("ba", tag("我把书放在桌子上。"))
        self.assertIn("v-zai", tag("我把书放在桌子上。"))
        self.assertIn("bi", tag("他比我高。"))
        self.assertNotIn("bi", tag("今天有比赛。"))
        self.assertNotIn("bie", tag("今天特别冷。"))
        self.assertIn("bie", tag("你别说话。"))
        self.assertNotIn("hai", tag("我明天还你书。"))
        self.assertNotIn("ba", tag("我把书放在桌子上。", level=2), "a HSK 3 point never tags a HSK 2 item")


if __name__ == "__main__":
    unittest.main()
