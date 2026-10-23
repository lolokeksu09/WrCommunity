# Independent security and specification review

Reviewed the implementation from baseline `28a2a84` through `69ec004`, plus the current working changes, against `CONTRACT.md`, approved Social Core §15, Functional Specification, and Product Decisions v1.1. This is a targeted API authorization, privacy, concurrency, and feature-completeness review; it does not assert production readiness.

## Findings and resolution

| Finding | Reproduction and consequence | Resolution |
| --- | --- | --- |
| Verified status was checked before, rather than after, account locks in event and LFG mutations. | Resolve a verified request, block its account row lock, clear `verified_at` and revoke sessions as an email change does, then release the lock. Event registration and LFG acceptance originally returned 200 and changed data. | Root added `assertCurrentActor` after account locks in event and LFG mutation paths. Both deterministic regressions now pass. |
| Platform club restriction could be undone by its owner. | Platform moderator archives a reported club, then the owner calls `PATCH /clubs/:id` with `state: active`. Owner and platform archives shared a state, allowing the owner to reverse the decision. Functional Specification §9 forbids club leadership bypassing platform decisions. | Root introduced a persistent platform restriction, blocked owner settings while restricted, and a separate audited platform restore operation. Regression passed during the initial test run. |
| Authorized reviewers could not inspect submitted club images. | The club moderation queue returned pending revision image IDs, but media ACL only considered `current_revision_id`, which is unset on new submissions and still points at the approved revision on edits. Reviewer image requests returned 404. | Root added media access for the current authorized club review scope. Regression also covers outsider denial, revoked review role, and author becoming hidden. |
| Club comment postmoderation and scoped report handling were absent. | Ordinary comment deletion only affected the author; platform removal required a global moderator. A club owner/admin/moderator could not remove another member's violating comment. | Root added scoped comment removal, report queue/decisions, audit entries, and `can_moderate` hints. Regressions cover effective removal, outsider denial, cross-club report denial, and omission of reporter identity. |
| Club deletion workflow was absent. | Owners could archive clubs but no confirmed deletion operation existed. Account deletion rejected all nondeleted owned clubs, leaving ownership transfer as the sole route to account deletion. Product Decision OD-04 requires a separate confirmed club deletion procedure. | Reported to root for implementation and UI integration. |

## Verification

`tests/regression-review.test.ts` contains API-level regressions for the issues above and negative checks around the newly added capabilities. The deterministic race tests use real PostgreSQL account locks and wait for the application request to reach its lock before changing account state.

- `npm run typecheck` passed after the review tests and current fixes were added.
- Initial PostgreSQL execution: 3 of 5 tests passed. Both account-verification race tests reproduced the bug with HTTP 200. Evidence: `docs/evidence/regression-review-before.log`.
- Expanded PostgreSQL rerun: six tests, six passed, zero failures. Evidence: `docs/evidence/regression-review-after.log`.
- Full-suite/container verification is owned by the final integration pass; this review does not claim either passed.

Other inspected invariants include direct media reads, old club archive scopes, deleted-account comment anonymization, historical club avatar snapshots, visible-only counters, ownership limits and transfer acceptance, consent revocation versus application approval, role hierarchy, LFG contact consent/revocation, and direct API access rather than hidden UI controls.
