# Proposed RT-PC dashboard deployment — approval required

This plan has not been executed. Substitute only the exact reviewed tip recorded in the final review receipt. It changes dashboard code and performs one service stop/start cycle; it does not change the service unit, environment, credentials, MFA, network settings, gateway, cron configuration or other services. Do not run `install.sh`.

## Preflight, while current service remains running

1. Verify `/home/aaa/openclaw-dashboard` HEAD is `4243f4505f8669d30638893b439476affe56bc0d`; its only tracked modification is `server.js`. Recreate its binary diff in memory and require SHA256 `df308c787119fa5bdc539da0fb79f3824dd04e47d282d1f7efb0069c6478ac23`. Stop on any drift. Confirm current file equals the saved before-copy.
2. Verify candidate worktree `/home/aaa/openclaw-dashboard-portfolio-20261015` is clean, tip exactly matches the reviewed/approved commit, and production HEAD is its ancestor. Re-run Node syntax and `python3 tests/disabled_controls_test.py .` in the candidate.
3. Verify saved original server, original binary patch and rollback note exist under `/home/aaa/Backups/portfolio-20261015-technical/`. Verify their hashes before any inverse apply. Preserve them; do not copy credential files into Git or this report.
4. Record service state and public HTTP baselines (`/`, `/api/health`, `/api/auth/status`, unauthenticated `/api/config`); retain only status codes and registered/loggedIn booleans. Confirm existing auth remains registered. Check listener address. Do not log in with real credentials or dump service environment.
5. Create `rollback/dashboard-20261015` pointing at the original HEAD. If that branch already exists, require it to match rather than replacing it. Existing ignored/runtime/auth data and environment files are outside this Git operation and remain untouched. This is a local rollback ref, not an additional agent or deployment.

## Deployment after explicit action-time approval

Use a bounded script that stops on every failed command and has a `try/finally`/trap recovery path. Working directory is the live repository. Set `REVIEWED_TIP` to the approved full commit hash; `PATCH` is the verified preserved patch path.

```bash
systemctl --user stop openclaw-dashboard.service
git apply --reverse --check "$PATCH"
git apply --reverse "$PATCH"
# Require an empty tracked diff/status here; never discard unexpected edits.
git merge --ff-only "$REVIEWED_TIP"
/usr/bin/node --check server.js
systemctl --user start openclaw-dashboard.service
```

The inverse apply removes only the byte-verified original uncommitted patch so Git can fast-forward. The reviewed candidate already contains that same hardening, plus the blocked new routes, so user changes survive in the deployed commit. No reset, clean, stash, force-push or history rewrite is involved. Preflight has already established fast-forward ancestry; any merge refusal triggers recovery, never a forced operation.

Expected interruption: roughly 10–30 seconds, with a 60-second recovery budget. This is an estimate, not a guarantee. Existing in-memory dashboard sessions and rate-limit counters reset; users may need to sign in again. Persisted account, password hash, MFA and recovery configuration remain at their existing paths and are not rewritten by this plan. Existing authenticated/unauthenticated boundaries and legacy administrative actions remain unchanged. The newly introduced config/Docker/security-probe routes are unavailable server-side, including preflights and canonical path variants.

## Readiness and receipt

- Within 30 seconds require service active/running, expected loopback listener, landing/health/auth-status HTTP 200 and legacy unauthenticated config HTTP 401; auth registration boolean must match baseline. Do not print response bodies containing private data.
- Require the reviewed commit at live HEAD, clean tracked checkout, exact expected code hashes and no new unexpected restart loop. Capture only safe service/status metadata.
- Record deployed full hash, old hash, preserved patch hash, timestamps, HTTP results, listener scope, outage duration, test receipt and remaining legacy-cron compatibility limitation. Perform a bounded five-minute stability check with ordinary read-only status requests; do not execute control endpoints.
- Scope review must acknowledge that newer read-only notifications/reauth/UI changes remain upstream, while raw-config, Docker subtree and System Security probe routes are disabled. The unavailable config/Docker/System Security pages and action handlers have been removed from the UI. Cron inventory is read-only and explicitly distinguishes a current gateway read, an unverified legacy snapshot, and unavailable current inventory. Do not claim live scheduler visibility until the supported CLI succeeds in the service environment. See RT-PC-CRON-COMPATIBILITY.md.

## Recovery / rollback

If preflight fails, do nothing operational. If any deployment or readiness check fails:

1. Stop dashboard service if running. Inspect tracked status; never overwrite unexpected new user edits.
2. If inverse apply happened but fast-forward did not, require original HEAD, then reapply the saved patch (with `git apply --check` first).
3. If fast-forward happened, require no unexpected tracked edits, then `git switch rollback/dashboard-20261015` and `git apply --check "$PATCH" && git apply "$PATCH"`. This restores the original branch snapshot plus its original hardening without erasing candidate history.
4. Require original `server.js` to match the saved before-copy; run Node syntax and start the unchanged service. Repeat baseline HTTP/listener/auth-registration checks and record failure/recovery evidence.
5. If safe restoration is blocked by drift, keep the original files/backups and report the exact failure; do not reset, clean, delete data, change security settings or attempt a broad repair.

No production command in this document has been executed during preparation/review.
