# Premium 2.0 — isolated accessibility evidence and integration gates

Date: 2026-10-27. Base PR #49 SHA `347e1dfa4bbcc6297dbff08d064aa0bfcff2c3f7`. Working branch `audit/premium-2-a11y-release-gates-2026-10-27`. No main merge or VDS delivery.

## Goal and scope
Provide additional **actual enabled mobile Chromium** evidence for authenticated profile/editor/game/privacy at narrow 320 CSS pixels, keyboard reachability of privacy controls, reduced-motion carousel behavior, and create a precise final release decision matrix. Use only isolated test accounts and seeded local CI PostgreSQL/Mailpit.

## Implementation
1. Add a small Playwright spec for profile/editor/game/privacy narrow-width reflow and keyboard interaction, preserving hidden privacy on the server; collect limited synthetic screenshots.
2. Add a guest reduced-motion + keyboard discovery test using `emulateMedia({reducedMotion:'reduce'})` and computed styles, not a simulated screen reader.
3. Register exact test case names in `scripts/ci/e2e-levels.json`, then run **FULL** on exact head with mobile Chromium, API, integration, Docker and quality gate.
4. Review results and write the integration matrix: verified behavior vs unverified real Android picker/keyboard, native 200% browser zoom, actual screen-reader speech, throttled LCP/INP and field CWV.

## Boundaries
- No changes under `web/src`, `server/`, migrations, production content, workflow policy or secrets.
- Desktop Chromium automatic E2E remains disabled. A resized `mobile-chromium` browser is not an actual desktop project.
- 320 CSS px reflow is **not native browser 200% zoom**; checking `prefers-reduced-motion` is **not a complete accessibility audit**.
- PR must remain unmerged. If a test reveals a defect, document it; do not bypass or weaken the check to obtain green.

## Acceptance
Exact head FULL all required jobs **success**; test report includes executable observations and no assertion that manual devices/screen readers were exercised. Update `docs/implementation/CONTINUATION.md` and link final PR evidence. Owner approval is required for any merge/release; merging `main` can trigger production deployment.
