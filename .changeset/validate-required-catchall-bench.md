---
'@pyreon/validate': minor
---

feat(validate): `.required()` + `.catchall()` object methods + a parse benchmark vs Zod/Valibot/ArkType

Closes the two object-algebra follow-ups flagged in `v1.ts`:

- **`.required()`** — inverse of `.partial()`; unwraps `.optional()` / `.nullish()` fields back to required (round-trips with `.partial()`). `OptionalSchema`/`NullishSchema` now expose their wrapped `inner` schema so `.required()` can rebuild.
- **`.catchall(schema)`** — validates every unknown key against `schema` and keeps it on the output (Zod semantics); takes precedence over strip/strict/passthrough and is preserved through `.pick`/`.omit`/`.partial`/`.extend`/`.merge`.

JIT-correctness: `.catchall` disqualifies an object from the JIT plain-object inline path (`jit.ts:isPlainObject` now checks `!_catchall`) — otherwise the shape-only inline loop would silently strip unknown keys without validating them. A catchall object (root or nested under a JIT'd object) falls back to the interpreter, which is correct. Bisect-locked.

Adds `scripts/bench/core/validate.ts` + the `bench:validate` script — a parse benchmark vs Zod 4 / Valibot 1 / ArkType 2 (warmup + timed-ops harness, `NODE_ENV=production`, a correctness gate asserts all four agree valid/invalid before timing). Result: `@pyreon/validate` is the **fastest on the error/invalid path** across every shape (2.5–50× — early-exit vs rich error allocation), and **2nd-fastest on valid-parse** (behind only ArkType's JIT, faster than Zod + Valibot). The discriminated-union root not being JIT'd is the widest valid-parse gap and the clearest tracked perf follow-up.

All additive — no breaking changes. 348 tests (6 new), all features bisect-verified.
