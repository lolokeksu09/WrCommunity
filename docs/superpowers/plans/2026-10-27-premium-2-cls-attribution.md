# Premium 2.0 P2-0: layout-shift attribution (diagnostics only)

Date: 2026-10-27. Base `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.
Branch `feat/premium-2-cls-attribution-2026-10-27`.
Parent roadmap: [PR #43, Premium 2.0 plan](https://github.com/lolokeksu09/WrCommunity/blob/audit/premium-2-preparation-2026-10-27/docs/superpowers/plans/2026-10-27-premium-2-implementation.md).

## Scope

Smallest technical first step: extend **manual, localhost-only** `scripts/ci/premium-visual-baseline.mjs` to report raw cumulative shift, correct five-second/one-second session-window CLS and anonymized layout-shift regions/geometry at the captured viewports. Record route-loading presence transitions and verify no private DOM content/IDs/links enter the artifact. No user-facing product changes, no automated desktop E2E, no VDS action, no data writes.

## Change checklist

- [x] Isolate CLS session math and source filtering in `scripts/ci/premium-cls-diagnostics.mjs`.
- [x] Add regression tests for session boundaries, recent-input exclusion, untrusted DOM strings and bounded payloads in `tests/premium-cls-diagnostics.test.mjs`.
- [x] Instrument `scripts/ci/premium-visual-baseline.mjs` with simple whitelisted regions and rects; preserve original screenshot routes and guard against external URLs.
- [ ] Run unit tests and FAST on exact PR head.
- [ ] Run real local-site Chromium via disposable GitHub runner with isolated test PostgreSQL, document exact artifact/SHA, manually inspect shift report and PNG.
- [ ] Remove temporary audit-only workflow from final PR; confirm diff contains only diagnostics/tests/documentation.
- [ ] Attribute top shifts from observed region/timeline before any CSS fix. Do not assert region overlap alone proves causal source.

## Verification and rollout

1. Local `node --test tests/premium-cls-diagnostics.test.mjs tests/premium-baseline-guard.test.mjs`; regression signal and data-boundary tests.
2. Draft FAST `npm run typecheck`, `npm run build`, secrets/UI checks.
3. Isolated `npm run migrate` + `node scripts/ci/premium-visual-baseline.mjs` at 360/390/430/1440. Report visible heading, no horizontal overflow, no uncaught exceptions and 20 screenshots; record actual non-zero layout shifts where observed.
4. Before merge, Ready FULL required mobile Chromium, api-tests, browser-tests, integration, docker-smoke, quality-gate. Do not allow skip/failure. A documentation/smoke change alone is not authorization to merge/deploy.
5. Rollback: revert the diagnostic PR only; existing app remains unaffected.

## Known limits

The `PerformanceObserver` list is bounded to 120 shift events with up to four sources each; regions are whitelisted and not personalized. Source association and raw diagnostic sums do **not** establish root cause or production CWV. Session windows are calculated from captured events; if truncated, mark dropped entries. The baseline deliberately uses public guest routes and does not substitute for authenticated test users or manual a11y testing.
