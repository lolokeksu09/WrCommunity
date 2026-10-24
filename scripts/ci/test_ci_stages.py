"""Invariant checks for the staged GitHub Actions pipeline (stdlib-only)."""
import re
import unittest
from pathlib import Path

CI = (Path(__file__).resolve().parents[2] / ".github/workflows/ci.yml").read_text(encoding="utf-8")


def section(name: str) -> str:
    match = re.search(rf"(?ms)^  {re.escape(name)}:\n(.*?)(?=^  [a-z][a-z0-9-]*:\n|\Z)", CI)
    if not match:
        raise AssertionError(f"Missing job: {name}")
    return match.group(1)


class StagedWorkflowContract(unittest.TestCase):
    def test_review_stage_events_are_explicit(self):
        self.assertIn("ready_for_review", CI)
        self.assertIn("converted_to_draft", CI)
        self.assertIn("synchronize", CI)
        self.assertIn("branches: [main]", CI)

    def test_draft_is_fast_and_ready_runs_full(self):
        fast = section("fast")
        self.assertIn("github.event.pull_request.draft == true", fast)
        self.assertIn("npm run typecheck", fast)
        self.assertIn("npm run build", fast)
        for name in ("api-tests", "browser-tests", "docker-smoke"):
            full = section(name)
            self.assertIn("github.event.pull_request.draft == false", full)
            self.assertIn("github.event_name == 'push'", full)
        integration = section("integration")
        self.assertIn("github.event.pull_request.draft == false", integration)
        self.assertIn("if: always()", integration)
        self.assertIn("needs: [api-tests, browser-tests]", integration)
        self.assertIn("npm run test:e2e", section("browser-tests"))
        self.assertIn("sh scripts/docker-smoke.sh", section("docker-smoke"))

    def test_required_quality_gate_cannot_skip_failures(self):
        gate = section("quality-gate")
        self.assertIn("if: always()", gate)
        self.assertIn("needs: [fast, integration, docker-smoke]", gate)
        self.assertIn("FAST_RESULT", gate)
        self.assertIn("INTEGRATION_RESULT", gate)
        self.assertIn("DOCKER_RESULT", gate)
        self.assertIn('"success"', gate)
        self.assertIn("exit 1", gate)

    def test_deployment_remains_full_only_and_sha_bound(self):
        deploy = section("deploy")
        self.assertIn("needs: [integration, docker-smoke]", deploy)
        self.assertIn("github.event_name == 'push'", deploy)
        self.assertIn("refs/heads/main", deploy)
        self.assertIn("WRC_TARGET_SHA: ${{ github.sha }}", deploy)
        self.assertIn("scripts/run-deployment-ssh.sh deploy", deploy)
        self.assertIn("node scripts/live-site-check.mjs", deploy)
        status = section("vds-status")
        self.assertIn("needs: [deploy]", status)
        self.assertIn("scripts/run-deployment-ssh.sh status", status)


if __name__ == "__main__":
    unittest.main()
