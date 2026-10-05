# @pyreon/feature

## 0.52.0

### Minor Changes

- [#2905](https://github.com/pyreon/pyreon/pull/2905) [`475985d`](https://github.com/pyreon/pyreon/commit/475985dc116aaeaceadc074e5e1687cbb0305597) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `feature.Field` — render one schema field without hand-writing its markup.

  `defineFeature` has always derived `fields: FieldInfo[]` from the schema (name, type, optionality, enum values, a human label) and nothing consumed it, so every app hand-wrote markup the schema had already described. `<Feature.Field form={form} name="title" />` now renders the label, a control typed from the schema (string → text, number → number, boolean → checkbox, enum → select with its values), and the error — wired through the form's own `register` / `labelProps` / `errorProps`, so label↔control association and the error's `role="alert"` come for free.

  Deliberately PER-FIELD rather than a whole-form renderer. A generated form is excellent right up until a designer wants one field different, at which point an all-or-nothing component is worse than the markup it replaced. Every derived value has an override (`label`, `type`, `options`, `placeholder`, `class`, `inputClass`), and a field you do not want generated is written by hand next to the ones you do.

  An unknown `name` throws naming the field and listing the real ones, rather than rendering an empty row that reads as a styling bug.

  Type inference is duck-typed on Zod, so a `z.string().email()` renders `type="text"` — the component does not guess an input type from the field NAME, which would mistype a field called `emailVerified`. Pass `type` explicitly.

- [#3064](https://github.com/pyreon/pyreon/pull/3064) [`950f1c2`](https://github.com/pyreon/pyreon/commit/950f1c24e1421b6690d71255cc020b93d2d020ea) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `defineFeature` reads the literal field-type map, the one schema form that crosses to native

  `@pyreon/native-compiler` introspects `schema: { id: 'string', done: 'boolean' }`
  and emits a Codable struct from it. A runtime Zod / Valibot / ArkType schema is
  NOT introspected there and warns by name — so the literal map is the form the
  multiplatform docs prescribe for a feature that has to run on all three targets.

  On the web that form produced ZERO fields: no auto form fields, no table
  columns, no create defaults. The one shape that crosses was inert on the target
  it was written for.

  `extractFields` now recognizes it, gated on EVERY value being a known field-type
  name so a real schema can never be mistaken for one — and `FeatureConfig.schema`
  accepts it, so the documented shape typechecks instead of needing a cast.

- [#2906](https://github.com/pyreon/pyreon/pull/2906) [`e9bbe3e`](https://github.com/pyreon/pyreon/commit/e9bbe3e97341b43213354ee345b6c8a18dc009da) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Add `feature.Table` — render the table `useTable()` already computes.

  `useTable()` derives columns from the schema, wires sorting and the global filter to signals, and returns a live table. Nothing rendered it, so every app hand-wrote ~50 lines of thead/tbody — and met two traps that have nothing to do with their domain:

  - A `<th>` carries a `key`, so the keyed reconciler REUSES the node on a state change and never re-runs its body. A sort indicator read bare therefore freezes at its first value; it must sit inside an accessor.
  - `getVisibleCells()` comes from `columnVisibilityFeature`, which `featureTableFeatures` does not register — `getAllCells()` is correct here, and reaching for the other one silently renders nothing.

  `<Feature.Table of={t} />` owns both. Per-COLUMN cell overrides keyed by column id (`cell={{ status: ({ value, row }) => … }}`), for the same reason `Field` is per-field: a generated table is excellent until one column needs a badge or a formatted date. `empty` renders a full-width row when the row model is empty; `sortable={false}` drops the handlers and the indicator.

- [#3642](https://github.com/pyreon/pyreon/pull/3642) [`0667b0b`](https://github.com/pyreon/pyreon/commit/0667b0bdad937bd79a8a7d3fef3a2b11d7a3f7ff) Thanks [@vitbokisch](https://github.com/vitbokisch)! - @pyreon/form hardening:

  - **Behaviour change:** `handleSubmit` no longer re-throws an error thrown by `onSubmit`. The error is recorded in `submitError` and the returned promise resolves, so `<Form>` / `<form onSubmit={form.handleSubmit}>` no longer produce an unhandled rejection on every failed submit. Programmatic callers that want the rejection pass `form.handleSubmit({ rethrow: true })` (new `SubmitOptions` type).
  - `handleSubmit` is re-entrancy safe: concurrent calls (double Enter, double click during a slow async validator) share one in-flight submit, so `onSubmit` runs once. `<Submit>` is also disabled while validating.
  - `field.reset()`, `form.reset()` and `setInitialValues()` now invalidate in-flight async validation (field validators and schema runs); `form.reset()` also aborts the validation `AbortSignal`. A pending "username taken" check can no longer write its error onto a freshly reset or re-based field.
  - A `''` validator result is valid everywhere: `aria-invalid` / `aria-describedby`, `useField().hasError` / `showError`, `trigger()` and `focusFirstError()` now agree with `validate()`.
  - `debounceMs` now debounces schema validation of schema-only fields (it used to apply only to per-field validators).
  - Dirty tracking compares `Date` by time, `Map` / `Set` by content and other class instances (`File`, …) by identity; values of different prototypes are never equal. A changed date field is now marked dirty.
  - A schema that throws on blur / change / `trigger()` is surfaced as `submitError` with a dev warning instead of being swallowed; `trigger()` returns `false`.
  - **Behaviour change:** `register(name, { type: 'number' })` stores `undefined` (not the raw string) for an empty or unparsable number input.
  - `useWatch(form)` now includes fields added with `registerField()` after the watch was created (and drops unregistered ones).
  - Error messages use the `[Pyreon]` prefix; `useField().register` gains the `{ type: 'file' }` overload.

  @pyreon/feature hardening:

  - `<F.Field>` binds number fields with `{ type: 'number' }` (stores a number, not `"42"`) and date fields as `Date` values, so `z.number()` / `z.date()` schemas accept them. Required fields carry `aria-required`; `z.string().email()` / `.url()` render `type="email"` / `type="url"`; number inputs get `inputmode="decimal"`.
  - Edit-mode `useForm` no longer lets a failed record load leave an enabled blank form that PUTs blanks over the record: the error is surfaced (`loadError`, `submitError`, `onError`), the form is disabled and submitting is refused (also while the load is in flight). The returned form now exposes `isLoading` and `loadError` (new `FeatureFormState` type).
  - **Behaviour change:** the edit-mode load re-bases the form (`setInitialValues`) instead of calling `setFieldValue`, so loaded values are not dirty and not validated; it goes through the query cache under the `useById` key, and ISO date strings are converted to `Date` for date fields.
  - `useUpdate` removes the optimistic partial record when a failed update had no cached record to restore.
  - `useById` accepts an accessor id (`useById(() => props.id)`) and refetches when it changes.
  - `defaultInitialValues` honours `.default(x)`, uses `[]` for arrays and `undefined` for dates; `FieldInfo` gains `defaultValue` and `format`.
  - `<F.Table>` sortable headers render a keyboard-reachable `<button>` with a live `aria-sort` on the `<th>`.

### Patch Changes

- [#3602](https://github.com/pyreon/pyreon/pull/3602) [`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338) Thanks [@vitbokisch](https://github.com/vitbokisch)! - The repo's contributor rules moved from `.claude/rules/` to `.agents/rules/`, and the agent instructions from `CLAUDE.md` to `AGENTS.md`, so they work with any coding agent. Tools that read those files now look in the new places: the MCP `get_anti_patterns` and `get_browser_smoke_status` tools, the lint rule `pyreon/require-browser-smoke-test`, and the `pyreon doctor` doc-claims gate. Messages and comments that pointed at the old paths are updated.

  The six `@pyreon/native-*` packages no longer describe themselves on npm as "PRIVATE / EXPERIMENTAL" or "Not published"; they are published, and their descriptions now say what each one is.

  `@pyreon/mcp`: `get_content_collection` and `get_content_entry` were registered and callable but missing from the manifest, so `mcp_overview` and the API reference did not list them. They are listed now, and `check-mcp-docs` fails when a registered tool and the manifest disagree in either direction.

- [#2704](https://github.com/pyreon/pyreon/pull/2704) [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Update external dependencies to latest across the workspace: tanstack query/virtual patches, tiptap 3.29.2, codemirror view 6.43.8, shiki 4.4.2, elkjs 0.12, yjs 13.6.32, MCP SDK 1.30, oxc 0.143, magic-string 1.1.0, pragmatic-drag-and-drop 2.0.2, and tooling (vite 8.2.0, playwright 1.62.1 — both previously held back by upstream bugs now fixed). `@pyreon/testing` widens its `@testing-library/jest-dom` peer to `^6.0.0 || ^7.0.0` (v7 verified). TypeScript stays capped `<7.0.0` (TS7 removed the classic Compiler API); `@tanstack/table-core` stays on v8 (v9 is a structural API rewrite that would break `@pyreon/table`'s public options surface — tracked as its own migration).

- [#2986](https://github.com/pyreon/pyreon/pull/2986) [`5ff6d4a`](https://github.com/pyreon/pyreon/commit/5ff6d4a1ea651d28b262a0b1250faaee71027c3c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - `@pyreon/feature` declares the native frontend it already had

  `defineFeature({ name, schema })` with the literal field-type map has been
  lowering to a Codable struct plus a module-scope const (`name`,
  `initialValues`) on both targets — but the manifest still said the package had
  NO native emit, so the compiler's derived web-only set kept warning about it and
  the coverage registry counted it as an open gap.

  The declaration half now says what it does, and the runtime half (the generated
  CRUD hooks, the fetcher, validator/form integration) is scoped honestly as the
  part that stays web. A runtime schema (Zod / Valibot / ArkType) is still not
  introspected and warns by name.

  Native app-runtime coverage: 34/37 → 35/37.

- [#2815](https://github.com/pyreon/pyreon/pull/2815) [`54f6d97`](https://github.com/pyreon/pyreon/commit/54f6d97dfae80b03fbffdd7d8fade52def4c5623) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(feature): edit-mode `useForm` no longer gets stuck (and populates) when the backend returns server-only keys

  `useForm({ mode: 'edit', id })` auto-fetches the record and populated the form by iterating EVERY key of the server response and calling `form.setFieldValue(key, …)`. But `@pyreon/form`'s `setFieldValue` THROWS on a field the form doesn't have — and a real backend returns server-only keys (`id`, `createdAt`, `updatedAt`, relations) that aren't schema fields. The throw fired inside the populate `batch()`, aborting before `isSubmitting.set(false)` → the form was left permanently `isSubmitting: true` (submit disabled, appears frozen) with the fields unpopulated, plus an unhandled promise rejection. The populate loop now skips keys that aren't registered form fields. Also guards the dev-only Zod-detection against a nullish `schema` (a JS-caller edge that crashed at `defineFeature` time). Bisect-verified.

- [#3207](https://github.com/pyreon/pyreon/pull/3207) [`78b3423`](https://github.com/pyreon/pyreon/commit/78b3423b830ec4c5d60034ae8f468eec111cacf2) Thanks [@vitbokisch](https://github.com/vitbokisch)! - PMTC: a `defineFeature` binding is now REACHABLE from the shared source that declares it

  `const Todo = defineFeature({ name, schema })` lowered its DECLARATION on both
  targets — a `Codable` struct plus `enum PyreonFeature_Todo` / `object
PyreonFeature_Todo` carrying `name` and `initialValues` — and emitted nothing
  called `Todo`. Since the only reason to declare a feature is to use it, every
  real shared-source app failed to build on **both** platforms the moment it wrote
  `Todo.name`: swiftc `cannot find 'Todo' in scope`, kotlinc `unresolved
reference 'Todo'`, in a generated file the author never wrote.

  The two sibling lowerings in the same emitter (`PyreonFieldMeta`,
  `PyreonZodSchema`) have always emitted an alias under the source binding name.
  The feature one did not. It now does: `let Todo = PyreonFeature_Todo.self`
  (Swift) and `val Todo = PyreonFeature_Todo` (Kotlin).

  It survived five green specs because every one of them asserts the emitted
  DECLARATION and none ever writes the binding in a component body — and because
  this test file made **zero** `swiftc`/`kotlinc` calls, so the whole
  `@pyreon/feature` lowering had never been compiled by either toolchain. Both
  halves are closed: the specs now reference the binding, and they compile the
  result with the real compilers.

  One limit is now DECLINED BY NAME rather than shipped broken. Swift and Kotlin
  share a single namespace for types and values — unlike TypeScript, where
  `interface Todo` and `const Todo` coexist — so a shared file declaring both a
  feature binding and a TYPE of that name cannot emit both. Neither alias form
  escapes it (a `typealias` and a value binding collide identically; both were
  measured, which is why the value form is chosen for sibling symmetry and NOT
  sold as collision-safe). The compiler now warns naming the binding and the
  remedy instead of emitting a redeclaration error.

- [#3674](https://github.com/pyreon/pyreon/pull/3674) [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Documentation-only: filled in manifest `api[]` gaps against each package's real `src/index.ts` exports. No runtime behavior changes.

  Notable additions: `@pyreon/hooks`'s 10 web-half hooks that had no manifest entry (`useGeolocation`, `useMap`, `useWebSocket`, `useAuth`, `usePush`, `usePayments`, `useDatabase`, `useCrashReporter`, `useAppState`, `setCrashTransport`); `@pyreon/http`'s typed error hierarchy, URL/transport utilities, and `defineEndpoint`; `@pyreon/router`'s active-router, link-classification, redirect-safety, and loader-serialization utilities; `@pyreon/reactivity`'s `registerSingleton`/context-owner APIs and `defineCrossModuleState`; `@pyreon/core`'s `Defer`, `registerErrorHandler`/`reportError`, `isClient`/`isServer`; `@pyreon/zero`'s theme system, locale runtime, `Meta`, typed-routes codegen, and `generateRssFeed`; `@pyreon/zero-content`'s remaining docs components (`Details`, `Tabs`, `PropTable`, `APICard`, `CompatMatrix`, `PackageBadge`, `Mermaid`, `Math`, `Sidebar`, `Breadcrumbs`, `PrevNext`, `Toc`, `Playground`, `Search`/`useSearch`, `getEntry`/`getEntries`); `@pyreon/form`'s `<Form>`/`<Submit>` components; smaller additions to `@pyreon/store`, `@pyreon/validate`, `@pyreon/validation`, `@pyreon/a11y`, `@pyreon/i18n`, `@pyreon/code`, `@pyreon/feature`, `@pyreon/charts`, `@pyreon/hotkeys`, `@pyreon/virtual`, `@pyreon/sync`, and `@pyreon/server`.

  Also corrected an inaccurate claim in `@pyreon/zero`'s `i18nRouting` manifest entry: it said components read the detected locale via `createLocaleContext`, but nothing in the framework reads `req.__localeContext` back out today — the working app-facing API is `useLocale()`/`setLocale()`. Verified `@pyreon/reactivity`'s `onCleanup` documentation is accurate (not outdated as initially suspected) via `effect.test.ts`'s explicit "onCleanup outside an effect is a silent no-op" test.

  `packages/tools/mcp/src/api-reference.ts` is the generated output of `bun run gen-docs` reflecting the above.

- [#3557](https://github.com/pyreon/pyreon/pull/3557) [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Stop publishing the build's bundle-analysis report.

  `vl_rolldown_build` writes an HTML treemap per entry into `lib/analysis/`, and
  54 packages published it: every install downloaded a build report (258 KB for
  `@pyreon/charts`) that is not part of the package. Their `files` now exclude
  `lib/analysis`, as ten packages already did. `pyreon doctor`'s distribution
  gate enforces it twice: a `vl_rolldown_build` package that publishes `lib`
  must exclude the report, and the live `npm pack --dry-run` probe fails if the
  tarball carries one.

- [#3637](https://github.com/pyreon/pyreon/pull/3637) [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Published type declarations now compile strictly (`skipLibCheck: false`), and no longer degrade to `any` under the default `skipLibCheck: true`.

  - `@pyreon/core`: component props may be a plain `interface`. `ComponentFn`, `defineComponent`, `lazy`, `Defer`, `HigherOrderComponent` and `h()` bounded props by `Record<string, unknown>`, which an interface does not satisfy (no implicit index signature). `ComponentFn<ButtonProps>` was TS2344, and every `@pyreon/elements` props type violated the bound once emitted into a `.d.ts`. The bound is now `object`; `Props` is unchanged.
  - `@pyreon/rocketstyle`: the origin-props parameter of `RocketStyleComponent` accepts interface-typed props for the same reason.
  - `@pyreon/validate`: `s.string().iso.date()` / `.dateTime()` / `.time()` returned `any` to consumers. The inferred type put polymorphic `this` inside an object type literal, which is invalid in a declaration file. It is now typed as the named `IsoChecks<this>`, and the chain stays typed.
  - `@pyreon/feature`: its declarations import `@tanstack/table-core`, which it now declares as a dependency. Before, the import resolved only where the package manager hoists transitive dependencies.
  - `@pyreon/document-primitives`: declares `@pyreon/ui-core`, which its declarations import.

- Updated dependencies [[`2ac084f`](https://github.com/pyreon/pyreon/commit/2ac084f5c3c762902e38004b3787f806d155d338), [`d5f19b9`](https://github.com/pyreon/pyreon/commit/d5f19b9700962305b1cc4fd0e5da603ec884e759), [`443a646`](https://github.com/pyreon/pyreon/commit/443a646875093e1987fbf4be56ffac934ba60c17), [`8563e97`](https://github.com/pyreon/pyreon/commit/8563e97ee5fd91daa6d74547c712ae6b71cffb47), [`ed98e38`](https://github.com/pyreon/pyreon/commit/ed98e380716dacea266b65e25394b5157265a415), [`61e0482`](https://github.com/pyreon/pyreon/commit/61e0482b7fa532d439af670066b8928fe121a53c), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`9045709`](https://github.com/pyreon/pyreon/commit/9045709020995c37692eb2a9a6ecd65f6b8c6e30), [`57b94ed`](https://github.com/pyreon/pyreon/commit/57b94ed8cd4b2aa9d5bd16e52d39edcdb7056c62), [`1c70f68`](https://github.com/pyreon/pyreon/commit/1c70f68b69a7e9f60eb7d565bf8797a155353743), [`99a1888`](https://github.com/pyreon/pyreon/commit/99a188821c005c4750c3daf98fd2d0863a0e3b58), [`e56abb6`](https://github.com/pyreon/pyreon/commit/e56abb6b44873164473b085e0e64838e7d9e7012), [`6bf2770`](https://github.com/pyreon/pyreon/commit/6bf2770d8d25e02aa853ac249b6c07923dac001d), [`ea669a1`](https://github.com/pyreon/pyreon/commit/ea669a11028d7067e80b8c59bb2f5d35d5cbda1b), [`1d74edc`](https://github.com/pyreon/pyreon/commit/1d74edc1b85c22714b9ee4b86e8fa9228be2ca93), [`9f02726`](https://github.com/pyreon/pyreon/commit/9f0272677bd083fb50998335257e31e44766e85d), [`cc455e8`](https://github.com/pyreon/pyreon/commit/cc455e84d9ed7d682d963d44b25cd3c4bb89c7c8), [`6a7c0f1`](https://github.com/pyreon/pyreon/commit/6a7c0f1bb21f285fce47fe67492ce9a14c20fd6a), [`26e1837`](https://github.com/pyreon/pyreon/commit/26e1837c562b35887a5b3866fc0251f086f32063), [`a0c4cd7`](https://github.com/pyreon/pyreon/commit/a0c4cd7803dd244b79a8828dca36dff6c34b0b8c), [`0667b0b`](https://github.com/pyreon/pyreon/commit/0667b0bdad937bd79a8a7d3fef3a2b11d7a3f7ff), [`8665c92`](https://github.com/pyreon/pyreon/commit/8665c9296c0d0fa696aad9560f039e95f9df2201), [`9d6ca3d`](https://github.com/pyreon/pyreon/commit/9d6ca3d705b555a2bb52d6dfd0c5fe231ff69f5c), [`d2abd90`](https://github.com/pyreon/pyreon/commit/d2abd907e169567321e8033039d8a3467593beb9), [`f74c37c`](https://github.com/pyreon/pyreon/commit/f74c37cac8b162012b6bcb8494eef3bd5c3be85b), [`fe29937`](https://github.com/pyreon/pyreon/commit/fe2993738a67840e666aa083497b524318d9a8e7), [`0f18357`](https://github.com/pyreon/pyreon/commit/0f183572631e53e5ca4a283f663bd64800810845), [`164c48a`](https://github.com/pyreon/pyreon/commit/164c48a564656bc0aec9e94fc20b44c28aad28e7), [`2a85027`](https://github.com/pyreon/pyreon/commit/2a85027c190335e782bd581b5856ae2ef783207d), [`cf50c79`](https://github.com/pyreon/pyreon/commit/cf50c79668fa46510df17f76906520c53d6e0e4a), [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832), [`b81dc7c`](https://github.com/pyreon/pyreon/commit/b81dc7cade1eca1fd0e5673e27587b72680fc2c3), [`f2194d5`](https://github.com/pyreon/pyreon/commit/f2194d544ca7fc10dcc64b2aeb1c97dc923eabfe), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`592c07b`](https://github.com/pyreon/pyreon/commit/592c07b848cb92cb1c0e5222b706f3c80c7c23ff), [`c41314d`](https://github.com/pyreon/pyreon/commit/c41314da54f7217a4a63cd0d6ec07583fd431001), [`cf780e1`](https://github.com/pyreon/pyreon/commit/cf780e15f31bc55119be29482a0adf706cae6c54), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`f166e69`](https://github.com/pyreon/pyreon/commit/f166e69d8308eaab6481cbee5d1afc6f813b15cb), [`e6b70a5`](https://github.com/pyreon/pyreon/commit/e6b70a5c80ed7c9f338a6a750296ebe89e9dd9c2), [`cbd6459`](https://github.com/pyreon/pyreon/commit/cbd6459970423b7f7d94883685ae7c753895f1d9), [`fc91492`](https://github.com/pyreon/pyreon/commit/fc91492c18cba19e38811486884eba76a46ef832), [`ea4e50a`](https://github.com/pyreon/pyreon/commit/ea4e50ab7d97d84f2bd5518ea747280c34805611), [`c8c47f7`](https://github.com/pyreon/pyreon/commit/c8c47f7c1b1853c4fde3247d5d7618cab03b6c4f), [`ed6518a`](https://github.com/pyreon/pyreon/commit/ed6518a68ec678e546713abf4e2551a3297a794f), [`8b49de2`](https://github.com/pyreon/pyreon/commit/8b49de2f440c9e4be30402a499b91e53bf7705f1), [`d873013`](https://github.com/pyreon/pyreon/commit/d873013b7c3ba8f4e2bc5984b974e684009a287d), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`489cba8`](https://github.com/pyreon/pyreon/commit/489cba8f7bb308ca26d27607a0c14c6dfa42da50), [`2e12add`](https://github.com/pyreon/pyreon/commit/2e12addb54586212dce479699d7ea70f084d1a7e), [`7c69228`](https://github.com/pyreon/pyreon/commit/7c6922838c8c05695b320c62d5758e3379840560), [`ea12a88`](https://github.com/pyreon/pyreon/commit/ea12a887e736882b5019388ad0c61ba0d1e1490c), [`45a04fb`](https://github.com/pyreon/pyreon/commit/45a04fb6e95af5b6d0dad9d3e76d5d756a218f02), [`2eb6540`](https://github.com/pyreon/pyreon/commit/2eb6540c024529b2b26bd1bd9d97aeda64a48323), [`b1f9914`](https://github.com/pyreon/pyreon/commit/b1f991412dbd53cb2e943678aadbe89a6dfdb513), [`d114ff8`](https://github.com/pyreon/pyreon/commit/d114ff8c83ac98acb0c421d0ee3217e43d4d713b), [`e56b865`](https://github.com/pyreon/pyreon/commit/e56b865f08946b7f848906bf2562911fa7f95066), [`50d9324`](https://github.com/pyreon/pyreon/commit/50d93245d8e28ba0a3c8217bd83a50d3dd6719d3), [`317367a`](https://github.com/pyreon/pyreon/commit/317367a9ade57b9aefd036441ebb397c8e3d1dc2), [`5c5e246`](https://github.com/pyreon/pyreon/commit/5c5e246832453a94e5ce112d11c9109d800d2889), [`384cb23`](https://github.com/pyreon/pyreon/commit/384cb23669ef897b74206c9441b8982a71729367), [`5867cca`](https://github.com/pyreon/pyreon/commit/5867cca15becbf4811effac32e81bdb3dc0a0d86), [`4f75a72`](https://github.com/pyreon/pyreon/commit/4f75a72ebbc4223a88d9ffc2ce950d962aa973a4), [`41df05a`](https://github.com/pyreon/pyreon/commit/41df05a6eba6a474ef8f57cdfb973c2402c3c2ee), [`773f9df`](https://github.com/pyreon/pyreon/commit/773f9dfaafaed05a06b252b1f83a0f7d970dbb8d), [`3dba9dc`](https://github.com/pyreon/pyreon/commit/3dba9dceec5dc96c34686b70604b6d79939655a2), [`d98b60d`](https://github.com/pyreon/pyreon/commit/d98b60d48ec42e1cf4cc6f22e20262000384676a), [`e44dcc7`](https://github.com/pyreon/pyreon/commit/e44dcc7124a5617f95ddb69786be262a35280d5f), [`768f104`](https://github.com/pyreon/pyreon/commit/768f104018ced7568dde1c99990a21c273e924ec), [`e0e0dc0`](https://github.com/pyreon/pyreon/commit/e0e0dc066470e92066652ccbd739ae0d6e518c58), [`87b581a`](https://github.com/pyreon/pyreon/commit/87b581a6a28433116c9a6c8364fbb8e3cab15760), [`9593fbc`](https://github.com/pyreon/pyreon/commit/9593fbc44375cc00f57865790a798bd53e479551), [`24c4019`](https://github.com/pyreon/pyreon/commit/24c4019d3e2527bf063d65d62bf574b00965d1e4), [`d5a7c06`](https://github.com/pyreon/pyreon/commit/d5a7c06a689e392bb3274e8cbd16b4c48989c88d), [`d0e57b2`](https://github.com/pyreon/pyreon/commit/d0e57b27ccbf9b4b90521235186a003f3d6bc3ca), [`fabd888`](https://github.com/pyreon/pyreon/commit/fabd888ac865155a5af687f1706bf918c6419f19), [`05ad36a`](https://github.com/pyreon/pyreon/commit/05ad36acb9e3dfe6b4f9ee8b012fc9919f8cd219), [`5c60743`](https://github.com/pyreon/pyreon/commit/5c60743c32bac8c46279fccacc5a51126b183832), [`5a52b2b`](https://github.com/pyreon/pyreon/commit/5a52b2be1759fbb4fc5f2fb368217adf5ac6070a), [`adb5897`](https://github.com/pyreon/pyreon/commit/adb58970bc878291bfd892927ee15cb8a4ca87a9), [`5493aa8`](https://github.com/pyreon/pyreon/commit/5493aa818aa3943c429ff37a35b2262401e4ecac), [`5438e9a`](https://github.com/pyreon/pyreon/commit/5438e9a7496e4c6e5dac43bc03ab90459d147a59), [`5af143d`](https://github.com/pyreon/pyreon/commit/5af143d746be81a4a0d688243f123d532c455553), [`b3af6f5`](https://github.com/pyreon/pyreon/commit/b3af6f5ade4cbc9ce756c173d349acb640f09264), [`76c0feb`](https://github.com/pyreon/pyreon/commit/76c0febfda0b05a73e0be307c344819435a8479d), [`58c0fc4`](https://github.com/pyreon/pyreon/commit/58c0fc46789226dd23e1556908ccb8af52bae41e), [`920f97b`](https://github.com/pyreon/pyreon/commit/920f97b0b746bafabbc263a8d89e6283e2df75ef), [`2b11ae1`](https://github.com/pyreon/pyreon/commit/2b11ae1977597aa08aa8f8f7668a642c50eed301), [`2bef24d`](https://github.com/pyreon/pyreon/commit/2bef24df3d5c86d709509906d4d1e831357b41c6), [`111ac7e`](https://github.com/pyreon/pyreon/commit/111ac7e262c6deda789f4060db9d6ebf35e00fbb), [`f4e9268`](https://github.com/pyreon/pyreon/commit/f4e9268a750318ceb5f7d2dc40c185a53e6b5299), [`c26fcef`](https://github.com/pyreon/pyreon/commit/c26fcef861ec794ca7f0e0b2163d84f7b58c0866), [`c8a45f5`](https://github.com/pyreon/pyreon/commit/c8a45f50138420d851407b34ce97d7c357f3cbcc), [`cf64ac7`](https://github.com/pyreon/pyreon/commit/cf64ac738115998ade80f3c8ed984a2d109cbc17), [`127e5d6`](https://github.com/pyreon/pyreon/commit/127e5d65cd2a3cea8457a1bd6f397b75c0ad4597), [`50caf2d`](https://github.com/pyreon/pyreon/commit/50caf2d3f97fefa7afa6105e38c7f5940c427b5d), [`c7feb0b`](https://github.com/pyreon/pyreon/commit/c7feb0b726ea78ef7b6a4d3a17e8ae85df471a67)]:
  - @pyreon/form@0.52.0
  - @pyreon/core@0.52.0
  - @pyreon/validation@0.52.0
  - @pyreon/http@0.52.0
  - @pyreon/store@0.52.0
  - @pyreon/reactivity@0.52.0
  - @pyreon/query@0.52.0
  - @pyreon/table@0.52.0

## 0.51.0

### Minor Changes

- `@pyreon/feature` now forwards TanStack's `AbortSignal`, so query cancellation works. (331c206)

  Every read hook (`useList`, `useById`, `useSearch`) called its REST layer as `queryFn: () => http.getById(api, id)`. That signature took no `AbortSignal`, so the per-fetch signal TanStack aborts on unmount, on supersede and on `cancelQueries` never reached the network — cancellation has been silently dead for every feature-driven query since the package shipped. An unmounted component kept fetching, and a rapidly-retyped search fired one request per keystroke, all of which ran to completion and raced each other into the cache, so the last response to arrive won rather than the newest.

  The REST layer now runs on `@pyreon/http` and threads `{ signal }` through all three hooks. Two further defects go with it: path parameters are URL-encoded, so an id containing `/` can no longer escape its segment (`1/../admin` reaching `/admin`), and requests get a 30s deadline where raw `fetch` had none.

  The thrown error shape is deliberately unchanged — `message` from the response body when present, else `<METHOD> <url> failed: <status>`, plus `status`, plus `errors` only when the body carries them. Migrating the transport must not silently re-shape what consumers catch, so the client runs with `throwHttpErrors: false` and the original extraction is preserved verbatim. `config.fetcher` remains a plain `typeof fetch`.

  `pyreon/query-fn-must-forward-signal` also gains a false-positive fix: it scanned only the function body, so a correct `queryFn: ({ signal: abortSignal }) => …` — where `signal` appears only in the parameter pattern — was reported as a violation. It now scans parameters too.

- Migrate to TanStack Table v9. (175a232)

  **`useTable` now returns the `Table` instance directly** instead of `Computed<Table>` — there is no `table()` call. v9 exposes a pluggable reactivity seam (`coreReactivityFeature`) and the adapter backs its atoms with Pyreon signals, so reading the table inside any reactive scope subscribes natively. The v8 version counter, the whole-`TableState` structural diff, and the `onStateChange` interception all existed only because v8 had no such seam; they are gone.

  **Features must now be registered explicitly.** v9 exposes an API only when its feature is present, and row models are feature slots rather than options: `getCoreRowModel()` is automatic (delete it), and the rest become `tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), … })`. Define the set once at module scope — it is a compile-time type parameter. Note `row.getVisibleCells()` requires `columnVisibilityFeature`.

  **Core types take a leading `TFeatures` generic** (`ColumnDef<typeof features, User>`), `table.getState()` → `table.store.state`, top-level `onStateChange` → per-slice `on<Slice>Change` (supplying one puts that slice in controlled mode), column pinning is logical (`start`/`end`, not `left`/`right`), `sortingFn` → `sortFn`, and `getIsSomeRowsSelected()` now means "at least one" including all-selected.

  **The runtime re-export surface is now an explicit curated list rather than `export *`.** Under the wildcard, table-core's public surface was literally ours — an upstream major retired 40 of 51 runtime exports and leaked internals (`noop`, `getMemoOptions`, `_getVisibleLeafColumns`). The curated list covers the full author surface (all 16 features, every row model and built-in fn) while keeping adapter-construction plumbing out; types are still re-exported wholesale. A future upstream major is now our migration rather than yours.

  `@pyreon/feature`'s `useTable` gains a fix along the way: `pageSize` was typed-but-unimplemented under v8 — it was read only as a boolean and its value discarded, so `pageSize: 25` silently paged by 10. It now sets the initial page size, and an unpaginated table is unpaginated (rather than truncated to v9's default of 10).

  Fine-grained per-cell updates are preserved and verified: a single-cell edit still re-runs only the changed row's cells (6 cell units, 1 DOM write at both N=100 and N=1000 — matching hand-memoized react-table with no memo boilerplate). See the migration section in the table docs for a before/after.

  `flexRender` and `flexRenderCell` now return a resolved-child type instead of `unknown`/`VNodeChild`. `VNodeChild` includes the accessor arm, so returning it made Pyreon's own documented `<td>{() => flexRenderCell(…)}</td>` pattern a nested accessor that the type system rejected; both functions always return already-resolved content, and the narrower type says so. `{flexRender(…)}` now typechecks directly in JSX.

### Patch Changes

- `extractFields` now reads enum members from zod v4 schemas. It looked for `_def.values`, which v4 does not have — v4 stores members as an entries map and exposes them as `.options` — so an enum field came back correctly typed with `enumValues: undefined`, a documented field that was silently always empty. Downstream that reads as "this enum has no members" rather than "we could not read them", which is the difference between generating a picker with the real options and generating a free-text box. Native enums are read by value, since a native enum maps name → value. (0b5ce4c)
- Every package manifest now declares its MULTIPLATFORM story as data: (4e53471)
  `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale }`
  (a discriminated union — `web-only` REQUIRES the rationale sentence). The
  assignments transcribe the classification the multiplatform docs and the PMTC
  compiler's own `WEB_ONLY_PACKAGES` registry already maintain, and the new
  `check-multiplatform-tier` gate (validate-fast family) holds the contract:
  a manifest without a tier, a published package with neither manifest nor
  explicit exemption, a `web-only` without a rationale, or a stale generated
  tier table all fail CI — so a new package can never again silently default
  to web-only while the ecosystem advertises "one codebase, three targets".

  No runtime change in any package: manifests are docs-pipeline inputs and are
  stripped from published tarballs; every generated surface (llms, MCP
  api-reference, reference pages) is byte-identical.

- Updated dependencies:
  - @pyreon/reactivity@0.51.0
  - @pyreon/http@0.51.0
  - @pyreon/core@0.51.0
  - @pyreon/form@0.51.0
  - @pyreon/query@0.51.0
  - @pyreon/store@0.51.0
  - @pyreon/table@0.51.0
  - @pyreon/validation@0.51.0

## 0.50.0

### Patch Changes

- Updated dependencies [[`f3f5d3b`](https://github.com/pyreon/pyreon/commit/f3f5d3b70d2bd19b23b802ea21ad8ba9d5e416a7), [`b428e47`](https://github.com/pyreon/pyreon/commit/b428e47766cc3c8be381b85458782884a4e3d241)]:
  - @pyreon/core@0.50.0
  - @pyreon/form@0.50.0
  - @pyreon/validation@0.50.0
  - @pyreon/reactivity@0.50.0
  - @pyreon/query@0.50.0
  - @pyreon/store@0.50.0
  - @pyreon/table@0.50.0

## 0.49.0

### Patch Changes

- Updated dependencies [[`41049d8`](https://github.com/pyreon/pyreon/commit/41049d897a1804d92ac0f599a48493e9a7a0fa85), [`d935083`](https://github.com/pyreon/pyreon/commit/d935083033edd2c0e74c8fa71e46d9dfcdb661e7)]:
  - @pyreon/core@0.49.0
  - @pyreon/form@0.49.0
  - @pyreon/query@0.49.0
  - @pyreon/table@0.49.0
  - @pyreon/validation@0.49.0
  - @pyreon/reactivity@0.49.0
  - @pyreon/store@0.49.0

## 0.48.0

### Patch Changes

- Updated dependencies [[`a333656`](https://github.com/pyreon/pyreon/commit/a333656ac79c7a43163b0a07f593aa71a59e124d), [`3f1120a`](https://github.com/pyreon/pyreon/commit/3f1120aaa5ee69b85f5de56681a655ba30bf0f67), [`9b5cb93`](https://github.com/pyreon/pyreon/commit/9b5cb9312fc46ddeaede34df600e63ef4ce16023), [`1fa3347`](https://github.com/pyreon/pyreon/commit/1fa33473514e64ebc07e3e75ad818fe1a9f89245)]:
  - @pyreon/reactivity@0.48.0
  - @pyreon/store@0.48.0
  - @pyreon/form@0.48.0
  - @pyreon/query@0.48.0
  - @pyreon/core@0.48.0
  - @pyreon/table@0.48.0
  - @pyreon/validation@0.48.0

## 0.47.0

### Patch Changes

- Updated dependencies [[`9799d6b`](https://github.com/pyreon/pyreon/commit/9799d6bfa1c3f99fa38f4375eebd330c2df0a715), [`17dbb42`](https://github.com/pyreon/pyreon/commit/17dbb42544f53a553bde5e8fcb57a7a99888cc28), [`bf658a0`](https://github.com/pyreon/pyreon/commit/bf658a0eb6495dc9bd7724997bdd6471043a6fe7)]:
  - @pyreon/core@0.47.0
  - @pyreon/table@0.47.0
  - @pyreon/store@0.47.0
  - @pyreon/form@0.47.0
  - @pyreon/reactivity@0.47.0
  - @pyreon/query@0.47.0
  - @pyreon/validation@0.47.0

## 0.46.0

### Minor Changes

- [#2242](https://github.com/pyreon/pyreon/pull/2242) [`1241013`](https://github.com/pyreon/pyreon/commit/124101364479fefa0313c9cbe269fb0789a56994) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(feature): validation now works for Valibot / ArkType (any Standard Schema), not just Zod

  `defineFeature`'s `createValidator` only recognised Zod (it gated on `safeParseAsync`), so a Valibot or ArkType schema silently received **no** form validation despite the documented "Zod / Valibot / ArkType" support — the form reported valid while the schema rejected (the silent-schema-drop class). It now routes any Standard Schema (`~standard`) through `@pyreon/validation`'s `standardSchemaToValidator`, and — unlike `isStandardSchema` — accepts **callable** schemas, so ArkType's `type(...)` (a function carrying `~standard`) is detected too. Errors surface on the right field.

  Honest boundary: field **introspection** (`extractFields` → auto form fields, table columns, create-form defaults) remains **Zod-only** — there is no cross-library shape-introspection standard. A non-Zod feature now emits a one-time dev warning naming the fix (supply `initialValues` explicitly; build tables via `@pyreon/table` directly) instead of the confusing downstream `[@pyreon/form] Field … does not exist` crash. The query hooks (`useList`/`useById`/`useSearch`/`useCreate`/`useUpdate`/`useDelete`) and `useStore` are schema-agnostic and work with every validator.

  All new tests exercise the real composed primitives (real `QueryClient` + `mount` + `@pyreon/form` + `@pyreon/table`) with real Zod, Valibot, and ArkType schemas.

### Patch Changes

- [#2272](https://github.com/pyreon/pyreon/pull/2272) [`b23cd38`](https://github.com/pyreon/pyreon/commit/b23cd38a2bdea6ff7965c6700902f1e595422fd7) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Remove the redundant local `hasStandardSchema` duck-type in `@pyreon/feature` and route Standard-Schema detection through `@pyreon/validation`'s exported `isStandardSchema`.

  The local workaround existed ONLY because validation's `isStandardSchema` used to carry an over-narrow `typeof value !== 'object'` guard that silently rejected callable ArkType schemas (`type(...)` returns a FUNCTION carrying `~standard`). [#2243](https://github.com/pyreon/pyreon/issues/2243) fixed that guard to accept `typeof === 'object' || 'function'`, so the two functions are now behaviorally identical and the local copy is dead weight. This completes the ArkType raw-schema detection arc ([#2242](https://github.com/pyreon/pyreon/issues/2242) → [#2243](https://github.com/pyreon/pyreon/issues/2243) → [#2253](https://github.com/pyreon/pyreon/issues/2253)).

  No behavior change — a raw callable ArkType schema is still detected and produces validation (locked by the existing `schema-validators.test.tsx` ArkType case, bisect-verified against a narrowed object-only guard).

- Updated dependencies [[`8f0912c`](https://github.com/pyreon/pyreon/commit/8f0912c3a36055aa625d582777850c0c3ecfbc04), [`7798a6a`](https://github.com/pyreon/pyreon/commit/7798a6a6a9e70f977483564b23eb1bf9a554b3fa), [`75a49be`](https://github.com/pyreon/pyreon/commit/75a49befac42202c8237911aa4b111efbbfb1a61), [`cc5250d`](https://github.com/pyreon/pyreon/commit/cc5250d4022638286a0bf89facffb5a585fe2a18), [`19c1ce1`](https://github.com/pyreon/pyreon/commit/19c1ce12a54305ac875d1b19682ecf084addc607), [`f67f3fe`](https://github.com/pyreon/pyreon/commit/f67f3fe451f0aeeb74a024501d30f593ce50b7ff), [`d93e7d3`](https://github.com/pyreon/pyreon/commit/d93e7d3f9a4d679b25a3fc646d99673c2fe276c5), [`c67cbb9`](https://github.com/pyreon/pyreon/commit/c67cbb9795c8f6cfed4669f34d7f726e26f0e10d), [`2963c27`](https://github.com/pyreon/pyreon/commit/2963c270f8fa5f6b2d178b6d8fb6d2bd21d3df89), [`3124522`](https://github.com/pyreon/pyreon/commit/31245225c087922575846fa644f93523ff6e1435), [`87ba16e`](https://github.com/pyreon/pyreon/commit/87ba16e3dc9cfa44ef03f8e2cb229a3b6fd11d47), [`661a748`](https://github.com/pyreon/pyreon/commit/661a7485a93abb9fc64592e25c5214b0a27d8597)]:
  - @pyreon/validation@0.46.0
  - @pyreon/form@0.46.0
  - @pyreon/reactivity@0.46.0
  - @pyreon/store@0.46.0
  - @pyreon/core@0.46.0
  - @pyreon/query@0.46.0
  - @pyreon/table@0.46.0

## 0.45.0

### Patch Changes

- Updated dependencies [[`e757b33`](https://github.com/pyreon/pyreon/commit/e757b33ea75a63d3b59751c22d0c290bdf8b71e0), [`7176c25`](https://github.com/pyreon/pyreon/commit/7176c25c5f40b92eeeafede866dff557e2277e4a), [`353eb05`](https://github.com/pyreon/pyreon/commit/353eb058ec9008d9de2fdc80559a0713f180a7d4), [`7d737ff`](https://github.com/pyreon/pyreon/commit/7d737ff41dd16112cd1c7746a8cc65cecccdaad0)]:
  - @pyreon/form@0.45.0
  - @pyreon/query@0.45.0
  - @pyreon/table@0.45.0
  - @pyreon/validation@0.45.0
  - @pyreon/core@0.45.0
  - @pyreon/reactivity@0.45.0
  - @pyreon/store@0.45.0

## 0.44.0

### Patch Changes

- Updated dependencies [[`38deec0`](https://github.com/pyreon/pyreon/commit/38deec0695ae616960966766e530e1b42d138ed1), [`c79a5f4`](https://github.com/pyreon/pyreon/commit/c79a5f492836645e41db6467b97c61ae2694c903), [`7021725`](https://github.com/pyreon/pyreon/commit/702172586ab3ede234cddc19ee691f82b30c4770), [`4ae3793`](https://github.com/pyreon/pyreon/commit/4ae3793ab53866be3d057260f3cbe9a213bf7a3b), [`d859370`](https://github.com/pyreon/pyreon/commit/d8593704b0941ef0e51a427147ebce2a385ecae3)]:
  - @pyreon/validation@0.44.0
  - @pyreon/form@0.44.0
  - @pyreon/store@0.44.0
  - @pyreon/reactivity@0.44.0
  - @pyreon/query@0.44.0
  - @pyreon/table@0.44.0
  - @pyreon/core@0.44.0

## 0.43.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.43.1
  - @pyreon/query@0.43.1
  - @pyreon/store@0.43.1
  - @pyreon/table@0.43.1
  - @pyreon/validation@0.43.1

## 0.43.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.43.0
  - @pyreon/reactivity@0.43.0
  - @pyreon/form@0.43.0
  - @pyreon/query@0.43.0
  - @pyreon/store@0.43.0
  - @pyreon/table@0.43.0
  - @pyreon/validation@0.43.0

## 0.42.0

### Patch Changes

- Updated dependencies [[`6c03a11`](https://github.com/pyreon/pyreon/commit/6c03a118d2c2ee35e1ac76b9962e11f98f52077d), [`b1479a5`](https://github.com/pyreon/pyreon/commit/b1479a57a83d860fc1c738d2fcfb6850c9304c88), [`6376915`](https://github.com/pyreon/pyreon/commit/63769159fb169209278845b0e6e607879faf54ba), [`707e1be`](https://github.com/pyreon/pyreon/commit/707e1bee8455d0347dc13dd0f6845dd60971588e), [`fda03d2`](https://github.com/pyreon/pyreon/commit/fda03d2c023d5aebbcb5abc1ae5908b051e418df), [`538c92a`](https://github.com/pyreon/pyreon/commit/538c92a651bcf55f2b97dbdeab45c4099fd8c2dc), [`0a76111`](https://github.com/pyreon/pyreon/commit/0a76111189ea80ed676f898f0c8c1b08b320ca23), [`f2a5a26`](https://github.com/pyreon/pyreon/commit/f2a5a262b5b497e735c825678c2b7a86d55ec87a), [`1a29fc3`](https://github.com/pyreon/pyreon/commit/1a29fc3d761b4facfe5e77d1503ffc3fd4f036e3), [`707e1be`](https://github.com/pyreon/pyreon/commit/707e1bee8455d0347dc13dd0f6845dd60971588e)]:
  - @pyreon/form@0.42.0
  - @pyreon/store@0.42.0
  - @pyreon/validation@0.42.0
  - @pyreon/query@0.42.0
  - @pyreon/table@0.42.0
  - @pyreon/core@0.42.0
  - @pyreon/reactivity@0.42.0

## 0.41.2

### Patch Changes

- Updated dependencies [[`3ebf924`](https://github.com/pyreon/pyreon/commit/3ebf924cff00ed5bfeb0a099f66f578409fe4c18)]:
  - @pyreon/form@0.41.2
  - @pyreon/query@0.41.2
  - @pyreon/store@0.41.2
  - @pyreon/table@0.41.2
  - @pyreon/validation@0.41.2

## 0.41.1

### Patch Changes

- Updated dependencies [[`12ce8e7`](https://github.com/pyreon/pyreon/commit/12ce8e72ffeff8b692db698301431674f7f87c40)]:
  - @pyreon/form@0.41.1
  - @pyreon/query@0.41.1
  - @pyreon/store@0.41.1
  - @pyreon/table@0.41.1
  - @pyreon/validation@0.41.1

## 0.41.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.41.0
  - @pyreon/reactivity@0.41.0
  - @pyreon/form@0.41.0
  - @pyreon/query@0.41.0
  - @pyreon/store@0.41.0
  - @pyreon/table@0.41.0
  - @pyreon/validation@0.41.0

## 0.40.0

### Patch Changes

- Updated dependencies [[`c184330`](https://github.com/pyreon/pyreon/commit/c184330594a7726c4f1f1095cc3a785cfe9ef3f7), [`ed364d2`](https://github.com/pyreon/pyreon/commit/ed364d2a34f4b74df94c02f3c2e630b96a4f2e7f)]:
  - @pyreon/reactivity@0.40.0
  - @pyreon/form@0.40.0
  - @pyreon/query@0.40.0
  - @pyreon/table@0.40.0
  - @pyreon/validation@0.40.0
  - @pyreon/core@0.40.0
  - @pyreon/store@0.40.0

## 0.39.0

### Patch Changes

- Updated dependencies [[`45791ad`](https://github.com/pyreon/pyreon/commit/45791ad573960d6d6741fbdc3621b24210b3fbd1), [`fa95aba`](https://github.com/pyreon/pyreon/commit/fa95aba3aebc24d0178093cd89870b8807beca72), [`794fb27`](https://github.com/pyreon/pyreon/commit/794fb27e6fa67e71608b603cd627cf4eff61a102), [`f7083e5`](https://github.com/pyreon/pyreon/commit/f7083e5a56768fb67e097ec9bc6ee6d1bc6e0d09), [`c82687c`](https://github.com/pyreon/pyreon/commit/c82687c07a2b2ba976787dea74bc891f72a1165a)]:
  - @pyreon/query@0.39.0
  - @pyreon/reactivity@0.39.0
  - @pyreon/form@0.39.0
  - @pyreon/table@0.39.0
  - @pyreon/validation@0.39.0
  - @pyreon/core@0.39.0
  - @pyreon/store@0.39.0

## 0.38.0

### Patch Changes

- [#1907](https://github.com/pyreon/pyreon/pull/1907) [`4f6135a`](https://github.com/pyreon/pyreon/commit/4f6135afac703ca77386819980769301cd10e2a9) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Correct `@pyreon/feature` API docs (manifest feeding `llms.txt`, `llms-full.txt`, and MCP `get_api`). The manifest had drifted from the source and documented an API that never existed: a string-map `schema`, an object `api: { baseUrl }` with phantom per-endpoint overrides, string `reference('users')`, and wrong hook shapes. Now source-accurate (verified against the integration tests):

  - `schema` is a real Zod / Valibot / ArkType validator (`z.object({ … })`), not a string map; `TValues` is inferred from it.
  - `api` is a plain string base path (e.g. `/api/posts`); REST endpoints are derived from it (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id`) — there are no `listUrl`/`getUrl`/etc. override fields.
  - `reference({ name })` takes a Feature object or `{ name }`, not a string.
  - `useList({ page, pageSize })` (`data()` is `T[]`, not `{ items }`), `useSearch(signal)` (a `Signal`, not an accessor), `useForm({ mode, id })` returning a `FormState` (`register`/`handleSubmit`/`isSubmitting`), `useTable(data, options)` (data first), `useCreate().mutate(…)` + `isPending()`, and `useStore()` exposing state on `.store`.

  No runtime change — docs/metadata only.

- Updated dependencies [[`5a39b0a`](https://github.com/pyreon/pyreon/commit/5a39b0ac0042dfa2ff8d120aa3679dbe98742014), [`cfa422f`](https://github.com/pyreon/pyreon/commit/cfa422fdb6985e50c74e06cf0f4c1318213d6303), [`0376a3d`](https://github.com/pyreon/pyreon/commit/0376a3ddc75dd1fbee582e7cabe98beb01d60073), [`6ee46e7`](https://github.com/pyreon/pyreon/commit/6ee46e7dca1cb01aacaa7c61ef5dbbcf12b30668), [`e08cf4b`](https://github.com/pyreon/pyreon/commit/e08cf4b9650f6e6c172b690eff2b192acc0ecb9a), [`979e434`](https://github.com/pyreon/pyreon/commit/979e4342776021eac5bfaed1c9e5ac0c4787dacc), [`abe3b61`](https://github.com/pyreon/pyreon/commit/abe3b61ac80bb91880752ae42351882f81cc61c2), [`47d7be4`](https://github.com/pyreon/pyreon/commit/47d7be4845808481b7a3fe3e111de834ae8a5604), [`8526e98`](https://github.com/pyreon/pyreon/commit/8526e9854318f886855d87b50b03373467436d80), [`442cc26`](https://github.com/pyreon/pyreon/commit/442cc26728fe5704a8bc9d8782f419d7a36a683a)]:
  - @pyreon/form@0.38.0
  - @pyreon/reactivity@0.38.0
  - @pyreon/store@0.38.0
  - @pyreon/core@0.38.0
  - @pyreon/query@0.38.0
  - @pyreon/table@0.38.0
  - @pyreon/validation@0.38.0

## 0.37.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.37.1
  - @pyreon/query@0.37.1
  - @pyreon/store@0.37.1
  - @pyreon/table@0.37.1
  - @pyreon/validation@0.37.1

## 0.37.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.37.0
  - @pyreon/reactivity@0.37.0
  - @pyreon/form@0.37.0
  - @pyreon/query@0.37.0
  - @pyreon/store@0.37.0
  - @pyreon/table@0.37.0
  - @pyreon/validation@0.37.0

## 0.36.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.36.0
  - @pyreon/core@0.36.0
  - @pyreon/reactivity@0.36.0
  - @pyreon/query@0.36.0
  - @pyreon/store@0.36.0
  - @pyreon/table@0.36.0
  - @pyreon/validation@0.36.0

## 0.35.0

### Patch Changes

- [#1670](https://github.com/pyreon/pyreon/pull/1670) [`80b404b`](https://github.com/pyreon/pyreon/commit/80b404b956c698510dccfaddf4afe1266672f5bd) Thanks [@vitbokisch](https://github.com/vitbokisch)! - fix(feature): guard edit-mode auto-fetch against write-after-unmount. `useForm({ mode: 'edit', id })` could resolve its `getById` fetch after the component unmounted and write the server data into a disposed form (the stale-promise class). An `onUnmount` cancellation flag now skips both settle branches after unmount.

- Updated dependencies [[`1f29c4b`](https://github.com/pyreon/pyreon/commit/1f29c4b9791e6ad96901ca0e2b90e5335b803895), [`ce49268`](https://github.com/pyreon/pyreon/commit/ce49268f21615478fe5544ce5ab385b74704c75d), [`bf6865c`](https://github.com/pyreon/pyreon/commit/bf6865c815e2ee4499995f9aba91591fa26a86f3), [`ac75935`](https://github.com/pyreon/pyreon/commit/ac7593520f4467cd7ba362178ee00ca7029794da), [`02b77ae`](https://github.com/pyreon/pyreon/commit/02b77aed6b4383554b3458e408b462098fc3e708), [`35d440a`](https://github.com/pyreon/pyreon/commit/35d440a44d92ac913cf19f3f8e21b4603458a165), [`86424f9`](https://github.com/pyreon/pyreon/commit/86424f9ce9f52dfa978da28c8d16322fd302e977), [`87e8f97`](https://github.com/pyreon/pyreon/commit/87e8f97143c03a83add6bc6db3e23fbbac5aaab1)]:
  - @pyreon/form@0.35.0
  - @pyreon/core@0.35.0
  - @pyreon/query@0.35.0
  - @pyreon/validation@0.35.0
  - @pyreon/table@0.35.0
  - @pyreon/reactivity@0.35.0
  - @pyreon/store@0.35.0

## 0.34.0

### Patch Changes

- Updated dependencies [[`66d44c5`](https://github.com/pyreon/pyreon/commit/66d44c58920bf81848e9ba858c413a88727a3c65), [`038a58c`](https://github.com/pyreon/pyreon/commit/038a58c0f39a35ad4338f6d2596c33c47e4e30cc)]:
  - @pyreon/reactivity@0.34.0
  - @pyreon/core@0.34.0
  - @pyreon/validation@0.34.0
  - @pyreon/form@0.34.0
  - @pyreon/table@0.34.0
  - @pyreon/query@0.34.0
  - @pyreon/store@0.34.0

## 0.33.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.32.0

### Patch Changes

- Updated dependencies [[`0e38332`](https://github.com/pyreon/pyreon/commit/0e3833212e93ec90994edfccb5f2966f9eb0e926), [`0c1ea1e`](https://github.com/pyreon/pyreon/commit/0c1ea1e89e4228e84367efd5d2cb334808955a25), [`e36bbe5`](https://github.com/pyreon/pyreon/commit/e36bbe52e7f1417a703b4e6ce23281c448d9132f), [`65ccdf2`](https://github.com/pyreon/pyreon/commit/65ccdf2ad95a16b676b58948acea51f957e5cf62), [`52bcecd`](https://github.com/pyreon/pyreon/commit/52bcecde43f58a48c3e1d3d0fd0b61d9e1956da9), [`7f89196`](https://github.com/pyreon/pyreon/commit/7f89196dd3d99f61b0bba032481b9d389fdd8264), [`48dd5e4`](https://github.com/pyreon/pyreon/commit/48dd5e4d2264f27a7fd39b796d4d518f05ef4043)]:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.31.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.30.0

### Patch Changes

- Updated dependencies [[`6feb9d4`](https://github.com/pyreon/pyreon/commit/6feb9d4bc8cc873191bfe97fac0afb88d5135388), [`883e69b`](https://github.com/pyreon/pyreon/commit/883e69baed47d77eb79f4dd09b87da96a0b52894), [`4efa71b`](https://github.com/pyreon/pyreon/commit/4efa71b83af84b9310681ed213a331842248bb65), [`960bb0f`](https://github.com/pyreon/pyreon/commit/960bb0f139839de49508d836878b98556b1c7d07), [`b720267`](https://github.com/pyreon/pyreon/commit/b720267f0d9fbe260398c56d49834dc1dd2b09fb)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.29.0

### Patch Changes

- Updated dependencies [[`c54ce0f`](https://github.com/pyreon/pyreon/commit/c54ce0f284dab0335d9b597488ba75c6dea92b43), [`6d3e085`](https://github.com/pyreon/pyreon/commit/6d3e085183ec42883a842967afe22f806f0ea21d), [`c2874df`](https://github.com/pyreon/pyreon/commit/c2874df8f2b07b19aaa7a64c2f9ff2ab6b11d2f0), [`e1139cc`](https://github.com/pyreon/pyreon/commit/e1139cc20447860a2c0e547e6fc0ed67f359e1fe)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

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

- Updated dependencies [[`63bdb95`](https://github.com/pyreon/pyreon/commit/63bdb956b9d1ac5db779672f0cd7314de672fac9), [`9be0265`](https://github.com/pyreon/pyreon/commit/9be0265553ff756383b21f9c0ab556949d7cadb0)]:
  - @pyreon/store@0.28.1
  - @pyreon/form@0.28.1
  - @pyreon/query@0.28.1
  - @pyreon/table@0.28.1
  - @pyreon/validation@0.28.1

## 0.28.0

### Patch Changes

- [#1194](https://github.com/pyreon/pyreon/pull/1194) [`1aeb610`](https://github.com/pyreon/pyreon/commit/1aeb610a10ce5069b52b2882a6175a16c16483b3) Thanks [@vitbokisch](https://github.com/vitbokisch)! - chore: move @pyreon/sized-map to packages/core/ + enrich mcp/feature/storage manifests

  **@pyreon/sized-map** — package moved from `packages/internals/` to `packages/core/`
  alongside the other foundational primitives every Pyreon package depends on. The
  package is now published to npm at 0.27.1 with OIDC trusted publishing, so the
  "internal-by-convention" location no longer fits. Updated:

  - `repository.directory` in package.json → `packages/core/sized-map`
  - `bun.lock` workspace dep entry rewritten

  Zero source/runtime changes — every consumer imports `@pyreon/sized-map` by package
  name, never by path. This is a path-only repackage; the published artifact is
  byte-identical.

  **@pyreon/feature** — manifest enriched from 2 → 5 api[] entries:

  - Added `isReference`, `extractFields`, `defaultInitialValues` (helpers exported
    from the package but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to the existing `reference()` entry

  `get_api({ package: 'feature', symbol: 'extractFields' })` now returns a real
  entry instead of 404. No runtime change.

  **@pyreon/mcp** — manifest enriched: 9 of 14 tool entries lacked `mistakes[]`.
  Added foot-gun catalogs for `get_api`, `validate`, `migrate_react`, `get_routes`,
  `get_components`, `get_pattern`, `get_changelog`, `audit_test_environment`,
  `audit_islands`. All 14 tools now have 3-4 documented mistakes grounded in real
  failure modes. No runtime change.

  **@pyreon/storage** — manifest enriched from 4 → 7 api[] entries:

  - Added `useSessionStorage`, `useMemoryStorage`, `setCookieSource` (helpers exported
    but not in the MCP `get_api` surface before this PR)
  - Added `mistakes[]` to existing `useCookie`, `useIndexedDB`, `createStorage`
    entries (e.g. cookie maxAge unit traps, IDB async-init flash-of-default, custom
    backend `undefined` vs `null` return contract)

  No runtime change.

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.27.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.27.1
  - @pyreon/query@0.27.1
  - @pyreon/store@0.27.1
  - @pyreon/table@0.27.1
  - @pyreon/validation@0.27.1

## 0.27.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.33.0
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/table@0.33.0
  - @pyreon/validation@0.33.0

## 0.26.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.3
  - @pyreon/query@0.26.3
  - @pyreon/store@0.26.3
  - @pyreon/table@0.26.3
  - @pyreon/validation@0.26.3

## 0.26.2

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.2
  - @pyreon/query@0.26.2
  - @pyreon/store@0.26.2
  - @pyreon/table@0.26.2
  - @pyreon/validation@0.26.2

## 0.26.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/form@0.26.1
  - @pyreon/query@0.26.1
  - @pyreon/store@0.26.1
  - @pyreon/table@0.26.1
  - @pyreon/validation@0.26.1

## 0.26.0

### Patch Changes

- [#960](https://github.com/pyreon/pyreon/pull/960) [`8333f05`](https://github.com/pyreon/pyreon/commit/8333f05e3a2b3d8b31cd03c3d835a4234a6e689c) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Fix 4 more framework DX walls surfaced by deep-audit of the HN-clone ([#942](https://github.com/pyreon/pyreon/issues/942)) — all bisect-verified at the unit level.

  **W13 — `@pyreon/zero/client` strips URL query string on SPA cold-start.**
  `startClient` called `router.replace(router.currentRoute().path)` to kick
  off the loader pipeline, but `currentRoute().path` is the pathname ONLY
  (query + hash stripped by `resolveRoute`). The `router.replace(pathname)`
  then wrote the bare URL via `history.replaceState`, silently dropping any
  query params present on the initial-load URL. Direct-link sharing of
  `/search?q=react` was broken on cold-start — `useUrlState('q')` /
  `useTypedSearchParams` read empty `window.location.search` and fell back
  to defaults. Fix: pass the FULL URL (pathname + search + hash) instead.

  **W14 — `@pyreon/hotkeys` sequential combos (`'g t'`) didn't work.**
  CLAUDE.md documented vim/Gmail-style `g t` / `g n` combos but the
  implementation only split on `+`. So `'g t'` parsed as a single key
  literal `'g t'` (with space) that could never match a keystroke. Fix:
  `registerHotkey` now splits the shortcut on whitespace into a sequence
  of sub-combos. Each non-first combo is recorded as `entry.sequence[]`
  and matched against subsequent keystrokes within a 1-second timeout
  window. Three-step sequences (`a b c`) and combos with modifiers
  (`ctrl+k p`) both work. 9 new specs cover the contract.

  **W16 — `@pyreon/runtime-dom`'s `<Transition>` crashed with null ref**
  when wrapped inside `<Portal>`/`<Show>`/other reactive wrappers. The
  `appear: true` path queued `applyEnter(ref.current as HTMLElement)`
  in a microtask, but the child commit could be one or more microtasks
  behind. `applyEnter(null)` → `el.classList.remove(...)` → "Cannot read
  properties of null (reading 'classList')". Fix: `safeApplyEnter`
  retries up to 16 microtasks for the ref to populate before silently
  giving up. Bisect-verified spec.

  **W17 — `@pyreon/feature`'s `feature.useForm()` didn't invalidate the
  list query after submit.** `useForm`'s `onSubmit` called `http.create()`
  / `http.update()` DIRECTLY, bypassing the `useCreate()` / `useUpdate()`
  mutation pipeline that wires `client.invalidateQueries` in `onSuccess`.
  So after the form submitted, the list view didn't refetch and the UI
  silently failed to show the new/updated item until manual reload. Fix:
  `useForm`'s onSubmit now invalidates `queryKeyBase` (and the per-id key
  in edit mode), matching the behaviour of `useCreate()` / `useUpdate()`.
  96 feature tests still pass.

  Discovered by deep-auditing every interactive flow in the HN-clone
  (`[#942](https://github.com/pyreon/pyreon/issues/942)`) with Playwright. Each is bisect-verified — revert the source
  fix → the new test fails; restore → it passes.

- Updated dependencies [[`885d6d9`](https://github.com/pyreon/pyreon/commit/885d6d95f02b9dd1b462c1ba1114ecf94350671a), [`fd3422c`](https://github.com/pyreon/pyreon/commit/fd3422cfec1d48c8b382f8512ed44f8256887931), [`cc8e6ac`](https://github.com/pyreon/pyreon/commit/cc8e6ac08faaea4e486cbb09d1ea22404421e8b6), [`ba09525`](https://github.com/pyreon/pyreon/commit/ba09525e947ebff5573222332bd0f1548fcfae77), [`ec869c0`](https://github.com/pyreon/pyreon/commit/ec869c0fa7eefd16901daf382ff273b60350fe66), [`2d9acff`](https://github.com/pyreon/pyreon/commit/2d9acff27e9fd3c51468e98505a6a2334e2b5384), [`a31f7dd`](https://github.com/pyreon/pyreon/commit/a31f7dd8f8ddba6864c69bbf53117d36ddd477a3), [`71901d4`](https://github.com/pyreon/pyreon/commit/71901d4366e993542a0a8252647b7a4b0e8ec3d2), [`0fd9852`](https://github.com/pyreon/pyreon/commit/0fd98527ff7ea8a06ef0b470a2a6e84fcd9eba81), [`1921168`](https://github.com/pyreon/pyreon/commit/192116843a0547c777e884f0254ffc51a69bfae1), [`749c2f4`](https://github.com/pyreon/pyreon/commit/749c2f435909740ea43d528ebfc00a2155e64f74), [`814dd46`](https://github.com/pyreon/pyreon/commit/814dd4649c83f044ef5754b73fdc20e4e037524d), [`534696a`](https://github.com/pyreon/pyreon/commit/534696ab763a1cd045f822da4cec41bdf08c98be), [`745fd63`](https://github.com/pyreon/pyreon/commit/745fd63c3ce97d0eb7bab37fa85ae40ed8c1c9bd)]:
  - @pyreon/reactivity@0.33.0
  - @pyreon/form@0.33.0
  - @pyreon/core@0.33.0
  - @pyreon/query@0.33.0
  - @pyreon/store@0.33.0
  - @pyreon/validation@0.33.0
  - @pyreon/table@0.33.0

## 0.25.1

### Patch Changes

- [#902](https://github.com/pyreon/pyreon/pull/902) [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Ship source maps in published tarballs.

  Every `@pyreon/*` package now ships its `.js.map` and `.d.ts.map` files. The previous `!lib/**/*.map` exclusion in each package's `files` array left every emitted JS file pointing at a `//# sourceMappingURL=*.map` that wasn't actually published — causing Vite (and other bundlers) to log a "Failed to load source map" warning per file on every cold dev start. Real bug in shipped tarballs, not just dev-noise theory.

  The fix is shipping the maps. They make framework stack traces readable: `at mountChild (node_modules/@pyreon/runtime-dom/src/nodes.ts:147)` instead of `at e (node_modules/@pyreon/runtime-dom/lib/index.js:1:42857)`. This matters most when a user hits a framework bug, opens devtools, or sees an unreadable production error from a server-side render. Sentry / Bugsnag / Rollbar can also translate framework frames using the shipped maps; without them, the framework's part of every captured stack stays opaque.

  Cost: ~350KB-1MB per package in `node_modules`. Bundlers (Vite, Webpack, Rollup, esbuild) strip source maps from production builds automatically; they never reach end users. Every comparable library (React, Vue, Solid, Preact, Svelte, TanStack) does this.

  No API changes. The `check-distribution` CI gate inverts to enforce the new contract (maps must be present, not absent).

- Updated dependencies [[`c862965`](https://github.com/pyreon/pyreon/commit/c8629652a94ca7d1e8622cd2de5b4ac009874dbf), [`b87fbac`](https://github.com/pyreon/pyreon/commit/b87fbaced0cbeb7304bdc1d358040818e4b1491e)]:
  - @pyreon/reactivity@0.25.1
  - @pyreon/core@0.25.1
  - @pyreon/form@0.25.1
  - @pyreon/query@0.25.1
  - @pyreon/store@0.25.1
  - @pyreon/table@0.25.1
  - @pyreon/validation@0.25.1

## 0.25.0

### Patch Changes

- Updated dependencies [[`7da5b2b`](https://github.com/pyreon/pyreon/commit/7da5b2bcbc2aebd9600cb8fdefb763ace7f78c1a), [`bc145f3`](https://github.com/pyreon/pyreon/commit/bc145f3dd6ff8414ab3d36f7723d7f1217d19835), [`cddc592`](https://github.com/pyreon/pyreon/commit/cddc5926f2f23d1b600d01f60fa4e72513d2b6fe), [`6075127`](https://github.com/pyreon/pyreon/commit/60751278894a6ff843c0f6f6c4894c76bcb6a720), [`f71fb4c`](https://github.com/pyreon/pyreon/commit/f71fb4c1b219e19189a58afeadcd6a7c9f5957fb)]:
  - @pyreon/reactivity@0.25.0
  - @pyreon/core@0.25.0
  - @pyreon/store@0.25.0
  - @pyreon/form@0.25.0
  - @pyreon/query@0.25.0
  - @pyreon/table@0.25.0
  - @pyreon/validation@0.25.0

## 0.24.6

### Patch Changes

- Updated dependencies [[`378efde`](https://github.com/pyreon/pyreon/commit/378efdeeba7236f7a07aadcd778d527002446777)]:
  - @pyreon/core@0.24.6
  - @pyreon/reactivity@0.24.6
  - @pyreon/form@0.24.6
  - @pyreon/query@0.24.6
  - @pyreon/store@0.24.6
  - @pyreon/table@0.24.6
  - @pyreon/validation@0.24.6

## 0.24.5

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.5
  - @pyreon/reactivity@0.24.5
  - @pyreon/form@0.24.5
  - @pyreon/query@0.24.5
  - @pyreon/store@0.24.5
  - @pyreon/table@0.24.5
  - @pyreon/validation@0.24.5

## 0.24.4

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.4
  - @pyreon/reactivity@0.24.4
  - @pyreon/form@0.24.4
  - @pyreon/query@0.24.4
  - @pyreon/store@0.24.4
  - @pyreon/table@0.24.4
  - @pyreon/validation@0.24.4

## 0.24.3

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.3
  - @pyreon/reactivity@0.24.3
  - @pyreon/form@0.24.3
  - @pyreon/query@0.24.3
  - @pyreon/store@0.24.3
  - @pyreon/table@0.24.3
  - @pyreon/validation@0.24.3

## 0.24.2

### Patch Changes

- Updated dependencies [[`1c1b135`](https://github.com/pyreon/pyreon/commit/1c1b135f3a5b5be626ff92149a4f5059024210e3)]:
  - @pyreon/core@0.24.2
  - @pyreon/reactivity@0.24.2
  - @pyreon/form@0.24.2
  - @pyreon/query@0.24.2
  - @pyreon/store@0.24.2
  - @pyreon/table@0.24.2
  - @pyreon/validation@0.24.2

## 0.24.1

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.24.1
  - @pyreon/reactivity@0.24.1
  - @pyreon/form@0.24.1
  - @pyreon/query@0.24.1
  - @pyreon/store@0.24.1
  - @pyreon/table@0.24.1
  - @pyreon/validation@0.24.1

## 0.24.0

### Patch Changes

- Updated dependencies [[`dfaefb8`](https://github.com/pyreon/pyreon/commit/dfaefb8e9e06eaff9039c001ad7731476b6b5732), [`67e1f37`](https://github.com/pyreon/pyreon/commit/67e1f371a20219481ee9564d2d7421ec2a0b5ddf), [`b8fb31c`](https://github.com/pyreon/pyreon/commit/b8fb31cf1a59578fc33f27d539695d2bc164b2f1), [`f400e85`](https://github.com/pyreon/pyreon/commit/f400e85282a370276d5ae0266ba501c41dce4f3e), [`891ca43`](https://github.com/pyreon/pyreon/commit/891ca4300727119dafd66ceaacd7cb39e68f3b4e), [`d4ec777`](https://github.com/pyreon/pyreon/commit/d4ec777643446ed2c51dedb1e74fbd8dce70bdfd), [`2abb672`](https://github.com/pyreon/pyreon/commit/2abb672d8a8bf7f4940af422bf8bf802aa129cdd)]:
  - @pyreon/core@0.24.0
  - @pyreon/reactivity@0.24.0
  - @pyreon/form@0.24.0
  - @pyreon/query@0.24.0
  - @pyreon/store@0.24.0
  - @pyreon/table@0.24.0
  - @pyreon/validation@0.24.0

## 0.23.0

### Patch Changes

- Updated dependencies [[`6571df8`](https://github.com/pyreon/pyreon/commit/6571df8209c5dc72619194ffe19359765b1d2d7f), [`af4d5d8`](https://github.com/pyreon/pyreon/commit/af4d5d83fc087d738dbe5084950476566d488d77), [`441b5df`](https://github.com/pyreon/pyreon/commit/441b5dfa64ae52002d3e6612ec68566344ae999d)]:
  - @pyreon/core@0.23.0
  - @pyreon/reactivity@0.23.0
  - @pyreon/form@0.23.0
  - @pyreon/query@0.23.0
  - @pyreon/store@0.23.0
  - @pyreon/table@0.23.0
  - @pyreon/validation@0.23.0

## 0.22.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.22.0
  - @pyreon/reactivity@0.22.0
  - @pyreon/form@0.22.0
  - @pyreon/query@0.22.0
  - @pyreon/store@0.22.0
  - @pyreon/table@0.22.0
  - @pyreon/validation@0.22.0

## 0.21.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.21.0
  - @pyreon/reactivity@0.21.0
  - @pyreon/form@0.21.0
  - @pyreon/query@0.21.0
  - @pyreon/store@0.21.0
  - @pyreon/table@0.21.0
  - @pyreon/validation@0.21.0

## 0.20.0

### Patch Changes

- Updated dependencies [[`3499594`](https://github.com/pyreon/pyreon/commit/3499594585b7fcb650ac0f80be4bc355f741491b)]:
  - @pyreon/reactivity@0.20.0
  - @pyreon/core@0.20.0
  - @pyreon/form@0.20.0
  - @pyreon/query@0.20.0
  - @pyreon/store@0.20.0
  - @pyreon/table@0.20.0
  - @pyreon/validation@0.20.0

## 0.19.0

### Patch Changes

- Updated dependencies [[`c3d0a70`](https://github.com/pyreon/pyreon/commit/c3d0a7017ed2ef4468ec3fb4e4c09ec869d2917a), [`ecd8e52`](https://github.com/pyreon/pyreon/commit/ecd8e526943a1e6b07957ff96f4410fa482baa0d), [`ac1d375`](https://github.com/pyreon/pyreon/commit/ac1d37542b11cd95451a2f0b0a51cc43603d001a), [`21e465c`](https://github.com/pyreon/pyreon/commit/21e465c7957c3e57c838af58ffa995682908c5f8), [`c4b6e9a`](https://github.com/pyreon/pyreon/commit/c4b6e9a5850196171c2197fc918163f736708aa8), [`fb40906`](https://github.com/pyreon/pyreon/commit/fb409066e49e44c42f77084a92a68103a4e6c5ef), [`fde0f41`](https://github.com/pyreon/pyreon/commit/fde0f41ad6312ad0ee45d8e70ece965d7c4fec41), [`9f03747`](https://github.com/pyreon/pyreon/commit/9f037478763d9f8cd2365feb63dc87fda2545e5d), [`3374150`](https://github.com/pyreon/pyreon/commit/33741500499dfb487d031bbffe77723d74b8f261), [`fa4e37f`](https://github.com/pyreon/pyreon/commit/fa4e37fa620cf0e3f240053bf789b84bd9668838)]:
  - @pyreon/reactivity@0.19.0
  - @pyreon/query@0.19.0
  - @pyreon/core@0.19.0
  - @pyreon/store@0.19.0
  - @pyreon/form@0.19.0
  - @pyreon/table@0.19.0
  - @pyreon/validation@0.19.0

## 0.18.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.18.0
  - @pyreon/reactivity@0.18.0
  - @pyreon/form@0.18.0
  - @pyreon/query@0.18.0
  - @pyreon/store@0.18.0
  - @pyreon/table@0.18.0
  - @pyreon/validation@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [[`35af0e2`](https://github.com/pyreon/pyreon/commit/35af0e22b670151052e0b1df5006977fca759128), [`8b1a982`](https://github.com/pyreon/pyreon/commit/8b1a982faa140e7e646293a47d6a4fbe70cac67c)]:
  - @pyreon/core@0.17.0
  - @pyreon/form@0.17.0
  - @pyreon/query@0.17.0
  - @pyreon/table@0.17.0
  - @pyreon/validation@0.17.0
  - @pyreon/reactivity@0.17.0
  - @pyreon/store@0.17.0

## 0.16.0

### Patch Changes

- Updated dependencies [[`a4a4255`](https://github.com/pyreon/pyreon/commit/a4a42550835cb2706b99beed8ea582037d338ea8), [`7f26cd7`](https://github.com/pyreon/pyreon/commit/7f26cd78d74db8237aa6261a11965325d944f1ca)]:
  - @pyreon/core@0.16.0
  - @pyreon/form@0.16.0
  - @pyreon/validation@0.16.0
  - @pyreon/reactivity@0.16.0
  - @pyreon/query@0.16.0
  - @pyreon/store@0.16.0
  - @pyreon/table@0.16.0

## 0.14.0

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.14.0
  - @pyreon/reactivity@0.14.0
  - @pyreon/form@0.14.0
  - @pyreon/query@0.14.0
  - @pyreon/store@0.14.0
  - @pyreon/table@0.14.0
  - @pyreon/validation@0.14.0

## 0.13.0

### Patch Changes

- [#261](https://github.com/pyreon/pyreon/pull/261) [`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f) Thanks [@vitbokisch](https://github.com/vitbokisch)! - Triaged safe changes from architecture review PR [#260](https://github.com/pyreon/pyreon/issues/260):

  - **hotkeys**: detach global `keydown` listener when last hotkey unregisters (prevents listener accumulation across component remounts)
  - **code**: new `useEditorSignal()` hook — wraps `bindEditorToSignal` with `onUnmount` auto-cleanup (eliminates manual `dispose()` calls)
  - **form**: `ValidateFn` accepts optional `AbortSignal`; `useForm` creates per-cycle `AbortController` cancelled on unmount (prevents orphaned async validators)
  - **validation**: `zodSchema()` / `valibotSchema()` / `arktypeSchema()` return `TypedSchemaAdapter<TValues>` with `.validator` and phantom `_infer` type for compile-time field name validation. `useForm({ schema })` accepts both the new adapter and plain `SchemaValidateFn` (backward compatible).

  Dropped from the original PR: onCleanup LIFO ordering change (breaking behavioral change), circular effect detection (redundant with batch), SSR streaming backpressure (architecturally wrong implementation).

- Updated dependencies [[`72b2023`](https://github.com/pyreon/pyreon/commit/72b2023609bf539e804f64dbefcf2586edf7162f), [`ec30b4e`](https://github.com/pyreon/pyreon/commit/ec30b4e2188fb493fdde77a77f521abe000beae0), [`a05c4ba`](https://github.com/pyreon/pyreon/commit/a05c4bab713f5168acd56eb233520102735bd80a)]:
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/store@0.13.0
  - @pyreon/core@0.13.0
  - @pyreon/reactivity@0.13.0
  - @pyreon/table@0.13.0

## 0.12.15

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.15
  - @pyreon/reactivity@0.12.15
  - @pyreon/form@0.12.15
  - @pyreon/query@0.12.15
  - @pyreon/store@0.12.15
  - @pyreon/table@0.12.15
  - @pyreon/validation@0.12.15

## 0.12.14

### Patch Changes

- Updated dependencies [[`779f61f`](https://github.com/pyreon/pyreon/commit/779f61f99e1f403485871c1848fc82489d20960f)]:
  - @pyreon/query@0.12.14
  - @pyreon/core@0.12.14
  - @pyreon/reactivity@0.12.14
  - @pyreon/form@0.12.14
  - @pyreon/store@0.12.14
  - @pyreon/table@0.12.14
  - @pyreon/validation@0.12.14

## 0.12.13

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.13
  - @pyreon/reactivity@0.12.13
  - @pyreon/form@0.12.13
  - @pyreon/query@0.12.13
  - @pyreon/store@0.12.13
  - @pyreon/table@0.12.13
  - @pyreon/validation@0.12.13

## 0.12.12

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.12
  - @pyreon/reactivity@0.12.12
  - @pyreon/form@0.12.12
  - @pyreon/query@0.12.12
  - @pyreon/store@0.12.12
  - @pyreon/table@0.12.12
  - @pyreon/validation@0.12.12

## 0.12.11

### Patch Changes

- Updated dependencies []:
  - @pyreon/core@0.12.11
  - @pyreon/reactivity@0.12.11
  - @pyreon/form@0.12.11
  - @pyreon/query@0.12.11
  - @pyreon/store@0.12.11
  - @pyreon/table@0.12.11
  - @pyreon/validation@0.12.11

## 0.9.0

### Minor Changes

- ### Improvements
  - Upgrade to pyreon 0.7.5 (jsx preset, all JSX types accept undefined)
  - Use @pyreon/typescript preset (no local jsx override needed)
  - Complete documentation: 18 package READMEs, 18 docs/ files, llms.txt
  - Update AI building rules with document generation patterns

### Patch Changes

- Updated dependencies []:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

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
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.7.0

### Minor Changes

- [`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502) Thanks [@vitbokisch](https://github.com/vitbokisch)! - ### New package

  - `@pyreon/document` — universal document rendering with 18 node primitives and 14 output formats (HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence/Jira, WhatsApp, Google Chat)

  ### Fixes
  - Fix DTS export paths — bump @vitus-labs/tools-rolldown to 1.15.4 (emitDtsOnly fix)
  - All packages now produce correct type declarations

### Patch Changes

- Updated dependencies [[`deb9834`](https://github.com/pyreon/fundamentals/commit/deb983456472cc685d80e97b21196588af53b502)]:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

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
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.13.0

### Minor Changes

- Add @pyreon/permissions (reactive type-safe permissions) and @pyreon/machine (reactive state machines). Update AI building rules.

### Patch Changes

- Updated dependencies []:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

## 0.13.0

### Minor Changes

- Add @pyreon/storage (reactive localStorage, sessionStorage, cookies, IndexedDB) and @pyreon/hotkeys (keyboard shortcut management). Add useSubscription to @pyreon/query for WebSocket integration. Upgrade to pyreon core 0.5.4. Convert all tests and source to JSX.

### Patch Changes

- Updated dependencies []:
  - @pyreon/store@0.13.0
  - @pyreon/form@0.13.0
  - @pyreon/validation@0.13.0
  - @pyreon/query@0.13.0
  - @pyreon/table@0.13.0

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
  - @pyreon/store@0.1.0
  - @pyreon/form@0.1.0
  - @pyreon/validation@0.1.0
  - @pyreon/query@0.1.0
  - @pyreon/table@0.1.0
