"""Guard a reversible three-worker Playwright CI experiment."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = (ROOT / "scripts/playwright.config.ts").read_text(encoding="utf-8")
WORKFLOW = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")


class PlaywrightWorkerReserve(unittest.TestCase):
    def test_ci_worker_count_is_adjustable_with_safe_default(self):
        self.assertIn("WRC_E2E_WORKERS", CONFIG)
        self.assertIn("2", CONFIG)
        self.assertIn("Number.isInteger", CONFIG)
        self.assertIn("fullyParallel: false", CONFIG)
        self.assertIn("retries: process.env.CI ? 1 : 0", CONFIG)

    def test_bounded_worker_override_only_for_browser_acceptance(self):
        browser = WORKFLOW.split("      - name: Browser acceptance checks", 1)[1]
        self.assertRegex(browser, r"WRC_E2E_WORKERS: \'(?:2|3|4)\'")
        self.assertEqual(WORKFLOW.count("WRC_E2E_WORKERS:"), 1)
        self.assertIn("npm run test:e2e", browser)
        self.assertIn("npm run test:e2e", WORKFLOW)
        self.assertIn("needs: [integration, docker-smoke]", WORKFLOW)
        self.assertIn("node scripts/live-site-check.mjs", WORKFLOW)


if __name__ == "__main__":
    unittest.main()
