---
'@pyreon/cli': minor
---

`pyreon doctor` v2 — feature-complete project health audit with a 0-100 score
and beautiful CLI output (after [react.doctor](https://www.react.doctor/)).

**What's new** (on top of PR 1's foundation):

- **6 new gates** wired into the unified `GateResult` API:
  `react-patterns`, `pyreon-patterns`, `lint` (all 66 `@pyreon/lint` rules),
  `audit-tests`, `islands-audit`, `ssg-audit`.
- **Score module** — pure per-category 0-100 subscores + overall weighted
  mean. Severity weights: `error=10 / warning=3 / info=1`. Letter grades
  A/B/C/D/F. Categories with no gate coverage are excluded from the mean
  rather than counted as perfect-100 (would inflate the score).
- **DoctorReport aggregator** — `buildReport(gates) → { score, grade,
  categories[], findings[], gates[], totals, elapsedMs, timestamp }`.
  Pure-function: gate results in, report out. Findings sorted errors →
  warnings → infos, then by category.
- **Beautiful CLI output** — big-score banner with letter grade,
  per-category bar chart (12-cell ░/█ fill), severity-iconed top-N
  findings with code + clickable file:line:col location (OSC-8
  hyperlinks for iTerm2 / WezTerm / kitty / VSCode), fix hints, skipped-
  gates footer. ANSI colors respect `NO_COLOR` / `FORCE_COLOR`.
- **`--json`** — full `DoctorReport` for AI agents + dashboards.
- **`--gha`** — GitHub Actions annotation lines (`::error file=X,
  line=Y,col=Z::msg`) for inline PR annotations.
- **Modes** — `--full` (enable slow gates: audit-types, bundle-budgets),
  `--only <gates>`, `--skip <gates>`, `--fix` (lint + react-patterns),
  `--ci` (exit nonzero on error findings only). `--only` precedence
  over `--full`; `--skip` applies after `--only` (intersection).
- **Parallel execution** — `Promise.all` over selected gates cuts
  wall-clock from ~5s sequential to ~1-2s for the fast set.
- **Legacy flag compat** — `--audit-tests`, `--check-islands`,
  `--check-ssg` still work; they map to `--only <gate>` shortcuts so
  existing CI scripts continue to function unchanged.

**Output sample** (text mode):

```text
  pyreon doctor · project health audit

  Score:  92/100   Grade: A

  Per category:

  correctness    █████████░░░  87 · 1E 1W
  performance    ████████████ 100 · clean
  architecture   ████████████ 100 · clean
  testing        ████████████ 100 · clean
  documentation  ████████████ 100 · clean

  Top findings (2 of 2):

  ✖ useState imported from React. Use signal() from @pyreon/reactivity.
     src/App.tsx:1:9
     fix: import { signal } from "@pyreon/reactivity"

  ⚠ className → class (HTML standard attribute).
     src/App.tsx:3:18

  1 error · 1 warning · 8 gates · 1.4s
```

No breaking changes — all existing flags (`--audit-tests`,
`--check-islands`, `--check-ssg`, `--fix`, `--json`, `--ci`) keep
working.
