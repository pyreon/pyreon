---
'@pyreon/validate': patch
---

`.is()` gets its own verdict-only JIT — no output value, no issue objects, no ctx.

`.is()` previously ran the PARSE validator and threw its issues away, so a boolean
verdict paid for every `makeIssue`: a `path.slice()`, a params record and a
template-literal message per failure, plus the strip-clone of the output object it
never returned. Measured against TypeBox's `Check()` on the same schema, that cost
`.is()` between 5× and 33× on invalid input and ~2× on valid arrays.

Measured against an in-run control interleaved with every other cell: **1.2×–25.7×**
(flat-object invalid 180ns → 7ns, deep-nested invalid 137ns → 7ns, array-of-20 valid
119ns → 51ns). `.is()` is now fastest or CI-tied on 10 of 12 `check`-axis cells.

`tryCompileJitCheck` is a second emission from the existing codegen: every failure
site is a bare `return false`, the root returns `true`, no output is constructed and
the emitted function takes only the input. Shapes it cannot express — a `_runInto`
fallback, or a check with neither an inline condition nor a `_pred` predicate, both
of which need a real ctx to decide — are REFUSED, and `.is()` keeps its previous
path unchanged.

Locked by `jit-check-differential.test.ts`, whose whole contract is
`schema.is(x) === schema.parse(x).ok`. Because the verdict emitter refusing a shape
would make that comparison compare `parse` to itself and pass vacuously, every block
also asserts how many of its schemas the emitter actually served, and the 2000-case
fuzz asserts a coverage floor. Bisect-verified in three directions: dropping a check
condition, removing the object type guard, and deleting the discriminated-union
unknown-tag arm each fail the suite with `is() != parse().ok`; restored, 771 pass.

Also: `typeIssue` built its identical `message` and `fallback` strings with two
separate template-literal evaluations — now built once.

It covers `.strip()` (the default) and `.passthrough()`. In verdict mode those are
the same question — both accept unknown keys, and a verdict builds no output, so
each only asks whether the known keys are valid — and compiling passthrough took it
from 256.3ns to 11.0ns on an 8-field object, landing exactly on strip's 11.0ns.
`.strict()` is deliberately excluded: it must REJECT an unknown key, which needs a
key scan the inline loop does not emit, and silently accepting one would be a
validation hole. A `.catchall()` is excluded for the same reason in both modes.

That gap was found by putting `@pyreon/validate` into the independent
typescript-runtime-type-benchmarks harness rather than trusting our own numbers: it
measured us 27x behind TypeBox on the case that uses `.passthrough()`. With the
extension, the same harness measures 4,159,437 -> 124,809,662 ops/s — ahead of
TypeBox's 113,006,350. The `.strict()` case is still 19x behind, and that is the
next lever.
