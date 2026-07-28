---
name: pyreon-fundamentals
description: Deep per-package technical detail for the @pyreon/fundamentals layer — store, state-tree, form, validation, validate, query, table, virtual, i18n, feature, charts, storage, hooks, hotkeys, permissions, machine, flow, code, rich-text, document, rx, toast, url-state, dnd, sync, a11y. Load this before changing, debugging, or reviewing any of those packages: it carries their API contracts, hot paths, schema-mode semantics, and the specific foot-guns each one has shipped. Not needed for core/runtime/compiler/ui-system work.
---

# Pyreon Fundamentals — Key Technical Details

> Extracted verbatim from CLAUDE.md. This is the authoritative copy — edit it here.

**Read only the package you need.** Each entry below is a separate file; loading this
skill costs a fraction of the full detail, and you pull one package on demand.

# Pyreon Fundamentals — Key Technical Details
> Extracted verbatim from CLAUDE.md. This is the authoritative copy — edit it here.
| Package | Description |
| --- | --- |
| `@pyreon/store` | Global state — `defineStore(id, setup)` composition stores returning `StoreApi<T>`; type helpers `StoreState`/`StoreActions` (derive unwrapped state + action surface from the api) |
| `@pyreon/state-tree` | Structured reactive state tree — models, snapshots, patches, middleware |
| `@pyreon/form` | Signal-based forms — `field()`, `useField('name')`, `<Form>/<Submit>`, arrays, validation; type helpers `FormValues`/`FieldNames`/`FieldValue` + standalone `NestValues<T>` (flat dot-path → nested payload shape; NOT threaded through useForm by design) |
| `@pyreon/validation` | Universal, library-agnostic validation gate + **single canonical home for the Standard Schema contract**. Owns the validation contract (`ValidationError`/`ValidateFn`/`SchemaValidateFn`), the Standard Schema types (`StandardSchemaV1` strict spec type · `StandardSchemaLike` lax accept-type · `StandardSchemaResult`/`StandardSchemaIssue`; `StandardSchemaShape` is a deprecated alias), the bridge (`isStandardSchema`/`standardSchemaToValidator`/`wrapStandardSchema`), universal `InferSchema` (resolves `~standard.types.output` AND, when that phantom is omitted, the `validate` return), + adapters (Zod/Valibot/ArkType). **`isStandardSchema` accepts CALLABLE schemas** (value whose `typeof` is `object` OR `function`) — **ArkType schemas are functions** (`type("string")(input)` validates) carrying `~standard`; an object-only guard silently rejected raw ArkType, so every schema-driven consumer (`store`/`state-tree` via `extractParseFn`, plus the `standardSchemaToValidator` bridge) SKIPPED validation for a raw ArkType schema — now fixed, additive (object schemas unchanged; a plain function without `~standard` still rejected). **Zero pyreon deps**; `@pyreon/form`/`store`/`state-tree`/`feature`/`validate` consume it — `@pyreon/validate` + `@pyreon/state-tree` import the `~standard` types from here instead of re-declaring them (form re-exports the contract for back-compat). `@pyreon/zero`/`zero-content` keep inline `~standard` duck-typing (they sit above the fundamentals layer, can't depend on it). **`@pyreon/form` completes the chain**: `resolveSchemaValidator` now checks `isStandardSchema` BEFORE the `typeof === 'function'` → `SchemaValidateFn` fallback, so a RAW ArkType schema passed to `useForm({ schema })` is detected as a schema (not mistreated as a validate-fn) — form/store/state-tree/feature all work with raw ArkType |
| `@pyreon/validate` | DX overlay on Standard Schema (`withField`/`parseReactive`/`formatErrors`) + own `s` validator runtime |
| `@pyreon/http` | HTTP client — the transport layer under `@pyreon/query`. Onion middleware (`(req,next)=>res`, so retry/refresh/short-circuit are ordinary middleware), immutable clients (`extend()`, never mutable shared defaults — the SSR cross-request leak), typed errors (`AbortError` distinct from a real failure), timeout ON by default (`fetch` has none). Validation is THREE tiers and only the third costs a dep: `.json<T>()` cast · `.json(parseFn)` · `.json(schema)` via `@pyreon/http/schema` (zod/valibot/arktype/`s` + `@pyreon/validation` typed adapters). `endpoint('GET /users/:id')` derives call + cache key + response type from ONE declaration so queryKey/URL cannot drift; `.query()` forwards the AbortSignal. Subpaths gated so an unused layer costs nothing: `/middleware` `/schema` `/query` `/mock` `/server` (the only `node:async_hooks` import — per-request SSR context via ALS, so concurrent renders never cross cookies) |
| `@pyreon/query` | TanStack Query adapter; type helpers `QueryData`/`QueryError` (unwrap the adapter's result bags) |
| `@pyreon/table` | TanStack Table adapter |
| `@pyreon/virtual` | TanStack Virtual adapter |
| `@pyreon/i18n` | Reactive i18n — async namespaces, plurals, interpolation, Intl formatters; opt-in typed keys (`MessageKeys<M>` dot-path union w/ plural-suffix collapse, depth-cap 6 + `TranslationParams` + `createI18n<typeof en>()` → typo-rejecting `t`, additive) |
| `@pyreon/feature` | Schema-driven CRUD primitives (queries/forms/tables/stores). Schema does TWO jobs: VALIDATION works for Zod OR any Standard Schema (Valibot/ArkType — callable schema included — /modern Zod/`s`, via `standardSchemaToValidator`); FIELD INTROSPECTION (auto form fields/table columns/create-defaults via `extractFields`) is **Zod-only** — a non-Zod schema needs explicit `initialValues` (+ build tables via `@pyreon/table` directly), dev-warned once. Query hooks + `useStore` are schema-agnostic; each mutation invalidates the list query |
| `@pyreon/charts` | Reactive ECharts bridge, lazy-loaded (`<Chart>`/`useChart`); `onEvents` general event map (any ECharts event, leak-safe bind), reactive `showLoading` overlay, `replaceMerge`; REACTIVE theme (accessor form — flip disposes+re-inits with option/group/events preserved; plain value stays static); `getCore()`/`connect()` exported (registerMap/registerTheme/linked charts); `initOptions` + full `SetOptionOpts` passthrough; `autoresize: false \| { throttle }`; cached-modules SYNC mount fast path (2nd..Nth chart inits same-task). Wrapper-overhead micro-bench vs echarts-for-react (per-impl PROCESS-ISOLATED, pooled CI95, 2026-07): ~9.4× faster reactive update, ~2.3× faster dispose, mount 🤝 CI95-overlap TIE (the prior '1.7–1.9× slower mount' was single-process order bias + pre-fast-path). `bun run --filter=@pyreon/charts bench` |
| `@pyreon/storage` | Reactive client-side storage — local/session/cookie/IndexedDB/memory |
| `@pyreon/hooks` | 47 signal-based hooks |
| `@pyreon/hotkeys` | Keyboard shortcuts — KEY-BUCKETED dispatch (miss path = one Map lookup, flat vs registry size; bench-proven fastest vs tinykeys/hotkeys-js/mousetrap), reference-counted scopes, `mod` alias, sequential combos (`g t`), comma-lists (`ctrl+s, mod+p`), keyup bindings, `once`/`ignoreRepeat`, selective `enableOnInputs: ['input']`, element `target`s (one shared listener per target, detached with last hotkey), shifted-symbol shortcuts (`?` fires on Shift+/), `getPressedKeys()`/`isKeyPressed` (lazy, blur-cleared), programmatic `trigger()`, conflict detection, SSR-safe |
| `@pyreon/permissions` | Reactive permissions — RBAC/ABAC/flags/tiers |
| `@pyreon/machine` | Reactive state machines — constrained signals + typed transitions; `StateOf`/`EventOf` (state/event unions from INSTANCE or config — `InferStates`/`InferEvents` are config-only and yield `never` on an instance) |
| `@pyreon/flow` | Reactive flow diagrams — signal-native nodes/edges, pan/zoom, elkjs layout |
| `@pyreon/code` | Reactive code editor — CodeMirror 6, minimap, diff, tabbed |
| `@pyreon/rich-text` | Reactive WYSIWYG — signal-backed TipTap/ProseMirror, lazy, a11y-labeled |
| `@pyreon/document` | Universal document rendering — 18 primitives, 20 output formats |
| `@pyreon/rx` | Signal-aware reactive transforms — 42 functions |
| `@pyreon/toast` | Toasts — `toast()` + variants, `<Toaster>`, a11y |
| `@pyreon/url-state` | URL-synced state — `useUrlState`, schema mode, type coercion, SSR-safe |
| `@pyreon/dnd` | Signal-driven DnD — wraps `@atlaskit/pragmatic-drag-and-drop`. Every pdnd teardown wired into `onCleanup`; `useSortable` disposes per-item AND container registrations on ref-`null`/re-register (a `<Show>`-toggled container no longer leaks — the F3 per-item leak's sibling). Wrapper-tax bench (`bench/dnd-wrapper-tax.ts`, real pdnd + happy-dom, per-op process isolation): near-zero overhead vs hand-rolled raw pdnd — draggable/droppable/sortable-item lifecycles tie, monitor +~1 closure/mount |
| `@pyreon/sync` | Local-first CRDT sync — a synced signal IS a signal; Yjs engine, IndexedDB, cross-tab + WebSocket, presence/live-cursors, relay server w/ authz |
| `@pyreon/a11y` | A11y primitives — `announce()` (zero-setup live regions), `<VisuallyHidden>`, `createA11yId` |

## Per-package detail — read the file for the package you are touching

| Package | Detail file | Size |
| --- | --- | --- |
| `@pyreon/sync` | `references/sync.md` | ~2373 tok |
| `@pyreon/validate` | `references/validate.md` | ~1745 tok |
| `@pyreon/form` | `references/form.md` | ~1304 tok |
| `@pyreon/flow` | `references/flow.md` | ~1237 tok |
| `@pyreon/table` | `references/table.md` | ~737 tok |
| `@pyreon/store` | `references/store.md` | ~708 tok |
| `@pyreon/storage` | `references/storage.md` | ~545 tok |
| `@pyreon/code` | `references/code.md` | ~449 tok |
| `@pyreon/rich-text` | `references/rich-text.md` | ~422 tok |
| `@pyreon/toast` | `references/toast.md` | ~330 tok |
| `@pyreon/state-tree` | `references/state-tree.md` | ~196 tok |
| `@pyreon/rx` | `references/rx.md` | ~176 tok |
| `@pyreon/machine` | `references/machine.md` | ~137 tok |
| `@pyreon/query` | `references/query.md` | ~137 tok |
| `@pyreon/permissions` | `references/permissions.md` | ~113 tok |

Read a file with the Read tool, e.g.
`.claude/skills/pyreon-fundamentals/references/form.md`.
