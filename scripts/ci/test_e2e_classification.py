"""Fast policy tests: every E2E case is classified, without opening a browser."""
import json
import re
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
E2E = ROOT / "tests/e2e"
CATALOG = ROOT / "scripts/ci/e2e-levels.json"
TEST_DECLARATION = re.compile(r"\btest\(\s*(['\"`])([^\n]+?)\1\s*,")
EXPECTED_LEVELS = {"L2", "L3"}
EXPECTED_AREAS = {"auth", "social", "clubs", "lfg", "notifications", "forms",
                  "navigation", "feed", "comments", "media", "editor", "moderation"}


class E2EClassificationContract(unittest.TestCase):
    def test_all_browser_cases_have_exactly_one_level_and_area(self):
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        rows = catalog["scenarios"]
        files = sorted(E2E.glob("*.spec.ts"))
        self.assertGreaterEqual(len(rows), 20)
        self.assertEqual({r["file"] for r in rows}, {p.name for p in files},
                         "Unclassified new E2E spec file")
        seen = set()
        for item in rows:
            self.assertIn(item["level"], EXPECTED_LEVELS)
            self.assertIn(item["area"], EXPECTED_AREAS)
            key = (item["file"], item["name"])
            self.assertNotIn(key, seen, "Duplicate classification")
            seen.add(key)
        matched = set()
        for path in files:
            tests = TEST_DECLARATION.findall(path.read_text(encoding="utf-8"))
            self.assertGreater(len(tests), 0, str(path))
            for quote, title in tests:
                matches = [r for r in rows if r["file"] == path.name and r["name"] in title]
                self.assertEqual(len(matches), 1, f"{path.name}: {title}")
                matched.add((matches[0]["file"], matches[0]["name"]))
        self.assertEqual(matched, seen, "Stale entries or unmatched test declarations")
        self.assertIn("L2", {r["level"] for r in rows})
        self.assertIn("L3", {r["level"] for r in rows})

    def test_each_level_has_runnable_command(self):
        scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
        self.assertIn("test:l1", scripts)
        self.assertIn("test:l2", scripts)
        self.assertIn("test:l3", scripts)
        self.assertIn("test:e2e", scripts)
        self.assertIn("test_*.py", scripts["test:l1"])
        self.assertIn("select-e2e.mjs L2", scripts["test:l2"])
        self.assertIn("select-e2e.mjs L3", scripts["test:l3"])
        for level, area in (("L2", "feed"), ("L3", "auth")):
            check = subprocess.run(
                ["node", "scripts/ci/select-e2e.mjs", level, area, "--dry-run"],
                cwd=ROOT, capture_output=True, text=True, timeout=15)
            self.assertEqual(check.returncode, 0, check.stderr)
            self.assertIn(level + "/" + area, check.stdout)

    def test_ci_executes_l1_and_retains_full_coverage(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertIn("npm run test:l1", workflow)
        self.assertIn("npm run test:e2e", workflow)
        self.assertIn("needs: [integration, docker-smoke]", workflow)


if __name__ == "__main__":
    unittest.main()
