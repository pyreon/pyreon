---
description: Full ship pipeline — parallel audit, bisect proof, gates, docs, PR. Never merges.
---

Take the current work from "written" to "PR open with green CI", using the
specialist agents. Do not shortcut a stage; each one catches a different class.

## Stage 1 — parallel audit (fan out, single message)

Spawn these concurrently and wait for all of them:

- `pyreon-reviewer` — review the diff against the anti-pattern catalog. Ask it
  explicitly to answer: **is the fix the whole CLASS or just the reproduced shape?**
- `parity-auditor` — only if the diff touches `packages/core/compiler`,
  `runtime-dom` props/template, `runtime-server`, or makes a browser-behavior claim.
- `leak-hunter` — only if the diff adds a module-level cache/stack/registry, a
  listener, a timer, a promise queue, a scratch buffer, or a long-lived closure.

Skipping one is a decision: say which you skipped and why.

## Stage 2 — act on findings

Fix what came back. If a finding says the fix is a SHAPE rather than the CLASS,
widen the fix before continuing — that is the single most expensive miss in this
repo's history. If you disagree with a finding, say so with evidence rather than
silently ignoring it.

## Stage 3 — prove the tests are load-bearing

For every behavior fix, run `bisect-verifier`. Capture its verbatim line:

    Bisect-verified: reverted <fix>, test failed with `<error>`, restored, passed.

If it reports the test is NOT load-bearing, go back to Stage 2. A regression test
that passes against the broken state is false confidence, not coverage.

## Stage 4 — gates

Run `gate-runner`. Fix everything it flags, using its triage table. Re-run until
clean. If a gate is red-on-arrival (failing independently of this change), report
that as its own finding — a permanently-red gate is a dead gate.

## Stage 5 — documentation

Run `docs-syncer` if any public API, behavior, LOCKED count, or anti-pattern
changed. It reports each of the nine surfaces as updated / not-applicable /
needs-attention.

## Stage 6 — PR

Run `pr-shepherd`. It handles worktree hygiene, lockfile discipline, the changeset,
an honest PR body, and CI triage.

**It does not merge, and neither do you.** Report the PR URL and stop.

## Final report

- what changed and the ROOT CAUSE (not the symptom)
- the bisect line, verbatim
- per-stage verdicts, including stages skipped and why
- **lead with what is NOT in this PR** — gaps, unverified assumptions, follow-ups
- the follow-up PRs you opened (open them now; do not leave a TODO)

Never inflate. If it is 7/10, say 7/10 and name the gap.
