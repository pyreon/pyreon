---
'@pyreon/mcp': patch
'@pyreon/compiler': patch
'@pyreon/cli': patch
'@pyreon/lint': patch
---

Input that does not parse no longer gets a clean verdict.

The detectors parse with an error-recovering parser, so on code they cannot read they found nothing, and "nothing" was reported as a pass. MCP `validate` answered `✓ No issues found` for an unclosed `<div>`, stray tokens, prose, empty input and, most often, code still wrapped in a markdown fence (the backticks parse as template literals, so the code became a string the detectors skipped).

- `@pyreon/mcp`: `validate`, `explain_reactivity`, `migrate_react`, `migrate_pyreon` and the `componentSource` of `diagnose` / `explain_error` check the input first. A syntax error is the verdict (`✗ Syntax error at line L, column C: <message>`), with any findings from the part that parsed listed under it. A single surrounding markdown fence is stripped, the code inside is checked, and the result says so. Several fences or prose around the code, empty input, and `.vue` / `.svelte` filenames are reported as such. Output for valid input is unchanged.
- `@pyreon/compiler`: new `findSyntaxErrors(code, filename)` in `@pyreon/compiler/analyze`, the shared "did this parse?" check, in the parse mode the filename names. `auditIslands` lists files that do not parse in `summary.unparseableFiles` and no longer reports a clean audit while there are any.
- `@pyreon/cli`: `pyreon check` reports a file that does not parse as a `syntax-error` finding (non-zero exit), and `--fix` leaves it untouched.
- `@pyreon/lint`: a file that does not parse gets one `pyreon-lint/parse-error` error and no rules run on it (it used to come back as "no problems").
