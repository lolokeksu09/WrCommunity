# WrCommunity — Rift Signal identity pass

**Base:** Premium 2.1, `e77c0be134cf58d8f8976fff405a6a0815a24206`.  
**Status:** working branch only; no merge, release, or VDS deployment authorized for this new pass.

## Problem

The supplied mobile screenshots show a tidy dark UI, but the visual hierarchy is built mostly from similar bordered panels. The current home discovery panel is functional yet visually interchangeable with a generic community app. The product lacks a recognizable signature moment.

## Options considered

1. **Character-art splash.** High initial impact, but it risks looking like generic AI-generated game art, introduces asset/license/latency concerns, and competes with community content.
2. **Editorial typography-only.** Clean and fast, but the impact is too subtle to solve the explicit "no wow" feedback.
3. **Rift Signal — recommended.** An original, lightweight topology illustration: three route nodes linked by a single luminous path, with contour lines inspired by tactical map reading. Nodes map to the real destinations **Игроки**, **Клубы**, and **Ищу команду**. The same motif is reused in the optional discovery hero and as restrained brand accents. No claim that any user, queue, event, or match is live.

## Design tokens

- **Void:** `#080B12` — AMOLED canvas.
- **Basalt:** `#111722` — panel surface.
- **Lane:** `#1B2A3D` — route bed and interactive surface.
- **Rift Violet:** `#A78BFA` — route selection / focus accent.
- **River Cyan:** `#5DE1D2` — active route signal, used sparingly.
- **Ice:** `#EAF2FF` — primary text.

**Type:** preserve the existing system sans stack for Cyrillic coverage, fast rendering, and zero external-font requests. Give only the signature heading a tighter display scale/weight; body copy stays quiet and legible.

## Layout sketch

```
[WrCommunity]                                  [search / alerts / profile]
Лента                                                   Найти
Все  Подписки
┌─ Найди своих ──────────────────────────────────────────────────────┐
│  [Игроки] ────── ◇ ────── [Клубы] ────── ◇ ────── [Ищу команду]   │
│  custom Rift contour/path art is behind the real navigation links   │
└─────────────────────────────────────────────────────────────────────┘
[real feed content: author → readable post → actions]
```

On mobile the art remains a compact background and the existing first post stays above the fold; desktop can reveal more of the contour artwork without adding new columns or hiding content. The existing expanded carousel uses the same map language so the compact and expanded states feel like one product.

## Principles

- One memorable visual element, not a glow effect on every component.
- Draw original SVG paths in code; no remote assets, generated faces, fake live indicators, fake counts, or dependency additions.
- Preserve every existing link target, disclosure behavior, session preference, feed ordering, auth/privacy rules, and API/data shape.
- Respect `prefers-reduced-motion`, keyboard focus, contrast, and 44px touch targets.
- Keep the mobile first-post position target and avoid horizontal overflow.

## Acceptance / verification

1. Existing UI guideline check and production web build pass.
2. Playwright verifies the SVG is decorative (`aria-hidden`), all three real destinations remain reachable, disclosure/collapse still works, no JS errors, and no horizontal overflow at 320, 360, 390, 430, and 1440 CSS px.
3. First populated post remains readable near the initial 390px viewport.
4. Inspect screenshots for 390px mobile and 1440px desktop from the exact PR HEAD.
5. Leave the PR unmerged and do not deploy until the owner reviews the visual direction.
