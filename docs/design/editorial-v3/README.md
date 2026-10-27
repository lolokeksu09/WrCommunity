# WrCommunity Editorial V3 — design direction & screen contracts
**Status:** owner-approved direction, implementation tracked separately. **Date:** 27 October 2026.
**Baseline:** production PR #59 (`1345bc2bc7b3bd7ef3aa53cbb46e778985a8975e`); [original community brief](../../specs/social-core-v1.md). Mobile-first web, Russian language.

## Reference study (principles, not copied designs)
- [FACEIT mobile](https://www.faceit.com/en/download/mobile): hierarchy of team/club identity, memberships and context actions. Adopt distinct club header + clear club-state actions, **not** the brand or esports visual assets.
- [E-Pal](https://www.epal.gg/download/): prioritize the human/card and immediate discovery over filters. Adopt search/results first, expose filters on demand; no monetization/engagement gamification.
- [Discord's You Bar](https://discord.com/blog/you-bar): navigation with clear personal context; retain WrCommunity's five-tab bottom navigation and adapt profile activity density without importing Discord components.
- Designer reference [INGAME](https://dribbble.com/shots/20857377-Gaming-app): expressive composition and image hierarchy; inspiration only, not a licensed asset.
Links are design references; no screenshots or external artwork distributed in this repo.

## Ground truth from owner’s mobile screenshots
1. Home: masthead + carousel-like shortcuts take substantial vertical space before first post, especially at 390px.
2. Discovery: uncollapsed multi-field filter form precedes people, consuming initial screen height.
3. Club: broad empty space when no content; identity, role and feed compete for attention.
4. Profile: real cover and avatar are strong but many long link rows extend scroll.
5. Existing strengths: true AMOLED canvas, mint/blue accents, original brand, real data, consent and privacy semantics.

## Layout / interactions
### Home
- Editorial identity should occupy a compact band, not another full promotional hero. Keep visual signature and accessible heading hierarchy.
- Tabs, three real destinations and content remain functional. Real post(s) are the primary visual unit, with distinct authentic editorial label.
- Do not hide publication text or inject fake content.

### Discovery
- One labeled quick search in the main viewport; advanced filters follow in a button-controlled area (collapsed initially when no explicit filter params).
- With active filters, show visible chips and offer reset; preserve existing query params when text search is submitted, except invalidated pagination cursor.
- Results immediately after controls: avatar, nickname, handle and only server/role fields available under API privacy. Show empty state with an honest explanation.
- No duplicated field `name=q` across simultaneous forms; no hidden fetch/synthetic matches.

### Club
- Dossier groups cover, title, public/members-only visibility, join mode, membership state and contextual action.
- Member/visitor content ACL remains server-enforced; when feed is unavailable, explain access and offer only allowed actions. Tabs expose meetings/about/people as before.
- Never display fabricated membership/activity counts.

### Profile
- Identity remains tied to the user's actual cover/avatar/privacy status; first steps and optional game fields retain meaning.
- Activity and membership links use compact grid rather than 7+ horizontal full-width rows. Preserve all hrefs and role gating. Focus order matches DOM order.
- Keep account deletion/logout in settings, not made accidentally prominent.

## Visual system and accessibility
- Existing `web/src/mobile-editorial.css` is the single mobile enhancement layer. Modify existing tokens/layout; **do not add an accumulating premium-v3 CSS import**.
- Background #000000, panels #101722/#121b29, mint #a5f4df, violet #c0aeff. Color must not solely convey privacy/state.
- Target 320–430px. Min 44x44px interactive controls, safe-area-aware bottom nav, readable text at zoom, semantic landmarks, visible focus, prefers-reduced-motion.
- Desktop layout remains functionally intact; do not claim full desktop browser acceptance since project disables that job.

## Acceptance evidence
- Existing player/following, saved profile fields, editor and club ACL tests still pass.
- Added L2 Playwright scenario validates quick search, URL preservation, filter expansion and results, profile route links, club context, mobile width/overflow.
- CI exact-head FAST (Draft) then FULL required checks on Ready. Screenshot evidence home/discover/profile/clubs at 390px from isolated Chromium.
- No production merge/deploy without successful checks and release authorization.

## Outstanding
Physical Android keyboard/IME, OS file picker, TalkBack, real-user CLS/INP, and desktop Chromium automated test remain outside this stage.
