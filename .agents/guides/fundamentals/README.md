# Pyreon fundamentals

Read only the file for the package you are changing. Packages with a detail file are listed first; the rest have their contract in this table and in the package's `src/manifest.ts` (served by the MCP `get_api` tool).

## Packages with a detail file

| Package | File | One line |
| --- | --- | --- |
| `@pyreon/store` | `references/store.md` | `defineStore(id, setup)` singleton stores, store-owned scope, schema overload |
| `@pyreon/state-tree` | `references/state-tree.md` | models, snapshots, patches, middleware |
| `@pyreon/form` | `references/form.md` | `useForm`, field a11y, schema error routing, dot-path leaf fields |
| `@pyreon/validate` | `references/validate.md` | `s` runtime, JIT, `.is()` verdict JIT, benchmark standings |
| `@pyreon/query` | `references/query.md` | TanStack Query adapter; options as a function |
| `@pyreon/table` | `references/table.md` | TanStack Table v9 adapter; fine-grained cells |
| `@pyreon/storage` | `references/storage.md` | reactive local/session/cookie/IndexedDB/memory signals, versioned migration |
| `@pyreon/permissions` | `references/permissions.md` | `can(key, ctx?)`, wildcard precedence |
| `@pyreon/machine` | `references/machine.md` | constrained-signal state machines; `StateOf`/`EventOf` work on an instance or config (`InferStates`/`InferEvents` are config-only and yield `never` on an instance) |
| `@pyreon/flow` | `references/flow.md` | flow diagrams, per-id reactivity, edge rendering invariants |
| `@pyreon/code` | `references/code.md` | CodeMirror 6 editor, grammar registry |
| `@pyreon/rich-text` | `references/rich-text.md` | TipTap/ProseMirror editor, JSON-derived counts |
| `@pyreon/rx` | `references/rx.md` | 42 signal-aware transforms, `pipe` |
| `@pyreon/toast` | `references/toast.md` | `toast()`, `<Toaster>`, soft/hard removal |
| `@pyreon/sync` | `references/sync.md` | local-first CRDT sync |

## Other packages

| Package | One line |
| --- | --- |
| `@pyreon/validation` | Home of the validation contract (`ValidationError`, `ValidateFn`, `SchemaValidateFn`) and the Standard Schema types and bridge (`isStandardSchema`, `standardSchemaToValidator`, `wrapStandardSchema`, `InferSchema`), plus Zod/Valibot/ArkType adapters. No Pyreon deps. `isStandardSchema` accepts callable schemas (ArkType schemas are functions carrying `~standard`). Discriminate a Standard Schema result on `issues`, never on `'value' in r` — valibot's failure result carries both. `@pyreon/form`'s `resolveSchemaValidator` checks `isStandardSchema` BEFORE its `typeof === 'function'` → `SchemaValidateFn` fallback, so a raw ArkType schema in `useForm({ schema })` is treated as a schema. |
| `@pyreon/http` | HTTP client under `@pyreon/query`: onion middleware, immutable clients (`extend()`), typed errors (`AbortError` distinct), timeout on by default. `.json<T>()` cast · `.json(parseFn)` · `.json(schema)` via `@pyreon/http/schema`. `endpoint('GET /users/:id')` derives call, cache key and response type from one declaration. Subpaths `/middleware`, `/schema`, `/query`, `/mock`, `/server` (the only `node:async_hooks` import). |
| `@pyreon/i18n` | `createI18n({ locale, messages, loader?, fallbackLocale?, … })`; `t(key, values?)` with `{{name}}` interpolation, format specifiers (`{{amount, currency}}`), plurals (`_one`/`_other`/`_zero`), `context`, `defaultValue`, `$t(key)` nesting (depth 4). Formatters `n`/`d`/`rt` read `locale()` reactively. Entries `@pyreon/i18n` (with `Trans`, `I18nProvider value={i18n}`, `useI18n`; `<Trans i18nKey>` reads `t` from context) and the framework-agnostic `@pyreon/i18n/core`. Opt-in typed keys via `createI18n<typeof en>()` (`MessageKeys<M>`, `TranslationParams`). |
| `@pyreon/feature` | Schema-driven CRUD (queries, forms, tables, stores). Validation accepts Zod or any Standard Schema; field introspection (`extractFields`: auto form fields, columns, create defaults) is Zod-only — other schemas need explicit `initialValues` (dev-warned once). |
| `@pyreon/virtual` | TanStack Virtual adapter. |
| `@pyreon/charts` | ECharts bridge (`<Chart>`/`useChart`, lazy) and the own-engine `/plot` subpath (theme tokens via `ChartThemeProvider`, `chartThemes`, `palettes`; `<PlotChart maxPoints>` LTTB thinning). Benches: `bench`, `bench:engine`. |
| `@pyreon/hooks` | 65 signal-based hooks. |
| `@pyreon/hotkeys` | Keyboard shortcuts: key-bucketed dispatch, refcounted scopes, `mod` alias, sequences (`g t`), comma lists, keyup bindings, `once`/`ignoreRepeat`, element targets, `trigger()`, conflict detection, SSR-safe. |
| `@pyreon/document` | Document rendering: 18 primitives, 20 output formats. |
| `@pyreon/url-state` | `useUrlState` with schema mode and type coercion; SSR-safe. |
| `@pyreon/dnd` | Wraps `@atlaskit/pragmatic-drag-and-drop`; every teardown goes through `onCleanup`, and `useSortable` disposes item and container registrations on ref `null`. |
| `@pyreon/a11y` | `announce()`, `<VisuallyHidden>`, `<LiveRegion>`, `<SkipLink>`, `createA11yId`. |
