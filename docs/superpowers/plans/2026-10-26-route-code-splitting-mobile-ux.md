# WrCommunity — route code splitting and mobile loading UX

**Status:** PR #37 is ready for review; Docker build-context fix is included in the latest commit and must be verified by FULL CI.

- **PR:** [#37](https://github.com/lolokeksu09/WrCommunity/pull/37)
- **Base SHA:** `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`
- **Working branch:** `perf/route-splitting-mobile-ux-2026-10-26`
- **Scope:** frontend performance and loading UX only; no API, database, auth-policy, or production-data changes.

## Findings

- `web/src/main.tsx` statically imported page components from social, clubs, LFG/events, notifications, profile editor and auth pages.
- Shell reset helpers pulled editor modules into the initial dependency graph.
- The app already uses mobile navigation, safe-area padding and reduced-motion support; preserve those contracts.
- After adding the bundle guard to `build:web`, Docker smoke revealed that the build stage copied only `scripts/copy-migrations.mjs`; it did not copy the new `scripts/ci/check-route-splitting.mjs`.

## Changes implemented

1. Split 47 route page component exports into typed `React.lazy` imports. Paths, loaders, redirects and route error boundaries remain unchanged.
2. Moved `Gate`/`useSession` into `web/src/auth-session.tsx`; `auth.tsx` preserves the existing re-exports.
3. Moved the profile editor's draft baseline map/reset into `web/src/profile-editor-state.ts`, keeping account-switch reset synchronous.
4. Added an accessible in-content Suspense fallback; shell and mobile navigation remain visible while route chunks load.
5. Enabled the Vite manifest and added `npm run check:bundle`. The check verifies nine heavy feature modules are dynamic imports and reports initial entry raw/gzip size.
6. Added an L2 mobile E2E regression in `tests/e2e/mobile-create-navigation.spec.ts`: delays the clubs JS chunk, then checks the loading status, persistent mobile navigation and no horizontal overflow.
7. Added the bundle-check script to the Docker build stage so `npm run build` can run inside the container.

## Measured bundle result

- **Before:** [CI 40339802596](https://github.com/lolokeksu09/WrCommunity/actions/runs/40339802596), SHA `43b953e17bada1f4eafcad2a2cdc5b425b0fa5ef` — Vite entry JS `811.76 kB` raw / `224.00 kB` gzip.
- **After:** [CI 40349035716](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349035716), SHA `1b591118dcd9f8db315dfb698d8b6e6e52a66935` — Vite entry JS `357.77 kB` raw / `112.52 kB` gzip.
- Initial entry reduction: approximately **55.9% raw** and **49.8% gzip**. This is a bundle-size comparison, not a claim of an equal percentage improvement in real-world page-load time.

## Verification snapshot

- FAST [40349693137](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349693137) passed on SHA `1e558727a6e3a12aed8369681442b2b852389008`: secret scan, UI guideline check, typecheck, production build, bundle guard and server build.
- FULL [40349858840](https://github.com/lolokeksu09/WrCommunity/actions/runs/40349858840) on that earlier SHA failed `docker-smoke`. The log confirmed `Cannot find module '/app/scripts/ci/check-route-splitting.mjs'`. The Dockerfile now copies the script; require a new FULL run on the latest SHA before merge.
- Local build and manual visual inspection were not performed in this environment. CI browser evidence is not a substitute claim for manual visual review.

## Acceptance

- [x] Route page components are lazy-loaded and shared reset/session helpers no longer force feature-page modules into the entry bundle.
- [x] Bundle guard verifies nine dynamic feature modules and reports entry size.
- [x] Mobile fallback is accessible and preserves shell/navigation.
- [x] Delayed-chunk mobile E2E regression is added and registered as L2/navigation.
- [x] Docker build stage copies the bundle-check script.
- [ ] FAST succeeds on the latest PR head.
- [ ] FULL succeeds on the latest PR head: API, desktop/mobile Chromium, browser-tests, integration, docker-smoke and quality-gate.
- [ ] Review desktop/mobile browser evidence and confirm the new delayed-chunk scenario passes.
- [ ] After merge, verify RELEASE, deploy, strict HTTPS and vds-status on the exact merge SHA.

## Risks and constraints

- `auth.tsx`, `social.tsx`, `clubs.tsx` and LFG modules share dependencies; preserve exports and direct-navigation behavior.
- Do not change route paths, API contracts, authorization policy, schema or production configuration.
- Do not merge if any required FULL job is skipped, pending, cancelled or failed.

## FULL failure and regression synchronization

- [FULL 40350273616](https://github.com/lolokeksu09/WrCommunity/actions/runs/40350273616) on `500b1f6850780a62cac6db75c5c66daedb801246`: API and Docker pass; desktop/mobile browser shards fail on the same notification pagination E2E scenario, with 30 of 63 rows visible.
- After route code splitting, the browser can reach `/notifications` before the lazy view renders. The test used `more.count()` (non-waiting) as its loop condition and could skip loading entirely. Introduced an explicit Playwright readiness assertion on the Load More button before any page-count assertions. This is a test synchronization hypothesis supported by the failure log and source; wait for the final FULL to validate.
- Keep the required FULL before merging; no bypass or skip is permitted.

## Temporary CI override (owner decision, 2026-10-26)

Desktop Chromium E2E is paused in automated FULL/RELEASE until the owner explicitly requests its return. The desktop Playwright project and test cases remain in the repository. Mobile Chromium, API, Docker, browser-tests, integration, and quality-gate remain mandatory for the active workflow. The release public-site smoke remains a separate read-only HTTPS check at 390/1440px. Reactivate Desktop only after the owner explicitly approves; then update CI matrix, browser-tests, L1 guard, AGENTS.md, and TESTING-STRATEGY.md together. This override is a reduced desktop coverage policy, not proof that the desktop regressions passed.
