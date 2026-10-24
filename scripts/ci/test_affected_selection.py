"""Regression tests for safe affected-area E2E plans, no database required."""
import json
import os
import tempfile
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

    def execute_dry_run(self, *args):
        return subprocess.run(
            ["node", "scripts/ci/plan-affected.mjs", "--execute", "--dry-run", *args],
            cwd=ROOT, text=True, capture_output=True, timeout=15)

    def test_execute_targeted_runs_selected_areas_in_one_browser_invocation(self):
        result = self.execute_dry_run(
            "--files", "web/src/notifications.tsx", "web/src/post-gallery.tsx")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.count("PLAYWRIGHT:"), 1)
        self.assertIn("новое уведомление", result.stdout)
        self.assertIn("вложения публикации", result.stdout)
        self.assertNotIn("API TESTS:", result.stdout)

    def test_execute_expanded_uses_full_browser_suite(self):
        result = self.execute_dry_run("--files", "web/src/styles.css")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("PLAYWRIGHT: npm run test:e2e", result.stdout)
        self.assertEqual(result.stdout.count("PLAYWRIGHT:"), 1)

    def test_execute_sensitive_runs_api_before_full_browser(self):
        result = self.execute_dry_run("--files", "server/modules/auth/routes.ts")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertLess(result.stdout.index("API TESTS: npm test"),
                        result.stdout.index("PLAYWRIGHT: npm run test:e2e"))

    def test_execute_docs_only_is_explicit_no_e2e(self):
        result = self.execute_dry_run("--files", "AGENTS.md")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("documentation-only", result.stdout)
        self.assertNotIn("PLAYWRIGHT:", result.stdout)

    def test_execute_rejects_incompatible_and_unsafe_flags(self):
        for args in (
            ("--execute", "--json", "--files", "web/src/social.tsx"),
            ("--dry-run", "--files", "web/src/social.tsx"),
            ("--execute", "--project=unknown", "--files", "web/src/social.tsx"),
        ):
            with self.subTest(args=args):
                result = subprocess.run(
                    ["node", "scripts/ci/plan-affected.mjs", *args],
                    cwd=ROOT, text=True, capture_output=True, timeout=15)
                self.assertNotEqual(result.returncode, 0)

    def test_execute_runner_command_is_documented(self):
        docs = (ROOT / "docs/implementation/TESTING-STRATEGY.md").read_text(encoding="utf-8")
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        self.assertIn("test:affected -- --execute", docs)
        self.assertIn("--execute", agents)


    def execute_with_fake_npm(self, files, fail_api=False):
        with tempfile.TemporaryDirectory() as td:
            npm = Path(td) / "npm"
            log = Path(td) / "calls.log"
            npm.write_text(
                '#!/bin/sh\\nprintf "%s\\\\n" "$*" >> "$WRC_TEST_CALL_LOG"\\n'
                'if [ "$1" = "test" ] && [ "$WRC_TEST_FAIL_API" = "1" ]; then exit 9; fi\\n'
                'exit 0\\n', encoding="utf-8")
            npm.chmod(0o755)
            env = dict(os.environ)
            env["PATH"] = td + os.pathsep + env["PATH"]
            env["WRC_TEST_CALL_LOG"] = str(log)
            env["WRC_TEST_FAIL_API"] = "1" if fail_api else "0"
            result = subprocess.run(
                ["node", "scripts/ci/plan-affected.mjs", "--execute", "--files", *files],
                cwd=ROOT, text=True, capture_output=True, timeout=15, env=env)
            calls = log.read_text(encoding="utf-8").splitlines() if log.exists() else []
            return result, calls

    def test_actual_execute_invokes_one_browser_process_for_two_areas(self):
        result, calls = self.execute_with_fake_npm(
            ["web/src/post-gallery.tsx", "web/src/notifications.tsx"])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(calls), 1)
        self.assertIn("run test:e2e -- --grep", calls[0])
        self.assertIn("вложения публикации", calls[0])
        self.assertIn("новое уведомление", calls[0])

    def test_api_failure_blocks_browser_execution(self):
        result, calls = self.execute_with_fake_npm(
            ["server/modules/auth/routes.ts"], fail_api=True)
        self.assertEqual(result.returncode, 9)
        self.assertEqual(calls, ["test"])



if __name__ == "__main__":
    unittest.main()
