# Premium 2.0 — same-runner, identical-content preload A/B

**2026-10-27.** Base SHA `e1fe61c58033d076949bccf8b7c33253fd06ca4f` ([PR #54](https://github.com/lolokeksu09/WrCommunity/pull/54)). Branch `perf/premium-2-identical-feed-ab-2026-10-27`. No production merge or deployment.

## Problem
Previous PR #53/54 LCP runs were on separate CI runners with concurrent E2E writers. Post length varied (up to 2624 characters). Early `import('./social')` appeared beneficial, but the magnitude and cause are uncertain.

## Controlled experiment
1. In a dedicated, **temporary pull-request-only** GitHub Actions workflow, use one runner to build **two Vite variants** of the same SHA. The only code difference is the existing early `import('./social')` snippet being removed by a build-time audit transform for the baseline variant. The actual application source and bundle-splitting rules remain unchanged.
2. Serve both built static apps on loopback; Playwright intercepts only `/api/v1/auth/session` and `/api/v1/feed` with fixed synthetic JSON. The feed has exactly **20 immutable posts**, fixed metadata, authors and text; report SHA-256 of the fixture and card count; no private production data/API/DB.
3. Alternate 4 cold 390×844 mobile Chromium navigations per variant on the **same** runner. Use CDP 150 ms latency / 200000 B/s download / 90000 B/s upload / 4× CPU, capture last LCP, FCP, first post DOM, navigation, JS transfer and long-task totals. No real device/field CWV claim. Recheck screenshots/ARIA, JS exceptions and page overflow. The server runs locally without real PostgreSQL because all API requests are fixture-controlled.
4. Persist JSON evidence and CI log summary. If a meaningful signal is demonstrated, retain existing PR #54 preload as a reviewable optimization; if no signal or regression, document rejection. Do **not** alter home/auth/API/production content for the sake of a benchmark.
5. Remove one-shot workflow after collecting evidence; keep the repeatable A/B runner script and records, register final evidence in `docs/implementation/CONTINUATION.md` and PR. Run exact-final-head FULL after the workflow removal, preserving desktop Chromium's owner-disabled state.

## Risks and acceptance
Build-time transform must assert that the preloader appears exactly once; a fallback that silently compares identical builds is forbidden. Reject unknown API URLs and mismatched fixture counts. Evaluate observed differences conservatively: only 4 visits per variant, single runner and browser/CDP emulation, not statistical certainty. **Never merge into `main`, alter live VDS, or claim real Android 200% zoom, TalkBack, IME or p75/INP verification.**

## Completion — 2026-10-27

- ✅ One-runner two-bundle audit completed successfully: [40481966087](https://github.com/lolokeksu09/WrCommunity/actions/runs/40481966087), artifact `12723670513`; 8 fixture-identical mobile loads (4 per variant), no horizontal overflow or JS errors.
- ✅ Baseline median LCP **3376 ms**, preload median **3224 ms** (**-152ms, -4.50%**); initial post DOM **3336 → 3187 ms**. DCL and FCP were effectively unchanged. No statistical/general-population inference from this 8-run sample.
- ✅ Temporary workflow removed; reproducible paired script retained. Review details: [paired audit](../../implementation/reviews/2026-10-27-premium-2-identical-fixture-ab.md).
- ✅ Existing standard FULL succeeded on original [PR #55 head 50d17d22](https://github.com/lolokeksu09/WrCommunity/pull/55) before these documentation/deletion commits. **Final exact-head FULL recheck required**, including mandatory jobs.
- ⏳ Real Android/manual screen-reader/zoom and field CWV/INP remain outside this CI experiment; **no merge/deploy authorized**.

**Plan status:** controlled experiment implemented and evidence reviewed; publication remains a separate project/release decision.
