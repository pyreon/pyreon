---
'@pyreon/cli': minor
---

feat(cli): non-grade-gating `best-practices` advisory category for `pyreon doctor`

Follow-up #4. Resolves the objectivity tension from the doctor-objective
work (#630): enabling the opt-in `@pyreon/lint` best-practice rules
(#632/#634 — `frontend`/`query`/`rx`/`i18n` + form/router opt-in) used
to fold into `correctness`/`architecture`, tanking the objective health
grade and failing `--ci` — punishing projects for adopting opinionated
best practices (opinionated ≠ broken).

New advisory `FindingCategory: 'best-practices'`. The lint gate routes
every `meta.optIn` rule's findings here regardless of its lint category
(`gates/lint.ts`). It is **scored + displayed** (own breakdown, labeled
`advisory — excluded from grade & --ci` in the text renderer; never
shown as "skipped") but **always `included: false`** so it never enters
the overall mean/grade, and `doctor.ts` excludes advisory errors from
the `--ci` exit code. `isAdvisoryCategory()` exported from `doctor/score`.

Verified: `@pyreon/cli` 141 tests pass (+3 advisory specs: always-
excluded-from-mean, scored-for-visibility, 10 advisory errors don't move
the grade); typecheck clean; full-repo oxlint 0 errors. Self-run proof:
doctor grade/score/errors **byte-identical** to baseline with the
category added (zero regression), advisory row renders correctly.
Doctor/CLI-only — runtime-inert (no e2e impact, same class as #632/#634).

NOTE — deferred (honest scope): #4's "more frontend a11y rules" half is
deliberately NOT in this PR. Adding lint rules off `main` while #632's
rule-count manifest claims and #634's are still unmerged would create
manifest/count-claim merge conflicts across the stack. Those a11y rules
land cleanly in a follow-up once #632/#634 merge (rebased onto the real
76-rule baseline) — not faked into this PR.
