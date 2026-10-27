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


## 27.10.2026 — Premium 2.0 evidence audit in Draft PR #43

- **Active documentation-only PR:** [#43](https://github.com/lolokeksu09/WrCommunity/pull/43), branch `audit/premium-2-preparation-2026-10-27` against `main` **`1077824c8a4d7d7c20f60ca8652e28805dee61eb`**.
- **Actual audit document:** [2026-10-27-premium-2-audit.md](reviews/2026-10-27-premium-2-audit.md). First-stage screenshots/source hypotheses retained; a separate corroboration section was added on 27.10 using the current production RELEASE and E2E screenshot artifacts.
- **Verified:** [RELEASE 40395582321](https://github.com/lolokeksu09/WrCommunity/actions/runs/40395582321) on the exact main SHA reports success for api-tests/mobile Chromium/browser-tests/integration/docker-smoke/deploy/vds-status. Downloaded and visually inspected `deployed-public-site` screenshots (390/1440 feed/login) and fresh mobile Chromium E2E screens. Production now shows clearly labeled editorial posts; old empty-feed snapshot is not representative of this RELEASE. QA-01 release smoke reported rendered content.
- **Local source acquisition:** direct Git clone and GitHub DNS failed in the current container. Recovered full earlier `git archive` of `2ef65bd…` from workflow 40382179306; compared it to current main: 17 commits changed no `web/src` or `server/` files. Browser/React app has **not** been launched locally; this is not a clean checkout of `main`. Node 22/npm 10, absent Docker/dependencies and blocked external DNS remain the environment blockers.
- **Not checked:** isolated local UI interactions, editable/authenticated states from personal testing, 20-shot localhost baseline, Lighthouse/CWV and manual a11y. E2E fixture screenshots are not production users.
- **Constraints:** no app/server/database/production changes, no new editorial accounts or synthetic engagement, do not merge Draft #43, do not re-enable automated Desktop Chromium E2E.
- **One next action:** obtain reproducible browser baseline from an isolated supported environment at exact current `main` SHA and append screenshot paths/measurements to the audit before authorizing screen implementation.


## 27.10.2026 — Isolated Premium 2.0 browser baseline complete

- Baseline actual Chromium runner: [Actions 40447759826](https://github.com/lolokeksu09/WrCommunity/actions/runs/40447759826) on audit-only SHA `d6ed3b92e289f537ae401e7551b058203e0d9aef`. Same product sources as main `1077824c8a4d7d7c20f60ca8652e28805dee61eb`. Temporary runner workflow is deleted from PR after capturing evidence.
- Disposable runner: Ubuntu 24.04, Node 24.22.1, PostgreSQL 18.6 (`wrcommunity_test`), Mailpit, local backend at `http://127.0.0.1:13000`, real headless Chromium. No production accounts/data or VDS access.
- Artifact `premium-2-isolated-baseline` **12709286063** contains 20 actual full-page PNG screenshots and `report.json`. All 20 passed render/overflow/broken-loaded-image/pageerror checks across five guest screens and 360/390/430/1440 widths. **11/20** diagnostic CLS readings exceeded 0.1 on the isolated guest instance; screenshots/metrics were manually inspected. INP and throttled field metrics not measured.
- Details, per-screen metric matrix, provenance and remaining blockers: [Premium 2.0 audit](reviews/2026-10-27-premium-2-audit.md#isolated-browser-baseline--executed-2026-10-27).
- **Still open before approval of implementation:** isolate the sources of CLS, manual keyboard/zoom/a11y checks, fully authenticated 360/390/430/1440 states with test profiles and media, and repeatable controlled Lighthouse. Existing successful production RELEASE screenshots are independent, not the isolated baseline.
- **One next action:** prepare a design implementation plan that prioritizes verified CLS/viewport issues and preserves privacy and all existing functional states; request owner approval before modifying app source. Keep the Draft PR docs-only, do not enable Desktop Chromium E2E.
