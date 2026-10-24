"""Fail-closed contracts for parallel FULL API and browser jobs (L1)."""
import re
import unittest
from pathlib import Path

CI = (Path(__file__).resolve().parents[2] / ".github/workflows/ci.yml").read_text(encoding="utf-8")


def job(name: str) -> str:
    match = re.search(rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [a-z][a-z0-9-]*:\n|\Z)", CI)
    if match is None:
        raise AssertionError(f"Missing CI job: {name}")
    return match.group(1)


class ParallelFullContract(unittest.TestCase):
    def test_api_and_browser_jobs_run_for_ready_pr_and_main(self):
        for name in ("api-tests", "browser-tests"):
            body = job(name)
            self.assertIn("github.event.pull_request.draft == false", body)
            self.assertIn("github.event_name == 'push'", body)
            self.assertNotIn("needs:", body, f"{name} must not wait for the other test job")

    def test_isolated_test_services_and_unchanged_coverage(self):
        api = job("api-tests")
        browser = job("browser-tests")
        for body in (api, browser):
            self.assertIn("services:", body)
            self.assertIn("postgres:", body)
            self.assertIn("mailpit:", body)
            self.assertIn("NODE_ENV: test", body)
            self.assertIn("npm run migrate", body)
        for cmd in ("npm run check:secrets", "npm run typecheck", "npm run build", "npm run test:l1", "npm test", "npm run backup:verify"):
            self.assertIn(cmd, api)
        self.assertIn("npm run build", browser)
        self.assertIn("npm run test:e2e", browser)
        self.assertIn("WRC_E2E_WORKERS: '3'", browser)

    def test_integration_gate_rejects_either_failure_and_blocks_deploy(self):
        gate = job("integration")
        self.assertIn("needs: [api-tests, browser-tests]", gate)
        self.assertIn("if: always()", gate)
        self.assertIn("API_RESULT", gate)
        self.assertIn("BROWSER_RESULT", gate)
        self.assertIn('!= "success"', gate)
        self.assertIn("exit 1", gate)
        self.assertIn("needs: [fast, integration, docker-smoke]", job("quality-gate"))
        self.assertIn("needs: [integration, docker-smoke]", job("deploy"))


if __name__ == "__main__":
    unittest.main()
