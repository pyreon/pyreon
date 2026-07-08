# @pyreon/store

## 0.42.0

### Minor Changes

- [#2130](https://github.com/pyreon/pyreon/pull/2130) [`0a76111`](https://github.com/pyreon/pyreon/commit/0a76111189ea80ed676f898f0c8c1b08b320ca23) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Schema-driven stores are now **strictly typed from the schema end-to-end.** The consumer-facing `SchemaStoreApi` previously degraded to `Record<string, unknown>` / `unknown` on `set` / `patch` / `deepPatch` / `update` / `state`; it now infers every field type from the schema (`InferSchema<S>`), with zero manual annotations and no casts:

  - `state` — the typed field-value snapshot (`InferSchema<S>`).
  - `set(next)` — requires the full schema shape.
  - `patch(partial)` — a typed `Partial`.
  - `deepPatch(partial)` — a typed `DeepPartial`.
  - `update(key, current => next)` — `key` is constrained to the schema FIELD names (setup-returned actions/computeds are rejected), and the transformer receives + returns the field's exact type `TRaw[K]`.

  This is a **types-only** change — the runtime already validated every write through the schema; only the compile-time surface got stricter. `SchemaStoreApi` now takes two type params, `SchemaStoreApi<TRaw, TStore = SignalsOf<TRaw>>`. Code that relied on the old loose types (e.g. `update`'s `unknown` transformer, or `update`-ing a computed key) will now fail typecheck — that's the point; remove the now-unneeded casts.

### Patch Changes

- Updated dependencies [[`f2a5a26`](https://github.com/pyreon/pyreon/commit/f2a5a262b5b497e735c825678c2b7a86d55ec87a), [`1a29fc3`](https://github.com/pyreon/pyreon/commit/1a29fc3d761b4facfe5e77d1503ffc3fd4f036e3), [`707e1be`](https://github.com/pyreon/pyreon/commit/707e1bee8455d0347dc13dd0f6845dd60971588e)]:
  - @pyreon/validation@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.41.0
  - @pyreon/validation@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/validation@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/reactivity@0.39.0
  - @pyreon/validation@0.39.0

## 0.38.0

### Minor Changes

- [#1927](https://github.com/pyreon/pyreon/pull/1927) [`442cc26`](https://github.com/pyreon/pyreon/commit/442cc26728fe5704a8bc9d8782f419d7a36a683a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - SSR store hydration — `dehydrateStores` / `hydrateStores` + framework auto-wiring

  The `dehydrate → inline-script → hydrate` handshake (the TanStack-Query / loader-data
  pattern, for `@pyreon/store`), wired into the SSR pipeline:

  - **@pyreon/store**: `dehydrateStores(filter?)` (server) snapshots every active
    per-request store's signal `.state` into a JSON-serializable `Record<id, state>`;
    `hydrateStores(data)` (client) seeds the stores back before mount — lazily and as a
    boot-time one-shot. Registers a decoupled `globalThis` bridge on import so the
    framework can drive the handshake with no hard dependency (the styler-flush pattern).
  - **@pyreon/server**: `renderPage` reads the bridge inside the request context and
    appends `<script>window.__PYREON_STORE_STATE__=…</script>` (same safe serializer as
    loader data) — so handler / SSG / dev all inject it with no caller change.
  - **@pyreon/zero** + **@pyreon/server** client entries: seed stores from the snapshot
    before mount.

  This makes cross-island shared state production-complete: two islands that both import
  the same store already share one instance on the client (the registry is a module
  singleton), so a signal write in one is seen by the other with zero prop-drilling — the
  only missing piece was hydrating that shared store once with server state.

### Patch Changes

- [#1931](https://github.com/pyreon/pyreon/pull/1931) [`e08cf4b`](https://github.com/pyreon/pyreon/commit/e08cf4b9650f6e6c172b690eff2b192acc0ecb9a) Thanks [@vitbokisch](https://github.com/vitbokisch)! - docs: fix the broken devtools example in the README. It imported a
  non-existent `storeRegistry` symbol (`import { storeRegistry } from
'@pyreon/store/devtools'`) — the actual `@pyreon/store/devtools` API is
  `getRegisteredStores()` / `getStoreById(id)` / `onStoreChange(listener)`.
  The documented snippet threw `undefined is not iterable`; corrected to the
  real API. No runtime change.

- [#1899](https://github.com/pyreon/pyreon/pull/1899) [`979e434`](https://github.com/pyreon/pyreon/commit/979e4342776021eac5bfaed1c9e5ac0c4787dacc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf: lazy per-signal change-detection subscription. The store kept per-signal subscribers only to feed store-level `subscribe()` callbacks + the `patch()` mutation event, but subscribed EAGERLY at creation — and most stores never call `.subscribe()`. That was pure overhead AND it forced every signal write onto the slow batched-notify path (a subscribed signal written inside the `patch()`/`reset()` batch round-trips the reactivity pending queue ~10× a direct write). Subscriptions are now lazy: activated on the first `subscribe()`, torn down when the last leaves (mirrors the already-lazy subscribers Set). A no-subscriber store's `patch()` writes its signals unsubscribed + fast: measured `patch` (no subscriber) ~270 → ~96ns (~2.8×). Stores with a subscriber keep change-detection live (they opted into mutation tracking). Byte-identical behavior; all 142 tests pass (incl. a dedicated lazy-lifecycle + mutation-delivery suite, bisect-verified). The earlier "the gap to Zustand is intrinsic to per-field signals" assessment was wrong — the signals are faster than Zustand; the cost was the eager-subscription-forced batched notify.

- [#1953](https://github.com/pyreon/pyreon/pull/1953) [`abe3b61`](https://github.com/pyreon/pyreon/commit/abe3b61ac80bb91880752ae42351882f81cc61c2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf(store): trim per-store `setup` cost — lazy `signalKeySet` + array-backed initial values

  Two allocation deferrals on the store-creation path, both feature-preserving and
  mirroring the existing lazy-`subscribers` precedent:

  - **`signalKeySet` is now lazy** — the `Set<signalKey>` used for `patch()`
    object-form membership is allocated on the FIRST `patch()` call and reused
    thereafter, instead of eagerly at creation. Most stores mutate via
    `store.x.set()` / actions and never call `patch()`, so the Set was pure setup
    overhead for them. The patch hot path stays O(1) after the first call (built
    once, amortized).
  - **Initial values are captured into a parallel array** aligned with
    `signalKeys` instead of a `Map`. An array is cheaper to build on the setup
    path; `reset()` — the sole consumer — zips the two by index. (The snapshot
    must happen at creation, so unlike `signalKeySet` it can't be deferred.)

  Measured (paired, per-op process isolation, median): `setup` ~17× → ~12.7×
  vs Zustand (~730ns → ~665ns). Every other op is unchanged (read / dispatch /
  write / patch all within noise); 151 store tests pass; typecheck clean.

  This narrows the once-per-store `setup` gap without touching the registry,
  per-field signals, or bound-method API — the features that win the hot path
  (dispatch ~6×, write ~1.7×, patch ~1.2× vs Zustand). It does NOT overtake
  Zustand's bare-closure `setup`; that gap is architectural (Pyreon's global
  singleton registry powers SSR isolation / devtools / `resetAllStores`, which
  Zustand has no equivalent of).

- [#1910](https://github.com/pyreon/pyreon/pull/1910) [`47d7be4`](https://github.com/pyreon/pyreon/commit/47d7be4845808481b7a3fe3e111de834ae8a5604) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `patch()` no-subscriber fast path — turns the bulk-patch op from a loss into a
  win vs Zustand. The `patchInProgress` flag + `patchEvents` buffer exist only to
  feed store-`subscribe()` callbacks (written by `notifyDirect`, which runs only
  via the per-signal change-detection subscribers — themselves active only while
  ≥1 subscriber is attached). So a patch on a store with no subscriber (the common
  case) now skips two `patchEvents = []` allocations + the flag dance, and the
  object-form path uses `Object.keys` + index instead of `Object.entries` (no
  per-entry `[k,v]` tuple arrays).

  Measured (`bench:stores`, Apple M3, NODE_ENV=production, per-op isolated): `patch
2 fields` **106ns → 49ns — now ~1.3× faster than Zustand (66ns), previously ~1.8×
  slower**. The with-subscriber notify path is unchanged (locked by the existing
  `type: 'patch'` notification tests); 142 store tests pass.

- [#1894](https://github.com/pyreon/pyreon/pull/1894) [`8526e98`](https://github.com/pyreon/pyreon/commit/8526e9854318f886855d87b50b03373467436d80) Thanks [@vitbokisch](https://github.com/vitbokisch)! - perf: leaner object-form `patch()`. When no subscriber is attached (the common case) `patch({...})` no longer allocates a per-key `{key,newValue,oldValue}` event object during the batched write — those events only feed the patch-`subscribe` notification, which is gated on `subscribers.size > 0`, so with no subscriber they were pure allocation waste. The per-patched-key membership test also uses a precomputed `Set` (`signalKeySet.has`) instead of an O(signalKeys) `Array.includes` scan (scales with store width). ~12% faster patch (controlled same-run A/B); byte-identical behavior, all 135 tests pass. The remaining gap to a plain object merge is intrinsic to the per-field-signal model. Surfaced by the `bench:stores` benchmark.

- Updated dependencies [[`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668)]:
  - @pyreon/reactivity@0.38.0
  - @pyreon/validation@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.37.0
  - @pyreon/validation@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.36.0
  - @pyreon/validation@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/validation@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.32.0

### Patch Changes

- [#1509](https://github.com/pyreon/pyreon/pull/1509) [`48dd5e4`](https://github.com/pyreon/pyreon/commit/48dd5e4d2264f27a7fd39b796d4d518f05ef4043) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Removed the module-level `const __DEV__ = process.env.NODE_ENV !== 'production'` alias — every dev gate is now the inline bare `process.env.NODE_ENV !== 'production'` check (the bundler-agnostic library convention). The alias is the documented tree-shake-defeating anti-pattern: Vite/Rollup consumers folded through it, but **esbuild and Bun.build consumers shipped every dev-warning string and perf-counter name in production bundles** (`[Pyreon] Store plugin error…`, `store.defineStore`, `store.pluginRun`, …). Measured on the published lib: an esbuild production bundle drops from 5,212 → 4,793 bytes (-8%) with all dev strings eliminated. No behavior change in dev or prod runtime — only dead diagnostic code no longer ships to non-Vite consumers. Locked by a two-layer regression test (source invariant + esbuild-on-published-lib consumer-shape check, bisect-verified).

- Updated dependencies [[`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.29.0

### Patch Changes

- [#1321](https://github.com/pyreon/pyreon/pull/1321) [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix: derive the singleton-sentinel version from package.json (was a stale hardcoded `0.24.6`)

  Every `@pyreon/*` package called `registerSingleton('@pyreon/X', '0.24.6', import.meta.url)`
  with a hardcoded version literal that the release process never bumped — so the
  duplicate-instance sentinel reported `0.24.6` for packages actually shipping
  `0.28.x`. The version is diagnostic-only (detection keys on module location, not
  version), but its diagnostic VALUE is exactly to surface a version skew between
  two installed copies — which a frozen literal silently defeats.

  Name + version are now derived from each package's own `package.json`
  (`import { name, version } from '../package.json' with { type: 'json' }`), so the
  diagnostic is always accurate and can never drift on release. The build inlines
  the strings (no `package.json` bloat); dev reads the live file. No new tooling
  needed — drift is structurally impossible.

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.28.1

### Patch Changes

- [#1226](https://github.com/pyreon/pyreon/pull/1226) [`63bdb95`](https://github.com/pyreon/pyreon/commit/63bdb956b9d1ac5db779672f0cd7314de672fac9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Lock coverage thresholds at ≥95% statements / branches / functions / lines. All 4 packages already measure at 100% on every metric (machine 63/63, store 13/13, virtual 59/59, kinetic-presets 198/198) — this PR just locks the thresholds.

- Updated dependencies [[`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0)]:
  - @pyreon/validation@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.26.1

## 0.26.0

### Minor Changes

- [#908](https://github.com/pyreon/pyreon/pull/908) [`0fd9852`](https://github.com/pyreon/pyreon/commit/0fd98527ff7ea8a06ef0b470a2a6e84fcd9eba81) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/store` adds a **schema-driven `defineStore` overload** that derives signals + types from a validation library — works with **every** validation library through two complementary tiers.

  ## API

  ```ts
  import { zodSchema } from "@pyreon/validation";
  import { defineStore, computed } from "@pyreon/store";
  import { z } from "zod";

  const UserSchema = zodSchema(
    z.object({
      name: z.string().min(1),
      age: z.number(),
    })
  );

  const useUser = defineStore("user", {
    schema: UserSchema,
    initial: { name: "", age: 0 },
    setup: ({ state, set, patch, reset }) => ({
      // state.name: Signal<string>   ← inferred from schema
      // state.age:  Signal<number>
      greet: computed(() => `Hello, ${state.name()}`),
    }),
  });

  const u = useUser();
  u.store.name(); // Signal<string> read
  u.store.greet(); // computed
  u.set({ name: "Alice", age: 30 }); // full replace + validate
  u.patch({ age: 31 }); // partial merge + validate
  u.store.age.set(-1); // direct write — bypasses validation (escape hatch)
  ```

  ## Library support

  **Tier A.1 — First-party adapters** (existing in `@pyreon/validation`, extended in this release with `parse()`):

  - `zodSchema(zSchema)` — Zod (any version)
  - `valibotSchema(vSchema, v.safeParse)` — Valibot
  - `arktypeSchema(aType)` — ArkType

  **Tier A.2 — Standard Schema** (auto-detected via `'~standard'`, no adapter needed):

  - Zod 3.24+
  - Valibot 1.0+
  - ArkType 2.0+
  - Effect Schema 0.66+
  - Any future Standard Schema-compliant library

  **Tier B — User-authored adapter** (any other library, 5-10 lines):

  - yup, joi, ajv, io-ts, runtypes, Superstruct, custom validators

  ## What's new in `@pyreon/validation`

  `TypedSchemaAdapter` gains an optional `parse` method that returns the **coerced parsed value** (not just errors). This is what schema-stores need so that `z.string().default('Alice')` / `z.transform(...)` actually write the transformed value to signals. The existing `validator` field is unchanged — `@pyreon/form` consumers see no behavior change. The three first-party adapters (`zodSchema`, `valibotSchema`, `arktypeSchema`) all gained sync `parse` implementations.

  ## Validation contract

  - **`set(full)` and `patch(partial)` validate.** Invalid input throws (or invokes `onValidationError` if provided). State stays at its previous value on failure.
  - **Initial is validated once at defineStore-time.** Bad initial throws immediately (fail-fast). Schema defaults + transforms apply.
  - **Direct signal writes bypass validation.** `store.fieldName.set(v)` is an escape hatch for hot paths (~50-200µs per zod parse). For guaranteed validation, route through `set`/`patch`.
  - **Async validators are unsupported.** Schemas whose validator returns a Promise are rejected at defineStore-time. Use `@pyreon/form` for async refinements.
  - **Reserved key check.** Schema fields cannot collide with reserved `StoreApi` method names (`set`, etc.) — throws at construction with named key.

  ## What this PR does NOT do

  - Existing `defineStore(id, setupFn)` API is **unchanged**. Schema mode is a purely additive overload.
  - No new package dependency (`@pyreon/store` keeps its existing `@pyreon/reactivity`-only dep tree). Schema detection is duck-typed at runtime — `'_infer' in schema` for Tier A.1, `'~standard' in schema` for Tier A.2. The type-level `InferSchema<S>` helper has no runtime cost.
  - Top-level fields only get signals. Nested objects stay as values inside the parent signal (use `patch({ nested: {...} })` to mutate) — recursive signal-ization would require library-specific introspection.

  ## Test coverage

  27 new specs (cross-library matrix: zod adapter, valibot adapter, arktype adapter, raw zod via Standard Schema, user-authored adapter) covering: type-level inference, per-field signal reads, validated `set`/`patch`, `reset` to parsed initial, schema defaults/transforms, direct-write escape hatch, async-rejection, reserved-key collision, setup/field collision, `onValidationError` suppression, plugin compat, `subscribe` + `onAction` integration, singleton semantics. All 92 existing store tests + all 40 existing validation tests still pass. Bisect-verified-with-restore: disabling the schema-mode dispatch branch fails all 27 new specs; restored → 119/119 green.

### Patch Changes

- [#910](https://github.com/pyreon/pyreon/pull/910) [`814dd46`](https://github.com/pyreon/pyreon/commit/814dd4649c83f044ef5754b73fdc20e4e037524d) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/state-tree` re-architected to mirror MobX-State-Tree's chainable `.views().actions()` shape, with first-class **schema validation** and **async actions out of the box**.

  ## BREAKING CHANGE

  The single-config form `model({ state, views, actions })` is **REMOVED**. Use the chainable form:

  ```ts
  // Before
  model({
    state: { count: 0 },
    views: (self) => ({ doubled: () => self.count() * 2 }),
    actions: (self) => ({ inc: () => self.count.update((n) => n + 1) }),
  });

  // After
  model({ state: { count: 0 } })
    .views((self) => ({ doubled: () => self.count() * 2 }))
    .actions((self) => ({ inc: () => self.count.update((n) => n + 1) }));
  ```

  Migration is mechanical: `state` stays inside `model(...)`; `views` and `actions` keys move to chained `.views(...)` / `.actions(...)` calls verbatim. Behavior of each factory is unchanged. Empty `views: () => ({})` can be dropped.

  ## What's new

  ### Schema mode — `model({ schema, initial? })`

  Accepts a `TypedSchemaAdapter` (`zodSchema(...)` / `valibotSchema(...)` / `arktypeSchema(...)`) OR a Standard Schema-compliant instance (zod 3.24+, valibot 1.0+, arktype 2.0+, Effect Schema, ...). Field types inferred end-to-end; every write validated through the schema.

  Schema-mode instances expose **five validated mutation helpers** with bare names matching `@pyreon/store`'s `SchemaStoreApi`:

  ```ts
  u.set({ ...full }); // full replace, validated
  u.patch({ name: "Bob" }); // shallow merge, validated
  u.deepPatch({ prefs: { theme: "dark" } }); // recursive merge — keeps siblings
  u.update("items", (items) => items.filter((x) => x.id !== id)); // transform one field
  u.reset(); // restore parsed initial
  ```

  Direct signal writes (`self.field.set(v)`) bypass validation by design — the documented escape hatch.

  **Reserved-name check** — in schema mode, schema field names AND chained `.views()` / `.actions()` keys cannot collide with `set` / `patch` / `deepPatch` / `update` / `reset`. The runtime throws at `.create()` time with a clear error naming the colliding key. Plain mode (no schema) has no installed helpers, so user actions named `reset` / `set` etc. still work in plain models.

  ### Chainable `.views()` / `.actions()`

  Each call returns a NEW `ModelDefinition` (immutable builder). Subsequent factories see prior views + actions via `self`. Order semantics: views run before actions in the lifecycle.

  ### Async actions — out of the box

  Actions can be `async`; the runtime detects Promise returns and propagates them through the middleware chain. No `flow()` / `yield` wrapper. Middleware that wants completion does `await next(call)`.

  ## Step 0 — helper extraction (`@pyreon/validation` patch)

  Moved schema-detection helpers from `@pyreon/store` to `@pyreon/validation` so both `@pyreon/store` (schema mode) and `@pyreon/state-tree` (schema mode) share them. New module: `packages/fundamentals/validation/src/schema.ts` exporting `extractParseFn`, `wrapStandardSchema`, `isPyreonAdapter`, `isStandardSchema`, `formatIssues`, `InferSchema<S>`, `SchemaIssue`, `SchemaParseResult<T>`, `StandardSchemaShape<T>`, `PyreonAdapterShape<T>`. `@pyreon/store` now imports from validation.

  ## Why patch on store (not minor)

  The store change is purely an internal refactor — helpers moved out, public API unchanged. All 130 existing store tests pass without modification. Bundle shrinks slightly (helpers move out, validation grows by the same amount). Tagged as `patch` rather than `minor` because no consumer-visible surface changed.

- [#1148](https://github.com/pyreon/pyreon/pull/1148) [`534696a`](https://github.com/pyreon/pyreon/commit/534696ab763a1cd045f822da4cec41bdf08c98be) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(store): schema-mode stores honor `resetStore(id)` instead of returning a stale wrapper

  The schema-mode factory cached the `apiRef` wrapper in module-closure scope and short-circuited (`if (apiRef) return apiRef`) BEFORE querying the registry. After `resetStore(id)` dropped the inner store from the registry, the next call to the schema-store hook returned the SAME wrapper — still bound to the disposed inner. Every `.set()` / `.patch()` / `.reset()` routed through dead bindings: the fresh inner that `useInner()` would have rebuilt stayed unreachable, while user-visible reads on the cached wrapper appeared to "succeed" silently.

  The setup-fn pipeline had no such bug — its hook queries `getRegistry()` on every call (the documented contract: "Destroy a single store by its ID. The next call to the store hook will re-run the setup function, producing fresh state"). Schema mode silently violated that contract from inception. Identified in the post v0.25.1 framework audit as bug class C (closure-pinned cache survives registry reset).

  **Fix**: detect inner-identity change via `useInner()` (cheap Map lookup against the registry) and rebuild the wrapper only when the inner identity flips. Identity stability is preserved — repeated calls within the SAME inner instance still return the SAME wrapper (locked by the singleton-semantics regression spec at `schema-store.test.ts:452`, which would catch an accidental "just drop the cache" over-fix).

  No public API surface change. The hook signature, return type, and identity-stability contract within a single inner instance are all unchanged. Only the post-`resetStore` correctness changes: schema stores now match the documented "fresh state after reset" contract that setup-fn stores already honored.

  Bisect-verified-with-restore: 2 new regression specs in `packages/fundamentals/store/src/tests/schema-store.test.ts` under `schema-driven defineStore — resetStore (audit [#3](https://github.com/pyreon/pyreon/issues/3) regression)`:

  1. **Spec A** (load-bearing): mutate → `resetStore(id)` → re-call hook → assert fresh initial values. With the identity-check block reverted, fails with `AssertionError: expected 'mutated' to be 'Alice'`.
  2. **Spec B** (over-fix guard): three sequential `useStore()` calls return the same reference. Passes both pre-fix AND post-fix, proving the identity-stability contract survives the fix.

  Restoring → 40/40 schema-store specs green, 132/132 full @pyreon/store suite green, typecheck green.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`0fd9852`](https://github.com/pyreon/pyreon/commit/0fd98527ff7ea8a06ef0b470a2a6e84fcd9eba81), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`814dd46`](https://github.com/pyreon/pyreon/commit/814dd4649c83f044ef5754b73fdc20e4e037524d)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/validation@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1

## 0.25.0

### Patch Changes

- [#883](https://github.com/pyreon/pyreon/pull/883) [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Singleton sentinel default-on across every `@pyreon/*` package with module-level state (PR A of the bullet-proof cross-module-instance plan, `.claude/plans/jaunty-herding-kazoo.md`).

  Each package's `src/index.ts` now calls `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at module load. The first registration records a marker on `globalThis`; a second registration with a DIFFERENT normalized location triggers detection. Default mode throws an actionable Error naming both file paths and three concrete fixes (Vite `resolve.dedupe`, `npm ls`, `bun ls`). `PYREON_SINGLE_INSTANCE=warn` demotes to `console.error`; `PYREON_SINGLE_INSTANCE=silent` opts out entirely (browser extensions, micro-frontends, nested SSR via `rocketstyle-collapse`).

  **HMR-aware.** Vite re-evaluates modules with the SAME path but possibly different query params (`?v=12345`, `?t=12345`, `?import`). The sentinel normalizes the location (strips query string) before comparing — same normalized location → HMR re-eval → silently allowed; different location → genuine dual-instance → throws.

  **Per-package detection.** The earlier prototype put the sentinel only in `@pyreon/reactivity` — insufficient because `@pyreon/core` (and every other package) has its own module-level state that can be silently corrupted under dual-load. The full plan requires per-package registration, which this PR ships.

  **Zero behavior change in correct setups.** Apps that already have a single instance of each `@pyreon/*` package (the overwhelmingly common case) see no runtime change. Apps with silently-tolerated duplicates today (sub-dep version mismatch, custom bundler config) will see their app throw at startup after upgrading with an error message naming the fix. `PYREON_SINGLE_INSTANCE=warn` is the immediate mitigation for any consumer surprised by the change.

  **Test coverage.** Contract tests at `packages/core/reactivity/src/tests/singleton-sentinel.test.ts` (57 specs) exercise the sentinel directly with synthetic `file://` URLs: default-mode throw + actionable error message, HMR re-eval allowance, `PYREON_SINGLE_INSTANCE=warn` / `=silent` escape hatches, per-package coverage across all 24 registered packages, and cross-package isolation. Bisect-verified — neutralizing the throw branch fails 49 positive-case tests; restored passes all 57. The synthetic-URL approach replaces the heavier filesystem dual-load reproducer (it's the sentinel's normalized-string comparison that matters, not Node's ESM loader behaviour).

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/reactivity@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0

## 0.19.0

### Patch Changes

- [#606](https://github.com/pyreon/pyreon/pull/606) [`fde0f41`](https://github.com/pyreon/pyreon/commit/fde0f41ad6312ad0ee45d8e70ece965d7c4fec41) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix the biggest MCP `get_api` quality gap: enrich + correct the two thinnest fundamentals manifests, and add a ratchet so density can't silently erode.

  **The gap (measured, via the authoritative `findManifests` loader — the same one `get_api` uses):**

  - `@pyreon/rx`: **3** `api[]` entries for 37 functions. `get_api(rx, sortBy)` / `(rx, debounce)` / `(rx, search)` / `(rx, groupBy)` all **404'd** — agents got nothing for the most-used transforms.
  - `@pyreon/store`: `StoreApi` referenced **3× in `seeAlso`** with no `api[]` entry — `get_api(store, StoreApi)` 404'd despite being the central return type.

  **Plus four real inaccuracies in the existing rx manifest** that were actively _misleading_ AI agents (found by grounding every claim in source, not assuming):

  1. "signals detected by checking for a `.subscribe` method" — false; detection is purely `typeof source === "function"` (`rx/src/types.ts`).
  2. "pass `items` not `() => items()`" — backwards; an accessor wrapper _is_ a function and works. The real mistake is passing a resolved `items()` (static path, never updates).
  3. `groupBy` documented as returning `Computed<Map<…>>` — it returns `Record<string, T[]>` (keys `String()`-coerced).
  4. `search` documented as `{ keys: [...] }` options + "fuzzy" — it's a positional `keys` array and plain case-insensitive `String.includes` (not fuzzy).

  **Fixed (delta, authoritative counts):**

  - `@pyreon/store`: 5 → **6** entries, 2 → **6** with `mistakes[]` (added `StoreApi` entry; added grounded foot-gun catalogs to `addStorePlugin` / `resetStore` / `resetAllStores`; expanded `defineStore`). Every foot-gun traced to real source behaviour (plugin-runs-once-at-creation, silent `patch({typoKey})` no-op, `__proto__` guard, registry-detach semantics, `store.pluginRun` O(stores×plugins)).
  - `@pyreon/rx`: 3 → **9** entries, 2 → **9** with `mistakes[]` (added `map`/`sortBy`/`groupBy`/`search`/`debounce`/`throttle`; beefed `filter`/`pipe`/`rx`) **and the 4 inaccuracies corrected** across summary, longExample, gotchas, and per-entry notes.

  **Proven end-to-end:** a real MCP client↔server round-trip confirms `get_api(rx, sortBy|debounce|search|groupBy)` and `get_api(store, StoreApi)` now resolve with `Common mistakes` sections (were 404), and `get_api(rx, groupBy)` returns `Record`, not `Map`, through the live tool.

  **Structural fix so this can't recur:** new `scripts/check-manifest-depth.ts` ratchet + required `Check Manifest Depth` CI job. `LOCKED` records each migrated package's _achieved_ `{ minEntries, minWithMistakes }` (store 6/6, rx 9/9, query 16/11, form 7/7 — counted via `findManifests`). The gate fails if a locked package erodes; not-yet-migrated packages are intentionally absent (the visible backlog) so it never flag-days CI. Bisect-verified: removing the `StoreApi` entry fails the gate on `@pyreon/store`; restored → passes.

  Per-package `manifest-snapshot` tests updated (regenerated inline snapshots now capture the _corrected_ content; regression-guard assertions added so the 4 inaccuracies can't reappear). `gen-docs` regenerated `llms.txt` / `llms-full.txt` / `api-reference.ts` — in sync.

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261)]:
  - @pyreon/reactivity@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.14.0

## 0.13.0

### Patch Changes

- [#262](https://github.com/pyreon/pyreon/pull/262) [`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0) Thanks [@vitbokisch](https://github.com/vitbokisch)! - QA audit fixes (5 HIGH + 2 MEDIUM):

  - **router**: `useBlocker` uses shared ref-counted `beforeunload` listener instead of per-blocker — prevents listener accumulation across multiple blockers
  - **router**: `destroy()` clears `_activeRouter` global ref and releases remaining blocker listeners — prevents stale router surviving in SSR/re-creation
  - **query/useSubscription**: close WebSocket BEFORE nulling handlers — prevents race where queued message fires null handler
  - **query/useSubscription**: respect `intentionalClose` when reactive deps change — user's explicit `close()` no longer gets overridden by signal change
  - **store**: plugin errors now logged with `__DEV__` console.warn instead of silently swallowed
  - **storage/IndexedDB**: initialization errors (corrupted DB, quota exceeded) now call `onError` callback and log in dev mode instead of silently falling back to default

- Updated dependencies []:
  - @pyreon/reactivity@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/reactivity@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.

## 0.1.0

### Minor Changes

- [#9](https://github.com/pyreon/fundamentals/pull/9) [`9fe5b51`](https://github.com/pyreon/fundamentals/commit/9fe5b51868c50c3bcab1961f94df27846921b739) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Initial public release of Pyreon fundamentals ecosystem.
  - **@pyreon/store** — Global state management with `StoreApi<T>`
  - **@pyreon/state-tree** — Structured reactive models with snapshots, patches, middleware
  - **@pyreon/form** — Signal-based form management with validation, field arrays, context
  - **@pyreon/validation** — Schema adapters for Zod, Valibot, ArkType
  - **@pyreon/query** — TanStack Query adapter with fine-grained signals
  - **@pyreon/table** — TanStack Table adapter with reactive state
  - **@pyreon/virtual** — TanStack Virtual adapter for efficient list rendering
  - **@pyreon/i18n** — Reactive i18n with async namespace loading, plurals, interpolation
  - **@pyreon/storybook** — Storybook renderer for Pyreon components
  - **@pyreon/feature** — Schema-driven CRUD primitives with `defineFeature()`
