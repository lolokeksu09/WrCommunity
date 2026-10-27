# Premium 2.0 — measured home-route module preload experiment

Date 2026-10-27. Base: [PR #53](https://github.com/lolokeksu09/WrCommunity/pull/53), SHA `78be68e4aae4d907c97cb6a67c27f54c22bc9956`. Branch `perf/premium-2-home-chunk-preload-2026-10-27`.

## Observation and hypothesis

Full [run 40477491737](https://github.com/lolokeksu09/WrCommunity/actions/runs/40477491737) had 44 passing mobile E2E tests, 2 actual isolated guest 20-post LCP **5588/5528ms** (median **5558ms**) versus two browser-only empty-feed control LCP **4916/5240ms** (median **5078ms**) at 390×844, CDP 150ms/200000 B/s/4× CPU. DCL median **3948/3959ms**. JS requests collectively transfer 636697 bytes and finish ~4.8–5.1s; feed heading/post DOM appears ~4.8–5.5s after initial navigation. This is evidence of an early JS/render critical path, not proof that any particular import is the bottleneck.

The index route uses `Home=lazyNamed(()=>import('./social'),'Home')`; React Router's root/session and index/feed data may resolve before React actually requests that lazy chunk. A **route-scoped speculative import** during module initialization may overlap its download with API/data loading without loading it on unrelated routes. This is a hypothesis to be measured; it can lose on congested/slow networks.

## Scope and acceptance

1. Make only one reversible change in `web/src/main.tsx`: when `window.location.pathname === '/'`, initiate the existing `import('./social')` ahead of lazy route render, swallowing only the speculative preload rejection (actual rendered lazy import retains its error path). No API/auth/session/ACL/React component/layout changes.
2. Reuse unchanged PR #53 `tests/e2e/premium-lcp-phases.spec.ts` with four sequential real/empty-control runs, plus prior E2E home, shell, routes, auth and private profile tests. Verify route-splitting budget checker and all mandatory Ready FULL jobs on exact final head. Desktop Chromium automatic E2E stays disabled.
3. Compare observed LCP, DOM mount, request timings and JS bytes with PR #53; report variability, never assert field Web Vitals or genuine A/B equivalence between separate CI hosts. If preload causes a regression or fails to improve under this limited experiment, do not merge it; recommend alternative profile/bundle investigation.
4. Preserve proof, prior/after numbers and residual accessibility gates in documentation/PR.

**No merge to main, no VDS or data writes, no public release.** Protected `main` remains on its unchanged SHA until a separate authorized delivery decision.
