# @pyreon/validate

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.43.0
  - @pyreon/validation@0.43.0

## 0.42.0

### Patch Changes

- [#2132](https://github.com/pyreon/pyreon/pull/2132) [`f2a5a26`](https://github.com/pyreon/pyreon/commit/f2a5a262b5b497e735c825678c2b7a86d55ec87a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/validation` is now the single canonical home for the Standard Schema contract. It owns `StandardSchemaV1<In,Out>` (the strict, spec-accurate type — promoted from `@pyreon/validate`'s superior definition), the lax `StandardSchemaLike` accept-type, `StandardSchemaResult<Out>`, and `StandardSchemaIssue` — and `@pyreon/validate` + `@pyreon/state-tree` now IMPORT them instead of re-declaring their own copies (which could drift). `@pyreon/validation`'s `InferSchema` is also now universal across strategies: it resolves the `~standard.types` phantom (zod/valibot/arktype/`s`) AND, for a schema that omits that optional phantom, the `validate` return — so `@pyreon/state-tree`'s `InferSchemaState` delegates to it with no regression. The legacy `StandardSchemaShape` is kept as a deprecated alias. (`@pyreon/zero` + `@pyreon/zero-content` keep their inline duck-typing — they sit above the fundamentals layer and can't depend on a fundamentals package.)

- Updated dependencies [[`f2a5a26`](https://github.com/pyreon/pyreon/commit/f2a5a262b5b497e735c825678c2b7a86d55ec87a), [`1a29fc3`](https://github.com/pyreon/pyreon/commit/1a29fc3d761b4facfe5e77d1503ffc3fd4f036e3), [`707e1be`](https://github.com/pyreon/pyreon/commit/707e1bee8455d0347dc13dd0f6845dd60971588e)]:
  - @pyreon/validation@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

## 0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0

## 0.39.0

### Patch Changes

- [#2000](https://github.com/pyreon/pyreon/pull/2000) [`0cd49a7`](https://github.com/pyreon/pyreon/commit/0cd49a710bb361c90a3480938b929103f25240c7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Harden the validation benchmark's objectivity (no runtime changes): per-cell process isolation (every scenario×path×library cell runs in fresh `bun` child processes, 3 pooled so the CI covers process-level jitter), seeded bootstrap 95% confidence intervals with 🤝 tie detection, a cross-library correctness gate before timing, and an explicit author-judge disclosure. Manifest/docs performance claims refreshed to the new verdicts.

- [#1988](https://github.com/pyreon/pyreon/pull/1988) [`17daf5b`](https://github.com/pyreon/pyreon/commit/17daf5b97e0975e3bb3df7992c46ddf452c621b8) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `s.union` now accepts the array form `s.union([a, b])` in addition to the rest form `s.union(a, b)`, matching Zod / Valibot / ArkType and staying consistent with `s.tuple([...])` / `s.enum([...])`. Previously the array form was a type error that, if reached at runtime (dynamic construction, `as` cast, plain JS), crashed with a cryptic `member['~standard'] is undefined` deep in the union validator. Non-schema members and unions of fewer than two members now throw a clear `[Pyreon]` error at construction instead of crashing at parse time.

  Also: the JIT object codegen no longer emits the redundant `if (r !== undefined || (key in src))` strip-assignment guard for fields whose valid value is provably defined (inline primitives past their type-guard, and freshly-built nested objects/arrays) — smaller generated validators, behavior-identical (locked by the JIT↔interpreter differential fuzz).

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0

## 0.38.0

### Patch Changes

- [#1955](https://github.com/pyreon/pyreon/pull/1955) [`1302e57`](https://github.com/pyreon/pyreon/commit/1302e5726a05a3ffe08f18be75908de4359f3689) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(validate): JIT-inline `between` / `multipleOf` / `startsWith` / `endsWith` / `includes`

  The JIT already inlined the cheap numeric/length conditions (`min`/`max`/`int`/…)
  but fell back to a per-parse CLOSURE call for five more common checks. They are
  all trivially inlinable with a byte-exact condition, so the generated validator
  now emits the comparison directly instead of `H[k](v, ctx)`:

  - `check:number:between` → `v < lo || v > hi`
  - `check:number:multiple-of` → `v % n !== 0`
  - `check:string:starts-with` → `!v.startsWith("…")`
  - `check:string:ends-with` → `!v.endsWith("…")`
  - `check:string:includes` → `!v.includes("…")`

  Each matches its check closure's fail condition exactly (verified by the
  `jit-differential` seeded-fuzz suite — 1000 random object schemas + 300 array
  roots agree JIT-vs-interpreter; 619 tests green). Removes one closure call per
  such check on the valid parse path — measured ~10% faster on a range/positional
  schema with no format checks (e.g. `{ age: between(0,150) }`: ~21ns → ~19ns).

  Note: the flagship valid-parse benchmark rows all carry `string().email()`,
  whose regex closure dominates, so this doesn't move those headline numbers — it
  speeds up the (very common) class of schemas doing numeric-range / prefix /
  suffix / multiple-of validation without a format check.

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0

## 0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.37.0

## 0.36.0

### Minor Changes

- Add the lean validator engine behind compile-time tree-shaking: lean base constructors (`string()`/`number()` — type-check + a generic `.check(...)`, no format methods on the prototype) plus standalone check actions (`minLength`/`email`/`url`/`uuid`/`minValue`/`integer`/`multipleOf`/…), exported from `@pyreon/validate/mini`. This is the target `@pyreon/vite-plugin`'s `optimizeValidators` rewrite lowers chainable `s.` schemas to — so you keep writing the chainable API and the compiler ships the tree-shakeable output (a typical 3-field schema drops ~11 KB → ~6.5 KB gz). `/mini` is also importable directly (`string().check(email(), minLength(2))` / `pipe(string(), email())`) as an escape hatch for dynamically-built schemas or non-Vite bundlers. Mini schemas are Standard Schema-native and produce byte-identical verdicts + issues to the chainable equivalent (parity-locked). Also adds a generic `.check(...actions)` to every schema. The shipped chainable classes are unchanged (zero behavior change for `s.` users). Corrects two stale docs claims (the runtime is not ~3.9 KB at the published entry; the `@pyreon/validate/checks/*` subpath never existed). (7852409)

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.36.0

## 0.35.0

### Minor Changes

- [#1759](https://github.com/pyreon/pyreon/pull/1759) [`b0fe759`](https://github.com/pyreon/pyreon/commit/b0fe7598b0e811788c85fb910c3fa2959e445d0b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): bigint comparison bounds — `.gt` / `.gte` / `.lt` / `.lte` / `.step` / `.between`.

  Numeric parity for `s.bigint()`, matching `s.number()`'s comparison surface:

  - **`.gt(n)` / `.lt(n)`** — strictly greater / less than `n` (EXCLUSIVE bounds; the existing `.min` / `.max` are inclusive-only, so an open interval `gt(0n).lt(100n)` wasn't expressible).
  - **`.gte(n)` / `.lte(n)`** — inclusive aliases for `.min` / `.max`.
  - **`.step(n)`** — alias for `.multipleOf(n)`.
  - **`.between(lo, hi)`** — inclusive range.

  bigints are genuinely used for crypto/financial validation, so symmetric bounds matter. bigint checks use the interpreter closure path (not JIT-inlined, like the existing bigint min/max), so no JIT changes. 11 tests (incl. values beyond `Number.MAX_SAFE_INTEGER`); the exclusive `gt` bound is bisect-verified.

- [#1742](https://github.com/pyreon/pyreon/pull/1742) [`53a75ea`](https://github.com/pyreon/pyreon/commit/53a75ea957efefef5d3ca09dfedc7bd4c05696a2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): `.catch(fallback)` (resilient parse) + `.readonly()` (freeze + `Readonly<T>`).

  Two terminal schema methods from the `s` runtime, matching Zod's surface.

  - **`.catch(value)`** — on parse FAILURE, discard the issues this schema produced and return a fallback instead of erroring. The fallback is a static value or a function of the raw input. Terminal regardless of chain position (`.min(3).catch('x')` ≡ `.catch('x').min(3)`). Scoped per-schema: a caught field failure is substituted while a sibling's failure still fails the object. Async-aware — under `parseAsync`, a failing async `.refine` is caught after the Promise settles.
  - **`.readonly()`** — `Object.freeze` the parsed output (shallow) and mark it `ShallowReadonly<T>` at the type level. Uses a primitive-safe shallow-readonly mapped type (not the built-in `Readonly<T>`, whose `Readonly<unknown>` resolves to `{}` and would break `Schema<T>` → `Schema<unknown>` assignability).

  Both are op-based (no new wrapper classes); a schema carrying either op falls out of the JIT fast path onto the interpreter automatically. 15 new tests, both code paths bisect-verified.

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add coercion: `s.coerce.string()` / `.number()` / `.boolean()` / `.date()` / `.bigint()`.
  Each coerces the input via the JS constructor before validation, then runs the
  primitive's normal checks on the coerced value (`s.coerce.number().int().min(0)`
  accepts `"42"` → `42`). Mirrors Zod's `z.coerce.*`.

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add the remaining composition combinators: `map(key, value)` (native `Map<K,V>`),
  `set(value)` (native `Set<V>`), `intersection(a, b)` (must satisfy both; merges object
  outputs → `A & B`), and `lazy(() => schema)` (recursive / self-referential schemas).
  All strictly type-inferred. This brings the `s` runtime to parity with Zod/Valibot on
  composition (only `.required` / `.catchall` and a JIT-codegen fast path remain).

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add composition combinators to the `s` validator: `union`, `discriminatedUnion`
  (O(1) literal-keyed dispatch with precise discriminator errors), `record` (string-keyed
  dictionary, prototype-pollution-safe), and `tuple` (fixed-length positional). All are
  strictly type-inferred — `union(s.string(), s.number())` → `string | number`,
  `tuple([...])` → positional tuple type, `discriminatedUnion` → the exact member union.
  Closes the largest feature gap vs Zod/Valibot (unions/records/tuples were the blocker
  for modeling most real-world API/domain schemas).

- [#1766](https://github.com/pyreon/pyreon/pull/1766) [`bc93849`](https://github.com/pyreon/pyreon/commit/bc93849581ab7bab66d3843bb9cc54fca915e276) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Composition completeness (Zod-4 parity gaps): `s.record(keySchema, valueSchema)` now validates keys against an optional key schema (the single-arg `s.record(valueSchema)` form is unchanged); `s.tuple([...]).rest(schema)` accepts a variadic tail validated against `schema` (length is then "at least the fixed count" instead of exact); `s.set(...)` and `s.map(...)` gain `.min(n)` / `.max(n)` / `.size(n)` size checks (plus `.nonEmpty()` on sets). All checks compose through the existing interpreter path and carry per-check `opts` (code / key / params / fallback / message) like every other built-in check.

- [#1757](https://github.com/pyreon/pyreon/pull/1757) [`4562f97`](https://github.com/pyreon/pyreon/commit/4562f97d3a9c799a1285918c0a1e42581fb1c3fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): composition shorthand methods — `.array()` / `.or()` / `.and()`.

  The Zod-parity chainable composition sugar:

  - **`s.string().array()`** ≡ `s.array(s.string())` — `Schema<T> → ArraySchema<T>`.
  - **`a.or(b)`** ≡ `s.union(a, b)` — `Schema<T | U>`.
  - **`a.and(b)`** ≡ `s.intersection(a, b)` — `Schema<T & U>`.

  They chain and nest (`s.string().min(2).array().min(1)`, `s.number().array().array()`) and infer the right output types.

  **Implementation — tree-shake-safe, no circular import.** The base `Schema` class can't import the composition classes (that would be a load-order-fragile `extends`-time cycle). Instead it holds a tiny late-bound factory registry (reads only); each composition module self-registers its factory from its export's INITIALIZER (`export const array = registerArrayFactory(fn)`). Rollup must evaluate the initializer to produce the used export — so registration is tree-shake-safe for `s`/composition consumers — yet drops entirely for the DX-helpers-only path (verified against the built lib: `s.string().array()` works; a `withField`-only bundle contains zero composition code). The composition return types are `import type`-only in the base (erased → no runtime dependency). A bare `import { string }` that never references composition throws a clear error directing to import `s`.

  14 tests; the base never imports composition as values (the cycle is structurally impossible), and the registration is empirically verified to survive production tree-shaking in `lib/`.

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `s.string().email()` — fix overly-loose default + add server/client precision tiers.

  The default email regex was `^[^\s@]+@[^\s@]+\.[^\s@]+$`, which accepted `a@b.c`
  (single-char TLD) and most malformed input — looser than Zod 4 / Valibot / ArkType
  (all of which reject `a@b.c`). The default is now the modern consensus ('standard')
  regex: requires a 2+ char alpha TLD and rejects leading / consecutive dots.

  New `precision` option on `.email({ precision })`:

  - `'html5'` — exactly what `<input type=email>` accepts (lenient; allows `a@b.c`).
  - `'standard'` — DEFAULT, Zod-4-grade.
  - `'rfc5322'` — `'standard'` + RFC 5321 length limits (local ≤64, domain ≤255,
    total ≤254), for server-authoritative validation. The client uses the lean
    default for fast UX; the server can opt into the stricter tier (bundle size
    doesn't matter server-side) and add `.refine()` for DNS / disposable-domain checks.

  `validateEmail(value, precision?)` is exported for reuse. **Behavior change:** inputs
  the old loose regex wrongly accepted (e.g. `a@b.c`) now fail the default `.email()` —
  pass `{ precision: 'html5' }` to keep the lenient behavior.

- [#1762](https://github.com/pyreon/pyreon/pull/1762) [`6b46b71`](https://github.com/pyreon/pyreon/commit/6b46b71d1aa5c4e1a0f251a8d32f83323c20e37f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Escape-hatch primitives (Zod parity): `s.never()` (accepts no value — every input including `undefined` is an error; pair with `.optional()` to forbid a key only when present), `s.custom<T>(check?, message?)` (validate by a user predicate; with no predicate it accepts everything as `T`, emitting a `custom`-coded issue when the predicate fails), and `s.instanceof(Ctor, message?)` (assert `input instanceof Ctor` — for `File` / `Date` / `URL` / user classes; the default message names the class). All three are real `s` factories with manifest + MCP `get_api` entries.

- [#1781](https://github.com/pyreon/pyreon/pull/1781) [`aa3a8bb`](https://github.com/pyreon/pyreon/commit/aa3a8bbf2947f9e81ed9d24333ab4406ad0eb9ed) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `toFormValidator(schema, t?)` — adapt a `@pyreon/validate` schema into a `@pyreon/form` `schema` validator: a `(values) => Record<field, errorMessage>` function. Runs `schema.safeParse` and maps each issue path to a per-field error via `formatErrorsByPath` (so i18n keys resolve through `t` like every other error); valid input → `{}`. Designed for a flat object schema whose field names match the form's fields. Proven end-to-end by a new dogfood integration test in `@pyreon/form` driving a real `useForm` with an `s.object` schema (field errors, submit gating, blur, error-clearing).

- [#1780](https://github.com/pyreon/pyreon/pull/1780) [`a22d40f`](https://github.com/pyreon/pyreon/commit/a22d40fe5f8b7cec88b514968b8e41f009a70a12) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `schema.is(input): boolean` — a pure boolean validity check (typia's `is<T>` analogue): `true` iff `input` is valid, cheaper than `.parse(...).ok` when you only need the verdict. It's also the runtime half of the compile-time fast path: an internal `_attachCompiledVerdict(fn)` hook lets `@pyreon/vite-plugin` attach `@pyreon/compiler`'s `emitValidator`-produced specialized verdict for EMITTABLE schemas, so `.is()` skips the runtime op-array entirely (the cross-runtime equivalence gate proves the verdict matches). Falls back to `.parse(input).ok` when no verdict is attached; the hook is dropped on any post-attach chained method so a stale verdict can never be used. `.is()` is sync-only — an async schema returns `false` (use `parseAsync`).

- [#1762](https://github.com/pyreon/pyreon/pull/1762) [`6b46b71`](https://github.com/pyreon/pyreon/commit/6b46b71d1aa5c4e1a0f251a8d32f83323c20e37f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `s.nativeEnum(MyEnum)` — validate a VALUE of a TS native `enum` (or a `const` value-object), Zod's `z.nativeEnum`. Output type is the enum's value union (`E[keyof E]`). Correctly filters out the numeric reverse-mappings TS auto-generates (a numeric `enum { A }` compiles to `{ A: 0, 0: 'A' }`, so `'A'` is NOT accepted as input — only `0` is); `getValidEnumValues` is exported for reuse. Also fixes a latent type bug: `PyreonIssue` now declares `code?: string` (it was always set at runtime by `makeIssue`/`makeCheckIssue` but missing from the type, so reading `issue.code` failed to typecheck).

- [#1756](https://github.com/pyreon/pyreon/pull/1756) [`91aa0d0`](https://github.com/pyreon/pyreon/commit/91aa0d04f8ab21b141f3e7e0e4b05f90c02892fe) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): number comparison methods — `.gt` / `.gte` / `.lt` / `.lte` / `.step` / `.safe`.

  Zod-parity number bounds on `s.number()`:

  - **`.gt(n)` / `.lt(n)`** — strictly greater / less than `n` (EXCLUSIVE bounds). New capability — the existing `.min` / `.max` are inclusive-only, so an open interval like `gt(0).lt(10)` wasn't previously expressible.
  - **`.gte(n)` / `.lte(n)`** — inclusive aliases for `.min` / `.max` (the names Zod migrants reach for).
  - **`.step(n)`** — alias for `.multipleOf(n)`.
  - **`.safe()`** — within the IEEE-754 safe-integer RANGE (`Number.MIN_SAFE_INTEGER` … `MAX_SAFE_INTEGER`). Bounds-only, matching Zod's `.safe()` — NOT an integer-ness check (compose with `.int()` for that).

  `gt` / `lt` / `safe` are inlined on the JIT fast path (cheap comparison conditions); `gte` / `lte` / `step` delegate to the existing checks. 19 tests; both the interpreter check and the JIT inline condition are bisect-verified for `gt`.

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Object algebra on `s.object(...)`: `.pick(keys)` / `.omit(keys)` / `.partial()` /
  `.extend(shape)` / `.merge(other)` / `.keyof()`, plus the unknown-key policy
  `.strip()` (default) / `.strict()` (error on unknown) / `.passthrough()` (keep unknown,
  prototype-pollution-safe). All strictly typed (`Pick` / `Omit` / intersection / key-union).

  Also upgrades object type inference: `.optional()` / `.nullish()` fields (and every
  `.partial()` field) now infer as TRUE optional keys (`{ k?: T }`) instead of
  required-with-undefined (`{ k: T | undefined }`) — matching Zod exactly under
  `exactOptionalPropertyTypes`.

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add missing primitives to the `s` validator: `date` (with `.min`/`.max`), `bigint`
  (with `.min`/`.max`/`.positive`/`.negative`/`.multipleOf`), `null`, `undefined`,
  `void`, `nan`, `symbol`, `any`, `unknown`. Each is fully type-inferred (`Infer<S>`
  yields the exact TS type) and available on the `s.` namespace + as named exports.
  Closes the primitive-coverage gap vs Zod/Valibot from the validation audit.

- [#1734](https://github.com/pyreon/pyreon/pull/1734) [`854b611`](https://github.com/pyreon/pyreon/commit/854b611c24e96e70018c3fb81fe9138d66ab6345) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): `.required()` + `.catchall()` object methods + a parse benchmark vs Zod/Valibot/ArkType

  Closes the two object-algebra follow-ups flagged in `v1.ts`:

  - **`.required()`** — inverse of `.partial()`; unwraps `.optional()` / `.nullish()` fields back to required (round-trips with `.partial()`). `OptionalSchema`/`NullishSchema` now expose their wrapped `inner` schema so `.required()` can rebuild.
  - **`.catchall(schema)`** — validates every unknown key against `schema` and keeps it on the output (Zod semantics); takes precedence over strip/strict/passthrough and is preserved through `.pick`/`.omit`/`.partial`/`.extend`/`.merge`.

  JIT-correctness: `.catchall` disqualifies an object from the JIT plain-object inline path (`jit.ts:isPlainObject` now checks `!_catchall`) — otherwise the shape-only inline loop would silently strip unknown keys without validating them. A catchall object (root or nested under a JIT'd object) falls back to the interpreter, which is correct. Bisect-locked.

  Adds `scripts/bench/core/validate.ts` + the `bench:validate` script — a parse benchmark vs Zod 4 / Valibot 1 / ArkType 2 (warmup + timed-ops harness, `NODE_ENV=production`, a correctness gate asserts all four agree valid/invalid before timing). Result: `@pyreon/validate` is the **fastest on the error/invalid path** across every shape (2.5–50× — early-exit vs rich error allocation), and **2nd-fastest on valid-parse** (behind only ArkType's JIT, faster than Zod + Valibot). The discriminated-union root not being JIT'd is the widest valid-parse gap and the clearest tracked perf follow-up.

  All additive — no breaking changes. 348 tests (6 new), all features bisect-verified.

- [#1762](https://github.com/pyreon/pyreon/pull/1762) [`6b46b71`](https://github.com/pyreon/pyreon/commit/6b46b71d1aa5c4e1a0f251a8d32f83323c20e37f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): schema transform/refine completeness — `.pipe()` / `.superRefine()` / `.preprocess()` / `.nonoptional()`.

  Closes the remaining Zod-parity gaps in the transform/refine surface:

  - **`.pipe(target)`** — validate with `this`, then feed the (validated, transformed) output into `target`. Ideal for `coerce → validate` chains (`s.string().transform(Number).pipe(s.number().positive())`). Short-circuits if `this` fails; async-aware. Output type is `target`'s.
  - **`.superRefine(fn)`** — like `.refine`, but the callback gets a `ctx` and may add ANY number of issues (or none) via `ctx.addIssue({ message, path? })` — for cross-field validation reporting multiple problems at once. Runs only if `this` passed.
  - **`s.preprocess(fn, schema)`** — transform the raw input BEFORE `schema` validates it (Zod's `z.preprocess`), e.g. trim/coerce before the type-check.
  - **`.nonoptional(message?)`** — reject `undefined` (Zod 4), re-requiring a present value after an `.optional()`.

  All four are **wrapper schemas** (`PipeSchema` / `SuperRefineSchema` / `PreprocessSchema` / `NonOptionalSchema`) with a custom `_compileType` — zero changes to the shared compile pipeline. New exports: `preprocess` (+ on the `s` namespace), `SuperRefineCtx` type. 12 tests; superRefine's `addIssue` and preprocess's pre-validation transform are bisect-verified.

- [#1739](https://github.com/pyreon/pyreon/pull/1739) [`2c903b6`](https://github.com/pyreon/pyreon/commit/2c903b63ef1bd0488d8d2aecc1ccf01cd420728f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): client/server validation tiers — `.serverCheck(key)` + `Result.pending` + `parseAsync` context.

  One shared schema, a thin client and a heavy server. `.serverCheck(key, opts?)` declares a server-only validation step (unique-email, breach-check, DNS-MX, cross-field DB lookups). On the **client** (no validator installed) it's a no-op: the value passes and the deferred check is recorded on `Result.pending` — so the UX can show a "checking…" affordance. On the **server**, the validator registered via `registerServerCheck(key, fn)` (from `@pyreon/validate/server`) runs, sync or async; an async check promotes the parse to `parseAsync(input, { context })`, which threads an opaque context (DB handle, request) to the validator.

  Enabling infrastructure shipped alongside:

  - **Async-aware object fields and array elements.** A field/element validator that returns a Promise (an async `.serverCheck` / `.refine` under `parseAsync`) is now collected and awaited instead of rejected as "async in sync parse". The all-sync path is unchanged (no Promise allocation, byte-identical behavior).
  - **Sync/async parity in the compile pipeline.** When a composite type-check resolves async, the object/array's own checks/transforms/refines run against the resolved value, and are skipped when an async field already failed — matching the synchronous early-return semantics.
  - **JIT correctness.** A schema containing any `serverCheck` is never JIT-compiled (the generated sync code can't await); it uses the async-aware interpreter. Issue `path` is snapshotted at the check site, so a field/array-element check reports the correct path even though it resolves after the path unwinds.

  New exports: `registerServerCheck` / `uninstallServerCheck` / `ServerCheckFn` (from `@pyreon/validate/server`); `installServerCheck` / `getServerCheck` / `uninstallServerCheck` / `ServerCheckFn` and the `PendingCheck` type (from the main entry). `Result<T>`'s ok-branch gains an optional `pending?: ReadonlyArray<PendingCheck>` (additive — existing consumers unaffected). `parseAsync` now accepts an optional `{ context }` second argument.

- [#1685](https://github.com/pyreon/pyreon/pull/1685) [`7704ac1`](https://github.com/pyreon/pyreon/commit/7704ac16622a5ba6a480fef1c4364cbe8207fbb7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Shared client/server validation — one schema, one syntax, lightweight on the client and
  superior on the server.

  A new format registry lets a format check resolve a lightweight in-bundle validator by
  default (client) and a heavy superior validator when `@pyreon/validate/server` is imported
  (server). The SAME shared schema (`s.string().email()` / `.phone()`) validates leniently

  - fast on the client and strictly on the server — with the heavy server code tree-shaken
    out of the client bundle entirely (proven: the disposable-domain list / strict validators
    are absent from the main-entry bundle; present only in `@pyreon/validate/server`).

  * **New formats** everyone needs: `s.string().phone()` (lightweight E.164 shape; the
    server upgrades it to full E.164 / `libphonenumber`-grade), `.ip()` (v4/v6), `.creditCard()`
    (Luhn + length). Exported standalone validators: `validatePhone` / `validateIp` /
    `validateCreditCard`.
  * **`@pyreon/validate/server`** (new subpath, side-effect install): strict email (rfc5322
    length + disposable-domain blocklist, extensible via `addDisposableDomains`) + strict
    phone (full E.164, requires `+`). `installServerValidators()` / `isDisposableEmail` /
    `strictEmail` / `strictPhone` exported. Async DNS-MX / BIN checks compose via
    `.refine(asyncFn)` + `parseAsync`.
  * **`installFormatValidator(name, fn)`** — public API to plug your own superior validator
    for any format (e.g. wire `libphonenumber-js` server-side).

  The mechanism: presence of an installed heavy validator IS the client/server switch — the
  client never imports `/server`, so its registry stays empty (light) and the heavy code
  never reaches the browser; the server imports `/server` and the same schemas validate
  strictly. Resolved at parse time, so it works even with the compile-once validator cache.

- [#1772](https://github.com/pyreon/pyreon/pull/1772) [`b74d773`](https://github.com/pyreon/pyreon/commit/b74d773a7ed348790e5648cd3599d95f7aec508b) Thanks [@vitbokisch](https://github.com/vitbokisch)! - String format long-tail (Zod-4 parity): `s.string()` gains `.cuid()` (v1 cuid, distinct from the existing `.cuid2()`), `.base64url()` (URL-safe alphabet), `.cidr()` (IPv4/IPv6 CIDR notation — splits on `/` and reuses the vetted IP regexes + an in-range prefix check, avoiding a ReDoS-prone IPv6 regex), `.duration()` (ISO 8601 duration, e.g. `P3Y6M4DT12H30M5S` / `PT1H`), and `.e164()` (E.164 phone). All route through the same client/server `resolveFormat` registry as the other formats and carry per-check `opts`.

- [#1745](https://github.com/pyreon/pyreon/pull/1745) [`feff537`](https://github.com/pyreon/pyreon/commit/feff5377d068298ec0a936381bcafedec3bd9a68) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): modern string format checks — `cuid2` / `ulid` / `nanoid` / `emoji` / `base64` / `jwt`.

  Adds the modern ID + encoding formats every Zod/Valibot migrant expects, as `s.string()` methods:

  - `.cuid2()` — lowercase alphanumeric, starts with a letter
  - `.ulid()` — Crockford base32, 26 chars (case-insensitive)
  - `.nanoid()` — URL-safe alphabet (`A-Za-z0-9_-`)
  - `.emoji()` — one or more emoji code points (Unicode property escapes)
  - `.base64()` — standard alphabet with optional `=` padding
  - `.jwt()` — three base64url segments (`header.payload.signature`)

  Each routes through the **client/server registry seam** (`resolveFormat`), so a server can swap in a stricter validator for any of them in place via `installFormatValidator(name, fn)` — the same mechanism `@pyreon/validate/server` uses to upgrade `email` / `phone`, without touching the shared schema. (`datetime` is intentionally omitted — already covered by `.iso.dateTime()`.)

  15 new tests; the registry-routing + check logic both bisect-verified. No new public exports (these are `s.string()` methods, like the existing `.email()` / `.uuid()`), so no manifest `api[]` / snapshot change.

- [#1762](https://github.com/pyreon/pyreon/pull/1762) [`6b46b71`](https://github.com/pyreon/pyreon/commit/6b46b71d1aa5c4e1a0f251a8d32f83323c20e37f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): `s.stringbool()` + manifest `api[]` enrichment for the new methods.

  - **`s.stringbool(opts?)`** — coerce a boolean-ish STRING to a real boolean (Zod 4's `z.stringbool`). Type-checks a string, then maps configured truthy/falsy tokens (case-insensitive, trimmed; defaults `true`/`1`/`yes`/`on`/`y`/`enabled` ↔ `false`/`0`/`no`/`off`/`n`/`disabled`) to `true`/`false`; anything else errors. Stricter + more explicit than `s.coerce.boolean()` (which applies JS truthiness to any input). Custom `truthy` / `falsy` / `message` via options.
  - **Docs:** added `api[]` manifest entries (→ MCP `get_api` + the generated reference page) for the notable methods shipped across this batch that were changeset-only: `array` / `or` / `and` / `pipe` / `superRefine` / `preprocess` / `nonoptional` / `stringbool`.

  19 stringbool tests; manifest snapshot updated to 21 entries.

### Patch Changes

- [#1688](https://github.com/pyreon/pyreon/pull/1688) [`0f32910`](https://github.com/pyreon/pyreon/commit/0f3291083795e3b48ca5567e1f62b1dc5258e0e3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Recursive JIT validator codegen — faster on more shapes, two latent bug-fixes.

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

- [#1749](https://github.com/pyreon/pyreon/pull/1749) [`73ccb68`](https://github.com/pyreon/pyreon/commit/73ccb68938cfa572ca8314b711224aeab52c8c65) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(validate): route `url` / `uuid` / `iso.date` / `iso.dateTime` / `iso.time` through the client/server format registry.

  These five string formats validated against a hardcoded regex, so — unlike `email` / `phone` / `ip` / `creditCard` (and the new cuid2/ulid/nanoid/emoji/base64/jwt) — a server could NOT upgrade them via `installFormatValidator`. They now route through `resolveFormat(name, lightDefault)` like every other format, so **all** string formats are client/server-upgradeable.

  The client default behavior is unchanged (same regexes); the method signatures are unchanged. Registry names: `url`, `uuid`, `iso-date`, `iso-datetime`, `iso-time`.

  9 tests; the routing is bisect-verified (reverting `uuid` to the hardcoded regex fails the upgrade specs).

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - JIT validator codegen — the "fastest" path. Pure object-of-primitives / primitive-array
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

- [#1684](https://github.com/pyreon/pyreon/pull/1684) [`9ce4743`](https://github.com/pyreon/pyreon/commit/9ce474358f4646af32ac06a9a9c3f95da9f5f559) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Object / array / record / tuple / discriminatedUnion parse is now 33–75% faster:
  child values are validated against the SHARED parse context via a new `_runInto`
  fast path instead of `~standard.validate`, eliminating a per-field `ctx` allocation,
  a per-field result-object allocation, and a per-issue path spread. Measured (vs the
  validation-audit harness): object-of-4-fields valid parse 393→262 ns (−33%), the
  same invalid 1180→300 ns (−75%, now the fastest of Zod/Valibot/ArkType on that op),
  20-element array valid parse 3434→1610 ns (−53%, now beats Zod). Also fixes a latent
  correctness bug surfaced by the change — issue `path`s were stored as references to
  the mutated `ctx.path` array (reading back as `[]` after parse unwound); issue paths
  are now snapshotted at creation.
- Updated dependencies []:
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65)]:
  - @pyreon/reactivity@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.32.0

### Patch Changes

- [#1499](https://github.com/pyreon/pyreon/pull/1499) [`4529407`](https://github.com/pyreon/pyreon/commit/4529407d69ba0875568b5c78ff14e2850aa2d690) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Core + fundamentals deep-audit fixes. `@pyreon/validate`: corrected the outdated "Pyreon does NOT ship its own validator runtime / ~1-2KB gz" claim across the entry docstring, README, manifest, and docs page — since v1 the package ships Pyreon's own `s` validator runtime; the accurate, measured contract is tree-shaking (DX-helpers-only import ≈0.5KB gz; the runtime ≈3.9KB gz pulled in only when `s`/primitives are imported). `@pyreon/code`: minimap's canvas click listener is now stored and explicitly removed in the plugin's `destroy()` — completes the destroy contract (the listener was element-scoped so it normally died with the canvas, but explicit removal protects against any external retention of the canvas). `@pyreon/runtime-dom`: fixed a misleading dev-gate comment in template.ts (claimed `import.meta.env.DEV`; the code correctly uses the bundler-agnostic `process.env.NODE_ENV !== 'production'` gate).

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/reactivity@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0)]:
  - @pyreon/reactivity@0.33.0

## 0.28.1

### Patch Changes

- [#1210](https://github.com/pyreon/pyreon/pull/1210) [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(coverage): bulk-bump 31 packages' `statements` threshold 94 → 95 (already passing)

  PR 1 of the "whole-repo coverage ≥ 95%" initiative (user-approved sequence:
  by-gap-size, start with quick wins).

  Every package in this bump is **already reporting ≥ 95% actual** per
  `bun scripts/check-coverage.ts`. Locking the configured threshold in
  match prevents regressions and lets the `Coverage (Full)` CI gate enforce
  the new floor.

  **No runtime changes, no test additions** — pure config update.
  Drift-detection in `BELOW_FLOOR_EXEMPTIONS` was triggered for two
  exemption entries (`@pyreon/code`, `@pyreon/kinetic`) which had been
  listed with `currentStatements: 94`; updated to 95 with the new reason
  documenting the lift.

  Packages bumped (current actual in parens):

  - @pyreon/attrs (100), @pyreon/coolgrid (100), @pyreon/table (100), @pyreon/toast (100)
  - @pyreon/rocketstyle (99.41), @pyreon/primitives (99.26), @pyreon/i18n (99.21), @pyreon/validation (99.12)
  - @pyreon/rx (98.45), @pyreon/kinetic (98.24), @pyreon/feature (98.11), @pyreon/head (97.97), @pyreon/flow (97.94), @pyreon/form (97.94), @pyreon/document-primitives (97.82), @pyreon/preact-compat (97.68), @pyreon/server (97.54), @pyreon/svelte-compat (97.42), @pyreon/validate (98.69), @pyreon/dnd (97.33)
  - @pyreon/query (96.79), @pyreon/mcp (96.52), @pyreon/unistyle (96.36) [already 95], @pyreon/reactivity (96.13), @pyreon/connector-document (96.05), @pyreon/react-compat (96.03) [already 95]
  - @pyreon/storage (95.6), @pyreon/permissions (95.38), @pyreon/url-state (95.13), @pyreon/runtime-dom (95.02), @pyreon/code (95.02), @pyreon/core (95.68), @pyreon/vite-plugin (95.32)

  Pre-existing CI failures NOT addressed in this PR (separate follow-ups):

  - @pyreon/sized-map: 0% reported by check-coverage.ts (test detection bug — Tier 5)
  - @pyreon/styler: 93.16% < 94% threshold (Tier 3)
  - @pyreon/ui-core: 90.94% < 94% threshold (Tier 4)
  - @pyreon/zero: 91.65% < 94% threshold (Tier 4)
  - @pyreon/runtime-dom: branches 85.78% < 88% threshold (Tier 6)

  Next PR (Tier 2): close the < 1pt gaps on charts, elements, hooks,
  hotkeys, lint, router, state-tree with focused test additions.

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0

## 0.26.3

## 0.26.2

## 0.26.0

### Minor Changes

- [#966](https://github.com/pyreon/pyreon/pull/966) [`77ba200`](https://github.com/pyreon/pyreon/commit/77ba200143f6092bbea41737e86612f6a75ed8bf) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): chainable `.toLowerCase()` / `.toUpperCase()` / `.trim()` on StringSchema + coverage hardening (closes BELOW_FLOOR_EXEMPTIONS)

  The validator's `core/ops.ts` declared `Op` kinds for `to-lower-case`/
  `to-upper-case`/`trim` from v1 (PR [#952](https://github.com/pyreon/pyreon/issues/952)) but never exposed chainable
  methods for them — the gap that drove the temporary `BELOW_FLOOR_EXEMPTIONS`
  entry for `@pyreon/validate` at 80/75/80 vs the 90/85/90 fundamentals
  floor. This PR ships the missing chainable surface AND lifts coverage
  from 83.58 → 98.69% statements / 78.38 → 94.3% branches / 83.21 → 98.6%
  functions via 46 additional bisect-targeted tests across the string
  transforms + `pipe()` invocation paths + uncovered-but-typed branches
  in number/array/object/schema/issue.

  What changes for users:

  ```ts
  import { s } from "@pyreon/validate";

  // New: declarative case + whitespace transforms — applied before any
  // further checks, so `.trim().min(3)` works the way it reads.
  const handle = s.string().trim().toLowerCase().min(3);
  handle.parse("  Alice  "); // → { ok: true, value: 'alice' }
  ```

  Internally these are `{ kind: 'transform', fn }` ops with the same
  compile-once-cached-thereafter contract as `.transform(fn)` — no new
  hot-path cost.

  Coverage exemption + lowered vitest thresholds removed in the same PR;
  `@pyreon/validate` now sits at the fundamentals 90/85/90 floor with
  significant headroom.

- [#952](https://github.com/pyreon/pyreon/pull/952) [`c288ea4`](https://github.com/pyreon/pyreon/commit/c288ea4a5356d7c0bb92a32914a2243a5c6e1311) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(validate): Pyreon's own validator library — Standard Schema-native, hybrid chainable + function-comp API

  **This is a major rev that turns `@pyreon/validate` from a DX overlay (its previous shape — `withField` / `parseReactive` / `formatErrors` only) into a full Pyreon-owned validator runtime. The DX layer stays — it now works on top of Pyreon's own schemas AND any other Standard Schema validator (Zod 3.24+, Valibot 1.0+, ArkType 2.0+, typia, etc.).**

  ## What ships

  ### Hybrid API surface — chainable + function-comp

  ```ts
  // Chainable (Zod-like, familiar):
  import { s } from "@pyreon/validate";

  const userSchema = s.object({
    name: s.string().min(2).max(50).field({ label: "Name" }),
    email: s.string().email().field({ i18nLabel: "auth.email" }),
    age: s.number().int().between(0, 150).optional(),
  });

  type User = s.Infer<typeof userSchema>;

  // Function-comp (Valibot-like, tree-shake-friendly):
  import {
    object,
    string,
    number,
    email,
    min,
    max,
    int,
    between,
    optional,
  } from "@pyreon/validate";

  const userSchema = object({
    name: string().min(2).max(50).field({ label: "Name" }),
    email: string().email().field({ i18nLabel: "auth.email" }),
    age: number().int().between(0, 150).optional(),
  });
  ```

  Both produce identical schema instances. Internally a single `Schema<T>` class with an `_ops` list; chainable methods append; the compiler turns the ops into a single closure on first parse — chain-friendly DX, no method-dispatch cost per parse.

  ### v1 surface

  - **Primitives**: `string`, `number`, `boolean`, `literal`, `enum` (exported as `enum_` to avoid the reserved-word collision; `s.enum` alias works)
  - **Composition**: `object`, `array`
  - **Modifiers**: `optional`, `nullable`, `nullish`, `default`, `transform`, `refine`, `brand`, `describe`, `field`
  - **String checks**: `min`, `max`, `length`, `nonEmpty`, `regex`, `email`, `url`, `uuid`, `iso.date`, `iso.dateTime`, `iso.time`, `startsWith`, `endsWith`, `includes`
  - **Number checks**: `min`, `max`, `int`, `finite`, `positive`, `negative`, `nonNegative`, `nonPositive`, `between`, `multipleOf`
  - **Array checks**: `min`, `max`, `length`, `nonEmpty`
  - **Parse entry points**: `.parse(input)` → `Result<T, Issue[]>` (no throw); `.parseOrThrow(input)` → `T` (throws `ValidationError`); `.safeParse(input)` (Zod-compat alias); `.parseAsync(input)` for async refines; `~standard.validate(input)` for Standard Schema interop
  - **Type helpers**: `Infer<S>`, `Input<S>`, `Output<S>`
  - **DX layer (unchanged from prior shape)**: `withField` / `getMeta` / `resolveMetaField`, `parseReactive` / `parseReactiveAsync` / `watchValid`, `formatError` / `formatErrors` / `formatErrorsByPath`

  ### Standard Schema-native

  Every schema implements `StandardSchemaV1` directly. This means:

  - Existing `@pyreon/form` (which accepts StdSchema via `bindSchema()` in `@pyreon/validation`) works with Pyreon-validate schemas with zero adapter overhead.
  - DX helpers (`withField` / `parseReactive` / `formatErrors`) work on Pyreon-validate schemas AND any other StdSchema validator — full backward compat for users who already have Zod / Valibot / ArkType schemas.
  - A future compiler-emit PR can target any Standard Schema validator (Pyreon-validate or external) — the `_compiled` sidecar contract is generic.

  ### Issues carry i18n keys natively

  Every built-in check emits issues with pre-populated `code` / `key` / `params` / `fallback`. `s.string().min(2).parse('a')` produces:

  ```ts
  {
    ok: false,
    issues: [{
      code: 'too_small',
      key: 'validate.string.too-short',
      params: { min: 2, actual: 1 },
      fallback: 'Must be at least 2 characters',
      message: 'Must be at least 2 characters',
      path: [],
    }]
  }
  ```

  Apps pipe `result.issues` through `formatErrors(issues, t)` from `@pyreon/i18n` to get translated strings.

  ### Tests + validation

  - **113 tests** covering primitives × checks × composition × modifiers × parse paths × hybrid-API parity × cross-lib StdSchema compat (Pyreon-validate schemas plugged into `@pyreon/validation`'s `wrapStandardSchema`).
  - **Typecheck + lint + repo-wide gates** all green.
  - **3 bisect-verified specs**: string type-check disabled → 4 specs fail; optional/nullish modifier prelude disabled → 4 specs fail; object unknown-key stripping disabled → 1 spec fails.
  - Bundle size **4.41 KB gz** (locked at 5.5 KB with 25% headroom).

  ### Out of scope (deliberate v1 deferrals)

  - **PR [#2](https://github.com/pyreon/pyreon/issues/2) — Compiler-emit.** `@pyreon/compiler:analyzeValidate()` emits typia-class specialized validators per schema at build time, working against any Standard Schema validator. Plan documented in `.claude/plans/synchronous-chasing-puffin.md`.
  - **PR [#3](https://github.com/pyreon/pyreon/issues/3) — Composition surface.** `tuple`, `record`, `union`, `discriminate`, `intersection`; primitive `date`, `bigint`, `null`/`undefined`/`void`; modifiers `.pick`, `.omit`, `.partial`, `.required`, `.extend`, `.merge`, `.coerce`.
  - **PR [#4](https://github.com/pyreon/pyreon/issues/4) — `@pyreon/feature` migration.** `defineFeature` defaults to Pyreon-validate schemas; existing Zod adapter remains.
  - **PR [#5](https://github.com/pyreon/pyreon/issues/5) — `@pyreon/zero` loader integration.** Loaders / search-param validators take Pyreon-validate or any StdSchema directly.

  ## Supersedes PR [#952](https://github.com/pyreon/pyreon/issues/952)

  PR [#952](https://github.com/pyreon/pyreon/issues/952) introduced `@pyreon/validate` as a DX-only overlay on top of any Standard Schema validator. This PR keeps every line of that DX code (it's verbatim — `withField` / `parseReactive` / `formatErrors` and their 53 tests) AND adds the actual validator runtime. PR [#952](https://github.com/pyreon/pyreon/issues/952) is closed in favor of this PR.

### Patch Changes

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74)]:
  - @pyreon/reactivity@0.33.0
