# WrCommunity — route code splitting and mobile loading UX

**Status:** draft PR open; CI verification pending.\n\n**PR:** [#37](https://github.com/lolokeksu09/WrCommunity/pull/37)  
**Base SHA:** `3bcf29661f3f5ac4c93580ee31c485cefd3cda5e`  
**Working branch:** `perf/route-splitting-mobile-ux-2026-10-26`  
**Scope:** frontend performance and loading UX only; no API, database, auth-policy, or production-data changes.

## Findings

- `web/src/main.tsx` statically imports route components from social, clubs, LFG/events, moderation/notifications, profile editor, and auth pages. This makes unrelated feature modules part of the initial dependency graph.
- `Shell` also imports reset helpers from feature modules, preventing some of those modules from being deferred.
- The app already has mobile navigation, safe-area padding, and reduced-motion support; preserve these contracts.

## Changes

1. Extract the profile-editor draft reset map into a small state module so the reset operation remains synchronous without importing the editor UI into the entry bundle.
2. Move the shared `Gate`/`useSession` helpers into `web/src/auth-session.tsx`; retain re-exports from `auth.tsx` for compatibility and point internal shared-helper imports at the small module.
3. Convert route page modules in `web/src/main.tsx` to typed React lazy imports. Keep route loaders, paths, redirects, and error boundaries unchanged.
4. Add an accessible in-content Suspense fallback that preserves the app shell/navigation while a route chunk loads, and honors reduced-motion settings.
5. Emit Vite's build manifest and add a CI-enforced bundle check that verifies the heavy route modules are direct dynamic imports and reports initial entry raw/gzip bytes. Do not invent a hard byte budget without a measured baseline.
6. Update the UI guideline check only if needed, and update continuation/status notes with exact SHA and verification evidence.

## Acceptance

- [x] `main.tsx` now uses typed lazy imports for 47 page component exports; `Gate`/`useSession` and profile-editor reset state are separated from page-heavy modules.
- [ ] Vite emits a manifest and `npm run check:bundle` verifies the 9 heavy route modules are dynamic imports and reports raw/gzip entry size.
- [ ] `npm run typecheck`, `npm run check:ui`, `npm run build`, and relevant mobile/desktop E2E checks pass on the final PR head.
- [ ] Existing routes, loader data, auth redirects, draft reset behavior, and error boundaries remain unchanged.
- [x] Mobile route loading has an accessible Suspense status while the shell/nav remain mounted; the spinner uses existing global reduced-motion handling.
- [ ] No local visual review is claimed unless actually run; if local browser setup is unavailable, record the reason and rely on CI artifacts as an explicitly limited alternative.
- [ ] PR FULL passes before merge; after merge, verify RELEASE, deploy, strict HTTPS, and `vds-status` for the exact merge SHA.

## Implementation snapshot\n\n- Code split commit: `26331930246e7b88df0254ff2258cef1fb388e6b` (route component lazy imports and shared session/reset helpers).\n- Bundle guard/config/mobile fallback commit: `1763e09e93ff3f0a2fa2a60bed97ac106d89294a`.\n- Initial FAST at that SHA failed during `npm run build`; the failing job logs were not available from the connector. Inspection confirmed Vite uses `web/index.html` as the HTML entry. The guard now prefers the `index.html` entry and falls back to the `main.tsx` module, accommodating both manifest shapes; verify this fix on the new SHA.\n- Draft PR [#37](https://github.com/lolokeksu09/WrCommunity/pull/37) opened. CI for the previous head is not sufficient after documentation edits; verify the latest head before marking ready.\n\n## Risks and constraints

- `auth.tsx`, `social.tsx`, and `clubs.tsx` currently share components and utilities. Preserve public exports and test direct navigation, not just in-app links.
- Avoid route path/loader rewrites and avoid changing behavior unrelated to loading.
- No production data, secrets, or VDS configuration should be touched.
