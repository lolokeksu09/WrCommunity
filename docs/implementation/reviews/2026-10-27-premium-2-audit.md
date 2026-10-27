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

## Second evidence pass — recovered source archive and current RELEASE (2026-10-27)

**Scope:** evidence-only update on the same Draft PR #43. No React/CSS, API, SQL, environment, production content or deployment changes.

### Exact revisions, provenance and local environment

- The active base of PR #43 and the latest inspected `main` is **`1077824c8a4d7d7c20f60ca8652e28805dee61eb`**. It passed [RELEASE 40395582321](https://github.com/lolokeksu09/WrCommunity/actions/runs/40395582321): `api-tests`, `browser-project (mobile-chromium)`, `browser-tests`, `integration`, `docker-smoke`, `deploy` and `vds-status` all concluded success. `quality-gate` on main is expected to be skipped.
- Git over HTTPS in the current sandbox was attempted and failed with `Could not resolve host: github.com`; direct API access from the sandbox likewise failed DNS. **A current Git clone was not obtained.**
- Instead, retrieved and extracted the previously generated **full repository source archive** `wrc-premium-audit-source` from [workflow 40382179306](https://github.com/lolokeksu09/WrCommunity/actions/runs/40382179306) to an isolated local working directory. Its code revision is **`2ef65bd03bd139372bfb6ae543fa59cbd480e236`**, not the current main SHA; it is a `git archive` snapshot without `.git` metadata.
- Verified [GitHub compare 2ef65bd… → 1077824…](https://github.com/lolokeksu09/WrCommunity/compare/2ef65bd03bd139372bfb6ae543fa59cbd480e236...1077824c8a4d7d7c20f60ca8652e28805dee61eb): 17 commits changed only documentation, `package.json`, smoke/CI scripts and tests. **No `web/src` or `server/` code changed across this range.** Thus the archived React/CSS sources are representative of current `main` UI code, but the archive is not an exact clean checkout of current main.
- Reviewed the local extracted `web/src/main.tsx`, `social.tsx`, `clubs.tsx`, `lfg-events.tsx`, `profile-editor.tsx`, `search-filters.tsx` and `styles.css`, in addition to live GitHub `AGENTS.md`, `CONTINUATION.md`, `LOCAL-DEVELOPMENT.md`, `PREMIUM-V2-BASELINE.md`, candidate design contract, `package.json` and the PR state.
- Local runtime has Node **22.16.0** and npm **10.9.2**, while `package.json` requires Node 24.19+ and npm 11; Docker and dependencies are absent, and external DNS is blocked. **No current local backend, PostgreSQL, Playwright site navigation, isolated accounts, local live viewport screenshots or Lighthouse run was executed.** The installed Chromium binary alone does not establish browser verification.

### Current public site: actual RELEASE screenshot evidence

Downloaded and visually inspected the **`deployed-public-site`** artifact (artifact `12687841175`) of [RELEASE 40395582321](https://github.com/lolokeksu09/WrCommunity/actions/runs/40395582321), produced **2026-10-26 20:43 UTC**. Files: `home-390.png` (390 px full-page), `home-1440.png` (1440 px full-page), `login-390.png`, `login-1440.png` and `report.json`. The report records HTTP 200, `feedRendered=true`, login form present, and `overflow=false` for both 390 and 1440. These are automation observations plus actual viewed screenshots, **not** direct interactive local browser inspection or field performance data.

| ID | Priority | Confirmed current production visual finding | Implementation implication |
|---|---|---|---|
| P2-E01 | P1 | **The feed is no longer empty.** The 390/1440 screenshots show multiple substantive posts from accounts visibly labelled **«Редакция»** (for example `Центр · редакция`, `Штаб · редакция`). | Supersedes the original empty-feed assumption for this captured production state. Do not advertise editorial accounts as real members; preserve transparent labels and real backend data. |
| P2-E02 | P1 | At 390px the expanded discovery carousel occupies a large area before the `Лента` heading; feed text starts substantially below header and banner. Desktop has the same discovery module before content. | Feed-first information hierarchy; retain discovery with compact entry and do not remove controls without an alternative. |
| P2-E03 | P1 | Repeated text-dominant posts, uniform author monogram avatars and separators make the long page visually monotonous; even editorial, club and player materials share a similar visual rhythm. | Distinct editorial/article, club update and ordinary post layouts; varying hierarchy using authentic media only, without fake engagement or automated identity masking. |
| P2-E04 | P2 | At 1440px the right sidebar emphasizes static slogans, repeated discovery links and signup prompts; it contributes little content-specific utility. | Contextual rail keyed to the route/data, with real LFG/club content only when present and permitted. |
| P2-E05 | P2 | Login at 390px has functional labeled email/password inputs, primary action and recovery/signup links; large top spacing and persistent bottom navigation consume visible height. | Tighten spacing if supported by task testing, but retain labels, keyboard access, touch targets and auth/recovery behavior. |
| P2-E06 | Verification | Latest public smoke no longer captured the unresolved loading screen: `feedRendered=true` and displayed posts in the artifact. | Historical QA-01 should be reported as **addressed in code and passing this smoke**, not newly unresolved; screenshot evidence alone does not prove network/user-performance reliability. |

### Current isolated browser E2E evidence (not production accounts)

Downloaded and inspected `browser-evidence-mobile-chromium` (artifact `12686323718`) from the **same** RELEASE. The artifact includes current test screenshots named `home-360.png`, `home-390.png`, `home-430.png`, `home-1440.png`, `compact-filters.png`, `profile-steps.png`, `clubs.png`, `club-feed.png`, plus loading/empty/error states and other scenarios. These images use **disposable E2E fixtures and generated account names**; screenshots in `docs/evidence/screens/` bundled alongside them are older checked-in fixtures and must not be misdated.

- `profile-steps.png`: the onboarding panel is still expanded and visually prominent even at **«Готово: 2 из 2»**. The synthetic user has a visibly hidden profile; privacy indicators must remain intact.
- `compact-filters.png`: filtering chips and controls appear ahead of a large empty-state card; screenshot confirms a valid filtered-no-results state, not a production failure. Preserve reset and transparent filter criteria.
- `clubs.png` and `club-feed.png`: tests show functional club differentiation, actions, membership cues and repeated abstract/montage-style fallback images; custom covers should come from authorized club assets rather than implied real users.
- Device screenshots include long-page/full-page captures or browser UI under automation; their apparent page length should not be confused with a single screen's viewport. No claim of keyboard, accessibility or quantitative performance pass from merely viewing them.

### Corrections to the first audit and open release gates

1. **Corrected evidence:** The first-stage concern about an empty publication feed was accurate for the supplied older screenshots, but **not for the 2026-10-26 20:43 UTC public RELEASE capture**. Prioritize content composition and hierarchy over artificial filling. Editorial data appears live; exact current database counts and ingestion method were **not** checked.
2. **QA-01:** `scripts/live-site-check.mjs` now checks fully rendered content using `public-home-ready` logic; the current RELEASE evidence passed. Do not re-open the prior smoke defect without new failure evidence.
3. **Current local-browser gap:** An actual localhost React/API run at `main` SHA, 20 scripted screenshots from `premium-visual-baseline.mjs` and first-hand authenticated interactions are still missing. A GitHub runner screenshot and a recovered older source archive partially answer the inspection request; they are **not a substitute** for the requested local live browser session.
4. **Design direction:** `docs/design/premium-v2` contains a *candidate* visual contract/preview, not production UI. The product has **not** been redesigned. No decisions to alter ACL, moderation, protected data, CI Desktop E2E or live content are authorized by this audit.
5. **Pre-implementation gates:** Obtain an actual isolated Node24/npm11/Postgres/Chromium baseline from exact latest main, record 360×800, 390×844, 430×932 and 1440×900 across the relevant states; capture authenticated profile/editor with disposable identities; perform interactive keyboard/zoom/ARIA checks and measured Lighthouse/CWV lab baseline. Then approve screen-by-screen changes and implement in bounded PRs with mobile CI, documented before/after screenshots and release verification.
6. **Do not enable Desktop Chromium automatic E2E** until expressly requested. Manual 1440px visual inspection is not a change to that policy.

**Verification status:** retrieved existing source archive and real current RELEASE evidence; manually inspected captured screens; compared commit ranges and reviewed source; did **not** run app locally or claim new browser interaction. PR #43 remains Draft, docs-only and unmerged.



## Isolated browser baseline — executed (2026-10-27)

**Evidence, not an application patch.** The blocked ChatGPT container still lacks a supported Node 24/Docker/network configuration. To execute the requested local browser baseline, a **disposable GitHub-hosted Ubuntu 24.04 runner** launched the application on its own **`http://127.0.0.1:13000`**, with Node **24.22.1**, an isolated PostgreSQL **18.6** `wrcommunity_test`, Mailpit, `npm ci`, `npm run build`, `npm run migrate`, and headless Chromium. The runner used only the published `scripts/ci/premium-visual-baseline.mjs` in read-only mode; no live user account, VDS, production database or website was accessed.

- Successful evidence run: [GitHub Actions 40447759826](https://github.com/lolokeksu09/WrCommunity/actions/runs/40447759826), commit `d6ed3b92e289f537ae401e7551b058203e0d9aef` on the audit branch. The runner's local app and browser both ran successfully. This SHA differs from `main` **only through documentation and a temporary audit workflow**, not product source changes.
- Archive: workflow artifact `premium-2-isolated-baseline` (artifact **12709286063**) with `report.json`, `source-sha.txt` and **20 real full-page PNGs**. Recorded creation: `2026-10-27T04:05:50.162Z`. Workflow artifacts have limited retention; preserve the archive outside GitHub Actions if long-term screenshots are required.
- Exact viewports: **360×800, 390×844, 430×932 and 1440×900**; guest routes **`/`**, **`/discover`**, **`/discover/lfg`**, **`/clubs`**, **`/login`**.
- **20/20 captured, 0 script failures**. All tested screens rendered expected headings; no detected horizontal overflow (document `scrollWidth === innerWidth`), broken loaded images, or uncaught JS `pageerror`. This does *not* certify all assets, network/API errors or accessibility.
- Baseline images depict **isolated empty test data**, not published production posts; the RELEASE 40395582321 images above independently confirm that the actual VDS feed was editorially populated.

### Initial layout stability diagnosis

The runner's PerformanceObserver returned the following **diagnostic** cumulative layout shift (CLS) values. Columns correspond to `feed / players / lfg / clubs / login` on the isolated **guest** instance, in that order.

| Viewport | Feed CLS | Players CLS | LFG CLS | Clubs CLS | Login CLS |
|---|---:|---:|---:|---:|---:|
| 360×800 | 0.320 | 0.331 | 0.216 | 0.103 | 0.113 |
| 390×844 | 0.256 | 0.243 | 0.157 | 0.098 | 0.108 |
| 430×932 | 0.145 | 0.133 | 0.088 | 0.088 | 0.097 |
| 1440×900 | 0.050 | 0.053 | 0.053 | 0.053 | 0.060 |

**Finding P2-CLS-01 / P1:** **11 of 20** guest laboratory captures exceeded the proposed CLS **0.1** budget, especially feed, players and LFG at 360/390 px; **none** of the five 1440px captures did. The script observed unthrottled lab LCP values between **188 and 560 ms**; these values are timing hints, **not production p75 Core Web Vitals or audited Lighthouse scores**. INP was **not measured**. A single synthetic run cannot determine field CLS or definitively identify the layout-shift source. **Next implementation prerequisite:** instrument `layout-shift.sources`, examine transitions from `.route-loading` to populated route and responsive sticky navigation, rerun with CPU/network throttling and real-but-disposable fixture data before setting CSS fixes. Do not assert those elements caused the shifts without attribution evidence.

### Visual review of the 20 PNGs

- **Guest feed (390/1440):** large discovery banner and indicator sit above the feed title. With empty local data, the oversized empty-state card is the only primary content. On 1440px the side columns leave substantial functional whitespace; the right rail is mostly static.
- **Guest discovery (390):** expanded multi-field filter occupies most of the visible screen and pushes the no-results panel below the fold; users cannot immediately assess results without scrolling. Default compact filter state remains a candidate.
- **Guest LFG (390):** filter controls followed by large empty panel; the LFG-specific information hierarchy relies on copy/form rather than recognizable listing treatment.
- **Login and clubs:** both rendered across all four sizes; their current empty/guest visual state is captured and can serve as a before-image, not as evidence for authenticated interactions.
- **Safe-area/navigation:** bottom nav appears in the mobile captures and consumes vertical space. Horizontal width measurement passed; manual scrolling, virtual keyboard, 200% zoom and screen reader behavior remain **not run**.

### Evidence gates after baseline

| Gate | Outcome |
|---|---|
| Current-source UI and isolated PostgreSQL actually launched in real Chromium | **Pass on GitHub runner** (not ChatGPT local container) |
| 5 routes × 4 viewports, real PNG artifacts and diagnostic report | **20/20 pass** |
| Browser JS exceptions, horizontal overflow, broken completed images | **0 detected** in this script |
| CLS ≤0.1 for all isolated guest captures | **Fail: 11/20 over target** (diagnostic, not release-performance guarantee) |
| Fresh authenticated profile/editor and media flows on same isolated runner | **Not tested**; separate latest RELEASE E2E artifacts exist |
| Manual keyboard, focus, zoom, screen reader and Lighthouse with throttling | **Not tested** |
| Product changes / VDS changes / Desktop Chromium E2E | **None / none / stays disabled** |

The temporary workflow used to collect this baseline is removed from the audit PR after the artifact is obtained, so the final PR is documentation-only. **Do not treat visual planning or this evidence as approval to implement/release Premium 2.0.**

## Additional independent evidence check — 2026-10-27 (local archive + inspected artifacts)

**Scope:** documentation-only continuation. This check preserves the existing isolated Chromium baseline and corrects the distinction between local browsing, review of recorded captures and actual production. No CSS, React, API, tests, CI policy, database or deployed VDS were modified.

### Local source copy and direct browser limitation

- Recovered GitHub Actions `wrc-premium-audit-source` (run [40382179306](https://github.com/lolokeksu09/WrCommunity/actions/runs/40382179306), artifact **12679356493**, bundled `wrc-audit-source.tar.gz`) and matching built `dist/` artifact **12677558517** into the current isolated working directory (`/mnt/data/WrCommunity-local`). The recovered **archive is `2ef65bd03bd139372bfb6ae543fa59cbd480e236`, not a checkout of current HEAD**; it has no `.git` history.
- Independently compared `2ef65bd…` with `main` `1077824c8a4d7d7c20f60ca8652e28805dee61eb` using GitHub's compare endpoint: 17 intervening commits, 15 changed paths, **none under `web/src/` or `server/`**. The archive therefore contains the same React/CSS and API implementation at the observed main revision; some testing/build script and package metadata are older.
- A local HTTP static host and Playwright script attempted to open the actual archived `dist/web` at `http://127.0.0.1:18765/me` using installed Chromium **144.0.7559.96**. Navigation failed with **`net::ERR_BLOCKED_BY_ADMINISTRATOR`**. A separate `data:` URL was similarly blocked. This is a **browser-environment permission limitation**, not evidence of a WrCommunity runtime failure. The script could not take any authenticated screenshots or validate the mock fixture against a running page. The fake profile/session fixtures were entirely local, and no requests were sent to VDS. **Do not count this as an interactive browser pass.**
- This container also has Node 22/npm 10 rather than the repository's required Node 24/npm 11, no supported Docker/Postgres and no outbound DNS. Do not report a local full-stack run or production performance from it. The independently proven real browser run remains the disposable GitHub-hosted baseline [40447759826](https://github.com/lolokeksu09/WrCommunity/actions/runs/40447759826).

### Independently inspected reproducible visual evidence

- Downloaded and unpacked existing **20 PNG + JSON** screenshots from artifact **12709286063** of run **40447759826**. Recomputed from `report.json`: **20/20** successful guest captures; **20/20** without measured horizontal document overflow; **0** broken completed images; **11/20** unthrottled diagnostic CLS readings greater than **0.1**. This corroborates, rather than duplicates or supersedes, the executed-baseline section above. Measurement origin is **isolated 127.0.0.1**, not VDS.
- Downloaded the public production smoke artifact **12687841175** of [RELEASE 40395582321](https://github.com/lolokeksu09/WrCommunity/actions/runs/40395582321). Its `report.json` records HTTP 200 homepage and rendered feed, usable login form and no measured page overflow at 390/1440 px, timestamp **2026-10-26T20:43:37.276Z**. Actual `home-390.png` shows labeled editorial authors and published posts with the expandable discovery hero above the feed. **Do not describe today's production feed as empty.** The first visible post starts after the hero/its controls and the feed headings, supporting the **content-first hierarchy** proposal without proving a particular scroll or conversion rate.
- Downloaded **12686323718** from the same RELEASE, which includes **isolated E2E fixtures**: `profile-steps.png`, `compact-filters.png`, `club-feed.png`, `club-events.png` and more. `profile-steps.png` shows the **2/2 completed** first-steps panel still open and consuming the profile's visible space; `compact-filters.png` shows a valid no-match view with filter-reset controls; club feed/events confirm actual distinct UI structures without guaranteeing any particular production club configuration. These are test fixtures, **not screenshots of real members, rankings, interactions or profiles**.
- Full-page production `home-390.png` measures **390×9140 pixels** and isolated empty-state `feed-390.png` measures **390×1055 pixels**. This difference documents **different content density**, not network cost, real-user scroll depth, an overflow defect or a valid performance comparison.

### Additional design decision points derived from this cross-check

1. **P1 — Above-fold editorial feed:** prioritize the first meaningful post over repeated discovery promotion; preserve hero discoverability and user collapse preference rather than blindly removing it. Design success metric: screenshot comparison of first meaningful post position at 360/390/430 with both hero states and an actual multi-post fixture.
2. **P1 — Completed onboarding:** when two steps are truly complete, default to a compact, re-expandable summary; do not remove user guidance or change public/hidden privacy semantics. Evaluate the profile first viewport before/after.
3. **P1 — Distinguish test and live states:** the empty gallery images and historical generated handles are diagnostic fixtures. Baseline UX acceptance must include *both* genuine-content-density and empty/error/loading states. Never fill activity metrics with fabricated likes, followers or online status to improve aesthetics.
4. **P0 — CLS instrumentation:** the 11/20 out-of-budget scores justify focused investigation, but **source attribution is still required**. A shifted loading placeholder, route replacement, fonts and sticky elements are hypotheses, not confirmed causes. Instrument before changing layout. PR [#44](https://github.com/lolokeksu09/WrCommunity/pull/44) should be reviewed on its own evidence and not treated as a merged fix.
5. **Unresolved local gate:** a first-hand authenticated browser run in a supported isolated runner (not this administratively restricted Chromium), plus manual keyboard/zoom/a11y checks and controlled throttled performance metrics, remain necessary before declaring Premium 2.0 design ready.

**Change boundary:** this is audit evidence, not approval for implementation. PR #43 is retained as the planning record. Keep automatic Desktop Chromium E2E disabled until the owner explicitly changes that instruction.
