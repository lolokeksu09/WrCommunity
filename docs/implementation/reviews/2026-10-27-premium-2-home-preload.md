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
