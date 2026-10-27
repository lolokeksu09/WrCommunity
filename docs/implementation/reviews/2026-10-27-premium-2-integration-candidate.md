# Premium 2.0 — isolated combined integration candidate (27 October 2026)

**Purpose:** Test the final combined composition of four separately developed PRs against the unchanged `main` code, **without merging any PR into main or triggering a RELEASE/VDS deployment**.

## Provenance

- Authoritative `main` at preparation: `1077824c8a4d7d7c20f60ca8652e28805dee61eb`.
- [PR #43](https://github.com/lolokeksu09/WrCommunity/pull/43): documentation-only audit and seven-stage rollout plan, final head `b00c15b36345fe97af9a63f3afa75823973086ad`. Both original documents `docs/implementation/reviews/2026-10-27-premium-2-audit.md` and `docs/superpowers/plans/2026-10-27-premium-2-implementation.md` were copied byte-for-byte from that PR to this integration branch. The historical continuation from that branch is summarized, not copied over newer #44–46 handoffs.
- [PR #44](https://github.com/lolokeksu09/WrCommunity/pull/44): CLS instrumentation, original head `e788acaf0b7065d4080c1a0aeca1f7388f4f935c`, included by normal Git ancestry of subsequent branches.
- [PR #45](https://github.com/lolokeksu09/WrCommunity/pull/45): shell geometry and layout stability, original head `8165e62e83d48174ac9a2d83b9966e6ed220a31f`, included by ancestry.
- [PR #46](https://github.com/lolokeksu09/WrCommunity/pull/46): compact editorial feed and six focused E2E tests, head `2c9367b891b192d5c439627aaeb5885ab89f8485`; this branch was created from that exact commit.
- **Combination method:** #44 → #45 → #46 is direct ancestry. Two novel #43 document files are brought in explicitly; no reverse merge to main, no CI-policy/release changes, no local production data manipulation.

## Existing independent evidence

- #43 [FULL 40454276661](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454276661) on its exact head: API, mobile Chromium, browser-tests, integration, docker-smoke, quality-gate all succeeded.
- #44 [FULL 40454680744](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454680744) on its exact head: API, mobile Chromium, browser-tests, integration, docker-smoke, quality-gate all succeeded.
- #45 [20-screen local Chromium 40451128776](https://github.com/lolokeksu09/WrCommunity/actions/runs/40451128776): CLS >0.1 decreased 11/20 → 0/20 on isolated guest captures. Laboratory result, not real-user CWV.
- #46 [six targeted browser tests 40453786018](https://github.com/lolokeksu09/WrCommunity/actions/runs/40453786018): synthetic editorial display at 390/1440, >4.5 contrast for post body, keyboard skip link/Enter/ArrowRight/Escape, 320px reflow, 20 guest screenshots; passed. Backend editorial seed, 200% browser zoom, screen reader and real Android keyboard were **not** independently audited.
- #46 [FAST 40454211780](https://github.com/lolokeksu09/WrCommunity/actions/runs/40454211780) passed on its exact head.
- #45 and #46 Ready FULL are separately requested in GitHub (check their final conclusions before any claimed pass).
- **This combined branch requires its own exact-head FULL** before treating the union as integrated. Target and commit identities must be recorded once run completes; prior individual runs alone do not certify the union.

## Integration gates and production boundary

1. Ensure this branch PR targets `main`, is Ready (not Draft) to trigger FULL and all mandatory jobs succeed on the **exact final head**. Automatic Desktop Chromium stays off by owner decision, and skipped deploy/vds-status on a PR are expected.
2. Check `AGENTS.md`, protected-main rule, secrets, UI guidelines, source tree and image/test evidence. Do not claim sitewide WCAG, field INP/LCP, a genuine 200% zoom or production editorial seeding without separate evidence.
3. **No merges into `main` in this preparation task.** In this repository, updating `main` can initiate an automatic RELEASE/deployment to VDS. The integration PR is solely a reviewable dry-run of the complete composition.
4. Before actual publication, choose whether to merge original PRs sequentially (#43, #44, #45, #46) or merge this validated aggregate instead. Avoid merging both paths (duplicate releases/PR conflict). Refresh stale base refs and check original PR authorship/permissions.
5. After explicitly authorized production delivery: require exactly matching `main` SHA, RELEASE success, deploy, strict HTTPS, VDS active revision and public mobile/desktop screenshot smoke. Abort release if verification fails and use established rollback controller.

**Single next action after a green integration FULL:** perform outstanding owner review and real 200% browser zoom/authenticated-state checks, then authorize release route. Do not merge/deploy automatically here.
