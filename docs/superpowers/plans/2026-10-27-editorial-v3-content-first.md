# Editorial V3 — content-first mobile refinement
Date: 2026-10-27
Base main: `1345bc2bc7b3bd7ef3aa53cbb46e778985a8975e`
Work branch: `feat/editorial-v3-content-first-2026-10-27`
PR: add after creating review request.

## Owner decision
Implement the proposed improvements inspired by FACEIT's club structure, E-Pal's player-first discovery, and concise mobile social navigation, **without copying their branding, layouts or artwork**. This is a concrete continuation of released PR #59, not a new color skin.

## Scope / sequencing
1. Save this plan and `docs/design/editorial-v3/README.md` before code. Approved direction: authentic content first, AMOLED dark, mint/violet signals, fewer screens dominated by forms, compact navigation and profile.
2. Mobile homepage: retain real carousel routes and social feed; reduce editorial masthead height and tighten first post access. No synthetic stats or auto-created posts.
3. Discovery: independently visible quick text search and a **collapsed-by-default advanced filter drawer**; retain all seven filters, mode, server/role query params, reset and recommendation disclosure. Keep users' real API results and privacy. Ensure changing quick search doesn't wipe existing filters.
4. Profile: reorganize activity/club route links as compact responsive grid, retaining exact links, labels, roles and first-steps checklist.
5. Club detail: group the cover/title/meta/member controls into an identifiable club dossier; preserve permissions, join/request consent flows, tab navigation and private feed access.
6. Add mobile Playwright regression for discovery shortcut, filters, profile links, club actions and 320/390/430 reflow in isolated DB, register L2 inventory, capture screenshots (no production fixture creation).
7. Validate per AGENTS: Draft FAST → Ready FULL on exact SHA; real Chromium evidence, docs/continuation, PR. Do not merge/publish until QA and visual review; production is already running released V2 stage 1.

## Explicit non-goals
No new backend/API/ACL/DB, bot/data generation, external images, fabricated community metrics, unlicensed third-party UI, general public signup, or desktop Chromium re-enablement. No VDS deploy until approved.

## Acceptance / risks
- On 390px guest discovery, heading + search field + visible result card appear without a fully expanded multi-field form; advanced fields accessible via a button. Active query state and filters preserved in URL, including recommended mode.
- On mobile profile, all original activity and company links remain keyboard accessible, no extra hidden navigation; 44px targets.
- Club owner and visitor paths unchanged; private club feed never leaked.
- On home, first post visible sooner; collapse persists.
- 320/360/390/430 has no horizontal clipping; 200% zoom and physical IME require separately documented checks.
- Exact-SHA CI and screenshots before release. No claim of running local Chromium if local environment does not allow it.
