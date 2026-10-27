# Premium 2.0 — CLS-stable but late guest feed LCP: phase investigation

Date: 2026-10-27. Parent [PR #52](https://github.com/lolokeksu09/WrCommunity/pull/52), tested source `a68f94f0d244039a646971b7d9032d3e8a249a62`.

## Recovered measurements previously omitted from #52

Read exact-head [Application CI 40474595135](https://github.com/lolokeksu09/WrCommunity/actions/runs/40474595135) mobile-browser job logs directly. Its `PREMIUM_LCP_ATTRIBUTION` output establishes:

| Run | LCP (ms) | DOMContentLoaded (ms) | Largest entry |
|---|---:|---:|---|
| 1 | 5768 | 4005 | `p`, `post-list`, size 46110 |
| 2 | 6364 | 4039 | `p`, `post-list`, size 46110 |
| 3 | 5784 | 3935 | `p`, `post-list`, size 46110 |

LCP range **5.768–6.364s**, median **5.784s**, three successful guest navigations. All 43 mobile Chromium tests passed. The element's category is consistent, but the same CI backend/database also serves synthetic posts created by other E2E tests. **Do not claim post content length or production representativeness from element area/size 46110 alone.** DOMContentLoaded `~3.9–4.0s` is not evidence of the responsible network request.

## New phase and fixture-control evidence

A new L2 test `tests/e2e/premium-lcp-phases.spec.ts` runs four sequential cold mobile-browser contexts: 2 actual isolated guest-feed responses and 2 browser-only **synthetic empty-feed controls**, alternated. It records URL-free timing buckets (navigation response, paints, feed/session API, JS, CSS), text lengths and count **without contents**, first post/heading DOM mounting, last LCP candidate, aggregate long tasks, and overflow. CPU/network emulation follows #52 (4× CPU, 150ms latency, 200000 B/s download, 90000 B/s upload). No real users, VDS, personal data, or production databases are read.

This control intentionally changes only browser-side response shape, not the server. Its results are *not* direct comparable production benchmarks nor causally isolating one code statement. Variance from other parallel E2E workers can remain in the actual branch. The control may identify whether content density changes the LCP target and highlight which phase deserves optimization. A failing test must be investigated; no thresholds are invented.

## Verification and release boundary

New exact-head FULL and raw `PREMIUM_LCP_PHASES` values are required before interpreting results. No edit to web/src or server, CI workflow, database, VDS or `main` is authorized by this task. Automatic Desktop Chromium E2E stays disabled. True 200% browser zoom, Android picker/keyboard, screen reader and field INP remain unverified.

**Next action:** read successful or failed new diagnostic log, classify dominant timing segment conservatively and only propose a small application fix if the result supports it. This PR must stay open/unmerged.
