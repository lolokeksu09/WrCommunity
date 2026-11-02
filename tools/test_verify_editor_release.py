#!/usr/bin/env python3
"""Tests for release verification without requiring a private signing key or Android SDK."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from verify_editor_release import (
    EXPECTED_SIGNER_SHA256,
    ReleaseVerificationError,
    gradle_identity,
    validate_apk_details,
)

IDENTITY = ("com.wrcommunity.editor.stable", "20", "0.14.0")
SIGNED = (
    "Verifies\n"
    "Verified using v1 scheme (JAR signing): false\n"
    "Verified using v2 scheme (APK Signature Scheme v2): true\n"
    "Number of signers: 1\n"
    f"Signer #1 certificate SHA-256 digest: {EXPECTED_SIGNER_SHA256}\n"
)
BADGING = "package: name='com.wrcommunity.editor.stable' versionCode='20' versionName='0.14.0' compileSdkVersion='36'\n"


class ReleaseVerifierTest(unittest.TestCase):
    def test_trusted_signed_release_passes(self):
        validate_apk_details(SIGNED, BADGING, IDENTITY)

    def test_debug_or_replaced_cert_fails(self):
        with self.assertRaisesRegex(ReleaseVerificationError, "Certificate SHA-256"):
            validate_apk_details(
                SIGNED.replace(EXPECTED_SIGNER_SHA256, "a" * 64), BADGING, IDENTITY
            )

    def test_v1_only_cannot_be_published(self):
        with self.assertRaisesRegex(ReleaseVerificationError, "v2"):
            validate_apk_details(
                SIGNED.replace("v2 scheme (APK Signature Scheme v2): true",
                               "v2 scheme (APK Signature Scheme v2): false"),
                BADGING, IDENTITY,
            )

    def test_multiple_signers_fail(self):
        with self.assertRaisesRegex(ReleaseVerificationError, "one signer"):
            validate_apk_details(
                SIGNED.replace("Number of signers: 1", "Number of signers: 2"),
                BADGING, IDENTITY,
            )

    def test_wrong_application_id_fails(self):
        with self.assertRaisesRegex(ReleaseVerificationError, "applicationId/version"):
            validate_apk_details(
                SIGNED,
                BADGING.replace("com.wrcommunity.editor.stable", "com.wrcommunity.editor"),
                IDENTITY,
            )

    def test_wrong_or_downgraded_version_fails(self):
        with self.assertRaisesRegex(ReleaseVerificationError, "applicationId/version"):
            validate_apk_details(
                SIGNED, BADGING.replace("versionCode='20'", "versionCode='19'"), IDENTITY,
            )

    def test_missing_signer_line_fails(self):
        with self.assertRaisesRegex(ReleaseVerificationError, "Certificate SHA-256"):
            validate_apk_details(
                SIGNED.replace(
                    f"Signer #1 certificate SHA-256 digest: {EXPECTED_SIGNER_SHA256}\n", ""
                ), BADGING, IDENTITY,
            )

    def test_read_gradle_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            build = Path(tmp) / "build.gradle.kts"
            build.write_text(
                'applicationId = "com.wrcommunity.editor.stable"\n'
                'versionCode = 20\nversionName = "0.14.0"\n',
                encoding="utf-8",
            )
            self.assertEqual(IDENTITY, gradle_identity(build))

    def test_reject_changed_gradle_application_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            build = Path(tmp) / "build.gradle.kts"
            build.write_text(
                'applicationId = "com.example.other"\n'
                'versionCode = 20\nversionName = "0.14.0"\n',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ReleaseVerificationError, "Stable applicationId"):
                gradle_identity(build)


if __name__ == "__main__":
    unittest.main()
