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


## 27.10.2026 — Premium 2.0 P2-1 shell stabilization, stacked Draft PR #45

- Branch `feat/premium-2-stable-shell-2026-10-27`, stacked on diagnostic Draft [PR #44](https://github.com/lolokeksu09/WrCommunity/pull/44), not directly on `main`; own [Draft PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45). Parent audit/rollout plan remains Draft [PR #43](https://github.com/lolokeksu09/WrCommunity/pull/43). Do not merge out of order.
- Scoped UI source changes: `web/src/main.tsx` now renders geometry-matched `InitialLoadingShell` while root loader resolves; `web/src/styles.css` contains route-loading minimum height, `page-content` flow-root to prevent heading margin escape, viewport min height for short routes, and reduced-motion indicator.
- Fully measured Chromium [run 40451128776](https://github.com/lolokeksu09/WrCommunity/actions/runs/40451128776), source SHA `3f3a75dcf975b9e6ad76f9eb53c38df7db5d48ec`, guest local `http://127.0.0.1:13000/`, isolated PostgreSQL, artifact **12710382372**: **20/20** captures, zero test-detected JS failures, broken completed images or horizontal overflow. Diagnostic session CLS over 0.1 improved **11/20 → 0/20** versus PR #44 baseline; all twenty current initial-load reports contained zero qualifying layout shifts. First intermediate fix was 11→6 but short-route footer regression, corrected in final variant.
- Full report, data and limitations: [2026-10-27-premium-2-stable-shell.md](reviews/2026-10-27-premium-2-stable-shell.md). Manually viewed final guest feed, players, clubs, login, desktop screenshots. No authenticated/soft-keyboard/a11y/zoom/INP test or production deployment. This is not a production field-CWV guarantee.
- Temporary one-shot workflow must be removed before PR #45 review; final FAST rerun on exact head. Desktop automated E2E stays off. Ready FULL and parent integration order mandatory before eventual release.
- **One next action:** review and complete remaining authenticated/keyboard states, then perform Ready FULL on PR #45 after PR #44 is integrated; only afterward proceed to design tokens/feed redesign in a separate PR. Current product production stays unchanged.


## 27.10.2026 — P2-2 compact editorial feed / Draft PR #46

- This branch: `feat/premium-2-feed-design-2026-10-27`, stacked on Draft [PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45), source `8165e62e83d48174ac9a2d83b9966e6ed220a31f`, with parent diagnostics Draft PR #44 and audit plan #43. **Do not merge the stack out of order.**
- Draft [PR #46](https://github.com/lolokeksu09/WrCommunity/pull/46): implemented a separate `web/src/premium-v2.css` near-black editorial card system, imported after `styles.css`, compact-first discovery shortcuts and feed-first hierarchy in `social.tsx`. Post variants use authentic `author.editorial` and `club_id` flags; editorial badge/ACL/reactions/scroll remain intact.
- [Isolated run 40452665664](https://github.com/lolokeksu09/WrCommunity/actions/runs/40452665664), source `f75da5c34a41b4414fe5b661b0af86726a9a3831`: Node24, disposable PostgreSQL, localhost Chromium. **4/4 mobile feed E2E passed; 20/20 screenshots captured**, zero diagnostics CLS, no observed JS errors or horizontal overflow. Artifact **12710539834** includes `report.json`, 20 guest full-page captures and a populated synthetic-post screenshot at 390. No production visitor or real editorial screenshot tested.
- [Evidence and limitations](reviews/2026-10-27-premium-2-feed-design.md); [roadmap/acceptance plan](../superpowers/plans/2026-10-27-premium-2-feed-design.md). Initial artifact ordering issue was resolved by running Playwright before screenshot collection. Temporary audit-only workflow removed from final PR after retrieving artifact.
- **Not done:** parent merges, final Ready FULL, production release, manual Android keyboard/zoom/screen reader, current editorial-variant screenshot. Auto Desktop Chromium E2E remains off.
- **One next action:** review exact PR #46 head and final FAST; then obtain real test editorial post variant screenshots and complete keyboard/authenticated manual states before Ready FULL. Keep production untouched.

## 27.10.2026 — PR #46 editorial and accessibility follow-up

- Branch `feat/premium-2-feed-design-2026-10-27` stacked Draft [#46](https://github.com/lolokeksu09/WrCommunity/pull/46) against Draft [#45](https://github.com/lolokeksu09/WrCommunity/pull/45). The other unmerged dependency PRs are #44 diagnostics and #43 documentation; `main` still `1077824c8a4d7d7c20f60ca8652e28805dee61eb` at start of this pass.
- Added two E2E cases in `tests/e2e/home-feed-ux.spec.ts` and registered both in `scripts/ci/e2e-levels.json`: whitelisted mocked `author.editorial=true` for one disposable API post, 390/1440 screenshots, text contrast ≥4.5, action-menu Escape focus restore, skip link after root hydration, Enter/ArrowRight carousel keyboard controls and 320px reflow proxy. No changed production API, data, identity, CSS or access rules.
- Verified [Actions 40453786018](https://github.com/lolokeksu09/WrCommunity/actions/runs/40453786018) SHA `4f69959b7a597ad63a481003aa4465d718aff217`: six targeted mobile tests passed, 20 isolated screenshots/20 CLS diagnostics passed, no reported overflow/JS exceptions, artifact **12712031295**. Synthetic editorial flag is only an API interception; not a real editorial seed or production identity.
- See [addendum](reviews/2026-10-27-premium-2-feed-design.md#addendum--editorial-fixture-and-keyboard-accessibility-2026-10-27). Full WCAG/200% actual zoom/screen reader and production editorial backend seed testing remain incomplete; auto Desktop Chromium E2E stays paused.
- **Integration order:** #43 docs → #44 CLS diagnostics → #45 stable shell (base #44) → #46 feed (base #45). Each PR must be rechecked against its actual base/head, reviewed, Ready FULL on exact SHA and merged in order; rebase/update branch if required. No deployment without explicit owner authorization and successful RELEASE/HTTPS/VDS SHA verification.
- **One next action:** remove the temporary workflow, verify final PR #46 FAST/diff, then prepare the parent #43 for FULL review (not automatic merge).

## 27.10.2026 — combined Premium 2.0 integration candidate (no production deploy)

- Branch `integration/premium-2-release-candidate-2026-10-27` combines all code/test commits by ancestry of [PR #46](https://github.com/lolokeksu09/WrCommunity/pull/46) (which includes #44 and #45), plus both original audit/roadmap documents from [PR #43](https://github.com/lolokeksu09/WrCommunity/pull/43). Preparation `main` SHA: `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.
- [Detailed integration manifest](reviews/2026-10-27-premium-2-integration-candidate.md) gives all source heads, prior CI evidence, exact omissions and release blockers. #43 [FULL 40454276661](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454276661) succeeded; #44 [FULL 40454680744](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454680744) succeeded. #45/#46 individual FULL and combined integration FULL need explicit verification.
- **This is an isolated review and CI branch, not a substitute for a protected-main merge/release.** No live VDS, schema, production account or seed touched. Auto Desktop Chromium remains disabled.
- **Next step:** require combined FULL success on the integration PR's exact head; evaluate outstanding manual 200% zoom and authenticated/keyboard tests. Publication to main/VDS is a separate authorized action, since a main merge triggers RELEASE.

## 27.10.2026 — authenticated baseline PR #48 and independent code review

- [PR #48](https://github.com/lolokeksu09/WrCommunity/pull/48) is a stacked test-only PR targeting candidate [#47](https://github.com/lolokeksu09/WrCommunity/pull/47). Final SHA `b3dae98f299104670311e1cf9ea58ff18ee7bd69`; [FULL 40462920211](https://github.com/lolokeksu09/WrCommunity/actions/runs/40462920211) success. Its 16/16 authenticated viewport captures, hidden test account/privacy checks, avatar save and 320px editor reflow are **isolated** evidence, not production UX/WCAG certification. No merge or VDS deployment.
- Following source review of [#44](https://github.com/lolokeksu09/WrCommunity/pull/44), [#45](https://github.com/lolokeksu09/WrCommunity/pull/45) and [#46](https://github.com/lolokeksu09/WrCommunity/pull/46), their exact-head FULL runs **40454680744**, **40456717929** and **40458324422** were confirmed successful. Integration #47 exact-head [40458364940](https://github.com/lolokeksu09/WrCommunity/actions/runs/40458364940) succeeded, too.
- This separate branch `audit/premium-2-independent-review-2026-10-27` is based on PR #48's immutable passing head. Changes here are exclusively diagnostic/test/documentation: strengthen the first-post-above-fold L2 check to include at least the beginning of the post text at 390×844 and redact broken-image URLs in the localhost-only visual report. Review details: [independent review](reviews/2026-10-27-premium-2-independent-review.md). No `web/src`, `server/`, DB, CI workflow, `main`, live data or VDS change.
- **Pending on this new branch:** validate exact new-head GitHub CI `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `docker-smoke`, `integration`, `quality-gate`. A successful FULL does not mean that the separate **manual** premium visual collector executed; its URL-redaction path also needs a targeted local-only evidence run before claiming runtime verification.
- Outstanding manual release evidence: native 200% zoom, screen reader, Android picker and keyboard, throttled performance/field Web Vitals. Desktop Chromium automatic E2E remains disabled.
- **One next action:** finish this branch's exact-head checks and record their outcomes in its PR, without merging to `main` or deploying.
