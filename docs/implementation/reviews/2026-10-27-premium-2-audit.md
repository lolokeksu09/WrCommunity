# WrCommunity Premium 2.0 — pre-implementation audit

**Date:** 2026-10-27. **Status:** research and planning only. **Source baseline:** main `2ef65bd03bd139372bfb6ae543fa59cbd480e236`. No product code, database or deployment changes.

## Evidence and limits

- User-provided mobile screenshots of home (hero collapsed and expanded), discovery tabs (players, LFG, recommendations), clubs, own profile and profile editor; browser chrome and device bars are visible.
- Reviewed React routes/components and CSS in `web/src/main.tsx`, `web/src/social.tsx`, `web/src/clubs.tsx`, `web/src/lfg-events.tsx`, `web/src/profile-editor.tsx`, `web/src/styles.css`; product screen map and previous audit.
- Historical desktop screenshot evidence in `docs/evidence/screens/` predates the current baseline; it must not be presented as a new live screenshot.
- **Not yet verified:** live site via local browser, new Lighthouse metrics, current desktop/mobile screenshots at target viewport sizes, editorial seed insertion, authenticated flows and mail delivery. Do not invent findings in these areas.

## Confirmed UX observations

| Priority | Screen | Evidence | Proposed direction |
|---|---|---|---|
| P1 | Home | Expandable hero and controls take prominent first-screen area; collapsed state leaves empty feed and an oversized empty-state card | Prioritize actual feed, compact discovery entry, concise editorial empty-state fallback |
| P1 | Discovery | Profile-derived settings card precedes search fields and results, repeating filters and adding scroll | Compact collapsible game card; results-first search; preserve profile privacy and filters |
| P1 | Clubs | Similar empty-state treatment and large whitespace, little club-specific identity | Distinctive covers, compact cards, member/activity context using **real** data only |
| P1 | Email onboarding | Previous config review found pilot Mailpit instead of external SMTP; user cannot receive verification link at ordinary inbox | Separate mail-delivery readiness track, verified sender and real SMTP before public onboarding |
| P2 | Profile | Abstract default cover, letter avatar and lengthy first-steps panel dominate; verified mail prompt blocks participation | Visually coherent player identity and onboarding progress, preserve privacy controls |
| P2 | Profile edit | Native file inputs are visually disconnected; no obvious rich upload preview in supplied screenshot | Unified accessible uploader with preview and validation, no loss of keyboard access |
| P2 | All | Repetitive slate gradients, outlined panels, typographic hierarchy and decorative marks across sections | Original editorial gaming design system; fewer containers, better content hierarchy |
| P2 | Mobile | Persistent bottom navigation and browser bars reduce usable viewport; large spacing and repeated actions | Safe-area aware compact navigation and content spacing; retain touch targets >=44px |
| P2 | Desktop | Current desktop evidence is historical, not new | Inspect 1440px current version before approving changes |

## Proposed visual direction (not approved implementation)

**AMOLED Editorial Gaming:** background `#090B11`, elevated `#121925`, structural `#26354A`, primary text `#EAF1FB`, restrained violet `#9C9AED` and cyan `#73C6E6`. Use typography with full Cyrillic support (evaluate Onest), strong legibility and restrained motion. No copied game IP, generic AI-glow patterns or fabricated player presence.

## Planned implementation batches (do not execute until approval)

1. Design tokens, type scale, navigation, responsive shells, accessibility baseline.
2. Home, editorial feed, post cards, media and real engagement states.
3. Discovery, player results, game filters and LFG cards.
4. Club directory, club profiles, club feed and covers.
5. Profile, onboarding, profile editor, upload affordances.
6. Visual regression, performance budgets, responsive 360/390/430/1440, a11y, security and release verification.

## Repository readiness and next evidence pass

- Clone exact `main` SHA locally and inspect AGENTS.md, release scripts, CSS/component ownership, dependency lock, CI requirements and testing strategy.
- Run app in a local isolated environment **without modifying VDS**; use disposable local database/test accounts. Do not import private production data or credentials.
- Capture real browser screenshots at 360/390/430/1440 px for home, discovery, clubs, profile, profile edit, login and states with editorial data; compare against user screenshots.
- Audit accessibility (contrast, focus, touch, reduced motion, keyboard), network payloads, LCP/CLS/INP where measurable, mobile safe areas, desktop density, navigation and error/empty/loading states.
- Append a separate section **“Local browser verification”** with actual date, command, SHA, environment, screenshot paths, observed defects and confidence; mark anything blocked explicitly.
- Keep Desktop Chromium E2E disabled until explicit user authorization. Preserve required Mobile Chromium, API, Docker, integration, quality gate and public read-only release smoke tests.
- No merge, deployment or application changes without review and explicit go-ahead.

## Local browser verification

**Pending.** No local clone/browser run has been completed at the time of this first commit. Findings above are based on user screenshots and source review only.
