---
'@pyreon/cli': patch
'@pyreon/compiler': patch
---

`pyreon doctor` correctness + accuracy fixes (deep audit follow-up).

**Robustness** — a gate that throws no longer crashes the whole run. The orchestrator isolates each gate in a try/catch and records a `<gate>/gate-failed` ERROR finding instead of rejecting `Promise.all` and losing every other gate's findings + the score.

**False positives** (the gates flagged correct code):
- `pyreon-patterns` now **defers to the `lint` gate** for codes a configured lint rule fully owns (`process-dev-gate`, `raw-add-event-listener`, `query-options-as-function`) — eliminating double-reporting at a wrong hardcoded `'warning'` severity AND the FPs on framework code the lint rule exempts. The kept codes (e.g. `raw-remove-event-listener`, which the add-only lint rule can't catch) honor the project's `.pyreonlintrc.json` exemptPaths.
- `ssg-audit`'s `dynamic-route-missing-get-static-paths` is now **scoped to `mode: 'ssg'` apps** (resolved from the nearest `vite.config`). SPA/SSR/ISR apps never prerender, so a missing `getStaticPaths` there was a false positive.

**Scoring** — `audit-leak-classes` findings now route to the advisory `best-practices` category. They were `info` "to keep the grade honest", but `info` still costs 1pt each, so ~45 advisory findings tanked the architecture grade to F. Advisory = VISIBLE but excluded from the grade + `--ci`, which is what the gate's stated intent actually requires.

**CLI** — `check-dedup` was rejected by `--only`/`--skip` (the CLI's `VALID_GATES` was a hand-kept duplicate that dropped it) even though it runs by default. `VALID_GATES` is now derived from the orchestrator's `[...FAST_GATES, ...SLOW_GATES]`, so it can never drift again; the help text derives its counts the same way.

**GHA renderer** — annotation property values (`file=`, `title=`) now URL-encode `,` and `:` per the workflow-command spec (a comma in a path previously ended the property early).

Bisect-verified per fix. Docs (CLAUDE.md, `docs/src/content/docs/cli.md`, orchestrator header) corrected: the gate count (13 total / 11 fast, not 10/8), the 3 gates missing from every table (`content-audit`, `check-dedup`, `audit-leak-classes`), the "single entry point for every gate" overclaim (doctor is the health-gate entry point, not a runner for CI-pipeline gates), `--check-content`, and the stale non-CI-exit claim (`pyreon doctor` is informational and always exits 0; `--ci` gates).
