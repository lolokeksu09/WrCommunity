# WrCommunity — Editorial UI polish, pass 1 (26 October 2026)

- **Base:** `9e19957c0e145e457eb157f89e851f284cd3ad63` after merged PR #37.
- **Branch:** `design/editorial-polish-2026-10-26`.
- **Scope:** current React site, CSS and documentation only. No new routes, fake content, server/API/security changes or changes to desktop E2E policy.
- **Source of design direction:** approved v6 Editorial Social, dark restrained palette, readable content first, compact discoveries, club/LFG in 1–2 taps.
- **Visual evidence:** checked committed screenshots `docs/evidence/screens/home-390.png`, `home-1440.png`, `club-390.png`, `lfg-390.png`, `login-390.png`, `profile-390.png`, `empty-390.png`; these are historical test screenshots, not a verified capture of today's VDS or the new patch. Cross-checked with `web/src/styles.css`, `web/src/main.tsx`, `web/src/social.tsx`.

## Design audit findings

1. **P1 — Mobile navigation:** five destinations including central Compose have ~10px caption text in the current CSS. Improve readable hierarchy, icon rhythm and active focus while retaining all five links, accessible labels and safe area.
2. **P1 — Information hierarchy:** post author metadata, secondary buttons and support labels are low contrast/small across feed, forms and LFG. Improve typography and vertical spacing, keeping the editorial continuous feed rather than turning every post into a SaaS card.
3. **P2 — Discovery hero:** multiple rotated backing surfaces and abstract stacked geometry draw more attention than the useful action. Reduce ornamental layers; strengthen text/CTA contrast, retain existing carousel, illustrations and content.
4. **P2 — Forms and empty states:** align comfortable input touch size, focus treatment and empty-state framing; do not change behavior or client-side validation.
5. **P2 — Desktop rhythm:** improve sidebar, central reading column and right rail spacing/affordances, without changing fixed 3-column skeleton.

## Intended design tokens

- Background `#0d1017` / page `#101722`; surface `#161f2c`; edge `#344257`; primary text `#f1f3f8`; accent `#d8e4f3` (existing brand family).
- Typeface remains native system UI for fast Cyrillic rendering, but editorial title rhythm and post readability improve.
- 390px/430px: comfortable minimum hit areas (44px), 11–12px nav captions instead of 10px, 16px form controls and safe-area nav.
- 760px+: retain existing columns, add subtle rail emphasis and content hover affordances.

## Implementation

1. CSS-only scoped override in `web/src/styles.css` with a single commented section and media queries. Avoid `transition:all`, `outline:none`, animations, remote fonts, extra assets, or changing DOM semantics.
2. Add minimal CSS semantic regression tests if needed; protect active nav, reduced motion and focus affordances through current UI guidelines.
3. Update `docs/implementation/CONTINUATION.md` with current design PR, exact status and no unsupported live verification.

## Verification / exit criteria

- [ ] `npm run test:l1`, `npm run check:ui`, `npm run typecheck`, `npm run build` pass on the final revision.
- [ ] Mobile Chromium E2E and API/Docker/integration/quality-gate success on the exact PR head; Desktop E2E remains disabled until owner explicitly reverses the decision.
- [ ] No horizontal overflow at 360/390/430; forms, bottom nav and hero maintain keyboard focus/contrast/reduced-motion contracts. A static CSS-only patch is ready for CI, but no new screenshot has been reviewed yet.
- [ ] Compare new local screenshot at 390 and 1440 if browser environment available; if not, state that manual inspection is unavailable and rely only on CI evidence actually obtained.
- [ ] Do not merge this design work or deploy until the pre-existing PR #37 RELEASE has finished and the owner approves the direction or requests merge.

## Implementation snapshot

- Stylesheet change is additive and scoped to existing components; the layout structure and all links remain unchanged. Earlier source CSS minification is untouched.
- Brand colours remain in the approved blue/slate family; no external fonts, imagery or new dependencies.
- Manual before references are committed historic screenshots, not current VDS captures. A fresh CI/browser comparison is still required.
