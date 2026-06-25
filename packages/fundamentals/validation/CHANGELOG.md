# @pyreon/validation

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.36.0

## 0.35.0

### Patch Changes

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`ce49268`](https://github.com/pyreon/pyreon/commit/ce49268f21615478fe5544ce5ab385b74704c75d), [`bf6865c`](https://github.com/pyreon/pyreon/commit/bf6865c815e2ee4499995f9aba91591fa26a86f3), [`ac75935`](https://github.com/pyreon/pyreon/commit/ac7593520f4467cd7ba362178ee00ca7029794da)]:
  - @pyreon/form@0.35.0

## 0.34.0

### Patch Changes

- [#1611](https://github.com/pyreon/pyreon/pull/1611) [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Internal coverage hardening — documented `v8 ignore`s for genuinely-unreachable
  defensive guards (deepMerge's non-plain-input safety net, the plain-mode
  `config.state ?? {}` fallback that `model()` rejects upstream, the
  `snapshotValue` meta-guard already gated by `isModelInstance`, the nested-walk
  `applyPatch` non-instance guard) + a test for the `onValidationError`-suppressed
  patch path. No behavior change. Branches → 98.85%, S/F/L → 100%.
- Updated dependencies [[`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc)]:
  - @pyreon/form@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0)]:
  - @pyreon/form@0.33.0

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

- Updated dependencies [[`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0)]:
  - @pyreon/form@0.28.1

## 0.28.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.1

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

- Updated dependencies [[`fd3422c`](https://github.com/pyreon/pyreon/commit/fd3422cfec1d48c8b382f8512ed44f8256887931), [`745fd63`](https://github.com/pyreon/pyreon/commit/745fd63c3ce97d0eb7bab37fa85ae40ed8c1c9bd)]:
  - @pyreon/form@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/form@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720)]:
  - @pyreon/form@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`7f26cd7`](https://github.com/pyreon/pyreon/commit/7f26cd78d74db8237aa6261a11965325d944f1ca)]:
  - @pyreon/form@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.14.0

## 0.13.0

### Patch Changes

- [#261](https://github.com/pyreon/pyreon/pull/261) [`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Triaged safe changes from architecture review PR [#260](https://github.com/pyreon/pyreon/issues/260):

  - **hotkeys**: detach global `keydown` listener when last hotkey unregisters (prevents listener accumulation across component remounts)
  - **code**: new `useEditorSignal()` hook — wraps `bindEditorToSignal` with `onUnmount` auto-cleanup (eliminates manual `dispose()` calls)
  - **form**: `ValidateFn` accepts optional `AbortSignal`; `useForm` creates per-cycle `AbortController` cancelled on unmount (prevents orphaned async validators)
  - **validation**: `zodSchema()` / `valibotSchema()` / `arktypeSchema()` return `TypedSchemaAdapter<TValues>` with `.validator` and phantom `_infer` type for compile-time field name validation. `useForm({ schema })` accepts both the new adapter and plain `SchemaValidateFn` (backward compatible).

  Dropped from the original PR: onCleanup LIFO ordering change (breaking behavioral change), circular effect detection (redundant with batch), SSR streaming backpressure (architecturally wrong implementation).

- Updated dependencies [[`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f)]:
  - @pyreon/form@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.13.0

## 0.8.0

### Minor Changes

- [`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### Improvements
  - Upgrade to TypeScript 6.0 and pyreon 0.7.3
  - Switch to @pyreon/typescript for tsconfig presets
  - Full exactOptionalPropertyTypes compliance
  - Security: add sanitization across all document renderers (XSS, XML injection, protocol validation)
  - Fix WebSocket.send() type for TS 6.0
  - Clean up conditional spreading now that core 0.7.3 accepts undefined on JSX attrs

### Patch Changes

- Updated dependencies [[`075dd4f`](https://github.com/pyreon/fundamentals/commit/075dd4fe4a325fe5a5637a68e209dffe665bb84e)]:
  - @pyreon/form@0.13.0

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes

  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

### Patch Changes

- Updated dependencies [[`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502)]:
  - @pyreon/form@0.13.0

## 0.6.0

### Minor Changes

- [`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New packages

  - `@pyreon/flow` — reactive flow diagrams with signal-native nodes, edges, pan/zoom, auto-layout via elkjs
  - `@pyreon/code` — reactive code editor with CodeMirror 6, minimap, diff editor, lazy-loaded languages

  ### Improvements

  - Upgrade to pyreon 0.6.0
  - Use `provide()` for context providers (query, form, i18n, permissions)
  - Fix error message prefixes across packages

### Patch Changes

- Updated dependencies [[`5610cdf`](https://github.com/pyreon/fundamentals/commit/5610cdffb69022aacd44419d7c71b97bdcf8403f)]:
  - @pyreon/form@0.13.0

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.13.0

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.13.0

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

### Patch Changes

- Updated dependencies [[`9fe5b51`](https://github.com/pyreon/fundamentals/commit/9fe5b51868c50c3bcab1961f94df27846921b739)]:
  - @pyreon/form@0.1.0
