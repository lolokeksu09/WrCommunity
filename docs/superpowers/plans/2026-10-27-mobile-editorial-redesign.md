# WrCommunity — mobile editorial redesign, stage 1

**Base:** `f762dc890f92476f1e3caa2f541b62648d60416c` (Rift Signal published).
**Branch:** `feat/mobile-editorial-redesign-2026-10-27`.
**Owner goal:** a distinctly new, premium mobile product instead of cosmetic layers. Preserve desktop arrangements until separately approved.

## Decisions and scope
- Product identity: AMOLED editorial / tactical interface, original graphic system, quiet contrast, sharp typographic hierarchy; no stock/AI art, imaginary player counts or fake status.
- Structural changes: redesign mobile home hierarchy with independent hub + feed regions; redesign navigation, post cards, club/player/LFG discovery, profile/editor surfaces. Preserve real routes and semantics.
- Auth, privacy, moderator permissions, backend, server, DB, migrations, editorial labels and live content remain unchanged.
- Do not promote to main or VDS without exact-head Ready FULL and visual screenshot review. Desktop automatic Chromium remains disabled.

## Execution
1. Inspect current shell, homepage, club and discovery markup. Reuse existing route/link contracts.
2. Implement distinct mobile hub/section hierarchy in `web/src/social.tsx`, retain original `Discoveries`, feed tabs, post markup and state behavior.
3. Ship original `web/src/mobile-editorial.css` **after** Premium 2.2 cascade, targeted to mobile; adjust shell content class in `web/src/main.tsx`. No spurious route or API changes.
4. Add mobile design/regression E2E checks to existing `tests/e2e/home-feed-ux.spec.ts` and register in `scripts/ci/e2e-levels.json`.
5. Draft FAST / Ready FULL on exact SHA. Inspect mobile Chromium screenshots and verify no overflow at 320/360/390/430, working routes, actions, editorial labels and privacy. Note physical Android/IME/TalkBack not verified by CI.
6. Review before merge/deploy; preserve pilot while not verified.

## Acceptance
- Visually distinguishable home stage, mobile navigation, reading surfaces, discovery, and clubs; not just color changes.
- Existing shortcut URLs and collapse persistence, following filter, post interactions, club joins, profile/privacy, upload picker untouched.
- No horizontal viewport overflow or clipping; 44px primary controls, accessible labels and reduced motion.
- Commit/package the exact implementation and test evidence with a single reviewable PR.
