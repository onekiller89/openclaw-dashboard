# RT-PC dashboard candidate - 15 October 2026

Production remains at `4243f4505f8669d30638893b439476affe56bc0d` plus the original local hardening patch. No deployment or restart occurred. Upstream candidate base is `b08c0b7cd4f6172c5824dff4e643b0b7950ca603`; previous preservation commit is `3fc7c9a730e8a9d68ad86ca5c3900a83d76a79d1`.

## Exact scope of the safety patch

After normal API authentication, `/api/openclaw-config` and `/api/docker/action` return HTTP 403 with `CONTROL_UNAVAILABLE`, for every HTTP method and query variant. Unauthenticated requests still receive 401. Raw config reads are also rejected to avoid exposing configuration credentials. The new config-write/gateway-restart and Docker start/stop/restart/prune handlers have been removed. There is no environment switch or reauthentication response that enables them.

Legacy endpoints present in the production baseline are unchanged, including existing administrative actions. In particular, this patch disables the new config-save-triggered restart, not every legacy restart route. New read-only Docker inventory, notifications and system-security views remain in the upstream candidate. The UI may show unavailable controls; the server is authoritative.

## Validation

Run `python3 tests/disabled_controls_test.py .` from this worktree. Standard-library test, temporary synthetic HOME/workspace/auth/config, loopback-only random port. A Node preload blocks all child commands during the test; legacy read-only attempts are recorded as a baseline. Tests prove:

- unauthenticated controls remain 401;
- landing, health, legacy authenticated config/session/cron reads and notifications retain successful responses;
- 20 authenticated method/action/query cases receive 403;
- successful reauthentication cannot enable config-write or Docker-prune;
- synthetic config unchanged, no backup created, no child commands added by rejected controls;
- loopback binding and recovery-token-log suppression retained.

Node syntax and Git whitespace checks also pass. Production file remains byte-identical to the saved original. No real credentials or destructive endpoint used against production.

## Review and deployment gate

This is an unpublished, non-deployed candidate. Review the resulting exact scope before any production change. Legacy `cron/jobs.json` compatibility is still unresolved against the migrated live runtime; an empty dashboard cron list is not proof of no jobs. No live auth/security setting changed.

Original server and binary patch, validation evidence and rollback notes remain under `/home/aaa/Backups/portfolio-20261015-technical/`. Production is unchanged, so operational rollback is unnecessary. Never reset the live checkout or overwrite later user edits.
