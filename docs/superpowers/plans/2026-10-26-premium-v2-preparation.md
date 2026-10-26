# Premium 2.0 — quality foundation before UI changes

Date: 2026-10-26. Base main SHA: 4ec19011c081e5e64866de72eda270d8cfbaca98. Branch: prep/premium-v2-quality-baseline-2026-10-26.
Reference: [current audit](../../implementation/reviews/2026-10-26-premium-v2-audit.md).

Scope: user authorized preparation, not full premium UI deployment.

1. Fix QA-01: public release smoke waits for fully rendered feed or empty state rather than any main text, fails on stuck route loader and JS errors, keeps strict TLS/read-only behavior. Add regression.
2. Add opt-in reproducible Playwright baseline runner for isolated localhost, guest states across 360, 390, 430, 1440 px, with screenshots, console failures, overflow, LCP/CLS where measurable. No production logins or mutations.
3. Store candidate Premium 2.0 tokens/components/wireframe prototype as isolated design assets; do not modify deployed React/CSS.
4. Record constraints and results in CONTINUATION plus updated audit, define performance/accessibility baseline and follow-up manual checks.
5. Verify relevant unit tests, CI Draft FAST then Ready FULL on exact head SHA; do not restore Desktop Chromium E2E. Deploy via protected main only.

Acceptance: smoke rejects route-loading and error states despite nonempty main, accepts rendered posts and genuine empty feed. Viewport snapshot runner fails closed on non-local origins; no synthetic users/engagement disguised as real. Final diff limited to scripts/tests/docs/design assets. Report environment limits without invented perf metrics.
