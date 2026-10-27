# Premium 2.0 — repeatable isolated LCP attribution

Date 2026-10-27. Parent [PR #51](https://github.com/lolokeksu09/WrCommunity/pull/51), verified head `3c29907cc65528f50433492ab8ecc6ffbcef047c`. This is a test-only stacked branch. No main/VDS changes.

## Goal
Investigate one 390×844 mobile guest lab LCP of 5808ms under CDP 150ms latency / 200000 bytes/sec download / 4× CPU. Repeat 3 independent fresh-context navigations on one isolated CI runner, collect navigation and candidate element timing without DOM text, URLs, IDs or user data, and report a small descriptive median/range. This is **not** proof of cause, Lighthouse, field p75, or a production performance budget.

## Work
1. Add one Playwright L2/feed scenario with a fixed whitelisted element classification from entry.element (tag + static region only), numeric navigation phases, LCP, CLS and observer availability. Collect a JSON report, not a private screenshot.
2. Register the scenario and run the standard exact-head FULL mobile CI; preserve old performance scenario.
3. Publish measured results and limitations in audit and continuation. Do not fix production code without causal evidence or owner approval.

## Restrictions
No modifications to web/src, server, ACL, database schema, CI workflow, remote VDS or main. Desktop automated Chromium remains disabled. Never put observed DOM text, author names, page URLs, cookie, CSS path/IDs or image src into artifact.
