"""No-network acceptance checks for the privileged command/provenance boundary."""
from __future__ import annotations
import copy
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("wrc_deployment_controller", HERE / "controller.py")
controller = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(controller)
SHA = "a" * 40


class CommandBoundaryTests(unittest.TestCase):
    def test_exact_status_and_deploy_are_accepted(self):
        self.assertEqual(controller.parse_command(["status"]), ("status", None, None))
        self.assertEqual(controller.parse_command([f"deploy {SHA} 42"]), ("deploy", SHA, 42))

    def test_shell_injection_and_extra_arguments_are_rejected(self):
        invalid = [[], ["status", "status"], ["status\n"], ["status; id"], ["$(id)"], ["logs"], [f"deploy {SHA} 0"], [f"deploy {SHA} -1"], [f"deploy {SHA} 42; id"], [f"deploy {SHA} 42\nstatus"], [f"deploy {'A' * 40} 42"], [f"deploy ../main 42"], [f"deploy {SHA} ４２"], [f"deploy {SHA}\t42"], [f"deploy {SHA} 42 extra"]]
        for arguments in invalid:
            with self.subTest(arguments=arguments), self.assertRaises(controller.Rejected):
                controller.parse_command(arguments)

    def test_invalid_request_does_not_touch_filesystem_or_run_a_command(self):
        with mock.patch.object(controller, "run") as run, mock.patch.object(controller, "secure_directory") as mkdir:
            self.assertEqual(controller.main(["status; id"]), 1)
            run.assert_not_called()
            mkdir.assert_not_called()

    def test_authorized_key_preserves_remote_input_as_one_argument(self):
        installer = (HERE / "install-access.sh").read_text()
        snippet = installer[installer.index("printf 'restrict,"):installer.index('chown root:root "$wrc_user_home/.ssh/authorized_keys"')]
        snippet = snippet.replace('"$(cat "$wrc_key_dir/id_ed25519.pub")"', '"ssh-ed25519 PUBLIC"').replace('>"$wrc_user_home/.ssh/authorized_keys"', "")
        line = subprocess.check_output(["bash", "-c", snippet], text=True).strip()
        self.assertEqual(line, 'restrict,command="sudo -n /usr/local/sbin/wrc-deploy-gateway \\"$SSH_ORIGINAL_COMMAND\\"" ssh-ed25519 PUBLIC')
        command = shlex.split(line)[0].removeprefix("restrict,command=")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sudo = root / "sudo"
            sudo.write_text('#!/usr/bin/python3\nimport json,sys\nprint(json.dumps(sys.argv[1:]))\n')
            sudo.chmod(0o755)
            injection = f"status; touch {root / 'injected'}"
            result = subprocess.check_output(["/bin/sh", "-c", command], env={"PATH": directory, "SSH_ORIGINAL_COMMAND": injection}, text=True)
            self.assertEqual(json.loads(result), ["-n", "/usr/local/sbin/wrc-deploy-gateway", injection])
            self.assertFalse((root / "injected").exists())

    def test_status_does_not_expose_inspected_environment_or_application_logs(self):
        private = "synthetic-private-value"
        inspected = [{"Config":{"Image":"wrcommunity:test", "Env":["COOKIE_SECRET="+private],"Labels":{"com.docker.compose.service":"web-api"}},"State":{"Status":"running","Health":{"Status":"healthy","Log":[{"Output":private}]},"OOMKilled":False,"ExitCode":0}}]
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(controller,"STATE",Path(directory)), mock.patch.object(controller,"run",side_effect=["container-id",json.dumps(inspected)]), mock.patch.object(controller,"public_ready",return_value=True), mock.patch.object(controller.shutil,"disk_usage",return_value=mock.Mock(free=123)), contextlib.redirect_stdout(io.StringIO()) as output:
            controller.status()
            self.assertNotIn(private,output.getvalue())
            self.assertTrue(json.loads(output.getvalue())["ready"])


class ProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.run = {"id": 42, "head_sha": SHA, "head_branch": "main", "event": "push", "path": ".github/workflows/ci.yml", "repository": {"full_name": controller.REPOSITORY}, "head_repository": {"full_name": controller.REPOSITORY}}
        self.jobs = {"total_count": 3, "jobs": [{"name": name, "status": "completed", "conclusion": "success"} for name in ("integration", "docker-smoke")] + [{"name": "deploy", "status": "in_progress", "conclusion": None}]}

    def test_running_deployment_can_use_completed_prerequisites(self):
        controller.validate_provenance(SHA, 42, self.run, self.jobs)

    def test_forks_pr_events_wrong_branch_run_and_sha_are_rejected(self):
        mutations = [("event", "pull_request"), ("head_branch", "feature"), ("head_sha", "b" * 40), ("id", 43), ("path", ".github/workflows/other.yml"), ("head_repository", {"full_name": "attacker/WrCommunity"}), ("repository", {"full_name": "attacker/WrCommunity"})]
        for key, value in mutations:
            candidate = copy.deepcopy(self.run)
            candidate[key] = value
            with self.subTest(key=key), self.assertRaises(controller.Rejected):
                controller.validate_provenance(SHA, 42, candidate, self.jobs)

    def test_failed_missing_pending_or_duplicate_prerequisites_fail_closed(self):
        variants = []
        for conclusion in ("failure", "cancelled", "skipped", None):
            jobs = copy.deepcopy(self.jobs)
            jobs["jobs"][0]["conclusion"] = conclusion
            variants.append(jobs)
        jobs = copy.deepcopy(self.jobs)
        jobs["jobs"][0]["status"] = "in_progress"
        variants.append(jobs)
        jobs = copy.deepcopy(self.jobs)
        jobs["jobs"].pop(0)
        variants.append(jobs)
        jobs = copy.deepcopy(self.jobs)
        jobs["jobs"].append(copy.deepcopy(jobs["jobs"][0]))
        variants.append(jobs)
        jobs = copy.deepcopy(self.jobs)
        jobs["total_count"] = 101
        variants.append(jobs)
        for jobs in variants:
            with self.subTest(jobs=jobs), self.assertRaises(controller.Rejected):
                controller.validate_provenance(SHA, 42, self.run, jobs)

    def test_stale_main_is_rejected_before_build_or_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "state"
            patches = [mock.patch.object(controller, "STATE", state), mock.patch.object(controller, "RELEASES", Path(directory) / "releases"), mock.patch.object(controller, "BACKUPS", Path(directory) / "backups"), mock.patch.object(controller, "secure_directory", side_effect=lambda path:path.mkdir(parents=True, exist_ok=True)), mock.patch.object(controller, "protected_directory"), mock.patch.object(controller, "protected_file"), mock.patch.object(controller, "latest_main", return_value="b" * 40), mock.patch.object(controller, "run"), mock.patch.object(controller, "github"), mock.patch.object(controller, "extract_release"), mock.patch.object(controller, "backup")]
            with __import__("contextlib").ExitStack() as stack:
                for patch in patches:
                    stack.enter_context(patch)
                with self.assertRaisesRegex(controller.Rejected, "current main HEAD"):
                    controller.deploy(SHA, 42)
                controller.github.assert_not_called()
                controller.extract_release.assert_not_called()
                controller.backup.assert_not_called()

    def test_partial_stop_failure_restarts_previous_writers(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            config = root / "config"
            config.mkdir()
            for name in controller.HOST_FILES + ("compose.local.yml",):
                (config / name).write_text("fixture")
            for name, value in (("STATE",root / "state"),("CONFIG",config),("RELEASES",root / "releases"),("BACKUPS",root / "backups")):
                stack.enter_context(mock.patch.object(controller, name, value))
            stack.enter_context(mock.patch.object(controller, "secure_directory", side_effect=lambda path:path.mkdir(parents=True,exist_ok=True)))
            stack.enter_context(mock.patch.object(controller, "protected_file"))
            stack.enter_context(mock.patch.object(controller, "protected_directory"))
            stack.enter_context(mock.patch.object(controller, "latest_main", return_value=SHA))
            stack.enter_context(mock.patch.object(controller, "github", side_effect=[self.run,self.jobs]))
            stack.enter_context(mock.patch.object(controller, "extract_release", side_effect=lambda source,sha,path:path.mkdir()))
            stack.enter_context(mock.patch.object(controller, "check_backup_space"))
            stack.enter_context(mock.patch.object(controller, "validate_compose_contract"))
            stack.enter_context(mock.patch.object(controller.shutil, "disk_usage", return_value=mock.Mock(free=10 * 1024**3)))
            stack.enter_context(mock.patch.object(controller.subprocess, "run", return_value=mock.Mock(returncode=0)))
            backup = stack.enter_context(mock.patch.object(controller, "backup"))
            def command_result(arguments, **options):
                if "stop" in arguments:
                    raise subprocess.CalledProcessError(1, arguments)
                return "{}"
            run = stack.enter_context(mock.patch.object(controller, "run", side_effect=command_result))
            with self.assertRaises(subprocess.CalledProcessError):
                controller.deploy(SHA,42)
            backup.assert_not_called()
            run.assert_any_call(controller.compose(config,"start","web-api","worker"))

    @contextlib.contextmanager
    def deployment_fixture(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            config = root / "config"
            config.mkdir()
            for name in controller.HOST_FILES + ("compose.local.yml",):
                (config / name).write_text("fixture")
            for name,value in (("STATE",root/"state"),("CONFIG",config),("RELEASES",root/"releases"),("BACKUPS",root/"backups")):
                stack.enter_context(mock.patch.object(controller,name,value))
            stack.enter_context(mock.patch.object(controller,"secure_directory",side_effect=lambda path:path.mkdir(parents=True,exist_ok=True)))
            stack.enter_context(mock.patch.object(controller,"protected_file"))
            stack.enter_context(mock.patch.object(controller,"protected_directory"))
            stack.enter_context(mock.patch.object(controller,"latest_main",return_value=SHA))
            stack.enter_context(mock.patch.object(controller,"github",side_effect=[self.run,self.jobs]))
            stack.enter_context(mock.patch.object(controller,"extract_release",side_effect=lambda source,sha,path:path.mkdir()))
            stack.enter_context(mock.patch.object(controller,"check_backup_space"))
            stack.enter_context(mock.patch.object(controller,"validate_compose_contract"))
            stack.enter_context(mock.patch.object(controller.shutil,"disk_usage",return_value=mock.Mock(free=10*1024**3)))
            process = stack.enter_context(mock.patch.object(controller.subprocess,"run",return_value=mock.Mock(returncode=0)))
            run = stack.enter_context(mock.patch.object(controller,"run",return_value="{}"))
            backup = stack.enter_context(mock.patch.object(controller,"backup"))
            yield config,run,backup,process

    def test_backup_failure_restarts_old_writers_without_applying_migrations(self):
        with self.deployment_fixture() as (config,run,backup,process):
            backup.side_effect = OSError("synthetic dump failure")
            with self.assertRaises(OSError):
                controller.deploy(SHA,42)
            run.assert_any_call(controller.compose(config,"start","web-api","worker"))
            self.assertEqual(process.call_count,1)  # build only, no compose apply

    def test_migration_apply_failure_never_restarts_incompatible_old_code(self):
        with self.deployment_fixture() as (config,run,backup,process):
            process.side_effect = [mock.Mock(returncode=0),mock.Mock(returncode=1)]
            with self.assertRaisesRegex(controller.Rejected,"rollback is not automatic"):
                controller.deploy(SHA,42)
            backup.assert_called_once()
            self.assertNotIn(mock.call(controller.compose(config,"start","web-api","worker")),run.mock_calls)
            run.assert_any_call(controller.compose(controller.RELEASES/SHA,"stop","-t","30","web-api","worker"))
            self.assertFalse((controller.STATE/"active-release.json").exists())
            self.assertTrue((controller.STATE/"recovery-required.json").exists())
            before = run.call_count
            with self.assertRaisesRegex(controller.Rejected,"operator recovery"):
                controller.deploy(SHA,42)
            self.assertEqual(run.call_count,before)

    def test_failed_post_apply_tls_check_stops_new_writers_and_keeps_old_revision_record(self):
        with self.deployment_fixture() as (config,run,backup,process), mock.patch.object(controller,"public_ready",return_value=False):
            with self.assertRaisesRegex(controller.Rejected,"Strict HTTPS"):
                controller.deploy(SHA,42)
            self.assertNotIn(mock.call(controller.compose(config,"start","web-api","worker")),run.mock_calls)
            run.assert_any_call(controller.compose(controller.RELEASES/SHA,"stop","-t","30","web-api","worker"))
            self.assertFalse((controller.STATE/"active-release.json").exists())


class ComposePersistenceBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.config = {"name":controller.PROJECT,"networks":{"backend":{"name":controller.PROJECT+"_backend","internal":True}},"volumes":{"postgres":{"name":controller.PROJECT+"_postgres"},"media":{"name":controller.PROJECT+"_media"}},"services":{}}
        for name,source,target in (("postgres","postgres","/var/lib/postgresql"),("web-api","media","/app/media"),("worker","media","/app/media"),("migrate","media","/app/media")):
            self.config["services"][name] = {"networks":{"backend":None},"volumes":[{"type":"volume","source":source,"target":target}]}

    def test_existing_named_volumes_and_private_network_are_accepted(self):
        controller.validate_compose_contract(self.config)

    def test_retargeted_named_volume_or_shadowing_bind_mount_is_rejected(self):
        variants=[]
        for logical in ("postgres","media"):
            candidate=copy.deepcopy(self.config)
            candidate["volumes"][logical]["name"]="new-empty-data"
            variants.append(candidate)
        for name in ("postgres","web-api","worker","migrate"):
            for field,value in (("type","bind"),("source","/root"),("target","/wrong")):
                candidate=copy.deepcopy(self.config)
                candidate["services"][name]["volumes"][0][field]=value
                variants.append(candidate)
            candidate=copy.deepcopy(self.config)
            candidate["services"][name]["volumes"].append({"type":"bind","source":"/root","target":"/root"})
            variants.append(candidate)
        for candidate in variants:
            with self.subTest(candidate=candidate),self.assertRaises(controller.Rejected):
                controller.validate_compose_contract(candidate)

    def test_public_database_api_or_removed_internal_network_is_rejected(self):
        variants=[]
        for name in ("postgres","web-api","worker","migrate"):
            candidate=copy.deepcopy(self.config)
            candidate["services"][name]["ports"]=[{"target":5432,"published":"5432"}]
            variants.append(candidate)
            candidate=copy.deepcopy(self.config)
            candidate["services"][name]["network_mode"]="host"
            variants.append(candidate)
            candidate=copy.deepcopy(self.config)
            candidate["services"][name]["networks"]["edge"]=None
            variants.append(candidate)
        candidate=copy.deepcopy(self.config)
        candidate["networks"]["backend"]["internal"]=False
        variants.append(candidate)
        candidate=copy.deepcopy(self.config)
        candidate["name"]="new-empty-project"
        variants.append(candidate)
        for candidate in variants:
            with self.subTest(candidate=candidate),self.assertRaises(controller.Rejected):
                controller.validate_compose_contract(candidate)

if __name__ == "__main__":
    unittest.main()
