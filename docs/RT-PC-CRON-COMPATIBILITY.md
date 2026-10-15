# Dashboard offline UI / cron compatibility follow-up

Scope: isolated `/home/aaa/openclaw-dashboard-portfolio-20261015`, following reviewed `bd1f3aea8968b06bbe3d4c165af3a0ac795c2054`. No live checkout, service, credential, job or scheduler configuration changed. Final commit/review receipt is recorded in the handoff.

Removed navigation, page forms and client fetch/action handlers for unavailable raw-config, Docker and System Security features. Existing account security/MFA and notification panel/polling remain. Server-side rejection stays authoritative; hiding UI does not grant access.

Cron inventory is now a read-only view. The current installed CLI implementation (`cron-cli-B4xdjOLS.mjs`, `list-jobs-BMZTV-lA.mjs`) verifies that `openclaw cron list --all --json` includes disabled jobs, gathers a complete paginated inventory and reports current `state.lastRunStatus` with legacy `lastStatus` compatibility. Installed state-reader code confirms migration to SQLite. No direct SQLite integration, credentials injection or live job changes were introduced.

The adapter uses fixed subprocess argv, no shell, a 12-second timeout and 2 MiB output bound. It finds the existing user-local CLI before PATH fallback. Raw command errors/output are not logged or returned. Only display fields are projected; job payloads/delivery secrets are omitted. Concurrent reads share one pending request; responses are cached up to 15 seconds with their read timestamp. A later failed read replaces prior success rather than returning it as current.

If the supported current read fails, an existing `cron/jobs.json` can be displayed only as **Legacy file snapshot · current scheduling unverified**. `.migrated`/`.bak` files are never read. Missing, corrupt, unreadable or invalid files produce **Current cron inventory unavailable**, not a zero-job claim. A successful empty current inventory is explicitly distinct from an empty legacy snapshot. Incomplete/duplicate-ID inventories are rejected. Expressions and time zones remain exact; one-time and interval representations are supported; unsupported schedule kinds are labeled rather than guessed. Unknown duration/enablement remain unknown.

All cron rows are read-only. Run/toggle buttons and their client handlers are removed; pre-existing backend cron mutations are outside this change and are not invoked. No new run/enable/delete permissions are created. The `/api/crons` response is now an envelope containing status/source/read timestamp/jobs; its sole in-repository UI consumer is updated.

Validation covers current and legacy formats; one-time/interval/cron schedules; current-empty versus unavailable/snapshot-empty; corrupt/partial/duplicate/missing/unreadable states; safe subprocess errors; cleared stale state; escaped untrusted job names/schedules; retained notification handlers; removed action controls; server/inline JavaScript syntax; and the full disabled-route security suite. Fixtures are synthetic and isolated, with no real credentials or jobs used.

Remaining operational limit: the previously observed CLI gateway secret-reference failure has not been repaired or bypassed. Live inventory completeness cannot be asserted until the ordinary supported command succeeds in the intended service environment. The UI now reports that limit honestly. No new deployment authorization is implied.

Rollback: discard this isolated candidate change by returning to prior reviewed `bd1f3ae` after preserving any later user edits. Production requires no rollback because it was untouched. Any future deployment must use the newly reviewed exact tip and existing bounded deployment/rollback plan; do not run installer or alter jobs/credentials.
