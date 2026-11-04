#!/usr/bin/env python3
"""Fail closed if an Android release APK cannot update the existing stable app."""
from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path

EXPECTED_SIGNER_SHA256 = "e6535697ab4f960f89acfc5bee3c80ffe53e62ecc7c13925025b91e1cc98d0c5"


class ReleaseVerificationError(ValueError):
    pass


def gradle_identity(build_file: Path) -> tuple[str, str, str]:
    source = build_file.read_text(encoding="utf-8")
    fields = {}
    for field, pattern in {
        "applicationId": r'^\s*applicationId\s*=\s*"([^"]+)"\s*$',
        "versionCode": r"^\s*versionCode\s*=\s*(\d+)\s*$",
        "versionName": r'^\s*versionName\s*=\s*"([^"]+)"\s*$',
    }.items():
        values = re.findall(pattern, source, re.MULTILINE)
        if len(values) != 1:
            raise ReleaseVerificationError(f"Expected one {field} in {build_file}")
        fields[field] = values[0]
    if fields["applicationId"] != "com.wrcommunity.editor.stable":
        raise ReleaseVerificationError("Stable applicationId changed")
    return fields["applicationId"], fields["versionCode"], fields["versionName"]


def validate_apk_details(
    signature_report: str,
    badging_report: str,
    expected: tuple[str, str, str],
) -> None:
    if not re.search(
        r"^Verified using v2 scheme(?: \([^\r\n]*\))?: true\s*$",
        signature_report, re.MULTILINE,
    ):
        raise ReleaseVerificationError("APK Signature Scheme v2 is not verified")
    if not re.search(r"^Number of signers:\s*1\s*$", signature_report, re.MULTILINE):
        raise ReleaseVerificationError("APK must have exactly one signer")
    fingerprints = re.findall(
        r"^Signer #\d+ certificate SHA-256 digest:\s*([a-fA-F0-9]{64})\s*$",
        signature_report, re.MULTILINE,
    )
    if len(fingerprints) != 1 or fingerprints[0].lower() != EXPECTED_SIGNER_SHA256:
        raise ReleaseVerificationError("Certificate SHA-256 differs from stable release key")
    found = re.search(
        r"^package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'",
        badging_report, re.MULTILINE,
    )
    if not found or found.groups() != expected:
        raise ReleaseVerificationError(
            "APK applicationId/version differs from the Gradle stable configuration"
        )


def verify_release(apk: Path, build_file: Path, apksigner: Path, aapt: Path) -> None:
    if not apk.is_file() or apk.stat().st_size == 0:
        raise ReleaseVerificationError("Release APK is missing or empty")
    expected = gradle_identity(build_file)
    signed = subprocess.run(
        [str(apksigner), "verify", "--verbose", "--print-certs", str(apk)],
        text=True, capture_output=True, check=True,
    )
    badges = subprocess.run(
        [str(aapt), "dump", "badging", str(apk)],
        text=True, capture_output=True, check=True,
    )
    validate_apk_details(signed.stdout, badges.stdout, expected)
    print(
        f"Verified stable release APK: {expected[0]} "
        f"versionCode={expected[1]} versionName={expected[2]}, "
        f"v2 signature and expected SHA-256 certificate"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("apk", type=Path)
    parser.add_argument("--gradle", type=Path, default=Path("app/build.gradle.kts"))
    parser.add_argument("--apksigner", type=Path, required=True)
    parser.add_argument("--aapt", type=Path, required=True)
    args = parser.parse_args()
    try:
        verify_release(args.apk, args.gradle, args.apksigner, args.aapt)
    except (ReleaseVerificationError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Release verification FAILED: {error}\n")


if __name__ == "__main__":
    main()
