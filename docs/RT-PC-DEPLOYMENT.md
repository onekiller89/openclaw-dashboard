# RT-PC dashboard candidate - 15 October 2026

Production remains on `4243f4505f8669d30638893b439476affe56bc0d` plus the existing hardening diff: loopback default bind, configurable DASHBOARD_HOST, and recovery-token logging suppressed. No service restart occurred.

Candidate base: fork `origin/main` at `b08c0b7cd4f6172c5824dff4e643b0b7950ca603`. The preserved local patch applies cleanly.

Validation: Node syntax; synthetic loopback startup; unauthenticated status; 401 for four protected endpoints; synthetic registration/authenticated config reads; static HTML; startup logs omit the synthetic recovery credential. Public production probes: `/` 200, `/api/auth/status` 200, `/api/config` 401. No mutation endpoints or real credentials were used.

## Deployment gate

The 16 upstream commits add authenticated raw config read/write with gateway restart and Docker mutation/prune controls. `/api/reauth` returns success but establishes no server-side recent-auth state that those sensitive routes require. The UI gate alone does not enforce recent reauthentication for direct API calls. Do not deploy this candidate until a narrow server-side reauthentication repair is reviewed/tested and the added control scope is approved. No production security setting was changed by this preparation.

The app still expects `cron/jobs.json`, whereas the live OpenClaw installation has migrated it. Do not treat an empty dashboard cron list as proof that jobs are absent.

## Preservation and rollback

Original `server.js` and its binary diff are retained outside Git under `/home/aaa/Backups/portfolio-20261015-technical/`, together with validation and rollback notes. Production is unchanged; no operational rollback is currently required. Never reset the live checkout or overwrite later user edits. This candidate can be inspected or revised independently; it has not been pushed.
