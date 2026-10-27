# WrCommunity Premium 2.1 — mobile UI consistency audit

**Date:** 2026-10-27. **Base:** released Premium 2.0 `fc3e92f20e6396cc22ac42e708c518af57077ff6`. **Working branch:** `feat/premium-2-1-mobile-polish-2026-10-27`. Scope approved by the user's request to implement the six-screen visual-audit findings.

## What was inspected

Six owner screenshots from live Premium 2.0 on an Android phone: guest/authorized feed, player discovery, clubs, profile editor, new post editor and empty drafts. Relevant production source: `web/src/social.tsx`, `web/src/lfg-events.tsx`, `web/src/player-journey.tsx`, `web/src/search-filters.tsx`, `web/src/clubs.tsx`, `web/src/profile-editor.tsx`, `web/src/styles.css`, `web/src/premium-v2.css`, existing E2E. Screenshots establish visual composition only; cannot prove touch response, TalkBack, server privacy, zoom or file-picker behavior.

## Changes proposed in PR

- **Discovery:** previously filled game-card filter options are collapsed by default, with visible text summary and an accessible expand/collapse button. When user has no saved server/role, setup hint remains visible; querying, sharing links, applying role, profile visibility and backend behavior remain unchanged. Search filter form gets tighter mobile spacing, while advanced criteria still use native `details`.
- **Clubs:** if no uploaded `cover_id`, remove the giant letter-only hero placeholder. A static CSS-only geometric background is tinted from a stable nonpersonal club ID prefix; uploaded images render exactly as before. Small club avatar still shows the initial when no avatar uploaded. No generated photos, synthetic engagement or editable record changes.
- **Profile edit:** group each native file picker and its preview/removal into accessible, coherent media panels. Input remains a normal `type=file`, allowed MIME list unchanged; existing save/restore/media API/concurrency logic preserved.
- **Post editor:** mobile textarea begins at 164 CSS px and stays vertically resizable; draft/preview/publish semantics and state unchanged; two action buttons align on common mobile grid.
- **Drafts:** the empty drafts route now uses a contextual title, private draft explanation and CTA linking to `/posts/new`, instead of generic 'Пока нет публикаций'. Other post-list empty states stay generic.
- **Feed:** slightly tighter interior vertical gaps but 44px touch targets retained. No copy or existing data changed.

## QA and limits

New enabled mobile Chromium E2E `premium-mobile-polish.spec.ts` covers empty drafts, real accessible native media inputs, post editor behavior/size, deterministic fallback club visual and overflow. Existing `player-journey.spec.ts` explicitly expands presets, guards role selection and privacy preserving. `scripts/ci/e2e-levels.json` is updated.

**To verify:** exact final PR HEAD Ready FULL `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate`; inspect diagnostic screenshot artifact and compare rendered markup at 390 and 1440 if artifact is accessible. Local interactive site/browser and native Android picker/TalkBack were **not** run in this ChatGPT cloud environment; passing CI browser tests does not prove physical-device behavior.

**No release yet:** this branch contains UI, browser test, docs and CSS only; no API, DB migration, production seed, external SMTP or workflow changes. `main`, RELEASE and VDS remain at existing Premium 2.0 until explicit separate publication authorization. Automatic Desktop Chromium E2E stays disabled by owner.
