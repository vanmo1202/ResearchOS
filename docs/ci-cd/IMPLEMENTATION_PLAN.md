# ResearchOS automation implementation plan

Goal: implement the supplied CI/CD and daily commit specification on automation-ci-cd.
Architecture: automation-ci-cd.yml calls production-readiness.yml through workflow_call;
shared backend/frontend/compose/operations checks run once, with Docker builds and a required summary.
Local daily commit and explicit manual push are separate guarded commands.

Constraints: only /home/vanmo/projects/ResearchOS; preserve WF01; no worktree,
production database, container restart, deployment, image publication, PR, or force push.
The user's supplied detailed specification authorizes direct implementation and final commit/push.

- [x] Test local automation in disposable Git repositories: wrong branch/remote/path,
  no changes, allowlist, secrets, pre-staged files, conflicts, locking, one daily commit,
  dry-run, and safe manual push divergence.
- [x] Implement guarded scripts, conservative path/content policy, user service and timer.
- [x] Reuse production readiness through workflow_call; preserve the complete supported
  rebuild, unified-chat and analytics suites, including every responsive case.
  Legacy playwright.config.js is an older API/UI suite, not the verified WF01 baseline.
- [x] Add backend logs, Docker builds (local and hardened Dockerfiles), worker image checks,
  placeholder-only Compose validation, failure artifacts and fail-closed summary.
- [x] Document installation, schedule, costs, limitations, troubleshooting and disabling.
- [x] Validate shell/YAML, disposable automation tests, systemd calendar and frontend;
  review diff and secrets, commit only intended files, push the named branch and inspect CI.

Review focus: no index changes on rejected secrets; staged work preserved; Vietnamese
calendar date; lock and history enforce daily cap; upstream divergence blocks push.

Progress: 16 automation tests and 12 existing operations tests PASS; Compose,
actionlint, shellcheck, Bash syntax, dry-run and timezone calendar validated.
Fresh independent review found no actionable findings. No timer installed/enabled.
Frontend format/build and complete rebuild suite PASS (39/39, no skips).
Backend audit: zero vulnerabilities. Commit/push follows local validation; the
GitHub Actions run is the authoritative record for Node 22 and Docker builds.
