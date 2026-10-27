# WrCommunity — continuation: Premium 2.0 foundation (26.10.2026)

## Confirmed main and prior milestone

- Main baseline before this PR: `4ec19011c081e5e64866de72eda270d8cfbaca98`, [PR #41](https://github.com/lolokeksu09/WrCommunity/pull/41) merged, [RELEASE 40385241941](https://github.com/lolokeksu09/WrCommunity/actions/runs/40385241941) success, confirmed exact active VDS revision, `ready=true`, `recovery_required=false`.
- Premium 2.0 original audit: [2026-10-26-premium-v2-audit.md](reviews/2026-10-26-premium-v2-audit.md). Separate app redesign **not started**. The report documented local Chromium `ERR_BLOCKED_BY_ADMINISTRATOR` and previous QA-01 smoke gap.
- Previous editorial code has been released but actual `--apply` to production PostgreSQL **not reverified**. No statement here about how many editorial records are live. External SMTP still pending.

## Current active preparation

- Branch `prep/premium-v2-quality-baseline-2026-10-26`, base `4ec19011c081e5e64866de72eda270d8cfbaca98`.
- Plan: [2026-10-26-premium-v2-preparation.md](../superpowers/plans/2026-10-26-premium-v2-preparation.md).
- **QA-01 fixed in source:** `scripts/live-site-check.mjs` waits for a rendered feed or empty state, no spinner/error alert; captures after real content; checks JS errors. `scripts/ci/public-home-ready.mjs` and `tests/public-home-ready.test.mjs` added, 5 local tests passed on Node 22.16.0 in isolated workspace (not a full app validation).
- **Baseline prepared:** `scripts/ci/premium-visual-baseline.mjs`, `premium-baseline-guard.mjs`, unit tests, four screen widths. Refuses production origins; only local HTTP. Guide: [PREMIUM-V2-BASELINE.md](PREMIUM-V2-BASELINE.md).
- **Design proposal prepared:** [tokens](../design/premium-v2/tokens.json), [component contracts](../design/premium-v2/design-contract.md), [standalone four-screen comparative prototype](../design/premium-v2/premium-preview.html). No app CSS/React code consumes these files.
- `npm test` includes all `tests/*.test.mjs` so regression checks are part of API CI. Existing test strategy stays.
- Desktop Chromium automatic E2E remains **disabled by explicit owner decision**. User authorized preparation work but not a full redesign deployment.
- Current execution environment cannot run full browser/app: old source archive, Node 22 instead of Node24, no local Postgres/Docker/dependencies and Chromium restrictions. Real local screenshots and performance baseline remain **not captured** until an isolated supported environment runs the new CLI.
- No new production accounts, editorial seed or credentials touched. No API, PostgreSQL migrations, application UI or security policy changed.

## Handoff and next action

- Review staged PR diff for only smoke/QA scripts, associated tests, package test command, candidate design docs/preview and continuation/plan.
- Verify exact PR head via Draft FAST then Ready FULL `api-tests`, mobile Chromium, browser-tests, Docker smoke, integration, quality-gate; keep Desktop E2E off. Merge only after all required checks. Confirm main RELEASE, active VDS SHA and screenshot after content loaded.
- **One next action after release:** run the local visual baseline in a supported Node24/Docker/Postgres/Chromium environment, inspect 20 screenshots and supply real evidence; then approve Premium 2.0 screen direction before touching live UI.


## 27.10.2026 — Premium 2.0 P2-0 CLS attribution (working PR #44)

- Parent **plan/evidence PR #43** is a separate docs-only Draft: [Premium 2.0 implementation plan](https://github.com/lolokeksu09/WrCommunity/blob/audit/premium-2-preparation-2026-10-27/docs/superpowers/plans/2026-10-27-premium-2-implementation.md). This branch originates directly from `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.
- This branch: `feat/premium-2-cls-attribution-2026-10-27`; unmerged [PR #44](https://github.com/lolokeksu09/WrCommunity/pull/44). Changes limited to manual privacy-safe CLS diagnostics in `scripts/ci/premium-visual-baseline.mjs`, pure session-window summarizer, unit tests, and docs.
- Tested in disposable Chromium runner [40449771048](https://github.com/lolokeksu09/WrCommunity/actions/runs/40449771048) at audit SHA `bd28e55b20125a50395783bf86af27019e263638`, local `http://127.0.0.1:13000/`, PostgreSQL `wrcommunity_test`; artifact `12709559163` has 20 PNGs, JSON and source SHA. **20/20 passed; unit tests passed**; direct initial `document` shift plus later `main`/`footer` shift observed on every guest route. **11/20** diagnostic session CLS readings exceeded 0.1. Full evidence [here](reviews/2026-10-27-premium-2-cls-attribution.md).
- The prior failed unit [run 40449682358](https://github.com/lolokeksu09/WrCommunity/actions/runs/40449682358) exposed a wrong expected region ordering in a new test; assertion corrected and rerun passed. No UI, API, DB, production or VDS changes. Desktop Chromium automated E2E stays disabled. Not a CLS fix.
- Before declaring PR ready or merge, remove ephemeral audit-only workflow, confirm final diff/FAST, run required Ready FULL and ensure owner review. One next action for subsequent P2-1 UI work: isolate actual initial fallback/shell geometry and prove lower CLS at 360/390/430/1440 on disposable fixtures while preserving interactions/ACL.
