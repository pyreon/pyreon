# Plain Mode — reactive code as plain JavaScript

A module with the `'use plain'` directive, or one importing from `@pyreon/core/plain`, is rewritten by `transformPlain` (`@pyreon/compiler`) before the JSX transform. Both compiler backends then see classic code, so templates, SSR, hydration and native need no awareness of the dialect.

## Lowering

- `let count = state(0)` → `const count = signal(0)`. Every read becomes a tracked call; every write becomes `.set(...)`, including compound, update and logical-assign forms (expression positions keep JS value semantics).
- `derived(expr)` → `computed(() => expr)`.
- `effect(fn)` gets total tracking: conditionally read state is hoisted into a `void (…)` prologue, so a branch flip or a read after `await` never loses its subscription. Write-only bindings and write targets are never hoisted, so an effect cannot retrigger itself.
- Component props destructuring (`{ name, size = 'm' }`, parameter or body form) becomes live `props.*` reads. Nested patterns read live paths (`{ user: { name } }` → `props.user.name`); a top-level rest becomes `splitProps(props, [...keys])[1]` (injected as `__plainSplitProps` from `@pyreon/core`), so `{...rest}` stays reactive.
- Destructuring assignment onto state (`[a, b] = [b, a]`) becomes an IIFE over temporaries seeded with `.peek()`: `((v) => { let t0 = a.peek(), …; ([t0, t1] = v); a.set(t0); …; return v })(rhs)`. The pattern keeps its own shape (iteration, defaults, rest, nesting); defaults read the temporaries so `[a, b = a] = [5]` gives `b = 5` exactly as JS.
- `signalOf(x)` → the bare signal (identity escape hatch); `key: signalOf(key)` restores the shorthand `key`. `state.from(sig)` / `derived.from(sig)` adopt an existing signal as a plain binding (the declaration becomes the bare expression).
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

## Project-wide mode

`pyreon({ plain: true })` passes `plain: true` to `transformJSX` for every non-`node_modules` module; `transformPlain(…, { force: true })` then runs even without a marker. A `'use classic'` directive opts a module out. A forced module WITHOUT a marker always takes the JS pre-pass (activation is not part of the byte-parity dialect, and an older per-platform native binary would return a `null` verdict and silently skip it). zero forwards the option to its SSR sub-build (`INNER_PYREON_OPTION_DISPOSITION.plain = 'forward'`).

## Unsupported shapes (each emits a warning)

- Deep mutation on shallow state (`state.raw` or non-literal) — replace the object instead.
- Rest inside a nested props pattern, computed props keys, a default on a nested props object.
- Compound assignment or `++` on a deep-state binding; `for (x of …)` writing state.
- Assigning (directly or by destructuring) to derived, props, or imported state.

Plain code that reaches the runtime unprocessed throws `[Pyreon] state() … reached the runtime`; the diagnose catalog explains the fix.

## Codemod and readiness report

`pyreon plain [paths] [--write] [--json]` runs `migrateToPlain` (`@pyreon/compiler`) per binding:

- `x()` → `x`, `.set` → assignment (an arrow returning the write becomes a block body, keeping `undefined`), `.peek` → `untrack(() => x)`.
- `.update(fn)`: a simple callback is substituted with GRANULAR edits (so rewrites of other bindings inside the body survive); anything else — and ANY `.update` inside an effect/computed, where a substituted read would subscribe — becomes `x = (fn)(untrack(() => x))`, the exact untracked read `_update` performs.
- Identity uses (passed, stored, `.subscribe`, a component prop) → `signalOf(x)`; inside call arguments / component props in TS it emits `signalOf<typeof x>(x)` because TypeScript otherwise infers from the contextual type. A bare signal in a JSX child or DOM attr stays a plain read (the compiler auto-calls it either way).
- Declines: called with arguments, `.set`/`.update` result used, reassigned binding, mixed declaration, and EXPORTED signals (importers still call `x()`).
- Marker names that collide with a binding anywhere in the file are imported under `plain*` aliases; kept reactivity specifiers keep their `type` modifier.
- Object-literal signals become `state.raw`, because the codemod never changes semantics.

`runtime-dom/src/tests/plain-roundtrip-fuzz.test.tsx` is a round-trip oracle: seeded classic programs → codemod → compile both → compare DOM behaviour.

## Integrations

- **PMTC**: `parsePyreon` runs the same pre-pass via the `@pyreon/compiler/plain` subpath; a plain file emits the same Swift/Compose as its classic twin. The total-tracking `(void (…), expr)` prologue lowers to `expr` (a `SequenceExpression` whose leading elements are all `void` — any other comma expression still warns); before that, PMTC fell back to an empty string for the whole derived value.
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
- `native/compiler/src/tests/native-plain-mode.test.ts` — PMTC emit equality; `native-plain-parity-fixes.test.ts` — the prologue lowering + emit determinism (per-file name counters reset on every emit).
- `core/src/tests/plain-markers.types.test.ts` — marker types (thunk `derived`, `signalOf`, `state.from`).
