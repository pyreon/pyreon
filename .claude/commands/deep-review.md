---
description: Adversarial multi-lens review of the current diff — fan out, then verify findings before reporting.
---

Review the current changes. Optional argument: $ARGUMENTS (a path, package, or PR
number; default is the working diff vs `origin/main`).

## Phase 1 — fan out (one message, concurrent)

Spawn every applicable specialist:

- `pyreon-reviewer` — anti-pattern catalog, reactivity contracts, fix altitude
- `parity-auditor` — dual backend, template vs `h()`, SSR vs hydration, happy-dom vs Chromium
- `leak-hunter` — the leak classes
- `bench-runner` — only if the change claims a perf win or touches a hot path

## Phase 2 — verify

Check every finding yourself against the code. A plausible finding can name the wrong
cause; verify the mechanism, not just the symptom. Drop anything you cannot
substantiate and say how many you dropped.

## Phase 3 — report

Rank by severity. For each finding: `file:line`, one-sentence defect, failure scenario
(inputs/state → wrong output), whether the fix covers the whole class or one shape,
and the fix.

Then state which lenses ran and which you skipped, what you did not check, and your
confidence per finding. If nothing survives verification, say so.
