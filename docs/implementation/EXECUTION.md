# WrCommunity 1.0 — implementation

Source: main 28a2a84; approved specifications in docs/specs/wrcommunity-v1 and Social Core. The user explicitly authorized implementation and parallel execution on 23 October 2026.

Modular TypeScript monolith, PostgreSQL 18, React 19 data router, private media, transactional outbox. Preserve prototypes/home/v6 unchanged. Polls/reposts/chat/native clients excluded per the functional specification. No production operations.

M0: reproducible toolchain, SQL migrations, health and CI. M1–M2: email authentication, sessions, hidden defaults and profiles. M3–M4: policy, social graph, posts/revisions/comments/media. M5–M6: discovery and LFG. M7–M8: clubs, identity, consent, moderation queue. M9: concurrent event registrations. M10–M11: outbox, notifications, reports/sanctions/audit. M12: PostgreSQL integration, browser/E2E, Docker and privacy checks.

Parallel ownership: auth/profiles agent; social/policy/media agent; clubs/club-content agent; discovery/lfg/events agent; web agent; infrastructure/QA agent. Root owns shared database schema, app wiring, integration and GitHub publication. Each agent reads the applicable approved specs and tests real database behavior. Shared contracts are in CONTRACT.md. Root resolves interface changes before integration.

Review focus: hidden DTO leaks and media access; canonical pair locks for blocking; membership/consent and approval races; owner/public invariant and three-club limit; last event seat and expired LFG behavior.

Release remains unapproved for public users until legal/retention/rights, SMTP delivery, backup restore, security and operational gates are verified. Statuses must reflect evidence, not file existence.
