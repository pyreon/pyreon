---
description: Full ship pipeline — parallel audit, bisect proof, gates, docs, PR. Never merges.
---

Take the current work from "written" to "PR open with green CI". Each stage catches a
different class; do not skip one silently.

## Stage 1 — parallel audit (one message)

- `pyreon-reviewer` — ask it explicitly whether the fix covers the whole class or only
  the reproduced shape.
- `parity-auditor` — if the diff touches `packages/core/compiler`, runtime-dom
  props/template, `runtime-server`, or makes a browser-behaviour claim.
- `leak-hunter` — if the diff adds a module-level cache/stack/registry, a listener, a
  timer, a promise queue, a scratch buffer, or a long-lived closure.

Say which you skipped and why.

## Stage 2 — act on findings

Fix what came back. If the fix covers only a shape, widen it to the class before
continuing. If you disagree with a finding, say so with evidence.

## Stage 3 — prove the tests

Run `bisect-verifier` for every behaviour fix and keep its line verbatim:

    Bisect-verified: reverted <fix>, test failed with `<error>`, restored, passed.

If a test is not load-bearing, return to Stage 2.

## Stage 4 — gates

Run `gate-runner`; fix everything it flags; re-run until clean. A gate that is red
independent of this change is reported as its own finding.

## Stage 5 — documentation

Run `docs-syncer` if a public API, behaviour, locked count or anti-pattern changed.

## Stage 6 — PR

Run `pr-shepherd`. It does not merge, and neither do you. Report the URL and stop.

## Final report

- what changed and the root cause
- the bisect line, verbatim
- per-stage verdicts, including skipped stages and why
- first: what is not in this PR — gaps, unverified assumptions, follow-ups
- follow-up PRs you opened (open them now; no TODOs)

Never inflate the assessment.
