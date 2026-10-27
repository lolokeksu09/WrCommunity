# Premium 2.0 — accessibility gates and integration decision

**Date:** 2026-10-27. **Candidate:** standalone stacked QA branch based on [PR #49](https://github.com/lolokeksu09/WrCommunity/pull/49) verified head `347e1dfa4bbcc6297dbff08d064aa0bfcff2c3f7`. **Production main:** `1077824c8a4d7d7c20f60ca8652e28805dee61eb` when reviewed. This is evidence and release preparation, **not a release authorization**.

## Existing verified evidence

- [#44](https://github.com/lolokeksu09/WrCommunity/pull/44) CLS diagnostics: exact-head FULL [40454680744](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454680744) passed.
- [#45](https://github.com/lolokeksu09/WrCommunity/pull/45) stable loading shell: exact-head FULL [40456717929](https://github.com/lolokeksu09/WrCommunity/actions/runs/40456717929) passed; 11/20 → 0/20 guest lab CLS budget exceedances in prior isolated experiment (not production performance).
- [#46](https://github.com/lolokeksu09/WrCommunity/pull/46) feed-first editorial design: exact-head FULL [40458324422](https://github.com/lolokeksu09/WrCommunity/actions/runs/40458324422) passed; preserved `Редакция` labeling and real backend data, no fabricated engagement.
- [#47](https://github.com/lolokeksu09/WrCommunity/pull/47) combined candidate: exact-head FULL [40458364940](https://github.com/lolokeksu09/WrCommunity/actions/runs/40458364940) passed.
- [#48](https://github.com/lolokeksu09/WrCommunity/pull/48) authenticated profile, editor, game/privacy: exact-head FULL [40462920211](https://github.com/lolokeksu09/WrCommunity/actions/runs/40462920211) passed, 16/16 synthetic hidden-profile captures, avatar upload/save, no JS exceptions or document-wide horizontal overflow, 320px editor reflow.
- [#49](https://github.com/lolokeksu09/WrCommunity/pull/49) review/test hardening: exact-head FULL [40465253118](https://github.com/lolokeksu09/WrCommunity/actions/runs/40465253118) passed. The standalone manual visual-diagnostic script's URL-redaction path has not independently been executed on this head.

## New checks on this branch

- Synthetic **hidden** account from the isolated test service; at 320×700 CSS pixels, inspect **four** authenticated screens (`/me`, `/me/edit`, `/me/game`, `/me/privacy`) and capture first-viewport evidence.
- Actual Playwright keyboard sends `ArrowRight`/`ArrowLeft` to the native privacy radio group, then checks the server remains `hidden` without form submission.
- With browser `prefers-reduced-motion: reduce`, expand the homepage carousel, check computed `animation-name: none` on the decorative energy elements, and verify arrow-key / Enter navigation still works.
- This is an **automated reflow and keyboard test only**; passing it does NOT constitute a native 200% browser zoom test, actual Android hardware interaction, complete WCAG certification or real screen-reader speech test.

## Integration recommendation

**Use a single cumulative reviewed candidate for actual future integration**, rather than merging overlapping PR #43–49 and the new QA PR separately. The latter could trigger multiple production RELEASE workflows, complicate rollbacks and falsely suggest independent deliveries. The final cumulative branch currently inherits #44 → #45 → #46 → #47 → #48 → #49 and this isolated accessibility work. Before any authorized publication, inspect the exact `main...candidate` diff, expected-sha rules and release policies. Retarget the selected integration PR to `main` only after explicit owner approval, rerun all exact-head required jobs for the new base, then merge using the reviewed mechanism. Do not merge both the aggregate and parents.

| Gate | Current evidence / decision |
|---|---|
| Source/review traceability | **Pass for previous SHA evidence**, new exact-head CI still required |
| API, mobile Chromium, Docker smoke, integration, quality gate | **New exact-head FULL required** |
| Hidden-profile/avatar/permissions regression | **Prior passing automated scenarios**, plus new keyboard guard |
| 320px reflow on all authenticated routes | **New automated test required**, not native zoom |
| Native 200% browser zoom and Android soft keyboard/file picker | **Not verified; on-device/manual testing needed** |
| Actual screen-reader speech, focus order and contrast across all states | **Not verified; requires assistive-technology audit** |
| Reduced motion | **New focused automated check**, not sitewide certification |
| Throttled LCP/INP and actual production field Web Vitals | **Not verified; collect a controlled baseline before a performance claim** |
| Desktop Chromium automatic E2E | **Off by owner's instruction**, not a passing desktop suite |
| External SMTP readiness for open onboarding | **Not confirmed**, separate public onboarding constraint |
| Protected `main` RELEASE/VDS active SHA | **Not attempted**, requires explicit release authorization |

**Provisional decision:** retain as a tested non-production candidate until the new FULL completes and manual accessibility/performance caveats are accepted or resolved. Any real `main` merge, database action or live deployment remains prohibited within this PR.

## Execution result — automated evidence (2026-10-27)

- **Verified test-source HEAD:** `4501290ad90659d50bcc87c2a5132d3ac230f5bd`; [Application CI 40466554105](https://github.com/lolokeksu09/WrCommunity/actions/runs/40466554105) **success**.
- Mandatory jobs `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` all concluded **success**. `fast` skipped because this is Ready/FULL; `deploy`, `vds-status` skipped because it is a PR.
- New 320px authenticated browser spec and reduced-motion/keyboard spec ran with the enabled mobile Chromium project; their no-overflow, radio-keyboard, hidden-profile-on-server, animation and interaction assertions passed. Artifacts: `browser-evidence-mobile-chromium` **12715754622** (short retention).
- Only *first viewport* screenshots of synthetic test pages were captured by the new spec. Screenshots were generated by Playwright; this review does **not** claim manual visual inspection of those PNGs.
- The result **does not close** native 200% zoom, actual Android native picker/IME, screen reader or field Web Vitals gates. The recommended delivery path remains one reviewed cumulative candidate, with an authorized release decision only after remaining conditions are dispositioned.

The commits recording this verification are documentation updates; verify FULL again at their final PR head rather than carrying over this earlier SHA's green status unqualified.
