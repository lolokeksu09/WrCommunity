# Premium 2.0 — paired identical-feed LCP experiment

**Date:** 2026-10-27. **Branch:** `perf/premium-2-identical-feed-ab-2026-10-27`. **Parent:** [PR #54](https://github.com/lolokeksu09/WrCommunity/pull/54) `e1fe61c58033d076949bccf8b7c33253fd06ca4f`. **Review:** [PR #55](https://github.com/lolokeksu09/WrCommunity/pull/55). No protected-`main` merge or VDS deployment.

## Independent experiment and exact evidence

[GitHub Actions run 40481966087](https://github.com/lolokeksu09/WrCommunity/actions/runs/40481966087), dedicated one-shot job `identical-feed-ab`, **completed success** after using browser-only installation instead of a slow Ubuntu dependency-install step. Output artifact **12723670513** (`premium-preload-identical-feed-ab`), `test-results/premium-preload-paired/result.json`; GitHub log line `PREMIUM_IDENTICAL_AB`.

**Fixture SHA-256:** `02b00d8346eee25a5549f62dadf7f713177a4c84dfd6483368afb70f6d681db9`. Exactly 20 fixed mock publications with the same metadata, text, author, counts and timestamps for both builds; first body 322 characters. The guest session is also fully mocked. Nothing in this experiment accesses production accounts or database. An audit Vite transform removes exactly the three-line speculative `import('./social')` block for the baseline build; the candidate build leaves the existing PR #54 code untouched. The script requires distinct entry bundle hashes, refuses an unexpected source/snippet or API request and captures UI card count / page errors / overflow.

**Conditions:** same Ubuntu CI runner, same Node 24 / Vite and Playwright, mobile Chromium cold browser contexts at 390×844, 150ms CDP network latency, 200000 download bytes/sec, 90000 upload bytes/sec, 4× CPU slow-down, alternated `baseline, preload, preload, baseline, preload, baseline, baseline, preload` for 8 runs. Both variants were served as production Vite bundles on loopback; API responses were browser-intercepted, with a fixed 150ms application-side delay. This is a **controlled same-runner laboratory proxy**, not real server latency, a statistically powered experiment or field LCP.

| Metric (4 cold runs each) | Baseline: no preload | Candidate: preload | Candidate minus baseline |
|---|---:|---:|---:|
| **Median LCP** | **3376 ms** | **3224 ms** | **-152 ms (-4.50%)** |
| LCP min–max | 3372–3456 ms | 3216–3236 ms | Observed ranges do not overlap |
| Median first post DOM mount | 3336 ms | 3187 ms | -149 ms |
| Median DOMContentLoaded | 2583 ms | 2588.5 ms | +5.5 ms |
| Median FCP | 2684 ms | 2698 ms | +14 ms |
| JS resources | 4 | 4 | no change in count |
| JS transfer bytes per run | 397000 | 397132 | +132 bytes |

**Raw LCP timings in balanced order:** baseline `3456, 3372, 3380, 3372` ms; candidate `3236, 3220, 3216, 3228` ms. Every sample rendered 20 cards and reported a `p` element inside `post-list` as its last LCP candidate; the first synthetic post text was verified in the page and both response counts checked. No page errors or document-wide horizontal overflow were detected by the benchmark.

### Interpretation

The exact same feed data on the same runner provides stronger evidence than previous PR #53/54 tests whose fixture text lengths and CI hosts differed. A measurable improvement in **first post DOM and LCP** is consistent with speculative module loading overlapping React Router/data work. FCP and DOMContentLoaded do **not** improve meaningfully, as expected when the effect is on the lazy route. This is not an overall faster initial paint, and four runs per variant are still too few to predict performance across mobile devices/networks. JS download bytes do not decrease; the optimisation changes their **timing**.

**Decision:** retain the existing PR #54 home-only preload as a reviewable, modest performance improvement, subject to final cumulative review and real-device/reliability gates. Do not enlarge the change or claim 1-second user-facing improvements.

### Further JS optimisation opportunities — assessed, not implemented

1. Inspect generated Vite manifest/entry chunks for the 4 requested JS resources and duplicate eagerly imported libraries; evaluate entry/bootstrap splitting **only if** compressed byte measurements and regression testing show a concrete opportunity. Keep all nine existing lazy feature modules; do not blindly rebundle.
2. Validate image/media prioritisation and first post rendering on realistic real-user data. This A/B used only fixed text posts with no images, so image-heavy feed impact is unknown.
3. Obtain real Android mobile Chrome and field Core Web Vitals data before production performance claims; check on-device interaction, native 200% zoom and TalkBack separately. INP was not measured.
4. Any further change should get its own baseline/after controlled experiment and FULL; do not use synthetic data to represent editorial or real users.

### Completion and release constraints

Temporary workflow `.github/workflows/premium-preload-paired.yml` was **deleted from the branch after capturing run evidence**. Retained script `scripts/ci/premium-preload-paired.mjs` makes the experiment repeatable manually with a localhost-only fixture. The new test is not part of normal FULL because it recompiles two full production bundles and performs 8 controlled runs; normal FULL remains mandatory on the **final PR HEAD** with `api-tests`, mobile Chromium `browser-tests`, integration, docker-smoke and quality-gate.

**No merge/deployment approved here**; automatic Desktop Chromium E2E remains disabled by owner. Real Android IME/picker, native browser 200% zoom, screen-reader speech, field p75 LCP/CLS and INP are unverified. Choose one cumulative, reviewed integration path rather than merging overlapping PR #43–55 and the aggregate separately.
