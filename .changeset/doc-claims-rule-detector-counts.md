---
'@pyreon/cli': minor
'@pyreon/lint': patch
---

feat(cli): doc-claims gate covers lint-rule / lint-category / detector-code counts

Extends the `doc-claims` gate (consumed by `pyreon doctor` AND
`scripts/check-doc-claims.ts`) from 2 to 5 source-of-truth counters,
7 → 19 claim sites:

- **lint rule count** — the `allRules` array in
  `packages/tools/lint/src/rules/index.ts`. Claim sites: CLAUDE.md (×3),
  the package README, `docs/docs/lint.md`, `lint/src/manifest.ts` (6×).
- **lint category count** — distinct `category:` literals across the
  rule files. Claim sites: CLAUDE.md (×2), README, manifest.
- **detector-code count** — the `PyreonDiagnosticCode` union in
  `packages/core/compiler/src/pyreon-intercept.ts`. Claim sites:
  `.claude/rules/anti-patterns.md`, CLAUDE.md.

New `ClaimSpec.all` flag asserts EVERY occurrence of a pattern in a file
agrees (not just the first) — `manifest.ts` carries the rule count 6×;
bumping 5 of 6 would otherwise pass silently.

**Counters TEXT-PARSE in-repo source via `repoRoot`, never
`import { allRules }`.** A dynamic import resolves via bun's module
cache to a STALE published snapshot (observed: 0.18.0 cache → 66 rules
while the working tree had 76); asserting against that is worse than no
gate. Same `repoRoot`-relative approach the existing hook/doc-page
counters already use.

Fixes the live drift this gate immediately surfaced on `main`:
`lint/src/manifest.ts` (`62`/`67`/`13` → `76`/`76`/`17` across 3
occurrences) and `.claude/rules/anti-patterns.md` ("flags 12" → 15).
The `@pyreon/lint` manifest correction regenerates `llms-full.txt` +
the MCP `api-reference.ts` region (`bun run gen-docs`).

Bisect-verified: stubbing `countLintRules → 0` fails the real-repo
shape + 2 new specs; restored → all 27 cli gate tests pass. Gate green
(19/19); `gen-docs --check`, lint manifest-snapshot, oxlint, cli +
lint typecheck all clean.
