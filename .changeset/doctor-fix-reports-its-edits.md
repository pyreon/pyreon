---
'@pyreon/lint': patch
'@pyreon/cli': patch
---

`pyreon doctor --fix` now reports what it changed, and only what is still wrong.

- `lint({ fix: true })` moves the diagnostics whose fix it wrote to the new `LintFileResult.fixed` field instead of discarding them. A fixable diagnostic whose fix was deferred because it overlapped another fix now stays in `diagnostics` (it used to vanish unfixed), so a second `--fix` pass applies it.
- The doctor `lint` gate lists every applied fix as an `info` finding (`lint/auto-fixed-<rule>`), the way the react-patterns gate already listed its migrations. Before, a fix such as `no-autofocus` removing an `autoFocus` attribute appeared nowhere in the report.
- Under `--fix` the two gates that write (react-patterns, then lint) run first and in sequence, and the read-only gates run after them. Before, all gates ran together, so `pyreon-patterns` read the pre-fix source and reported findings the same run had already fixed.
- The `pyreon/no-autofocus` fix removes an attribute that is alone on its line together with that line, instead of leaving a whitespace-only line.
