# @pyreon/state-tree

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

### Minor Changes

- [#1744](https://github.com/pyreon/pyreon/pull/1744) [`e51e8f5`](https://github.com/pyreon/pyreon/commit/e51e8f5190a4118d9403f09c7e5ace6c38922606) Thanks [@vitbokisch](https://github.com/vitbokisch)! - state-tree: instance lifecycle + integrity (MST parity).

  - `.lifecycle(self => ({ afterCreate?, beforeDestroy? }))` — chainable instance lifecycle hooks. `afterCreate` runs once at the end of `.create()` (after all view/action layers; bottom-up for nested field-models); `beforeDestroy` runs on `destroy`. Unknown handler keys throw (typo guard).
  - `destroy(instance)` / `isAlive(instance)` — tear down (run `beforeDestroy`, recurse into field-nested children, clear patch listeners + middleware, mark dead; idempotent) and liveness. After `destroy`, actions + schema mutation helpers dev-warn and no-op (a stale handler post-teardown is caught, not silently applied); direct signal writes stay unguarded. `destroy` tears down subscriptions + runs cleanup — it does NOT free memory (signals are GC-reclaimed once unreferenced).
  - `clone(instance)` / `getType(instance)` — independent structural copy (snapshot → `def.create()`; re-validated in schema mode) and the producing `ModelDefinition` back-ref.
  - `applySnapshot` now RE-VALIDATES in schema mode — a malformed snapshot is rejected through the schema `patch` helper instead of written raw to signals (the schema is the source of truth). Plain mode is unchanged.

- [#1790](https://github.com/pyreon/pyreon/pull/1790) [`adafac0`](https://github.com/pyreon/pyreon/commit/adafac073c0a158759e064eeacd864437202f757) Thanks [@vitbokisch](https://github.com/vitbokisch)! - state-tree: normalized references & identifiers (closes [#1751](https://github.com/pyreon/pyreon/issues/1751)) — `identifier()` / `reference()` / `resolveIdentifier`.

  - `identifier(default?)` — declare which field is a model's id. Plain mode uses it as a field marker (`model({ state: { id: identifier(), name: '' } })`); schema mode names it via config (`model({ schema, identifier: 'id' })`).
  - `reference(TargetModel)` — a field that STORES the target's id but RESOLVES to the live node on read. Accessor: `()` resolves, `.set(node | id)`, `.id()`, `.setId(id)`, `.peek()`. Serializes/restores as the id (`getSnapshot`/`applySnapshot`). `ReferenceField` is exported.
  - `resolveIdentifier(root, Type, id)` — find a node of `Type` by id in `root`'s subtree (depth-first, cycle-safe; reads owned state, never follows references). The resolver `reference()` uses; useful directly too.

  Resolution goes through `getRoot(node)`, so the referencing node + target must share a root. The target type must declare an `identifier()`. O(n) per resolve in v1 (a root id-index is a planned optimization). `reference()` fields are plain-mode (the marker lives in `state`); the target can be schema-mode.

- [#1744](https://github.com/pyreon/pyreon/pull/1744) [`e51e8f5`](https://github.com/pyreon/pyreon/commit/e51e8f5190a4118d9403f09c7e5ace6c38922606) Thanks [@vitbokisch](https://github.com/vitbokisch)! - state-tree: `model({ schema })` now strictly types the instance from ANY schema passed directly — `@pyreon/validate`'s `s.object(...)`, a raw `z.object(...)`, valibot, arktype, or any Standard Schema — no `@pyreon/validation` adapter wrapper required. The state type is inferred from the schema's `~standard.validate` output (`InferSchemaState`), so `self.name()` is `string` (not `unknown`) even for validators like `@pyreon/validate` that omit the optional `~standard.types` slot. The `zodSchema()` adapter `_infer` path is unchanged.

  This tightens the inferred instance type for schema-mode models that previously fell back to the untyped `StateShape` (raw Standard-Schema instances passed without the adapter). Code relying on the old loose typing (e.g. casting `model({ schema: z.object(...) }).create()` to a record) no longer needs the cast.

- [#1744](https://github.com/pyreon/pyreon/pull/1744) [`e51e8f5`](https://github.com/pyreon/pyreon/commit/e51e8f5190a4118d9403f09c7e5ace6c38922606) Thanks [@vitbokisch](https://github.com/vitbokisch)! - state-tree: tree-traversal helpers — `getParent` / `getRoot` / `getPath` / `isRoot` / `hasParent`.

  A model instance gets a tree **parent** when it's written into another model's state — as a field value, an **array element**, or a plain-object value. Parent tracking runs on the initial value AND every subsequent tracked-signal write (an always-on `afterSet` hook, not listener-gated), so array-held children (the headline `todos: Todo[]` shape) are tracked the same way field-nested children are — not field-nested-only.

  - `getParent(node)` → the instance `node` is attached under, or `undefined` for a root.
  - `getRoot(node)` → walk to the top of the tree.
  - `getPath(node)` → JSON-pointer path from the root (field keys; `""` for a root).
  - `isRoot(node)` / `hasParent(node)` → booleans.

  All throw on a non-model-instance. v1: `getPath` carries field keys not array indices; a node removed from an array keeps its last parent until GC; auto-attachment is one container level deep. (References / identifiers build on these and land next — [#1751](https://github.com/pyreon/pyreon/issues/1751).)

- [#1744](https://github.com/pyreon/pyreon/pull/1744) [`e51e8f5`](https://github.com/pyreon/pyreon/commit/e51e8f5190a4118d9403f09c7e5ace6c38922606) Thanks [@vitbokisch](https://github.com/vitbokisch)! - state-tree: volatile state + `onSnapshot` + `onAction` (MST parity).

  - `.volatile(self => ({ ... }))` — signal-backed TRANSIENT state: reactive (`self.x()` / `self.x.set()`, strictly typed via a new `TVolatile` generic on `ModelDefinition`/`ModelInstance`) but EXCLUDED from snapshots, patches, and `onSnapshot`. For in-flight flags, drag/hover UI state, live refs (websockets/timers/promises). Reserved-name-checked against state / schema helpers / views / actions / other volatile.
  - `onSnapshot(instance, cb)` — MICROTASK-COALESCED snapshot subscription. All writes in one synchronous burst collapse into a single emit on the next microtask (MST-like async); does NOT fire on subscribe; volatile changes don't fire it. Implemented via the patch-write hook (not an `effect()`), so it never fires-on-create and never depends on `getSnapshot`'s untracked `.peek()` reads. Cleared by `destroy`.
  - `onAction(instance, cb)` — observe-only action subscription (name/args/path before the call); sugar over `addMiddleware`.

### Patch Changes

- Updated dependencies []:
  - @pyreon/validation@0.35.0
  - @pyreon/reactivity@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
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

- [#1345](https://github.com/pyreon/pyreon/pull/1345) [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb) Thanks [@vitbokisch](https://github.com/vitbokisch)! - feat(reactivity): `wrapSignal` primitive — fixes a latent state-tree bind bug + retires hand-rolled signal facades

  `@pyreon/reactivity` had no primitive for "a signal whose write runs a side
  effect" (persist, emit a patch, validate). So **two** packages hand-rolled the
  same signal-facade — `@pyreon/storage`'s `wrapBaseSignal` and
  `@pyreon/state-tree`'s `trackedSignal` — and a dedicated lint rule
  (`pyreon/storage-signal-v-forwarding`) existed only to police the contract.
  **A lint rule enforcing a wrapper invariant is the proof the primitive is
  missing.**

  New `wrapSignal(base, { set, update? })` builds a signal facade over `base`
  that delegates ALL reads — including the internal `_v` field and `.direct`
  that the compiler's `_bindText` / `_bindDirect` fast paths read directly,
  bypassing the call — by construction, and routes writes through `set`. The
  `_v`/`.direct` forwarding can no longer be forgotten.

  **Latent bug fixed:** `state-tree`'s `trackedSignal` forwarded neither
  `.direct` nor `_v`, so a model field bound via `{() => model.field()}` (the
  text fast path) rendered empty and stayed empty — the exact class
  `wrapBaseSignal` was created to prevent in storage, present and unfixed in
  state-tree. Routing it through `wrapSignal` fixes it. Bisect-verified by
  `state-tree/src/tests/tracked-signal-bind-contract.test.ts`.

  - `@pyreon/reactivity`: new `wrapSignal` + `WrapSignalOptions` exports.
  - `@pyreon/storage`: all 5 backends use `wrapSignal`; `wrap-base-signal.ts`
    deleted.
  - `@pyreon/state-tree`: `trackedSignal` uses `wrapSignal` (bug fix).

  `provide`/`useContext`-style user APIs are unchanged. The lint rule stays as
  defense for any future hand-rolled facade that bypasses the primitive.

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

- [#1211](https://github.com/pyreon/pyreon/pull/1211) [`8bb2463`](https://github.com/pyreon/pyreon/commit/8bb2463d9771c63bd53c6a761cb067aeb9c9e9ee) Thanks [@vitbokisch](https://github.com/vitbokisch)! - test(state-tree): cover applyPatch error paths to lift coverage 94.98% → 96.55%

  Adds 7 focused tests for the validation throw branches in
  `applyPatch` (patch.ts lines 109, 114, 122, 126, 129, 133, 142, 147)
  that previously had no coverage:

  - unsupported op
  - empty path
  - reserved property name (intermediate segment) via `__proto__`
  - unknown intermediate state key
  - intermediate segment is not a nested model instance
  - reserved property at final segment
  - unknown final state key

  All 7 tests assert the documented error messages, so a future refactor
  that silently changes the messaging will fail the test.

  Lifts `state-tree` statements 94.98% → 96.55%; threshold bumped 94 → 95
  to lock in the actuals.

  Part of the user-approved "whole-repo coverage ≥ 95%" incremental plan.
  Tier 2 follow-up: charts, elements, hooks, hotkeys, lint, router each
  within 1pt of 95 — addressed in separate PRs.

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

### Patch Changes

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
