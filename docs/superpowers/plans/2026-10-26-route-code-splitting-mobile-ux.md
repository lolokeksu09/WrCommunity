# WrCommunity — route code splitting and mobile loading UX

**Status:** implementation in progress.  
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

- [ ] `main.tsx` does not statically import the heavy route component modules.
- [ ] Build manifest confirms route modules are dynamically imported from the main entry; bundle check reports entry raw/gzip sizes.
- [ ] `npm run typecheck`, `npm run check:ui`, `npm run build`, and relevant mobile/desktop E2E checks pass on the final PR head.
- [ ] Existing routes, loader data, auth redirects, draft reset behavior, and error boundaries remain unchanged.
- [ ] Mobile route loading has an accessible status, retains navigation, and respects `prefers-reduced-motion`.
- [ ] No local visual review is claimed unless actually run; if local browser setup is unavailable, record the reason and rely on CI artifacts as an explicitly limited alternative.
- [ ] PR FULL passes before merge; after merge, verify RELEASE, deploy, strict HTTPS, and `vds-status` for the exact merge SHA.

## Risks and constraints

- `auth.tsx`, `social.tsx`, and `clubs.tsx` currently share components and utilities. Preserve public exports and test direct navigation, not just in-app links.
- Avoid route path/loader rewrites and avoid changing behavior unrelated to loading.
- No production data, secrets, or VDS configuration should be touched.
