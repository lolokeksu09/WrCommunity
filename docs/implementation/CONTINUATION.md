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

## 27.10.2026 — isolated Premium 2.0 accessibility checks and release decision

- Working branch: `audit/premium-2-a11y-release-gates-2026-10-27`, directly stacked on reviewed [PR #49](https://github.com/lolokeksu09/WrCommunity/pull/49), source head `347e1dfa4bbcc6297dbff08d064aa0bfcff2c3f7`. Source `main` at start: `1077824c8a4d7d7c20f60ca8652e28805dee61eb`. No main/VDS interaction.
- [Scope/plan](../superpowers/plans/2026-10-27-premium-2-a11y-gates.md). New `tests/e2e/premium-accessibility.spec.ts` plus registry entries: isolated 320px reflow and keyboard privacy tests for profile/editor/game/privacy; reduced-motion + keyboard discovery. Captures only disposable test identity in isolated CI. No product app, API, migrations or workflow modifications.
- [Release-gate decision](reviews/2026-10-27-premium-2-release-gates.md): prefer one reviewed cumulative integration path to avoid duplicate releases; never merge existing stacked PRs plus aggregate. Android picker/IME, real 200% browser zoom, real screen-reader speech and throttled CWV remain unverified until separately executed. Auto Desktop Chromium E2E remains disabled as instructed.
- Required next action: verify new exact-head mobile FULL jobs; if any test fails, preserve failure evidence, fix in this branch, recheck and update PR description. **No merge/deploy authorized.**

### PR #50: browser acceptance result

- [Application CI 40466554105](https://github.com/lolokeksu09/WrCommunity/actions/runs/40466554105) on code/test SHA `4501290ad90659d50bcc87c2a5132d3ac230f5bd`: **all required FULL jobs success**. The new 320px authenticated reflow/privacy-keyboard and reduced-motion discovery assertions passed. Evidence artifact `browser-evidence-mobile-chromium` `12715754622`.
- Updated [release-gate report](reviews/2026-10-27-premium-2-release-gates.md) distinguishes passing automation from unverified manual/on-device accessibility and real-user performance. Later documentation-only commits must be followed by FULL at the new exact head before release consideration.
- **One next action:** after final PR-head FULL confirms checks, perform actual native 200% zoom/screen-reader/Android interaction assessment or obtain an explicit owner decision on those open gates; only then decide on a single cumulative integration PR. **Do not merge to main or deploy from this evidence-only task.**

## 27.10.2026 — isolated mobile semantics / throttled lab (stacked after PR #50)

- Starting verified head: PR #50 `55e3c8995fa0cef388996eb7f3199fc0a37733c6`. Branch `audit/premium-2-semantics-performance-2026-10-27`. No deployment or protected main change.
- Added `tests/e2e/premium-semantics-performance.spec.ts` (two scenarios registered at L3/editor and L2/feed), [plan](../superpowers/plans/2026-10-27-premium-2-semantics-performance.md) and [evidence/release limits](reviews/2026-10-27-premium-2-semantics-performance.md). This extends existing authenticated keyboard/320px evidence with editor accessible-name checks and guest mobile Chromium CPU/network-throttled navigation observations, not full WCAG/native 200% zoom.
- Exact new-head FULL required: API, mobile Chromium, browser-tests, docker-smoke, integration, quality-gate. No claim of pass until completed. INP, production CWV, native Android picker/IME, TalkBack and real 200% browser zoom remain unverified. Desktop Chromium E2E stays disabled.
- **Single next action:** verify final FULL and report fixture-based measured values and limits; do not retarget/merge to main or deploy without separate explicit authorization.

## 27.10.2026 — LCP attribution after PR #51

- Source: validated [PR #51](https://github.com/lolokeksu09/WrCommunity/pull/51) `3c29907cc65528f50433492ab8ecc6ffbcef047c`, one throttled 390px lab sample LCP 5808ms, not production metrics.
- Branch `audit/premium-2-lcp-attribution-2026-10-27`. Added three-run isolated 390x844 CDP 150ms / 200000 download B/s / 4x CPU performance test, static element-region metadata and numeric timing without private DOM/URLs; exact L2 registry entry. Plan [here](../superpowers/plans/2026-10-27-premium-2-lcp-attribution.md); [audit](reviews/2026-10-27-premium-2-lcp-attribution.md).
- **Required next action:** complete exact-head PR FULL and read actual evidence values; document any unavailable metric or failure. No `main` merge, deployment, production user/data modification or Desktop Chromium E2E. Manual Android/zoom/screen-reader and field CWV remain open.

## 27.10.2026 — LCP phase attribution after PR #52

- Recovered [PR #52 FULL 40474595135](https://github.com/lolokeksu09/WrCommunity/actions/runs/40474595135) logs: three isolated mobile feed LCPs **5768/6364/5784 ms**, median **5784 ms**; same `p` inside `post-list`; DCL 4005/4039/3935 ms. All 43 mobile E2E passed on SHA `a68f94f0d244039a646971b7d9032d3e8a249a62`. Production CWV and root cause remain unmeasured.
- Current branch `audit/premium-2-lcp-phases-2026-10-27` stacked on #52, **test/docs only**: plan [here](../superpowers/plans/2026-10-27-premium-2-lcp-phases.md), audit [here](reviews/2026-10-27-premium-2-lcp-phases.md), and new L2/feed diagnostic. Four cold browser contexts alternate real isolated feed and browser-only empty synthetic response to inspect navigation, JS/API timing buckets, first text mount, LCP and summary lengths without content/URLs.
- CI FULL on **exact final new head required**. No merge/main/production DB/site change or VDS. Desktop Chromium E2E stays disabled. Native 200% zoom, Android keyboard/picker, screen reader and field CWV/INP remain outstanding.
- **One next action:** read actual new `PREMIUM_LCP_PHASES` metrics from GitHub browser logs and decide if a narrow product performance fix is justified; avoid optimizing based solely on one lab number.

## 27.10.2026 — measured home route module preload experiment

- Parent [PR #53](https://github.com/lolokeksu09/WrCommunity/pull/53), exact source `78be68e4aae4d907c97cb6a67c27f54c22bc9956` and [FULL 40477491737](https://github.com/lolokeksu09/WrCommunity/actions/runs/40477491737) **success** (44 mobile tests). Real synthetic 20-post feed LCP **5588/5528ms** median **5558ms**, empty control **4916/5240ms** median **5078ms**. JS 636697 transferred bytes; first post mounts late. These lab values are not field p75 and do not alone prove cause.
- Branch `perf/premium-2-home-chunk-preload-2026-10-27`. Plan [2026-10-27-premium-2-home-preload.md](../superpowers/plans/2026-10-27-premium-2-home-preload.md), [audit](reviews/2026-10-27-premium-2-home-preload.md). In `web/src/main.tsx`, speculative existing `import('./social')` runs only on pathname `/` during entry evaluation to overlap server loaders, leaving original React lazy route intact. No API/SQL/auth/content/CI release changes.
- **Next action:** exact-head FULL mobile CI and read `PREMIUM_LCP_PHASES` comparable samples. If no repeatable benefit or regression, keep this product change unmerged and identify entry bundle overhead. No main merge/VDS deploy, Desktop Chromium automatic E2E, Android hardware/IME/native zoom, screen-reader speech or production CWV claim.

### PR #54 — first comparable lab test passed

- Candidate source `57fc44dbffacb2fa111b19adb70b89649dd9808c`, [FULL 40478515862](https://github.com/lolokeksu09/WrCommunity/actions/runs/40478515862) success, 44 mobile tests. Two actual isolated-feed LCP samples 4956/5176ms (median **5066ms**) vs reference #53 5588/5528ms (median **5558ms**). Browser-only empty-controls: 4636/4784ms (median **4710ms**) vs 4916/5240ms (median **5078ms**). DCL actual median 3949 vs 3948ms. JS last-response and first post mount both earlier in candidate. Details and caveats: [home preload audit](reviews/2026-10-27-premium-2-home-preload.md).
- This **does not prove field speed**: 2 samples per variant per version, different runners, shared synthetic test-data DB. Product-only change remains unmerged on [PR #54](https://github.com/lolokeksu09/WrCommunity/pull/54); new documentation commits require a final exact-head FULL run.
- **One next action:** verify new exact-head FULL result, compare rerun `PREMIUM_LCP_PHASES` with original measurements and record final conclusion in PR body; never merge to `main` or VDS during audit.

## 27.10.2026 — identical-fixture paired home preload A/B, PR #55

- Parent [PR #54](https://github.com/lolokeksu09/WrCommunity/pull/54), base SHA `e1fe61c58033d076949bccf8b7c33253fd06ca4f`; new **unmerged** [PR #55](https://github.com/lolokeksu09/WrCommunity/pull/55) in `perf/premium-2-identical-feed-ab-2026-10-27`. No `main`, VDS, production database, API/auth or actual user changes. Desktop Chromium automatic E2E remains off.
- [Plan](../superpowers/plans/2026-10-27-premium-2-identical-fixture-ab.md) and [detailed audit](reviews/2026-10-27-premium-2-identical-fixture-ab.md). One-shot [GitHub Actions 40481966087](https://github.com/lolokeksu09/WrCommunity/actions/runs/40481966087) **success**: built two production Vite variants on the same CI runner, with only the speculative `import('./social')` block removed for baseline; four alternating cold mobile browser runs each; same mock guest session and exactly 20 fixed posts. Fixture SHA-256 `02b00d8346eee25a5549f62dadf7f713177a4c84dfd6483368afb70f6d681db9`, artifact `12723670513`.
- **Measured:** LCP median **3376ms no preload vs 3224ms with preload** (-152ms/-4.50%). First post DOM 3336→3187ms. FCP 2684→2698ms and DCL 2583→2588.5ms (no meaningful improvement). 4 JS resources both, +132 network bytes preload. 8/8 rendered matching first test post; no errors/overflow. This is laboratory evidence, not production p75 or real device. Existing PR #54 preload remains a promising isolated improvement, not approved for release.
- One-shot workflow `.github/workflows/premium-preload-paired.yml` was deleted **from this branch only** after evidence capture. Reproducible `scripts/ci/premium-preload-paired.mjs` remains. Previous initial PR #55 FULL succeeded before documentation changes; **final exact-HEAD FULL must be confirmed**. No auto Desktop Chromium; manual real 200% browser zoom, Android keyboard/picker, actual TalkBack and field Web Vitals/INP remain unverified.
- **One next action:** confirm final exact-head FULL, record in PR body without another code commit. Then prepare one cumulative Premium 2.0 release candidate for owner review, excluding duplicated merges of parent PRs. Do **not** merge or deploy without explicit authorization.

## 27.10.2026 — Premium 2.0, единый финальный интеграционный кандидат

- Репозиторий `lolokeksu09/WrCommunity`. Перед созданием кандидата `main` = `1077824c8a4d7d7c20f60ca8652e28805dee61eb`, исходная HEAD PR #55 = `6671666bcc64004daee36c2dcc52a84fe148d404` ([Application CI 40482488773](https://github.com/lolokeksu09/WrCommunity/actions/runs/40482488773), все 6 обязательных jobs success).
- Ветка `release/premium-2-final-candidate-2026-10-27` создана **из готовой общей цепочки #43–55**, не из `main` без остальных изменений. [План релиза](../superpowers/plans/2026-10-27-premium-2-final-candidate.md). Следует использовать **один** кандидат→`main`, не объединять родительские перекрывающиеся PR параллельно.
- Настоящие изменения продукта Premium 2.0: стабильная загрузочная оболочка, новый вид ленты с честными редакционными метками, ранняя загрузка существующего JS-модуля `social.tsx` на главной. Измеренный контролируемый A/B: LCP медиана 3376→3224 мс (-152 мс, 4× CPU / 390×844, одинаковые 20 синтетических публикаций; реальный эффект на VDS не известен). Авторизованные экраны, responsive, клавиатура, privacy и reduced-motion защищены изолированными browser/API тестами.
- **Перед следующим этапом:** проверить итоговый diff с `main` и запустить FULL именно на финальном коммите кандидата. Никаких изменений `main`, live PostgreSQL, VDS, DNS, SMTP или release workflow; Desktop Chromium auto E2E остаётся отключённым по решению владельца.
- Остались реальные тесты Android-клавиатуры/пикера/нативного 200% zoom, TalkBack и field CWV. Они не считаются прошедшими. Внешняя SMTP и правовые условия блокируют открытый публичный запуск, но не обязательно обновление UI действующего пилота — границы должны быть явно подтверждены перед release.
- **Одно следующее действие:** проверить финальный PR относительно `main`, собрать exact-head FULL и запросить решение владельца на один production merge. Не запускать деплой в этой подготовительной фазе.

## 27.10.2026 — Premium 2.1 mobile polish (development snapshot, no release)

- Base released `main` SHA: `fc3e92f20e6396cc22ac42e708c518af57077ff6` (Premium 2.0, deploy/VDS previously confirmed healthy). New branch: `feat/premium-2-1-mobile-polish-2026-10-27`; publication of 2.1 is **NOT** authorized by the previous 2.0 release permission.
- Owner provided six live Android screenshots and approved Premium 2.1 design changes. [Approved execution plan](../superpowers/plans/2026-10-27-premium-2-1-mobile-polish.md) and [six-screen audit](reviews/2026-10-27-premium-2-1-mobile-visual-audit.md).
- Work on branch: compact preconfigured personal discovery preset; deterministic abstract empty club cover, with uploaded cover unchanged; labeled native media selectors with attached profile previews and explicit remove/restore; compact vertically resizable post editor; context-correct empty draft text and actions; minor feed spacing. Source changes: `web/src/player-journey.tsx`, `web/src/clubs.tsx`, `web/src/profile-editor.tsx`, `web/src/social.tsx`, `web/src/main.tsx`, new `web/src/premium-v2-1.css`.
- E2E: `tests/e2e/premium-mobile-polish.spec.ts` and updated `tests/e2e/player-journey.spec.ts`, cataloged in `scripts/ci/e2e-levels.json`. Tests use ephemeral test accounts, never VDS users. Native Android file picker/IME, real 200% zoom and TalkBack remain unverified. Automatic Desktop Chromium E2E remains disabled.
- **Verification pending**: open Ready PR against current `main`, inspect diff and get exact-head FULL (6 mandatory jobs). CI-based browser captures will be stored as artifacts. Real interactive local preview in this assistant environment has **not** been performed; screenshots from user are before-change references, not after-change validation.
- **One next action:** run Ready PR FULL, investigate/fix any failed selector, functional regression or layout mismatch; update PR evidence. Keep Premium 2.1 **unmerged**, no RELEASE or VDS deploy without a fresh explicit publication instruction.
