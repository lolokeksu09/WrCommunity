# WrCommunity 1.0 implementation status

Implementation branch. Not a production release. Evidence and final feature matrix will be updated after integration testing.

## Requirement precedence

User's implementation instruction explicitly approves using the architecture and engineering details. Earlier documentation statements “implementation not started” describe the baseline, not current code. Social Core's approved §15 is the extension contract. The separate PROPOSAL is explanatory and does not independently authorize privacy expansion. Polls/reposts, chat, native apps, Riot verification and fake data are excluded.

## Verification constraints

Sandbox launches each command in a separate network namespace, so real PostgreSQL and verification must execute within one persistent process namespace. PostgreSQL 18.6 installed from PGDG; the scratch-only UID guard shim is never part of source/build/deployment. Docker daemon cannot create its Unix socket in this sandbox; the repository's GitHub CI includes independent container build/start smoke checks. Do not mark Docker execution passed until that job succeeds.
