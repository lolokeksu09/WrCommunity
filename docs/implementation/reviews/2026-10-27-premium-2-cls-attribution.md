# WrCommunity Premium 2.0 — isolated CLS attribution, P2-0

**Date:** 2026-10-27. **Scope:** diagnostic runner only; not a production UI change.
**Base app source:** `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.
**Tested instrumentation SHA:** `bd28e55b20125a50395783bf86af27019e263638`, isolated [Actions run 40449771048](https://github.com/lolokeksu09/WrCommunity/actions/runs/40449771048), artifact `premium-2-isolated-baseline` **12709559163**.
**Runner:** Ubuntu 24.04, Node 24.22.1, PostgreSQL 18.6 `wrcommunity_test`, Mailpit, `http://127.0.0.1:13000/`, headless Chromium. No production secrets, live database, user account, deployment or Desktop E2E. Full-page PNGs and `report.json` are in the short-retention artifact.

## Execution evidence

- Real app built; migrations applied to isolated PostgreSQL; Chromium started and visited 5 **guest** routes × 4 target viewports: **20/20** captures successful.
- Script reported 0 failed screens, no script-detected horizontal overflow, broken completed images or uncaught page JavaScript errors. Manual inspection included `feed-390.png`: expanded discoveries banner, feed empty state and persistent bottom bar are still present; this is test data, not production posts.
- Separate unit step **`node --test tests/premium-cls-diagnostics.test.mjs tests/premium-baseline-guard.test.mjs` succeeded** in the same runner. Previous run [40449682358](https://github.com/lolokeksu09/WrCommunity/actions/runs/40449682358) caught an incorrectly ordered test expectation (region list intentionally sorts by associated shift magnitude); corrected the expectation without changing the metric algorithm, then reran successfully.
- Existing Draft FAST typecheck/build/checks passed for [run 40449689054](https://github.com/lolokeksu09/WrCommunity/actions/runs/40449689054) before the last test assertion edit; run the final FAST again after removing the temporary workflow.

## Actual observed shifts

| Viewport | Feed session CLS | Players | LFG | Clubs | Login |
|---|---:|---:|---:|---:|---:|
| 360×800 | 0.31995 | 0.33147 | 0.21589 | 0.10293 | 0.11346 |
| 390×844 | 0.25614 | 0.24259 | 0.15706 | 0.09773 | 0.10775 |
| 430×932 | 0.14532 | 0.13296 | 0.08827 | 0.08827 | 0.09722 |
| 1440×900 | 0.04954 | 0.05342 | 0.05342 | 0.05342 | 0.05985 |

**All 20 pages captured two input-independent layout-shift entries.** Raw shift sum and maximal 5-second/1-second session-window CLS coincide in this capture (both events fall into one window). **11/20** values exceed the proposed 0.1 lab budget. This is one fixed runner/environment, not field p75. No throttled Lighthouse/INP, authenticated media/editor or manually operated keyboard tests were performed.

### Event and geometry attribution (390px examples)

| Route | Entry 1 | Entry 2 |
|---|---|---|
| `/` | ~174ms, **0.07109**, `document` bounds `y=60,h=336` → `y=0,h=844` | ~474ms, **0.18505**, `main` `y=64` → `y=73`, footer disappears from its old position |
| `/discover` | ~174ms, **0.07109**, same initial document transition | ~474ms, **0.17150**, `main` `y=64` → `y=89`, footer moves/disappears from previous bounds |
| `/login` | ~176ms, **0.07109**, same initial document transition | ~464ms, **0.03666**, `main` `y=64` → `y=98`, footer y=728 → y=762 |
| `/` at 1440px | ~185ms, **0.04167**, initial document transition | ~477ms, **0.00787**, `main` y=0→24 and footer y=800→826 |

Reported route-loader timeline at 390px `/`: `loadingVisible=false` at ~25ms, **true** at ~121ms, **false** at ~421ms. Other guest routes show a very similar sequence. Source code explains plausible transitions: `web/src/main.tsx` supplies a standalone `hydrateFallbackElement` `.initial-loading`, then `Shell` and route-level React `Suspense` `.route-loading` followed by actual route UI; `web/src/styles.css` gives `.initial-loading` margins and a `.route-loading` min-height of 42vh. **Observed source rectangles/time alignment support this hypothesis; they do not individually prove which CSS declaration causes each CLS score.**

### Privacy and interpretation

The report writes whitelisted static region labels (`document`, `main`, `footer`, etc.), numeric rectangles, timing and shift values only. The source does **not** serialize DOM text, author handles, selectors with arbitrary IDs, cookies, URLs from media or account values; unknown labels normalize to `other`. Each entry retains ≤4 sources, ≤120 entries in all, with overflow count. Region-associated shift values are **not additive root-cause attribution** when multiple regions are involved.

## Next action (P2-1 candidate)

In a **separate UI PR**, create a controlled experiment that retains the actual shell geometry across the initial fallback/Suspense transitions, and compare the **same five routes/20 viewport captures** before/after, with the same script and test data. Preserve real page content and keyboard focus; do not mask shifts by hiding the loader, disabling metrics or faking content. Design/viewport refinements follow only after the measured CLS regression and component/state gates pass.

The temporary audit workflow is removed before the PR #44 final diff. **No claim that this diagnostic PR fixes CLS.**
