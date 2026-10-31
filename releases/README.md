# Project Hub v0.2.2 — security update (delivery artifact only)

This branch is a **delivery branch only** for the user's existing VDS installation. It does not reopen or deploy the archived WrCommunity project. No commit to `main`.

## Verified artifact

- File: `releases/Project-Hub-v0.2.2.tar.gz`
- SHA-256: `5f7eb1f9369013f30dca4eecf42d78183de7d61793f6226d10c8eef5adb50652`
- Git blob SHA-1: `b8db13e051d2f54bf0e1a25fa5ffaf6ec01d3fbd`
- Note: no credentials, passwords, or private/state folders packaged.

## Upgrade on VDS

**Backup `/opt/project-hub/private` and `/opt/project-hub/state` before overwriting files.** HTTPS Funnel remains publicly reachable until a separate decision to disable it.

Download the exact tarball from this branch (pin the SHA-256 above); verify with `sha256sum` before extracting it into `/opt/project-hub`. Preserve the current `private/`, `state/` and `queue/` directories. From a trusted root SSH session run:

```bash
cd /opt/project-hub
python3 tools/mfa_setup.py
bash install.sh
```

The new installer is **fail-closed**: it refuses to replace the existing web container until a valid TOTP record has been enrolled. Follow the interactive TOTP instructions; never send secrets or one-time codes to ChatGPT or GitHub. Existing admin password is retained.
