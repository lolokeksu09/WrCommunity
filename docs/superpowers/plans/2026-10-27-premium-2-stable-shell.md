# Premium 2.0 — P2-1 stable loading shell and responsive foundation

**Date:** 2026-10-27. **Stacked on:** Draft PR #44, SHA `e788acaf0b7065d4080c1a0aeca1f7388f4f935c`; audited app base `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb`. Branch `feat/premium-2-stable-shell-2026-10-27`.
**Master plan:** Draft [PR #43](https://github.com/lolokeksu09/WrCommunity/pull/43). **Diagnostic parent:** Draft [PR #44](https://github.com/lolokeksu09/WrCommunity/pull/44).

## Problem and hypothesis

Actual isolated Chromium baseline recorded 20 of 20 public guest routes with exactly two major layout shifts. In 11 cases measured session CLS > 0.1. Region source/timing analysis supports:
- initial standalone `.initial-loading` at 60px top margin is replaced by entire `Shell` at origin;
- route-level `Suspense` with `.route-loading` min-height `42vh` yields to longer content, shifting `#main-content` / footer and the preceding opening elements.

This is an experimentally testable hypothesis, *not* proof of a specific CSS declaration or real-user p75.

## Authorized bounded change

- [x] Replace the standalone hydration fallback with the same responsive layout geometry as the real `Shell`: mobile header, desktop grid tracks and route-content stage. Keep loading status meaningful, non-interactive and a11y-labeled; no fake navigation controls.
- [x] Reserve a stable, near-viewport vertical route-loading stage to keep transient footer layout from entering the view and moving on content arrival, not hide actual errors, page content, loader state or metrics.
- [x] Keep visual-token scope unchanged; this narrow PR corrects stable shell geometry without a global visual redesign. New palette/type scale remains a separate bounded design PR.
- [x] Keep `React Router` route loaders, privacy permissions, scroll restoration, header actions, bottom nav and reduced-motion unaffected.
- [x] Test on 20 public guest screenshots at 360×800, 390×844, 430×932, 1440×900 in isolated PostgreSQL, with same instrumented CLS collector as PR #44. Compare each route/viewport to original baseline, report both improvements and regressions.
- [ ] Include real-browser regression checks in Ready FULL and manually verify keyboard/zoom/authenticated/error behavior before any production merge; do not claim these manual checks have already been run.
- [x] Capture PNGs, lab metrics, exact SHA and manual visual observations. Re-test after every change that changes measured layout. See [measured report](../../implementation/reviews/2026-10-27-premium-2-stable-shell.md), runner 40451128776.
- [ ] Do not merge until parent PRs' order and protected main rules are satisfied; Ready FULL must succeed on final relevant head. Do not deploy without review.

## Acceptance

Primary target: at least the two repeatable initial document/main/footer shifts must reduce, ideally all 20 guest diagnostic CLS <=0.1 with no regressions. Accessibility: loader has true `role=status`, no decorative dead controls, no focus trap, no horizontal overflow at required viewports; content/header/footer remain perceivable after load. The CLS requirement is a laboratory goal, not a field-user guarantee.

## Rollback

Revert bounded `web/src/main.tsx`/`web/src/styles.css` changes through the normal PR flow, no database migration or production cleanup. Remove any temporary one-shot GitHub workflow from final diff after artifact capture.

**Next action:** implement a minimally different hydration fallback shell, measure it against PR #44 baseline in isolated Chromium, keep or revert based on observed metric and screenshot results.
