# Premium 2.0 P2-1 — measured loading-shell stabilization

**Date:** 2026-10-27. **Work:** Draft [PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45), stacked on diagnostics [PR #44](https://github.com/lolokeksu09/WrCommunity/pull/44); neither merged/deployed.
**Source:** base `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb`, PR #44 diagnostic head `e788acaf0b7065d4080c1a0aeca1f7388f4f935c`.
**Successful final experiment:** [isolated GitHub Actions 40451128776](https://github.com/lolokeksu09/WrCommunity/actions/runs/40451128776) at SHA `3f3a75dcf975b9e6ad76f9eb53c38df7db5d48ec`. Artifact **12710382372**, named `premium-2-isolated-baseline` (short-lived).
**Previous baseline:** [40449771048](https://github.com/lolokeksu09/WrCommunity/actions/runs/40449771048), SHA `bd28e55b20125a50395783bf86af27019e263638`, artifact 12709559163. Its instrumented CLS report is an independent *prior run*, not a laboratory randomized A/B trial.

## What changed and why

1. `web/src/main.tsx`: the temporary `hydrateFallbackElement` now renders a non-interactive `InitialLoadingShell` with exactly the production shell's mobile-header/main/desktop-grid/sidebar/right-rail/bottom-nav geometry and a genuine screen-reader `role=status` loading indicator. This avoids an initially centered 60px-margin block being replaced by a full-width application.
2. `web/src/styles.css`: route-loading reserves stable near-viewport vertical space; `.page-content` is `display:flow-root` to prevent heading top margins from collapsing through `main`; the content minimum height keeps the actual footer from moving into the initial viewport when a short route replaces its loader. A reduced-motion indicator has no continuous spin.
3. No changes to routes, data loaders, authentication, moderation, user data, API, database schema or deploy configuration. No fake data, loading suppression or alteration of PerformanceObserver measurements.

### Controlled measurements: session-window CLS

The same `scripts/ci/premium-visual-baseline.mjs` (from PR #44) visited five public guest routes at four viewports on both builds using disposable PostgreSQL/Mailpit and localhost Chromium, **not** production. Every viewport showed the final loaded page and valid expected headings. **20/20 completed** in both runs with 0 test-reported horizontal overflow, broken completed images or uncaught JS exceptions.

| Viewport | Feed before → after | Players before → after | LFG before → after | Clubs before → after | Login before → after |
|---|---|---|---|---|---|
| 360×800 | 0.31995 → **0** | 0.33147 → **0** | 0.21589 → **0** | 0.10293 → **0** | 0.11346 → **0** |
| 390×844 | 0.25614 → **0** | 0.24259 → **0** | 0.15706 → **0** | 0.09773 → **0** | 0.10775 → **0** |
| 430×932 | 0.14532 → **0** | 0.13296 → **0** | 0.08827 → **0** | 0.08827 → **0** | 0.09722 → **0** |
| 1440×900 | 0.04954 → **0** | 0.05342 → **0** | 0.05342 → **0** | 0.05342 → **0** | 0.05985 → **0** |

- **Above proposed diagnostic CLS 0.1 threshold:** **11/20 before → 0/20 after**.
- **Attribution:** previous baseline logged two non-interaction layout shifts per route, notably `document` then `main`/`footer`. Final experiment logged **0 qualifying layout shifts per route** in the captured initial load. Neither observer nor its threshold logic was changed by P2-1. This is a valid laboratory improvement within the measured sample, not assurance of zero field CLS.
- An intermediate experiment used only matched fallback plus taller `.route-loading`; reduced over-budget captures from **11→6**, but shifted the footer *into view* on shorter pages (clubs/login). That regression informed the additional `flow-root`/minimum-height change, which passed the final repeat capture.
- Diagnostic unthrottled LCP across 20 routes: **median 480ms before versus 448ms after**; this is neither p75 field data nor a controlled performance benchmark. No INP or manual screen-reader testing.

## Human visual inspection and limitations

Manually inspected final PNG captures for guest feed (390/1440), players (390), clubs (390), login (390), and compared the 390 CSS-px layout to the earlier baseline. The header, feed/discovery entry, form labels, bottom navigation and loaded content remain visible; mobile navigation remains five entries and no horizontal overflow was detected. Short empty pages may now require slightly more vertical scroll to reach the global site footer: this is an intentional tradeoff to keep first-viewport placement stable and should be checked against UX expectations before merge.

Not checked in this audit: authenticated profiles/uploads, actual Android soft keyboard, keyboard focus order with assistive technology, 200% browser zoom, controlled throttled Lighthouse, RUM p75, or the production VDS after the patch. The existing automated Desktop Chromium E2E is not enabled. Visual review is evidence of **captured pages**, not a complete accessibility or privacy audit.

## Next checks, deployment and rollback

- Remove temporary `.github/workflows/premium-2-isolated-baseline.yml` from the final PR. Re-run Draft FAST on final SHA; Ready FULL (API, mobile Chromium, browser-tests, integration, docker-smoke, quality-gate) is required before merge, with parent PR #44 first.
- Follow up on authenticated/loading/zoom/error states in the normal E2E or an isolated run; preserve `#main-content` and skip-link behavior.
- Do **not** merge/deploy from this evidence-only response. Production remains at separate verified `main` until explicitly approved integration. Rollback is normal PR revert/redeploy, never manual production edits.
