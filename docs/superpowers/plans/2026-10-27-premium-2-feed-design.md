# Premium 2.0 — P2-2 design foundation, compact home and post hierarchy

**Date:** 2026-10-27. **Branch:** `feat/premium-2-feed-design-2026-10-27`, stacked on [PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45) SHA `8165e62e83d48174ac9a2d83b9966e6ed220a31f`. Product main remains `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.

## Approved scope
Replace the old oversized first-screen discovery with a compact always-available path to real features. Improve editorial/ordinary/club post information hierarchy using **existing** authoritative fields only. Establish restrained AMOLED semantic surface, border, typography and spacing tokens applied to home and posts; no rewrite of sitewide architecture, no imported fonts, no decorative AI illustrations.

1. `web/src/social.tsx`: place feed context before discovery; initial compact discovery links for /discover, /clubs, /posts/new, plus user-triggered expanded swipeable carousel for compatibility. Persist user collapse preference; no fake content, preserve gesture+keyboard control.
2. `PostCard`: add visual variant classes based only on `author.editorial` and `club_id` without changing accessible actions, comments, pagination, reactions, hidden data, drafts or moderation menu. Editorial badge remains authentic `AuthorName` label; no fabricated status/likes.
3. `web/src/styles.css`: scoped Premium 2.0 tokens; sober high contrast near-black palette, smaller compact discovery, readable cards, differentiated metadata; responsive 360/390/430/1440 and keyboard/reduced-motion constraints. Preserve PR #45 CLS fix, route loader height and nav size.
4. Update `tests/e2e/home-feed-ux.spec.ts` to cover compact-first discovery, expand/collapse persistence and horizontal-vs-vertical gestures; test first visible post and post interactions.
5. Run isolated real Chromium with PostgreSQL/Mailpit; capture 20 guest viewport screenshots + repeat CLS diagnostics and ideally production-like editorial fixtures from disposable DB. Run targeted L2 mobile and Draft FAST. Remove one-shot workflow from final diff.
6. Document measured before/after evidence and stop as unmerged Draft; protected merge order #43 → #44 → #45 → this PR, only after FULL and owner review.

## Acceptance & fallback
- First public publication visible before y=560 at mobile 390×844 in populated fixture; actual nav/CTA destinations work, 44px touch target minimum.
- No horizontal overflow, broken assets, page errors, accessibility regression or introduced layout shift compared with PR #45; guest loading and error states remain real.
- All existing feed modes, posts, comments, bookmarks, privacy and stateful carousel gestures preserved.
- No production deployment, database operations or settings changes. Revert via PR if regression observed.
