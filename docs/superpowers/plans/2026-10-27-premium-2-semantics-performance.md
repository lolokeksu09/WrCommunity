# Premium 2.0 — mobile semantics and throttled laboratory baseline

Date: 2026-10-27. **Exact starting SHA:** `55e3c8995fa0cef388996eb7f3199fc0a37733c6` (verified PR #50 head). Working branch `audit/premium-2-semantics-performance-2026-10-27` stacked on #50. Production `main` unchanged.

## Objective
Close the remaining **automatable** accessibility evidence gaps without confusing simulations for native Android accessibility. Use the existing isolated Mobile Chromium E2E infrastructure.

1. Test keyboard focus sequence and accessible names for authenticated profile editor inputs, image file input and privacy fields with a disposable hidden account. No save or production requests.
2. Run one deterministic-configuration **throttled** guest home capture: mobile 390×844; CDP network latency 150ms, throughput ~1.6 Mbps download / ~0.72 Mbps upload and 4× CPU throttling; record DOM ready, observed LCP and CLS entry metrics with units and a screenshot. No pass/fail Web Vitals score or field INP claim.
3. Register the exact scenarios in the E2E inventory and verify all FULL GitHub CI required jobs on the final HEAD.
4. Append observations, reproducible commands, remaining manual gates and one next action to the report and CONTINUATION. No `main` merge or VDS deploy.

## Safety
No React/CSS/API/ACL/migration/production change, no external telemetry, no personal profile screenshots: test identity and test PostgreSQL/Mailpit only. Guest performance observation occurs solely on local test site. Preserve disabled automatic Desktop Chromium. Do not label CDP emulation native browser zoom, physical Android behavior, screen-reader speech, production CWV or actual INP.

## Acceptance
New L2/L3 E2E pass in `mobile-chromium`. FULL's exact-head `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` must be `success`. Any failure is reviewed and corrected, not bypassed. Stay unmerged for owner review.
