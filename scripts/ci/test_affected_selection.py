"""Regression tests for safe affected-area E2E plans, no database required."""
import json
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def select(*names: str):
    result = subprocess.run(
        ["node", "scripts/ci/plan-affected.mjs", "--json", "--files", *names],
        cwd=ROOT, text=True, capture_output=True, timeout=15)
    if result.returncode:
        raise AssertionError("Selector failed: " + result.stderr)
    return json.loads(result.stdout)


class AffectedSelectionContract(unittest.TestCase):
    def test_single_screen_selects_only_its_area(self):
        plan = select("web/src/notifications.tsx")
        self.assertEqual(plan["mode"], "targeted")
        self.assertEqual(plan["areas"], ["notifications"])
        self.assertGreater(plan["levelCounts"]["L3"], 0)
        self.assertFalse(plan["securitySensitive"])

    def test_global_styles_and_unknown_files_fail_closed(self):
        areas = {x["area"] for x in json.loads(
            (ROOT / "scripts/ci/e2e-levels.json").read_text(encoding="utf-8"))["scenarios"]}
        for file in ("web/src/styles.css", "web/src/new-crosscutting.tsx"):
            with self.subTest(file=file):
                plan = select(file)
                self.assertEqual(plan["mode"], "expanded")
                self.assertEqual(set(plan["areas"]), areas)

    def test_security_code_expands_and_flags_manual_authorization_tests(self):
        plan = select("server/modules/auth/routes.ts")
        self.assertEqual(plan["mode"], "expanded")
        self.assertTrue(plan["securitySensitive"])
        self.assertIn("auth", plan["areas"])

    def test_multiple_files_use_union(self):
        plan = select("web/src/notifications.tsx", "web/src/post-gallery.tsx")
        self.assertEqual(plan["mode"], "targeted")
        self.assertEqual(plan["areas"], ["media", "notifications"])

    def test_documentation_only_does_not_require_playwright(self):
        plan = select("docs/implementation/TESTING-STRATEGY.md", "AGENTS.md")
        self.assertEqual(plan["mode"], "documentation-only")
        self.assertEqual(plan["areas"], [])
        self.assertEqual(plan["levelCounts"], {"L2": 0, "L3": 0})

    def test_changed_e2e_file_uses_registry_without_expanding(self):
        plan = select("tests/e2e/notification-quick-read.spec.ts")
        self.assertEqual(plan["areas"], ["notifications"])
        self.assertEqual(plan["mode"], "targeted")

    def test_empty_input_cannot_claim_success(self):
        result = subprocess.run(
            ["node", "scripts/ci/plan-affected.mjs", "--json", "--files"],
            cwd=ROOT, capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)

    def test_full_release_gate_is_unchanged(self):
        workflow = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
        self.assertIn("npm run test:affected", workflow)
        self.assertIn("npm run test:e2e", workflow)
        self.assertIn("needs: [integration, docker-smoke]", workflow)


if __name__ == "__main__":
    unittest.main()
