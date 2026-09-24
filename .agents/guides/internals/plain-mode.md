# Plain Mode (experimental) — reactive code as plain JavaScript

A module with the `'use plain'` directive, or one importing from `@pyreon/core/plain`, is rewritten by `transformPlain` (`@pyreon/compiler`) before the JSX transform. Both compiler backends then see classic code, so templates, SSR, hydration and native need no awareness of the dialect.

## Lowering

- `let count = state(0)` → `const count = signal(0)`. Every read becomes a tracked call; every write becomes `.set(...)`, including compound, update and logical-assign forms (expression positions keep JS value semantics).
- `derived(expr)` → `computed(() => expr)`.
- `effect(fn)` gets total tracking: conditionally read state is hoisted into a `void (…)` prologue, so a branch flip or a read after `await` never loses its subscription. Write-only bindings and write targets are never hoisted, so an effect cannot retrigger itself.
- Component props destructuring (`{ name, size = 'm' }`, parameter or body form) becomes live `props.*` reads.
- A component-body `if (<reactive>) return <jsx>` wraps the rest of the body in a returned accessor, so the branch re-evaluates.
- The Vite plugin also transforms `.ts`/`.mts` modules carrying the marker (`detectPlain` gate).

## Three laws

1. A read is a read: it yields the value everywhere.
2. Liveness comes from position.
3. Arguments are values; module exports are live. `export let x = state(0)` exports the signal, and the Vite plugin's registry feeds importers (classic and plain) via `knownSignals`. Assigning to an imported binding warns.

## Deep state

- A literal object or array initializer lowers to `signal(createStore(<literal>))`. The outer signal makes the root read a tracked call, so JSX children, attributes and props stay live with no downstream changes; the store proxy gives per-key updates (`todos.push(t)`, `user.name = x`).
- Whole reassignment `user = v` becomes `signal.set(createStore(v))`; later mutations on the new value still track.
- `state.raw(v)` opts a literal out: shallow signal, replace semantics, member mutation warns. A non-literal argument is always shallow.

## Unsupported shapes (each emits a warning)

- Deep mutation on shallow state (`state.raw` or non-literal) — replace the object instead.
- Destructuring assignment onto state.
- Rest or nested props patterns.
- Compound assignment or `++` on a deep-state binding.

Plain code that reaches the runtime unprocessed throws `[Pyreon] state() … reached the runtime`; the diagnose catalog explains the fix.

## Codemod and readiness report

`pyreon plain [paths] [--write] [--json]` runs `migrateToPlain` (`@pyreon/compiler`) per binding:

- `x()` → `x`, `.set` → assignment, simple `.update` param-substituted, `.peek` → `untrack(() => x)`.
- Object-literal signals become `state.raw`, because the codemod never changes semantics.
- Any other reference declines the binding with a named reason. The dry run is the readiness report, including a histogram of declined shapes.

`runtime-dom/src/tests/plain-roundtrip-fuzz.test.tsx` is a round-trip oracle: seeded classic programs → codemod → compile both → compare DOM behaviour.

## Integrations

- **PMTC**: `parsePyreon` runs the same pre-pass via the `@pyreon/compiler/plain` subpath; a plain file emits the same Swift/Compose as its classic twin.
- **Reactivity Lens**: plain warnings appear as `plain-mode` findings in `analyzeReactivity`.

## Rust mirror

`native/src/plain.rs` (napi `transformPlain`) mirrors the pre-pass. `transformJSX` prefers it when the binary exports it; a throw falls back to JS, while a `null` result is a verdict.

- Byte equality of code and warnings is the contract, locked by `plain-native-equivalence.test.ts` (shape corpus plus 300 fuzz seeds in CI).
- The JS implementation is the oracle. Any dialect change lands in both implementations in one PR.
- The port's `Magic` replicates the MagicString subset used (left-before-right insert ordering at one position, call order within a side) and preserves JS `Set` insertion order with ordered `Vec`s.

## Tests

- `compiler/src/tests/plain.test.ts`, `plain-migrate.test.ts` — emit shapes.
- `runtime-dom/src/tests/plain-mode.test.tsx` — DOM updates, per-key deep state, classic/plain equivalence, SSR + hydrate.
- `vite-plugin/src/tests/plain-mode.test.ts` — cross-module exports, including deep and raw.
- `native/compiler/src/tests/native-plain-mode.test.ts` — PMTC emit equality.
