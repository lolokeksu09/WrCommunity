"""Policy tests for classified E2E scenarios: run without browsers or database."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
E2E = ROOT / "tests/e2e"
TEST_DECLARATION = re.compile(r"\btest\(\s*(['\"`])([^\n]+?)\1\s*,")
EXPECTED_LEVELS = {"L2", "L3"}
EXPECTED_AREAS = {"auth", "social", "clubs", "lfg", "notifications", "forms",
                  "navigation", "feed", "comments", "media", "editor", "moderation"}


class E2EClassificationContract(unittest.TestCase):
    def test_all_browser_cases_have_exactly_one_level_and_area(self):
        count = 0
        for path in sorted(E2E.glob("*.spec.ts")):
            text = path.read_text(encoding="utf-8")
            cases = TEST_DECLARATION.findall(text)
            self.assertGreater(len(cases), 0, str(path))
            for quote, title in cases:
                levels = re.findall(r"@L[1-5]\b", title)
                areas = re.findall(r"@area-([a-z-]+)\b", title)
                self.assertEqual(len(levels), 1, f"{path.name}: {title}")
                self.assertIn(levels[0][1:], EXPECTED_LEVELS, title)
                self.assertEqual(len(areas), 1, f"{path.name}: {title}")
                self.assertIn(areas[0], EXPECTED_AREAS, title)
                count += 1
        self.assertGreaterEqual(count, 18, "Browser scenarios were silently removed")

    def test_each_level_has_runnable_command(self):
        import json
        scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
        self.assertIn("test:l1", scripts)
        self.assertIn("test:l2", scripts)
        self.assertIn("test:l3", scripts)
        self.assertIn("--grep", scripts["test:l2"])
        self.assertIn("@L2", scripts["test:l2"])
        self.assertIn("--grep", scripts["test:l3"])
        self.assertIn("@L3", scripts["test:l3"])
        self.assertIn("test:e2e", scripts)

    def test_ci_executes_l1_and_retains_full_coverage(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertIn("npm run test:l1", workflow)
        self.assertIn("npm run test:e2e", workflow)
        self.assertIn("needs: [integration, docker-smoke]", workflow)


if __name__ == "__main__":
    unittest.main()
