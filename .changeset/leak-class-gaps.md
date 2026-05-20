---
'@pyreon/cli': patch
---

feat(cli): wire audit-leak-classes into `pyreon doctor` + CI nightly + CONTRIBUTING pointer

Closes the 3 remaining gaps from the post-#748 review of the
leak-class sweep:

### 1. `pyreon doctor` integration

`audit-leak-classes` is now a fast gate in `pyreon doctor` (runs by
default alongside `audit-tests`, `islands-audit`, `ssg-audit`). Maps
every finding to severity `'info'` — the audit is advisory by design;
mapping to error/warning would push the score down for known-bounded
patterns (Chrome extension scripts, framework-owned lifecycles,
enum-keyed caches) which the script deliberately flags. The `'info'`
mapping keeps the doctor's grade honest while making the catalog
discoverable through the existing doctor surface every user runs.

Available via:
- `pyreon doctor` — runs alongside the 8 other fast gates
- `pyreon doctor --only audit-leak-classes` — just this gate
- `pyreon doctor --json` — machine-readable per existing convention

### 2. CI nightly run

`.github/workflows/audit-leak-classes.yml` — nightly `schedule: '23 4 * * *'`
+ manual `workflow_dispatch` + opt-in via `leak-audit` PR label. Uploads
both `findings.json` (machine-readable, 30-day retention) and
`findings.txt` (human-readable summary) as artifacts. Posts a summary
to the workflow output with collapsed full report.

**Soft ceiling** at 40 findings — fails the job if total exceeds 40
(current baseline ~21, 2x headroom). This catches a sudden spike from
a recent merge without gating individual PRs. Tunable as the leak-hunt
sweep matures.

### 3. CONTRIBUTING.md pointer

New "Memory-Leak Avoidance" section between Code Style and Commit
Messages. Documents the 3 preventative layers (lint rules + static
audit + anti-patterns catalog) and the 3-question defensive check
when adding module-level state. Cross-references the canonical
catalog in `.claude/rules/anti-patterns.md`.

### Validation

- `@pyreon/cli` 147/147 tests pass (+1 new test suite for the gate
  adapter with 3 specs covering parse-output mapping, path
  relativization, and empty-findings edge case)
- Lint + typecheck clean
- `bun run check-doc-claims` clean (19/19 claim sites)
- `pyreon doctor --only audit-leak-classes` end-to-end smoke verified
  — produces 21 findings (the script's current baseline)

### Closes the post-#748 review

This finishes the leak-class sweep at the discoverability layer.
The 11-PR sweep total now covers: 8 fix PRs (#725-#741) + 2
preventative lint rules (#743) + documentation (#746) + monitoring
(#747) + audit script + 2 more fixes (#748) + integration (this PR).
