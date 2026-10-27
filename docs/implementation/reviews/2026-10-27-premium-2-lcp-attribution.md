# Premium 2.0 — repeated throttled LCP element attribution

Date 2026-10-27. Parent [PR #51](https://github.com/lolokeksu09/WrCommunity/pull/51) at SHA `3c29907cc65528f50433492ab8ecc6ffbcef047c`. This is a *non-production* test-only evidence branch.

## Reason for investigation
PR #51 captured **single isolated** 390×844 guest LCP **5808ms** with 150ms network latency, 200000 bytes/s download, 90000 bytes/s upload and 4× CPU throttling. That number is a lab signal, not a measured production Core Web Vital or proof of slow site performance on real phones. Missing element-level attribution and repeated samples prevent identifying the bottleneck.

## New experiment and limits
- New test `tests/e2e/premium-lcp-attribution.spec.ts`, registered as L2/feed. Executes three **separate browser contexts** at 390×844 on the same disposable GitHub runner and server, using the same CDP conditions as #51. Does not mutate server data or use real users.
- Captures numeric response-start/end, DOMContentLoaded/load, LCP entry list count, last LCP element candidate **static region and generic tag only**, layout-shift session diagnostic and three-run min/median/max. Report: `premium-lcp-attribution-390.json` in Playwright artifact.
- No observed content text, URL, CSS selector/IDs, image source, account data, cookie or tokens serialized. The predefined region labels include feed-heading, discovery, post-list, loader, header, navigation and shell.
- No automated Desktop Chromium E2E. Native 200% zoom, Android IME/picker, screen-reader speech, field p75 and INP all remain unverified.
- **No performance threshold is imposed** on uncalibrated three-run lab. Goal is a reproducible observation, not making CI artificially fail on runtime variation.

## Completion gate
At the final PR HEAD, GitHub FULL `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` must report success. Read actual `PREMIUM_LCP_ATTRIBUTION` values before stating any median or element. If there are no LCP entries, report the metric as unavailable rather than manufacturing it. No merge to main, no VDS deploy.

**One next action after validated evidence:** determine whether the LCP candidate belongs to initial UI shell, discovery or primary post; inspect relevant asset/loading timings and optimize only when repeatability and source-level cause are demonstrated. Keep a single cumulative release path and preserve manual accessibility gates.
