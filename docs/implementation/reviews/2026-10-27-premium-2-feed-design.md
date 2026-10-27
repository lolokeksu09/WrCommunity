# Premium 2.0 — design foundation, compact discovery and editorial feed (PR #46)

**Date:** 2026-10-27. **Status:** implemented on unmerged stacked Draft [PR #46](https://github.com/lolokeksu09/WrCommunity/pull/46) targeting [PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45). Baseline product `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb`. No production deployment.
**Experiment SHA:** `f75da5c34a41b4414fe5b661b0af86726a9a3831`, isolated GitHub [Actions 40452665664](https://github.com/lolokeksu09/WrCommunity/actions/runs/40452665664), `premium-2-isolated-baseline` artifact **12710539834** (temporary retention).
**Build/test context:** GitHub Ubuntu 24.04, Node 24.22.1, disposable PostgreSQL 18.6 + Mailpit, HTTP `127.0.0.1:13000`, built production React bundle, headless Chromium. No live VDS/data/credentials.

## Shipped into the Draft PR

- `web/src/premium-v2.css`: additive, reversibly isolated near-black surface and semantic design tokens, typographic hierarchy, responsive feed cards, club/editorial/user variants, keyboard focus/reduced-motion styles. No third-party font or remote artwork.
- `web/src/main.tsx`: imports the new CSS **after** existing `styles.css`; keeps stable loading-shell modifications from parent PR #45.
- `web/src/social.tsx`: feed heading/mode tabs are prioritized before compact discovery. Three **real** shortcuts link to player search, clubs and LFG. Expanded carousel is optional, retaining swipe, arrow key controls, slide controls, and explicit persisted collapse preference. Post classes are selected solely by existing `author.editorial` and `club_id` fields; real `AuthorName` editorial badge remains.
- `tests/e2e/home-feed-ux.spec.ts`: default-compact state, correct quick-link href, retained disclosure state on navigation, preserved swipe tests, populated first card present at 390 and player-post variant. One screenshot created within a disposable test user's post scenario.

## Executed verification and evidence

- **Targeted Mobile Chromium 4/4 passed** in [isolated run 40452665664](https://github.com/lolokeksu09/WrCommunity/actions/runs/40452665664): collapse persistence/shortcuts, horizontal versus vertical gesture, first visible published post above 560px at 390 CSS px, and long/multiline post expand/react workflow. This is a real local server and test PostgreSQL, not a page screenshot mocked in static HTML.
- **20/20** guest screenshot captures across `/`, `/discover`, `/discover/lfg`, `/clubs`, `/login` at 360×800, 390×844, 430×932, 1440×900. Report recorded **zero failures**. No detected horizontal overflow, missing completed images, page JS exceptions.
- **20/20 diagnostic session-window CLS = 0**, 0 qualifying initial-load shift events in collected reports. Preserves measured shell stability of PR #45 in this test environment. Not production p75 nor Lighthouse results; INP not measured.
- Screens visually inspected on **390 mobile guest/populated feed** and **1440 desktop guest/populated feed**. They show header/menus, mobile five-item nav, early first post, compact shortcuts, bordered dark differentiated post cards and functioning dynamic long-text expansion. The dataset shown is synthetic disposable E2E account/post content, **not** editorial or authentic production users.
- **Initial successful workflow 40452399288** produced the screenshot of a populated post, but Playwright removed the earlier `test-results/premium-baseline` directory during its own setup. This was an artifact-ordering issue, not an application failure. Final workflow 40452665664 deliberately executes mobile E2E before the 20-screen capture; archive now contains **20 PNGs, report.json, source-sha.txt and populated feed E2E PNG**.
- Previous Draft FAST success on `0e4e8b5fa55a0785733363d1e4ee4c7a0a7fa82b`: [Application CI 40452405643](https://github.com/lolokeksu09/WrCommunity/actions/runs/40452405643). After deleting the disposable workflow and committing this report/continuation, rerun FAST and quality-gate on the final head SHA.

## Limits / review before integration

- Actual production editorial posts are visibly labeled by `AuthorName`, but this disposable database did not seed editorial authors: **a fresh browser screenshot of the editorial-post variant remains untested in this run**. Code uses the existing backend `editorial` Boolean; no invented attribution.
- Manual screen reader, tab/Escape/focus traversal, actual Android keyboard, zoom, account privacy flows and controlled Lighthouse/RUM are pending. Native Desktop Chromium automated E2E remains disabled by owner decision, although 1440 desktop manual screenshot was inspected.
- No false social counts/online labels, authentication or moderation changes, server/API/schema migrations, third-party IP art or production data edits.
- **Stacked PR ordering:** docs #43 → diagnostics #44 → shell #45 → this UI PR #46. Do not merge this branch directly into main before the parents; all final Ready FULL/API/mobile Chromium/integration/docker-smoke/quality-gate jobs are mandatory before approved merge.

**Next action:** remove the temporary one-shot workflow, verify clean PR diff and latest FAST; subsequently add an **authorized isolated** editorial-author screenshot case and manual keyboard/zoom checks, then consider Ready FULL. No deployment until review.
