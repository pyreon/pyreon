---
'@pyreon/validate': patch
---

Recursive JIT validator codegen — faster on more shapes, two latent bug-fixes.

The `s` validator's JIT fast path now compiles a whole composite tree to ONE
specialized function instead of only a flat object-of-primitives. It recurses
into nested objects, composite array elements, **array roots**, and now also
**inline-primitive roots** (`s.number().int().min(0).max(150)`), inlining
every level's type guard + cheap check conditions with zero closure calls on
the valid path.

Measured (monomorphic / real-app usage, separate process per lib — see
`bench/validation-mono.ts`): Pyreon now **beats or ties ArkType** on
`number.int.range` (7.0 vs 8.4ns), `object.deep-nested` (27.4 vs 27.5ns) and
`array.20-objects` (163 vs 187ns), and stays 3–10× faster than Zod/Valibot —
on top of the existing 15–48× error-path wins.

Two latent correctness bugs in the old flat JIT are fixed in the same change
(both were masked because no test exercised the shape):

- a number **field** accepted `NaN` (`typeof NaN === 'number'`); it is now
  rejected, matching the interpreter and a bare `s.number()` root.
- an array carrying its **own** `.refine()` / `.transform()` had that op
  silently dropped (the array branch only ran check ops); such arrays now fall
  back to the interpreter, which runs the refine.
- a coercing schema (`s.coerce.number()`) used as an object **field** skipped
  coercion; it now correctly coerces.

A **differential fuzz harness** (`src/tests/jit-differential.test.ts`, 1300+
seeded cases) now runs every JIT-able schema through BOTH the JIT and the
interpreter and asserts byte-identical `{ value, issues }`. It is the permanent
correctness gate for the JIT, and it immediately found two more divergences
that are fixed here:

- a `literal()` type-mismatch emitted the generic "Expected literal, received
  X" issue instead of the interpreter's `invalid_literal` "Expected <value>".
- an array's own `min`/`max`/`length` check ran even when an element already
  failed; the interpreter skips checks once the type-check produced issues.
  The JIT now runs array checks AFTER the element loop and only when it added
  no issues — matching the interpreter exactly.

No public API change. A codegen depth cap bounds the emitted function on
pathologically deep schemas (the subtree beyond it uses the interpreter).
