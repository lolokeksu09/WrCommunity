#!/usr/bin/python3
"""Root-owned, forced-command deployment gateway. Never accepts a shell command."""
from __future__ import annotations

import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request

REPOSITORY = "lolokeksu09/WrCommunity"
REMOTE = f"https://github.com/{REPOSITORY}.git"
ORIGIN = "https://139.100.205.135"
CONFIG = Path("/opt/WrCommunity")
STATE = Path("/var/lib/wrcommunity-deploy")
RELEASES = Path("/opt/wrcommunity-releases")
BACKUPS = Path("/root/wrcommunity-deploy-backups")
PROJECT = "wrcommunity-local"
HOST_FILES = (".env", "compose.vds.yml", "compose.ip.yml", "Caddyfile.ip")
SAFE_ENV = {"PATH": "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Rejected(Exception):
    pass


def parse_command(arguments: list[str]) -> tuple[str, str | None, int | None]:
    if len(arguments) != 1:
        raise Rejected("Exactly one forced-command argument is required")
    if arguments[0] == "status":
        return "status", None, None
    match = re.fullmatch(r"deploy ([0-9a-f]{40}) ([1-9][0-9]{0,19})", arguments[0], flags=re.ASCII)
    if not match:
        raise Rejected("Only status or deploy <main SHA> <successful CI run ID> is allowed")
    return "deploy", match[1], int(match[2])


def validate_provenance(sha: str, run_id: int, run: dict, jobs: dict) -> None:
    if (run.get("id") != run_id or run.get("head_sha") != sha or run.get("head_branch") != "main"
            or run.get("event") != "push" or run.get("repository", {}).get("full_name") != REPOSITORY
            or run.get("head_repository", {}).get("full_name") != REPOSITORY
            or run.get("path", "").split("@", 1)[0] != ".github/workflows/ci.yml"):
        raise Rejected("CI provenance does not match this repository's main push")
    # The overall run remains in progress while its dependent deployment job runs.
    # Only the latest attempt's prerequisite jobs may authorize the deployment.
    if jobs.get("total_count", 0) > 100:
        raise Rejected("Unexpected CI job count")
    for required in ("integration", "docker-smoke"):
        candidates = [job for job in jobs.get("jobs", []) if job.get("name") == required]
        if len(candidates) != 1 or candidates[0].get("status") != "completed" or candidates[0].get("conclusion") != "success":
            raise Rejected(f"Required CI job did not pass: {required}")


def validate_compose_contract(config: dict) -> None:
    """Guard persistence and private network boundaries before any writer is stopped."""
    if config.get("name") != PROJECT:
        raise Rejected("Compose project identity changed")
    networks = config.get("networks", {})
    backend = networks.get("backend", {})
    if backend.get("internal") is not True or backend.get("name") != PROJECT + "_backend":
        raise Rejected("The existing private backend network must be preserved")
    services = config.get("services", {})
    volume_definitions = config.get("volumes", {})
    for service_name, logical_volume, target in (("postgres", "postgres", "/var/lib/postgresql"), ("web-api", "media", "/app/media"), ("worker", "media", "/app/media"), ("migrate", "media", "/app/media")):
        service = services.get(service_name, {})
        mounts = service.get("volumes", [])
        if service.get("network_mode") or service.get("ports") or len(mounts) != 1:
            raise Rejected("Database/application services must retain their isolated mount/port contract")
        mount = mounts[0]
        definition = volume_definitions.get(logical_volume, {})
        if (mount.get("type") != "volume" or mount.get("source") != logical_volume
                or mount.get("target") != target or definition.get("name") != PROJECT + "_" + logical_volume):
            raise Rejected("Existing PostgreSQL/media named volume identity changed")
        attached = service.get("networks", {})
        if set(attached) != {"backend"}:
            raise Rejected("Database/application services must stay on the private backend only")


def run(command: list[str], *, output=None, input_file=None, capture: bool = True, timeout: int = 900) -> str:
    completed = subprocess.run(command, check=True, stdin=input_file, stdout=output if output is not None else (subprocess.PIPE if capture else None), stderr=subprocess.PIPE, text=output is None and input_file is None, env=SAFE_ENV, timeout=timeout)
    if output is not None or not capture:
        return ""
    value = completed.stdout
    return value.decode() if isinstance(value, bytes) else value


def protected_file(path: Path, *, secret: bool = False) -> None:
    meta = path.lstat()
    if not stat.S_ISREG(meta.st_mode) or meta.st_uid != 0 or meta.st_mode & 0o022:
        raise Rejected(f"Expected a root-owned non-writable regular file: {path}")
    if secret and meta.st_mode & 0o077:
        raise Rejected("The deployment environment must have mode 0600")


def protected_directory(path: Path) -> None:
    meta = path.lstat()
    if not stat.S_ISDIR(meta.st_mode) or meta.st_uid != 0 or meta.st_mode & 0o022:
        raise Rejected("The host configuration directory must be root-owned and non-writable by others")


def secure_directory(path: Path) -> None:
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    meta = path.lstat()
    if not stat.S_ISDIR(meta.st_mode) or meta.st_uid != 0 or meta.st_mode & 0o077:
        raise Rejected(f"Expected a root-only directory: {path}")


def atomic_json(path: Path, value: dict) -> None:
    descriptor, filename = tempfile.mkstemp(dir=path.parent, prefix=".state-")
    with os.fdopen(descriptor, "w") as stream:
        json.dump(value, stream, sort_keys=True)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(filename, path)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def compose(directory: Path, *arguments: str) -> list[str]:
    command = ["docker", "compose", "--project-directory", str(directory), "-p", PROJECT]
    for filename in ("compose.local.yml", "compose.vds.yml", "compose.ip.yml"):
        command.extend(("-f", str(directory / filename)))
    if (directory / "compose.release.yml").exists():
        protected_file(directory / "compose.release.yml")
        command.extend(("-f", str(directory / "compose.release.yml")))
    return command + list(arguments)


def active_directory() -> Path:
    active = STATE / "active-release.json"
    if not active.exists():
        return CONFIG
    protected_file(active, secret=True)
    value = json.loads(active.read_text())
    sha = value.get("sha", "")
    if not re.fullmatch("[0-9a-f]{40}", sha):
        raise Rejected("Invalid active release state")
    directory = RELEASES / sha
    if not directory.is_dir() or directory.is_symlink():
        raise Rejected("Active release directory is missing or unsafe")
    return directory


def public_ready() -> bool:
    try:
        with HTTP.open(ORIGIN + "/health/ready", timeout=10) as response:
            return response.status == 200 and response.geturl() == ORIGIN + "/health/ready" and json.load(response).get("ok") is True
    except (OSError, ValueError, urllib.error.URLError):
        return False


def status() -> None:
    # No application logs, SQL records, environment variables, or auth headers.
    ids = run(["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={PROJECT}"]).split()
    containers = []
    if ids:
        for container in json.loads(run(["docker", "inspect", *ids])):
            state = container.get("State", {})
            containers.append({"service": container.get("Config", {}).get("Labels", {}).get("com.docker.compose.service"), "state": state.get("Status"), "health": state.get("Health", {}).get("Status"), "oom_killed": state.get("OOMKilled"), "exit_code": state.get("ExitCode"), "image": container.get("Config", {}).get("Image")})
    active = STATE / "active-release.json"
    revision = None
    if active.exists():
        protected_file(active, secret=True)
        revision = json.loads(active.read_text()).get("sha")
    disk = shutil.disk_usage("/opt")
    print(json.dumps({"origin": ORIGIN, "ready": public_ready(), "active_revision": revision, "recovery_required": (STATE / "recovery-required.json").exists(), "disk_free_bytes": disk.free, "containers": containers}, sort_keys=True))


def github(path: str) -> dict:
    request = urllib.request.Request(f"https://api.github.com/repos/{REPOSITORY}/{path}", headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "WrCommunity-deploy"})
    with HTTP.open(request, timeout=20) as response:
        return json.load(response)


def latest_main(source: Path) -> str:
    run(["git", "-C", str(source), "fetch", "--no-tags", REMOTE, "+refs/heads/main:refs/remotes/origin/main"])
    return run(["git", "-C", str(source), "rev-parse", "refs/remotes/origin/main"]).strip()


def extract_release(source: Path, sha: str, directory: Path) -> None:
    # A failed prior build may leave a release behind. Never merge or overwrite it.
    directory.mkdir(mode=0o700)
    with tempfile.TemporaryFile() as archive:
        run(["git", "-C", str(source), "archive", "--format=tar", sha], output=archive)
        archive.seek(0)
        with tarfile.open(fileobj=archive) as source_tar:
            members = source_tar.getmembers()
            if any(not (member.isfile() or member.isdir()) or member.name.startswith("/") or ".." in Path(member.name).parts or member.name in HOST_FILES for member in members):
                raise Rejected("Unsafe or host-specific source archive entry")
            source_tar.extractall(directory, members=members, filter="data")


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def media_mountpoint() -> Path:
    mountpoint = Path(run(["docker", "volume", "inspect", f"{PROJECT}_media", "--format", "{{.Mountpoint}}"]).strip())
    if not mountpoint.is_absolute() or mountpoint == Path("/") or not mountpoint.is_dir():
        raise Rejected("Media volume mountpoint is invalid")
    return mountpoint


def check_backup_space(directory: Path) -> None:
    database_bytes = int(run(compose(directory, "exec", "-T", "postgres", "psql", "-U", "wrcommunity", "-d", "wrcommunity", "-tAc", "SELECT pg_database_size(current_database())")).strip())
    media_bytes = int(run(["du", "-sb", str(media_mountpoint())]).split()[0])
    if min(shutil.disk_usage("/opt").free, shutil.disk_usage(BACKUPS).free) < 2 * (database_bytes + media_bytes) + 2 * 1024 ** 3:
        raise Rejected("Insufficient free disk for a consistent backup; nothing was stopped")


def backup(directory: Path, destination: Path) -> None:
    for filename in HOST_FILES + ("compose.local.yml",):
        shutil.copyfile(directory / filename, destination / filename)
        os.chmod(destination / filename, 0o600)
    dump = destination / "database.dump"
    with dump.open("wb") as stream:
        run(compose(directory, "exec", "-T", "postgres", "pg_dump", "--format=custom", "--no-owner", "--no-acl", "-U", "wrcommunity", "wrcommunity"), output=stream)
    with dump.open("rb") as stream:
        run(compose(directory, "exec", "-T", "postgres", "pg_restore", "--list"), input_file=stream)
    mountpoint = media_mountpoint()
    media = destination / "media.tar.gz"
    run(["tar", "--numeric-owner", "-czf", str(media), "-C", str(mountpoint), "."])
    run(["gzip", "-t", str(media)])
    (destination / "SHA256SUMS").write_text("".join(f"{sha256(path)}  {path.name}\n" for path in (dump, media)))


def deploy(sha: str, run_id: int) -> None:
    secure_directory(STATE)
    with (STATE / "deploy.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise Rejected("Another deployment is running") from error
        if (STATE / "recovery-required.json").exists():
            raise Rejected("A prior deployment requires operator recovery; automatic writes are blocked")
        protected_directory(CONFIG)
        for filename in HOST_FILES + ("compose.local.yml",):
            protected_file(CONFIG / filename, secret=filename == ".env")
        secure_directory(RELEASES)
        secure_directory(BACKUPS)
        source = STATE / "source.git"
        if not source.exists():
            run(["git", "init", "--bare", str(source)])
        if latest_main(source) != sha:
            raise Rejected("Only the current main HEAD may deploy")
        validate_provenance(sha, run_id, github(f"actions/runs/{run_id}"), github(f"actions/runs/{run_id}/jobs?filter=latest&per_page=100"))
        old = active_directory()
        if old == RELEASES / sha:
            if not public_ready():
                raise Rejected("Already deployed revision is not ready; operator diagnosis required")
            status()
            return
        if shutil.disk_usage("/opt").free < 6 * 1024 ** 3:
            raise Rejected("At least 6 GiB free disk is required; nothing was stopped")
        target = RELEASES / sha
        if target.exists() or target.is_symlink():
            meta = target.lstat()
            if not stat.S_ISDIR(meta.st_mode) or meta.st_uid != 0 or meta.st_mode & 0o077:
                raise Rejected("Unsafe previous failed release directory")
            # Retain unsuccessful candidates for diagnosis. Never delete release/data paths.
            target.rename(RELEASES / f"{sha}.failed-{time.time_ns()}")
        extract_release(source, sha, target)
        print(f"Building reviewed main revision {sha}", flush=True)
        build_log = STATE / f"build-{sha}.log"
        with build_log.open("wb") as stream:
            # Build before copying host secrets into this source directory.
            completed = subprocess.run(["docker", "build", "--tag", f"wrcommunity:{sha}", str(target)], stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, env=SAFE_ENV, timeout=1200)
            if completed.returncode:
                raise Rejected(f"Image build failed; server-only log: {build_log}")
        for filename in HOST_FILES:
            shutil.copyfile(CONFIG / filename, target / filename)
            os.chmod(target / filename, 0o600)
        (target / "compose.release.yml").write_text("services:\n" + "".join(f"  {service}:\n    image: wrcommunity:{sha}\n" for service in ("migrate", "web-api", "worker")))
        # Effective configuration contains secrets: capture in memory, validate a whitelist,
        # and never write/print it to GitHub logs.
        validate_compose_contract(json.loads(run(compose(target, "config", "--format", "json"))))
        if latest_main(source) != sha:
            raise Rejected("main advanced during build; current service was not stopped")
        check_backup_space(old)
        snapshot = Path(tempfile.mkdtemp(prefix=dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ-") + sha[:8] + "-", dir=BACKUPS))
        stopped = False
        migration_started = False
        try:
            stopped = True
            run(compose(old, "stop", "-t", "30", "web-api", "worker"))
            backup(old, snapshot)
            print(f"Consistent database/media backup verified: {snapshot}", flush=True)
            atomic_json(STATE / "recovery-required.json", {"sha":sha,"backup":str(snapshot),"ci_run":run_id})
            migration_started = True
            apply_log = STATE / f"apply-{sha}.log"
            with apply_log.open("wb") as stream:
                completed = subprocess.run(compose(target, "up", "-d", "--no-build", "--wait", "--wait-timeout", "180"), stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT, env=SAFE_ENV, timeout=240)
                if completed.returncode:
                    raise Rejected(f"Deployment failed; database rollback is not automatic. Server-only log: {apply_log}")
            if not public_ready():
                raise Rejected("Strict HTTPS/readiness check failed after deployment")
            with HTTP.open(ORIGIN + "/", timeout=15) as response:
                if response.status != 200 or response.geturl() != ORIGIN + "/" or b'<div id="root"></div>' not in response.read(2 * 1024 * 1024):
                    raise Rejected("Built site verification failed")
            atomic_json(STATE / "active-release.json", {"sha": sha, "ci_run": run_id, "deployed_at": dt.datetime.now(dt.timezone.utc).isoformat()})
            (STATE / "recovery-required.json").unlink()
            stopped = False
            status()
        except Exception:
            if stopped:
                if migration_started:
                    # Fail closed. Old application code may no longer match the schema.
                    with contextlib.suppress(Exception):
                        run(compose(target, "stop", "-t", "30", "web-api", "worker"))
                    print("Application stopped for operator recovery; backup retained. No database restore was attempted.", file=sys.stderr)
                else:
                    with contextlib.suppress(Exception):
                        run(compose(old, "start", "web-api", "worker"))
            raise


def main(arguments: list[str]) -> int:
    try:
        operation, sha, run_id = parse_command(arguments)
        if os.geteuid() != 0:
            raise Rejected("The forced-command gateway requires its configured sudo rule")
        os.umask(0o077)
        if operation == "status":
            status()
        else:
            assert sha is not None and run_id is not None
            deploy(sha, run_id)
        return 0
    except (Rejected, OSError, ValueError, subprocess.SubprocessError, urllib.error.URLError) as error:
        # Do not serialize subprocess stderr or full commands containing environment.
        print(f"Deployment gateway rejected/failed: {error if isinstance(error, Rejected) else type(error).__name__}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
