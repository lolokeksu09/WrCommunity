# WrCommunity Premium 2.0 — evidence-led implementation plan

**Date:** 2026-10-27. **Owner direction:** proceed with preparation for the Premium 2.0 upgrade in bounded pull requests, not a big-bang deploy.
**Repository:** `lolokeksu09/WrCommunity`. **Baseline `main`:** `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.
**Planning branch:** `audit/premium-2-preparation-2026-10-27`; **audit:** [PR #43](https://github.com/lolokeksu09/WrCommunity/pull/43).
**Evidence:** [2026-10-27 audited screenshots and isolated Chromium baseline](../../implementation/reviews/2026-10-27-premium-2-audit.md), [2026-10-26 product review](../../implementation/reviews/2026-10-26-premium-v2-audit.md), [candidate visual contract](../../design/premium-v2/design-contract.md) and [design tokens](../../design/premium-v2/tokens.json).
**State:** executable plan; product implementation NOT performed by this planning PR. Design direction is still a candidate, and no visual screenshot approval or public release is implied by this document.

## Goal, priorities and proof

Deliver a polished original, AMOLED-friendly, content-first Wild Rift community without generic gradient clutter, while retaining every supported data/permission/action contract. Correct measurement gaps before changing large amounts of UI.

1. **P0 evidence:** determine *which elements shift*, at what time and under which state before treating CLS scores as proven causes. Baseline: **20/20 read-only guest screenshots** captured at 360×800, 390×844, 430×932, 1440×900; **11/20** reported diagnostic CLS above 0.1; no horizontal overflow or uncaught page error in those captures. Source: [isolated run 40447759826](https://github.com/lolokeksu09/WrCommunity/actions/runs/40447759826), artifact 12709286063 (short retention).
2. **P1 perceived quality:** first viewport prioritizes useful feed/results over a tall discovery banner, pre-expanded filters and generic empty panels. Production screenshots show explicitly labeled editorial posts, so “empty feed” is **not** an accurate present-tense production claim.
3. **P1 identity, trust and navigation:** make editorial posts, club identities, game profiles and LFG visibly distinguishable **without fake players, engagement, membership or online indicators**; preserve profile privacy and actual server ACL.
4. **P2 refinement:** coherent tokens, adaptable 3-column desktop, compact bottom navigation with safe-area protection, accessibility and measured performance.

### Non-negotiable constraints

- Do not rewrite architecture: retain **React 19 / TypeScript / Fastify / PostgreSQL / worker / Docker / Caddy**, routes, request/response contracts, existing RBAC/ACL, moderation and sanctions.
- Maintain existing mobile flows, document title, draft/resume/scroll restoration, server-mediated media access and genuine loading/empty/error states. `prototypes/home/v6/index.html` is historical reference, not to be overwritten.
- **Editorial content must remain visibly editorial.** No disguised bots, invented users, fake counts/likes/online or scraping Riot art.
- No production account/data fixtures, migration, privileged operations, deployment or modification of release settings as part of design planning. Seed fixtures **only** into disposable test environments.
- The automatic Desktop Chromium E2E suite remains disabled by the owner decision of 2026-10-26; manual desktop visual review at 1440px **is still required**.
- Candidate **Onest** font is not part of the first patch: validate Cyrillic, license, cache strategy and load cost before any adoption. Keep working system fallback.
- An isolated screenshot runner is evidence, **not** proof of manual keyboard, screen-reader, production Core Web Vitals or full auth/media coverage.
- Design UI changes only in a new branch/PR, not in PR #43; no merge/deploy before required checks and review.

## Implementation sequence (separate reviewable PRs)

### P2-0 — Attribute CLS and complete evidence

**Primary files:** `scripts/ci/premium-visual-baseline.mjs`, optional dedicated `scripts/ci/` diagnostics helper and `tests/premium-*.test.mjs`, evidence documentation.

- [ ] Record layout-shift `sources` (selector/old/current rectangles with privacy-safe filtering), state timestamps, `PerformanceNavigationTiming`, route-loading removal and responsive viewport diagnostics. Keep aggregation bounded: no DOM text, profile values, cookies or private request bodies.
- [ ] Distinguish cold vs warm visits, no-data vs representative **disposable** data; repeat three cold captures at **360/390/430** and one manual **1440** inspection with deterministic throttling parameters recorded. Ensure field-like CLS session windows are not conflated with raw sum.
- [ ] Add tests for report schema, failures, no external origin and no data mutation. Track baseline and after runs with exact SHA/artifacts and correctly state uncertainty.
- [ ] Investigate `.route-loading` to content layout, `SearchFilters`/preferences, `Discoveries`, images/fonts and sticky shells only **after identifying measured shift sources**.
- [ ] **Gate:** credible attribution evidence for top contributors and repeatable before metrics. Do not “fix CLS” by hiding metrics or suppressing content.

### P2-1 — Design-system foundation and responsive shell

**Primary files:** `web/src/styles.css`, `web/src/main.tsx`; `docs/design/premium-v2/tokens.json` is reference, not automatically imported.

- [ ] Move repeated surface/spacing/typography rules into additive, tested CSS variables and component tokens; change gradually rather than replacing the 50KB+ stylesheet wholesale.
- [ ] Stabilize mobile header/bottom-nav/safe-area and route-loading dimensions **using findings from P2-0**. Preserve `main#main-content`, skip link, semantics, all five mobile actions, desktop sidebar and account/moderation navigation.
- [ ] Check 360/390/430/1440, 200% zoom, focus-visible, 44px touch targets, reduced motion and real keyboard traversal.
- [ ] **Gate:** no introduced horizontal overflow, hidden actions, inaccessible states or regressions; CLS improves relative to repeatable baseline, without claiming production p75.

### P2-2 — Feed, discovery entry and editorial cards

**Primary files:** `web/src/social.tsx`, `web/src/styles.css`; associated feed tests.

- [ ] Refine `Discoveries` initial state/height and move feed context into first viewport without deleting accessible discovery entry, keyboard slide controls or the persisted collapse preference.
- [ ] Distinguish authentic post types using **already available API fields**; prefer content hierarchy, legible Cyrillic and responsive media, not extra empty card borders and fabricated social metadata.
- [ ] Explicit editorial labels remain clear and separate from ranks, moderation roles and other user accounts.
- [ ] **Gate:** real editorial fixtures display the byline and provenance; feed modes `all/following`, reactions, bookmarks, post editor, infinite paging and scroll restoration stay intact; compare before/after mobile and desktop screenshots.

### P2-3 — Player discovery and LFG

**Primary files:** `web/src/lfg-events.tsx`, `web/src/search-filters.tsx`, `web/src/player-journey.tsx`, `web/src/styles.css`.

- [ ] Evaluate compact **initial** advanced filters, while keeping selected criteria visibly listed and accessible with keyboard-managed disclosure.
- [ ] Condense the `SearchPreferences` game-card summary when valid; preserve server/role values, clear reset/apply controls, recommended mode, privacy masking and public-only game fields.
- [ ] LFG listing differentiates server/roles/expiry/action; preserve existing consent/contact/expiry and application semantics. No fake availability.
- [ ] **Gate:** guest + registered + filtered-empty + recommended modes tested; query URL, reset, selection and load-more behavior regressions covered; responsive screenshots including mobile keyboard.

### P2-4 — Clubs and participation

**Primary files:** `web/src/clubs.tsx`, `web/src/club-navigation.tsx`, `web/src/styles.css`; club E2E/API tests for touched behavior.

- [ ] Make catalog tiles, actual cover media, identity/status and joining affordances distinct; meaningful fallback when no image exists. Read original, permitted uploads only.
- [ ] Separate club overview/feed/actions visually without altering closed/private permissions, join modes, member roles, moderation, ownership transfer or audit.
- [ ] **Gate:** public/private, guest/member/owner/pending/archived states and security boundaries pass existing tests, with mobile/desktop screenshot comparison.

### P2-5 — Profile, onboarding and media editor

**Primary files:** `web/src/auth.tsx`, `web/src/player-journey.tsx`, `web/src/profile-editor.tsx`, `web/src/styles.css`, `web/src/profile-editor-state.ts` if justified.

- [ ] Completed `FirstSteps` (2/2) defaults to compact *without removing ability to reopen*, and respects any explicit persisted user choice; review state changes when verification/preferences update.
- [ ] Stronger identity block and actual profile/game fields; never reveal hidden profiles or private game values to another viewer.
- [ ] Replace raw-looking upload controls with a tested accessible select/preview/replace/remove flow, retaining server validation, media ACL, conflict resolution, unsaved drafts and keyboard access. Never persist file contents in localStorage.
- [ ] **Gate:** guest/login, verified/unverified/hidden profile, profile edit/media, 409 conflict and explicit consent tested in disposable accounts on 360/390/430/1440; no changes to data/privacy defaults.

### P2-6 — Release candidate hardening

- [ ] Repeat isolated screenshots for **empty, populated editorial, error/loading, search filtered/unfiltered, public/private clubs, authorized profile and editor** at the 4 target viewports. Attach artifacts and exact SHA per PR.
- [ ] Manual Tab/Shift+Tab/Escape, focus management, screen reader, 200% zoom, virtual keyboard, visible touch areas, contrast (WCAG 2.2 AA body ≥4.5:1, essential UI ≥3:1). Check RTL only if a supported product requirement emerges; no speculative extras.
- [ ] Controlled Lighthouse and repeatable lab LCP/CLS; recognize INP needs real interactions, production p75 requires real-user data. Proposed budgets: LCP ≤2.5s, CLS ≤0.1, INP ≤200ms where method valid; do not claim “passed” when unmeasured.
- [ ] Run `npm run check:ui`, typecheck, build, secret checks and affected tests, then GitHub FULL on **exact Ready PR head**: `api-tests`, mobile `browser-project`, `browser-tests`, `integration`, `docker-smoke`, `quality-gate` all **success**. Keep automatic Desktop E2E off.
- [ ] For **approved** merge only: confirm protected main, RELEASE same SHA, `deploy`, `vds-status`, HTTPS/strict TLS, actual production artifact and active VDS revision. Do not call a PR or passing local screenshot a deployment.

## Dependencies, ordering and rollback

1. Finalize PR #43 evidence + this executable plan; keep it docs-only. Once reviewed, promote/merge it through the required protected-main checks (no automatic product changes on the audit branch).
2. P2-0 attribution is a blocker for CSS layout-shift fixes. Distinct design PRs can be prepared after it, but avoid overlapping `styles.css` changes until the prior PR is integrated and rebased.
3. Each implementation PR: plan reference → test-first for changed behavior → smallest code changes → selected L1–L3 → local isolated before/after browser → FAST → Ready/FULL → release verification. Pause at first blocker, record result, no silent skipped checks.
4. No database/schema migrations intended. UI regression rollback is revert of the relevant UI PR and redeploy through the standard protected pipeline, not manual VDS changes; preserve captured screenshots and auth/ACL regression evidence.

## Tracking

- [x] Existing audit and current public/E2E screenshots inspected.
- [x] Independent real 20-screen Chromium guest baseline with reproducible SHA/runner and CLS observations.
- [x] Scope, dependencies, actual source paths, acceptance conditions and non-goals written here.
- [ ] CLS attribution & multi-run measurements (**P2-0**).
- [ ] Design token/shell proof (**P2-1**).
- [ ] Feed and editorial hierarchy (**P2-2**).
- [ ] Discovery & LFG (**P2-3**).
- [ ] Clubs (**P2-4**).
- [ ] Profile and uploader (**P2-5**).
- [ ] Release readiness (**P2-6**).

**Next single action after this planning PR:** implement a privacy-safe CLS attribution diagnostic on a separate working branch against current `main`, verify with isolated Chromium, and record attributable shift sources before proposing the first UI CSS correction.
