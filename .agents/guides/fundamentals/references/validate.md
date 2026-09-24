# @pyreon/validate

## API

- The `s` validator runtime plus DX helpers over Standard Schema: `withField`, `getMeta`, `resolveMetaField`, `parseReactive`, `parseReactiveAsync` (a stale in-flight run resolves to the latest run's verdict), `watchValid`, `formatErrors`.
- `s`: primitives, object/array composition, modifiers, 20+ checks, object algebra (`.pick/.omit/.partial/.required/.extend/.merge/.keyof/.catchall`).
- Async members (`.refine`, `.transform`, a registered `.serverCheck`) work inside every composition, including the JIT. A sync `parse()` of an async tree reports one "use parseAsync" issue at the root.
- `s.discriminatedUnion` accepts literal/enum/nativeEnum discriminants; a non-registrable field or duplicate tag throws at construction.
- `.catch` runs against a private child context, so it can never swallow a sibling field's issues under `parseAsync`.
- `toJsonSchema(schema)` (`@pyreon/validate/json-schema`) emits draft 2020-12 for the input shape. Unrepresentable kinds throw or become `{ unrepresentable: 'any' }`; a cyclic lazy schema throws (no `$defs`).
- Subpaths: `/mini` (tree-shakeable functional form), `/json-schema`, `/server`.

## Build options (`@pyreon/vite-plugin`)

- The chainable `s.` API does not tree-shake (prototype methods). `pyreon({ optimizeValidators: true })` rewrites module-level `const X = s.<chain>` to the `@pyreon/validate/mini` form at build time (parity-locked).
- `pyreon({ compileValidators: true })` inlines a monomorphic verdict for `.is()`. It is currently about 2× slower than the default runtime `.is()`, which has its own verdict JIT.
- Both cover statically analyzable chains (primitives, common checks, object/array/optional); other chains stay on the full runtime.

## JIT

- `tryCompileJit` flattens pure object/array/primitive/DU shapes into one monomorphic `new Function`:
  - `ctx.path` is untouched on the valid path; issue paths are rebuilt only at failure sites.
  - Format checks go through a memoized resolver and `_pred` predicates.
  - A lazy `EMPTY_PATH` sentinel means scalar and flat-object parses allocate no path arrays.
  - A DU root compiles to a discriminant `switch` with member bodies inlined.
  - All-inline-primitive objects build their stripped clone as one object literal.
  - A fully inline tree is branded `_jitPure`; `parse`/`~standard.validate` reuse a per-schema context, and `parse` is installed as an own property closing over the compiled function.
- `.is()` uses a separate verdict-only emission (`tryCompileJitCheck`): every failure is `return false`, no output or issue is built, and the function takes only the input. Shapes it cannot express (a `_runInto` fallback, or a check with neither an inline condition nor a `_pred`) are refused and `.is()` keeps the parse path.
- The verdict function is built in the same pass as `_compiled`, not lazily. A chained method mutates a schema in place and invalidates only that schema, not its ancestors; two artifacts built at different times go stale differently, and `.is()` would disagree with `.parse().ok`. `.is()` reads one field on the hot path.
- Locked by the JIT↔interpreter differential fuzz suites in `src/tests/` (`jit-differential`, `jit-async-differential`, `jit-du-differential`, `jit-partial-inline-differential`, `jit-check-differential`). `jit-check-differential.test.ts` asserts `is(x) === parse(x).ok`, counts how many schemas the verdict emitter actually served (so a refusal cannot make it compare parse with itself), and covers the shared-child staleness case. `format-registry-routing.test.ts` checks the resolver switches to the `/server` validator on install.

## Performance standings

Bench: `bench/validation.ts`, results in `bench/results/` (`final-2026-08-31.txt`, `final-2026-09-06-four-cells.txt`, `own-parse-2026-09-07-four-cells.txt`). Competitors: zod 4.5 (interpreted and `z.compile()`), valibot, arktype, typebox (check only), typia, yup, joi. Two axes: `parse` (produce output) and `check` (boolean; zod's `check` is a full `safeParse`). Do not claim "fastest on every cell" — zod-compiled and ArkType lead on several.

- `check`: fastest or CI-tied on 10 of 12 cells. Both losses are `string.email` (ArkType and typia about 1.3× ahead).
- `parse`, invalid input: outright win on 4 of 5 shapes; typia wins scalar number-range invalid by about 1.2×.
- `parse`, valid input: not ahead anywhere. zod-compiled wins scalar number-range, array-of-20 and object-with-array-of-objects; ArkType and typia win scalar email; ArkType wins flat object; deep-nested and DU tie. Still ahead of interpreted Zod, Valibot, Yup and Joi on every valid shape.
- Known causes on the valid path: ArkType returns the input by reference while Pyreon returns a stripped clone (deliberate). zod-compiled also clones, so cloning is not the gap against it; the deep-cell remainder has no identified mechanism.
- The `parse()` seam's SIZE decides whether V8 inlines it: keep the hot seam tiny (the `Result` envelope allocation itself is not the cost).
- Refuted levers (do not re-propose): a one-unit `jitParse(input)` wrapper, and emitting the `Result` envelope inside the validator (it outgrew the inliner and slowed DU).

Harness rules:

- Rotate an input pool per scenario (8 same-shape entries). With one constant input, V8 hoists the call out of the loop and the table ranks inlinability.
- Round-robin processes across libraries in a row, so a load burst widens every CI instead of landing on one library.
- Sub-nanosecond seam verdicts come only from `bench/four-cells.ts` (process-isolated); in-process probes have a ±1.5 ns slot bias.
- Contention inflates absolutes and widens CIs into ties, so a loaded run reads as MORE dominant than a quiet one; record machine load with every run.
- Setup cost reports only an explicit compile call (`z.compile`, `TypeCompiler.Compile`).
- typia validators are generated ahead of time with a TypeScript 7 toolchain the repo does not use, so its fixtures are vendored as plain JS in `bench/typia/`; the bench's cross-library correctness gate catches drift. On the parse axis use `plain.createValidateClone` (`typia.validate` returns the input by reference).
