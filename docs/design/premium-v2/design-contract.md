# WrCommunity Premium 2.0 — design language & state contracts

**State:** candidate specification for owner review; none of these tokens are imported into `web/src/styles.css`. Source of truth: [2026-10-26 audit](../../implementation/reviews/2026-10-26-premium-v2-audit.md). Tokens: [tokens.json](tokens.json). Visual concept: [standalone preview](premium-preview.html).

## Product intention

AMOLED Editorial Gaming: content-first interface for Russian-speaking Wild Rift fans. Dark near-black canvas, high-contrast typography, restrained cool-accent signaling, original visual identity distinct from Discord/Reddit/Riot. Existing v6 IA, API/ACL, privacy, club permissions and moderation stay binding. The candidate Onest font needs license/Cyrillic/latency validation before shipping; use installed system fallback otherwise.

## Comparison of current UX vs proposal

| Route | Current observable cost | Target Premium design (proposal) | Must preserve |
|---|---|---|---|
| `/` | Expanded discovery banner precedes publications | Compact discovery strip below essential feed controls; prominent author, topic and post text; nuanced editorial badge | All/following, reactions, tags, post drafts, ACL, restore scroll |
| `/discover` | Large card + fully open filters hide results | Compact profile preferences summary with one-line selected criteria; results before advanced settings | Privacy masking, manual game data warnings, filters/reset/recommendations |
| `/discover/lfg` | Form-led entrance, little LFG distinction | LFG-specific cards with role/region/availability and explicit apply CTA; filters collapsed | Expiry, allowed contact sharing, application policy, hidden identities |
| `/clubs` | Homogeneous list and abstract fallback | Independent club tiles using original cover, tags, clear member/permission states | Guest/member/owner, join-mode, feed visibility, moderation |
| `/me` | Large cover + early onboarding checklist | Clear identity block, game identity and next action; completed onboarding condenses | Hidden default, per-field visibility, verification, account settings |
| `/me/edit` | Native image selector and large whitespace | Accessible upload dropzone with thumbnail, replace/remove/revert controls | Multipart validation, image ACL, conflict resolution, drafts |

## Component contracts (pre-implementation)

- **PageLayout** — single semantic `main`; mobile 360px no horizontal overflow; sticky navigation respects `env(safe-area-inset-bottom)`; essential content not hidden underneath it.
- **FeedCard** — author name and transparent editorial label distinct from role/rank; 16px body; optional media aspect ratio; actions have accessible names and ≥44px targets. Do not display fake counts or current match state.
- **ClubTile** — shape/media differentiation without relying on color alone; visibility and join-mode labels; no implied membership for anonymous users.
- **LfgTile** — role, server, available slots only when genuinely available in the API; expiry shown as date/time. Expired objects cannot be advertised as open.
- **PlayerIdentity** — profile picture fallback / server / roles / preferences; only API-public game fields. Hidden profile remains hidden.
- **FilterSheet** — keyboard and focus-managed disclosure, selected filters immediately visible, reset returns to default. No auto-apply on accidental focus loss.
- **AssetUploader** — JPEG/PNG/WebP, accessible upload label, visible status/error, replace/remove/revert where permitted; no public media leakage.

## Required states for each component

Loading / empty / results / error / offline-or-retry; guest / registered-unverified / verified / hidden / moderation-restricted as relevant. Club screens additionally public-private, owner-member-guest. Capture at 360×800, 390×844, 430×932, 1440×900. Include 200% zoom, keyboard order, focus-visible, high contrast, reduced motion and 44px hit targets. Do not create visible clickable controls with no supported action.

## Visual layout wireframes

### Mobile feed (~390 CSS px)

```
┌────────────────────────────────────┐
│ Logo   WrCommunity   Search  Alerts│
│ Лента         [Все][Подписки]      │
│ [Темы · Подобрать игроков]         │
│ ┌────────────────────────────────┐ │
│ │ [Avatar] Редакция   · Тема    │ │
│ │ Как решить спорный момент...  │ │
│ │ #лес #макро                    │ │
│ │ [♥] Нравится [↩] Ответить     │ │
│ └────────────────────────────────┘ │
│ ... следующая публикация ...       │
│ Лента Поиск  Создать Клубы Профиль │
└────────────────────────────────────┘
```

### Mobile player discovery

```
┌────────────────────────────────────┐
│ Найти своих                        │
│ [Игроки] [Команда] [Для тебя]      │
│ [EU · Лес  x] [Фильтры ⚙]          │
│ ┌────────────────────────────────┐ │
│ │ Игровые параметры игрока      │ │
│ │ Роли · Сервер · Предпочтения   │ │
│ │ [Открыть профиль]             │ │
│ └────────────────────────────────┘ │
│ ... реальная выдача / empty state  │
└────────────────────────────────────┘
```

### Desktop (1440 px)

Sidebar 220–240px (navigation and create), feed 620–700px (reading hierarchy, not extreme width), contextual right rail 250–290px (clubs/LFG in appropriate state only). Preserve meaningful whitespace, never fill it with invented online or fake activity.

## Accessibility/performance release gates (proposals)

- WCAG 2.2 AA contrast: body text ≥4.5:1; nontext essential UI boundaries ≥3:1; confirm *computed* CSS against actual adjacent surfaces. Proposed palette checked by the token unit test, but **does not prove entire UI WCAG compliance**.
- LCP target ≤2.5s, CLS ≤0.1, INP ≤200ms at p75 with real-user or repeatable controlled measurement; baseline runner collects **diagnostic** LCP/CLS only, not field INP.
- All active inputs labeled; screen reader and keyboard manual checks required. Empty/stalled loaders fail quality gates. Preserve existing route splitting and saved drafts.
- Automated desktop Chromium E2E remains disabled; local manual desktop screenshot is allowed.

## Before the first implementation PR

Approve screen comparison direction; capture a valid local browser baseline; obtain actual non-sensitive representative fixture data; audit third-party font license; record LCP/CLS/accessibility findings. Then split into UI-focused PRs rather than overriding all CSS at once.
