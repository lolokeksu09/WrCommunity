"""Guard bounded file-level Playwright parallelism for CI only.

Cross-test tests share one integration DB, so we deliberately do not enable
fullyParallel (which would overlap scenarios in platform.spec.ts).
"""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "scripts/playwright.config.ts"
WORKFLOW = ROOT / ".github/workflows/ci.yml"


class BrowserWorkerSafety(unittest.TestCase):
    def test_ci_uses_two_workers_but_local_stays_serial(self):
        text = CONFIG.read_text(encoding="utf-8")
        self.assertRegex(text, r"workers:\s*process\.env\.CI\s*\?\s*2\s*:\s*1\s*,")
        self.assertIn("fullyParallel: false", text)
        self.assertIn("retries: process.env.CI ? 1 : 0", text)

    def test_full_suite_and_deployment_gates_remain_intact(self):
        ci = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("npm run test:e2e", ci)
        self.assertIn("needs: [integration, docker-smoke]", ci)
        self.assertIn("npm run backup:verify", ci)
        self.assertIn("node scripts/live-site-check.mjs", ci)


if __name__ == "__main__":
    unittest.main()
