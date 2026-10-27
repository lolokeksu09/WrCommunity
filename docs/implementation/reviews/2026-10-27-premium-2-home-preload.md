# Premium 2.0 — isolated home chunk preload candidate

Date 2026-10-27. **Product code patch is unmerged**, based on audited [PR #53](https://github.com/lolokeksu09/WrCommunity/pull/53) commit `78be68e4aae4d907c97cb6a67c27f54c22bc9956`.

## Prior evidence

- PR #52 [run 40474595135](https://github.com/lolokeksu09/WrCommunity/actions/runs/40474595135), 3 mobile guest LCP: 5768/6364/5784 ms, median 5784 ms, same `p` element within post-list.
- PR #53 [run 40477491737](https://github.com/lolokeksu09/WrCommunity/actions/runs/40477491737), 44 mobile tests passed. Actual synthetic 20-post feed LCP 5588/5528 ms (median 5558); empty-response controls 4916/5240 ms (median 5078). Both page classes had ~636697 bytes transferred as four JS requests; late JS resource response 4767–5084 ms, first loaded heading ~4841–5539 ms. Actual first-post DOM ~5482–5539 ms and feed API response ~4158–4200 ms.
- PR #53's **empty control** replaces server response in Playwright with `{items:[]}`, so its LCP is not a post even though broad classifier marked region post-list. Cross-test fixture data (20 posts, 1233 characters in first copy) can influence actual-run measurements. No production field performance, causation, INP or Lighthouse measured.

## Change

In `web/src/main.tsx` preserve `lazyNamed(()=>import('./social'),'Home')` but speculatively request the same dynamic route module when the initial browser URL pathname is `/`. The route-scoped preload occurs during entry evaluation and may overlap normal session/feed loader latency. No CSS, navigation, data, API, DB or authorization semantics intentionally change. If speculative loading rejects, the real React lazy route still owns the rendering/error boundary. This is a trial, not an established improvement.

## Before/after verification

Run unchanged `tests/e2e/premium-lcp-phases.spec.ts` plus exact-head FULL and examine 2 actual/2 empty control lab runs at 390×844 under CDP 150ms, downstream 200000 B/s, CPU×4. Track LCP timing, first post/heading DOM mark and JS resources, and test logout/login/privacy and mobile navigation via existing suite. Compare samples descriptively; host load, parallel E2E and test content can differ. **Do not publish an improvement percentage without sufficient comparable evidence.**

## Release boundary / fallback

Keep this experiment open and unmerged until metrics and all mandatory jobs succeed. If unchanged/worse, do not advance candidate to production; isolate larger JS entry / modulepreload hints instead. Automatic Desktop Chromium E2E stays disabled. Native Android 200% zoom/IME/picker, real screen-reader speech, field p75 and INP remain not tested. No production seed, merge or deployment.

## First measured pre/post execution — isolated GitHub runners (2026-10-27)

**Unchanged reference**: [PR #53 run 40477491737](https://github.com/lolokeksu09/WrCommunity/actions/runs/40477491737), source `78be68e4aae4d907c97cb6a67c27f54c22bc9956`. **Preload candidate**: [run 40478515862](https://github.com/lolokeksu09/WrCommunity/actions/runs/40478515862), source `57fc44dbffacb2fa111b19adb70b89649dd9808c`. Both used the unchanged Playwright `premium-lcp-phases.spec.ts` on separate isolated runners. Both ran 44 mobile tests with success; FULL jobs API, mobile browser, browser-tests, integration, docker smoke and quality-gate passed on their respective heads.

| Metric | Reference PR #53 | Candidate PR #54 | Difference |
|---|---:|---:|---:|
| Actual isolated 20-post LCP (2 samples), median | 5558 ms | 5066 ms | -492 ms (-8.9%) |
| Browser-only empty response LCP (2 samples), median | 5078 ms | 4710 ms | -368 ms (-7.2%) |
| Actual DCL, median | 3948 ms | 3949 ms | +1 ms |
| Actual first post DOM time | 5539 / 5482 ms | 4913 / 5137 ms | both candidate samples earlier |
| Last JS resource response, actual | 4872 / 4898 ms | 4352 / 4474 ms | both candidate samples earlier |
| Total JS network bytes, each run | 636697 | 636839 | +142 bytes |
| Actual feed records | 20 / 20 | 20 / 20 | same count, first copy length not always same |
| Empty-control feed records | 0 / 0 | 0 / 0 | synthetic browser interception |

**Interpretation:** advancing the same existing route module to bootstrap is consistent with faster JS availability and first post DOM/LCP in these runs. DCL remained approximately stable; the change did not reduce bundle size. Because sample sizes are **two per variant per build**, runs execute on **different GitHub machines**, and other E2E tests share the disposable backend, these are directional lab data rather than a reproducible statistical effect, causal proof, or production Core Web Vitals improvement. `post-list` as region in empty control is a classifier artifact: no post cards existed.

**Next evidence:** a second full run after documentation handoff on the new exact SHA can check whether the benefit survives runner variability. A measured regression on that rerun must override this promising preliminary result. Only after repeated data and source review should this be considered as one feature of a cumulative release. Neither a `main` merge nor VDS deploy is authorized.
