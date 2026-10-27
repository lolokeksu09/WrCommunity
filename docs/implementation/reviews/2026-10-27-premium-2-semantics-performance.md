# WrCommunity Premium 2.0 — semantic and throttled lab evidence

Date: 2026-10-27. Base: reviewed [PR #50](https://github.com/lolokeksu09/WrCommunity/pull/50), head `55e3c8995fa0cef388996eb7f3199fc0a37733c6`. This document describes the new isolated tests and pending verification, not a publication decision.

## New reproducible tests

**`tests/e2e/premium-semantics-performance.spec.ts`** contains two distinct Mobile Chromium scenarios in the exact E2E registry:

1. **Authenticated semantic keyboard smoke:** use one disposable verified hidden account and open profile editor at 390×844; assert accessible names of "Имя" and "О себе", keyboard Tab movement from name to biography, accessible file inputs for "Аватар" and "Обложка", and profile privacy radio-group/checkbox names. The editor is not submitted. This verifies a narrow path of keyboard and semantic behavior, not screen-reader speech or end-to-end WCAG compliance.
2. **Throttled guest lab:** use the existing isolated localhost backend with mobile 390×844 viewport; CDP `Network.emulateNetworkConditions` 150ms latency / 200,000 download bytes per second / 90,000 upload bytes per second and `Emulation.setCPUThrottlingRate(rate=4)`; navigate to the guest feed. Collect numeric performance-navigation timings, observed LCP entries and session-window CLS, HTTP success, horizontal overflow and a viewport screenshot. Save `premium-throttled-guest-390.json` and PNG in browser-run artifact. No private URL/body/person details are serialized.

**Limitations:** This is one synthetic measurement under emulated conditions, not a calibrated Lighthouse run. LCP/CLS from PerformanceObserver are diagnostic; INP, p75 field metrics, and production traffic remain unmeasured. Neither CDP throttling nor a resized viewport simulates actual native browser 200% zoom, real Android keyboard/file picker or screen-reader speech.

## Evidence and stage boundaries

Previous [PR #50 FULL 40467063816](https://github.com/lolokeksu09/WrCommunity/actions/runs/40467063816) succeeded at exact final head `55e3c8995fa0cef388996eb7f3199fc0a37733c6`. This does **not** verify the new test revision. Before declaring this patch complete, record `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, and `quality-gate` success on the *new final PR head*.

No app code, CI rules, ACL, database, production data or VDS content modified. The newly registered tests run on isolated PostgreSQL/Mailpit in the existing CI. Automatic Desktop Chromium E2E remains disabled by owner decision.

## Release decision

Retain all stacked branches unmerged. For release, choose **one** cumulative integrated candidate and complete real on-device zoom/IME/picker and assistive-technology review, manual audit of contrast/focus, and any explicit acceptance of remaining performance evidence limits. Then review the final `main...candidate` source diff and obtain explicit owner authorization before a protected-main merge. Keep external SMTP/public onboarding readiness as a separate gate.

**One next action:** obtain exact-head CI result for this PR, publish it in PR description with artifact details, then assess remaining manual device validation without claiming it was performed.
