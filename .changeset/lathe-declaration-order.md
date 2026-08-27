---
'@pyreon/lathe': patch
---

Fix two defects in generated schemas, and remove a quadratic from the emitter.

**Declaration order was a correctness bug, not a formatting one.** Schemas are
`const` declarations and `const` is not hoisted, so a model emitted before one
it references threw `ReferenceError: Cannot access 'X' before initialization`
the moment the module was imported. Models were emitted alphabetically, which
satisfies that only by coincidence — `Alpha` referencing `Zulu` produced a
`schemas.ts` that crashed on import. They are now emitted in dependency order,
and a genuine `$ref` cycle (a tree node with children, a comment with replies)
is broken with `s.lazy(() => X)` rather than being emitted unorderable.

**Native modules inlined only directly-referenced models.** A native module
imports nothing, so inlining `Order` while leaving out the `Customer` it
references emitted a module that did not typecheck. They now carry the
transitive closure, in dependency order.

**Performance:** the native emitter rendered the entire schema file and
string-searched it once per model per tag — quadratic in (tags x models), and
brittle besides. Each expression is now computed once, directly. Measured on a
960-operation spec: 48.2ms to 25.0ms at 120 models, and per-operation cost is
now flat in model count (was 30 to 50us/op across 30 to 120 models).
