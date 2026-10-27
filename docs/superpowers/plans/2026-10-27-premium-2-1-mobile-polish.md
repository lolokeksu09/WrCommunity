# Premium 2.1 — mobile consistency pass (screenshots 2026-10-27)

Base: `fc3e92f20e6396cc22ac42e708c518af57077ff6` (released Premium 2.0). Working branch: `feat/premium-2-1-mobile-polish-2026-10-27`. User approved implementation of prior 6-screen audit; **no additional approval to publish 2.1 on VDS**.

## Goals and acceptance
1. **Discovery**: collapse optional profile-preference panel by default, reveal with accessible toggle; preserve selected role/server and applied filters. In compact 320–430 px mobile discovery show filters in a compact panel by default when no active criteria, retain explicit button to reveal and inspect all editable fields. Do not hide active criteria or search state; no change to backend filtering.
2. **Clubs**: replace a giant letter in missing club cover with deterministic, CSS-only abstract geometric cover that varies stably using club identity, while retaining existing uploaded covers and small fallback avatar. Never introduce fake graphics, club stats, profiles or promises about authenticity.
3. **Profile editor**: use accessible native file inputs inside a branded media-upload row with live preview, predictable remove/restore controls and explicit type hint. Preserve `/media` upload, update concurrency/409 handling, draft retention and deletion behavior.
4. **Post editor**: reduce empty textarea height on mobile, keep resizable and expandable; align draft/publish actions without changing save/autosave/preview flows.
5. **Contextual empty state**: `/me/drafts` must say “Пока нет черновиков”, describe drafts and use “Создать черновик”; other empty post lists retain their own correct labels.
6. **Feed**: small spacing adjustments only; avoid obscuring readability and true first-post-above-fold behavior.

## Engineering boundaries
- Keep same React/Fastify/PostgreSQL routes, privacy, account permissions, real server data and CLS improvements. No DB/server/migration/seeding/SMTP/CI policy changes.
- Respect owner-disabled desktop automated Chromium. Coverage uses existing mobile Chromium configured in GitHub FULL. Add tests for toggles/empty state/fallback cover/native file input without invoking real Android picker; screenshot captures of viewport 320/390/430/1440 on disposable CI and no horizontal overflow.
- Mobile in screenshots is a high-density display; tests operate in **CSS pixels**, not real device hardware.

## Steps
1. Inspect AGENTS.md, TESTING-STRATEGY, relevant TSX/CSS and existing E2E. Add targeted behavior assertions before changes where meaningful (empty draft, initial collapsed prefs and filters, native media controls).
2. Implement smallest TSX/UI changes and additive `premium-v2-1.css`, scoped to route/components.
3. Run GitHub Ready/FULL, examine exact-head mobile screenshot artifact and failed tests, fix any regression. Preserve tested SHA and results in `docs/implementation/CONTINUATION.md`. If no local GUI available, say so explicitly; CI browser screenshots are not manual Android testing.
4. Leave PR **unmerged**, no VDS release until separate explicit consent after verified quality gates.

## Risk
Prior `player-journey.spec.ts` assumes preferences initially expanded; revise regression path to expand explicitly, preserving existing role-pick/submit behavior. If filters collapse, ensure direct query parameters and modes stay in URL and selected chips remain visible.

**Next action:** add regression tests and implement scoped UI polish on this branch.
