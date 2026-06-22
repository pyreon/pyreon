---
"@pyreon/validate": patch
---

JIT validator codegen — the "fastest" path. Pure object-of-primitives / primitive-array
schemas now compile to a flat, monomorphic `new Function`-generated validator that
inlines the object type guard, field access, primitive `typeof` checks, and cheap
check conditions (length / numeric comparisons), while reusing the existing per-check
issue logic for correctness. Anything it can't inline (optional/nested/transform/refine/
union/record/tuple/coerce/…) falls back per-field to the interpreter, and unsupported
roots return to the interpreter entirely — so it is always correct, fast where it can be.

Measured vs the audit harness (Node 24, darwin/arm64): object-of-4-fields valid parse
**262 → 75 ns** (3.5×; now 2nd only to ArkType's 46 ns, beating Zod 205 / Valibot 142),
the same invalid **300 → 99 ns** (3×), 20-element array valid **1610 → 228 ns** (7×;
1.2× ArkType, beating Zod 1.64µs / Valibot 1.24µs). Pyreon `s` goes from slowest to a
close 2nd on valid-parse, decisively faster than Zod + Valibot. (ArkType's mature JIT
still edges it 1.2–1.6× — being literally fastest-of-all remains a tracked follow-up.)
