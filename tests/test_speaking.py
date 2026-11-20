import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/hsk3/speaking.json"


class SpeakingTests(unittest.TestCase):
    def test_committed_data_is_current(self):
        """speaking.json must be what content/speaking + blueprints build to (run `npm run build`)."""
        before = DATA.read_text("utf-8")
        try:
            subprocess.run([sys.executable, "-I", str(ROOT / "scripts/build_speaking.py")], check=True, capture_output=True)
            self.assertEqual(DATA.read_text("utf-8"), before)
        finally:
            DATA.write_text(before, encoding="utf-8")

    def test_content(self):
        d = json.loads(DATA.read_text("utf-8"))["3"]
        self.assertFalse(d["blueprint"]["verified"])
        self.assertGreaterEqual(len(d["repeat"]), 40)
        self.assertGreaterEqual(len(d["pictures"]), 20)
        self.assertGreaterEqual(len(d["questions"]), 40)
        for r in d["repeat"]:
            self.assertEqual("".join(r["tokens"]), r["zh"])
            self.assertTrue(r["pinyin"] and r["id"])
        for p in d["pictures"]:
            self.assertTrue(p["emoji"] and len(p["models"]) >= 2)
        for q in d["questions"]:
            self.assertTrue(q["zh"] and q["id"] and q["models"] and q["models"][0]["zh"])
        ids = [x["id"] for k in ("repeat", "pictures", "questions") for x in d[k]]
        self.assertEqual(len(ids), len(set(ids)))


if __name__ == "__main__":
    unittest.main()
