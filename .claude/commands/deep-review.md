---
description: Adversarial multi-lens review of the current diff — fan out, then verify findings before reporting.
---

Review the current changes hard. Optional argument: $ARGUMENTS (a path, package, or
PR number to scope to; default is the working diff vs `origin/main`).

## Phase 1 — fan out (single message, concurrent)

Spawn all applicable specialists at once:

- `pyreon-reviewer` — anti-pattern catalog, reactivity contracts, fix altitude
- `parity-auditor` — dual-backend, template-vs-h(), SSR-vs-hydration, happy-dom-vs-Chromium
- `leak-hunter` — the seven retention classes
- `bench-runner` — only if the change claims a perf win or touches a hot path

## Phase 2 — verify before reporting

Do not pass findings through unexamined. For each one, check it yourself against the
actual code. A confident, correct-sounding finding can name the wrong cause — verify
the MECHANISM, not just the symptom.

Drop anything you cannot substantiate, and say how many you dropped. A review that
inflates its finding count is worse than one that reports two real bugs.

## Phase 3 — report

Rank by severity. For each surviving finding:

- `file:line`
- one-sentence defect
- concrete failure scenario: inputs/state → wrong output or crash
- whether the CLASS is closed or only the shape
- the fix

Then state explicitly:

- which lenses ran and which you skipped
- what you did NOT check
- your honest confidence per finding

If nothing real survives verification, say that plainly. Do not manufacture findings.
