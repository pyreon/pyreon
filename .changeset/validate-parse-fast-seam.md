---
'@pyreon/validate': patch
---

Make the pure-JIT parse seam small enough to inline. `parse()` and the Standard
Schema `validate` closure each carried the pure fast path, the general path, the
async refusal and its error literal in ONE body; the fast path itself — two
field loads, one call, one `issues.length` read, one Result literal — costs
~3 ns as a small method, but inside that body it cost ~10 ns on the
`number.int.range` cell (bun/JSC, quiet box) while the emitted validator ran at
2.63 ns and zod-c's whole `safeParse` at 2.61. The seam was 75% of the cell and
its SIZE was the whole reason. The cold halves now live in module-level
`parseGeneral` / `stdValidateGeneral` / `pureFail` / `stdFail`; verdicts, issue
objects and value identity are unchanged (the pure-seam differential fuzz and
all 816 specs hold). Measured: `S.parse` 10.2 → 4.9 ns under load; quiet figures
in the PR.
