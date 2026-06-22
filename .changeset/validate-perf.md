---
"@pyreon/validate": patch
---

Object / array / record / tuple / discriminatedUnion parse is now 33–75% faster:
child values are validated against the SHARED parse context via a new `_runInto`
fast path instead of `~standard.validate`, eliminating a per-field `ctx` allocation,
a per-field result-object allocation, and a per-issue path spread. Measured (vs the
validation-audit harness): object-of-4-fields valid parse 393→262 ns (−33%), the
same invalid 1180→300 ns (−75%, now the fastest of Zod/Valibot/ArkType on that op),
20-element array valid parse 3434→1610 ns (−53%, now beats Zod). Also fixes a latent
correctness bug surfaced by the change — issue `path`s were stored as references to
the mutated `ctx.path` array (reading back as `[]` after parse unwound); issue paths
are now snapshotted at creation.
