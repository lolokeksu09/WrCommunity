# Premium 2.0 — independent source and evidence review after PR #48

**Date:** 2026-10-27. **Scope:** isolated audit/test infrastructure only, no product/UI/API/database/deployment change. This branch starts at verified PR #48 head `b3dae98f299104670311e1cf9ea58ff18ee7bd69` and intentionally remains separate from production `main` (`1077824c8a4d7d7c20f60ca8652e28805dee61eb` when reviewed).

## Verified GitHub revision and release boundary

- [PR #44](https://github.com/lolokeksu09/WrCommunity/pull/44), `e788acaf0b7065d4080c1a0aeca1f7388f4f935c`, [FULL 40454680744](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454680744): success.
- [PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45), `3a7b0e0dcef7e24d82e2e350132cc919a82bf388`, [FULL 40456717929](https://github.com/lolokeksu09/WrCommunity/actions/runs/40456717929): success.
- [PR #46](https://github.com/lolokeksu09/WrCommunity/pull/46), `5f38d8381331101d93acf077d10c5932d783e318`, [FULL 40458324422](https://github.com/lolokeksu09/WrCommunity/actions/runs/40458324422): success.
- Combined [PR #47](https://github.com/lolokeksu09/WrCommunity/pull/47), `b5222a70421a8e9474e87c34a64b1158c6a5a478`, [FULL 40458364940](https://github.com/lolokeksu09/WrCommunity/actions/runs/40458364940): success.
- Authenticated evidence [PR #48](https://github.com/lolokeksu09/WrCommunity/pull/48), `b3dae98f299104670311e1cf9ea58ff18ee7bd69`, [FULL 40462920211](https://github.com/lolokeksu09/WrCommunity/actions/runs/40462920211): success.

These five exact-head workflow runs show success for `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, and `quality-gate`. `deploy` and `vds-status` were skipped as intended for PRs. Automatic Desktop Chromium E2E remains disabled. This review does **not** authorize any merge or production delivery.

## Independent code review: #44 → #45 → #46

Reviewed changed file paths, source diffs and test cases, and read project `AGENTS.md` and `TESTING-STRATEGY.md`.

- **#44, instrumentation:** `summarizeLayoutShifts` filters input-related events, applies the 1-second gap/5-second window, caps serialized source entries and emits static region labels and geometry instead of DOM text. The measured 11/20 above-budget baseline should not be confused with real-user Core Web Vitals or causal attribution.
- **#45, loading shell:** the non-interactive fallback mirrors shell tracks, and `.page-content` flow-root/min-height addresses the recorded footer/header shifts. Existing reported isolated test improvement is 11/20 → 0/20 out-of-budget initial guest captures. A deeper footer after a short page is an explicit UX tradeoff; no proof about user field CLS or Android keyboard.
- **#46, feed:** compact discovery is persisted via sessionStorage and remains expandable; quick links point to existing routes. Editorial, club and ordinary cards use source data for appearance. The mocked editorial flag in the isolated browser case proves **rendering only**, not editorial backend authorization, production seeding or account truthfulness. No auth or ACL behavior was changed.

## Two test/evidence weaknesses corrected on this branch

1. **P2-QA-01 — first-post visibility assertion was too weak.** The scenario named `первая публичная публикация читаема и видна без прокрутки на 390px` only checked the top of the card (`y < 560`) and text font size; it was possible for the body itself to sit below the first viewport. The revised existing L2 test also checks that the first up-to-48 px of `.copy` appears in the 390×844 viewport without scrolling. This is a more precise above-fold requirement, **not** a claim that the entire card is visible.
2. **P2-PRIV-01 — diagnostic report could include broken-image source URLs.** `premium-visual-baseline.mjs` previously put each `img.currentSrc || img.src` into `brokenImages`, even though #44's audit narrative described the geometry event data as free of media URLs. The new collector retains each broken-image occurrence as the literal `[redacted]`; counts remain observable while raw asset URLs cannot enter this report field. The isolated runner never accessed production, so **no actual production-data exposure is alleged**.

The first issue is an acceptance-test coverage gap, not a demonstrated UI failure. The second is a preventive diagnostic-artifact privacy improvement, not evidence of a leaked secret.

## Required checks for this patch

- Updated L2 browser scenario must execute on enabled `mobile-chromium` at the exact new PR head (not just prior #46/#48 heads). Review screenshot `premium2-populated-390.png` if available.
- Existing `premium-cls-diagnostics.test.mjs` and baseline guard, source scan, check:ui, typecheck/build and all Ready FULL jobs must remain successful. `premium-visual-baseline.mjs` is a **manual localhost-only** evidence script, not part of normal auto FULL; do not assert the new redaction ran under FULL unless separately executed.
- Keep native 200% browser zoom, screen-reader speech, real Android picker/keyboard, throttled lab LCP/INP and production field Web Vitals marked **not verified**.
- This review does not cover unmodified codepaths end-to-end, and no first-hand live browser session was available in the ChatGPT container. It is source inspection plus existing exact-head CI records, followed by a new test-only patch.

## Integration decision still needed

Keep #43–48 and this review branch unmerged. Before release, the owner must select **one** delivery path (sequential dependency PRs, or reviewed integrated candidate) to avoid duplicate merges/releases. Then perform exact-head required checks, authorized merge, RELEASE and real VDS verification. No changes to `main`, deployment, live accounts or databases were made in this review.
