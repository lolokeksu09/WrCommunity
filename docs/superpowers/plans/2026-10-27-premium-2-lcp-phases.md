# Premium 2.0 — isolate LCP timing phases and fixture sensitivity

Date: 2026-10-27. Source: [PR #52](https://github.com/lolokeksu09/WrCommunity/pull/52) verified head `a68f94f0d244039a646971b7d9032d3e8a249a62`. Branch: `audit/premium-2-lcp-phases-2026-10-27`.

## Evidence that motivates this task

[Run 40474595135](https://github.com/lolokeksu09/WrCommunity/actions/runs/40474595135) logged three throttled 390×844 guest LCP entries: **5768, 6364, 5784 ms**, median **5784 ms**. In all three, the LCP element was `p` in `post-list`, entry size 46110; DOMContentLoaded ~3935–4039 ms. 43 browser tests passed. This proves a repeatable *element type under this test runner*, **not** the cause of delay or production performance.

Other Playwright scenarios create synthetic post data in the same runner database, and the current lab test does not record feed composition. We must not assume the text is representative of production.

## Implementation / checks

1. Add a diagnostic-only Playwright L2/feed test comparing 2 actual isolated guest feed runs against 2 same-host **explicitly synthetic empty-feed response** controls. The control must be labeled as modified data; do not claim that those four runs are randomized A/B or performance improvements.
2. Collect numeric browser navigation milestones, first paint/FCP, whitelisted request-category timings (session/feed/JS/CSS), post count and **only text lengths** (no post content), first post DOM-mount time, last LCP candidate tag/region, and browser long-task summary. Never serialize DOM text, personal info, raw API URLs, image src, IDs or cookies.
3. Run exact-head FULL mobile Chromium and preserve the current unmodified PR #52's prior log evidence for comparison. If a check fails, investigate rather than suppress it.
4. Append actual timings to the audit and PR, and preserve the source SHA, environment and limitations.

## Boundaries

No changes to React/CSS/server, auth/ACL, database schema, migrations, deployment workflow, production VDS, main, or Desktop Chromium E2E. The standalone synthetic feed control exists only inside this Playwright test. It is not a backend seed or production feature.

## Handoff

Report phase dominance (network response, JS/route readiness, late post DOM, post paint) only if supported by measured intervals. Otherwise state unknown and plan a smaller follow-up experiment. Native Android 200% browser zoom, TalkBack/screen-reader, IME, field p75 CWV and true INP remain unverified.
