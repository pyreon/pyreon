# Pyreon — Signal-Based UI Framework

## Overview

Full-stack UI framework with fine-grained reactivity (signals). SSR, SSG, islands, SPA.
All packages under `@pyreon/*` scope.

**Active improvement plan**: `.claude/plans/ecosystem-improvements-2026-q2.md` — addresses six recurring failure modes surfaced by PRs #197/#200. Tier 0 (critical bugs), Tier 1 (test parity), Tier 2 (doc pipeline), Tier 2.5 (MCP overhaul), Tier 3 (architecture), Tier 4 (strategic). Read the plan before starting any new catalog work — your task may already be addressed there or may conflict with the planned approach.

## Benchmark Results (Chromium via Playwright)

Pyreon (compiled) is fastest framework on all benchmarks:

- Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
- Replace 1,000 rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
- Partial update: 5ms (1.00x) vs Solid 5ms, Vue 7ms, React 6ms
- Select row: 5ms (1.00x) vs Solid 5ms, Vue 5ms, React 8ms
- Create 10,000 rows: 103ms (1.00x) vs Solid 104ms, Vue 131ms, React 540ms

Key optimizations: `_tpl()` (cloneNode), `_bind()` (static-dep tracking), `TextNode.data`

## Package Overview

| Package                  | Description                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/reactivity`     | signal, computed, effect, onCleanup, batch, createSelector, createStore, untrack                                                              |
| `@pyreon/core`           | VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId |
| `@pyreon/runtime-dom`    | DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive, SVG/MathML namespace, custom elements                                |
| `@pyreon/compiler`       | JSX transform with smart `shouldWrap`, static hoisting, per-text-node `_bind`, pure call detection, spread templates                           |
| `@pyreon/runtime-server` | renderToString, renderToStream, Suspense 30s timeout, XSS-safe templates, For key markers                                                     |
| `@pyreon/router`         | hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive, View Transitions, middleware, typed search params                  |
| `@pyreon/head`           | useHead, HeadProvider, renderWithHead                                                                                                         |
| `@pyreon/server`         | createHandler (SSR), prerender (SSG), island(), middleware                                                                                    |
| `@pyreon/vite-plugin`    | JSX transform + SSR dev middleware + signal-preserving HMR                                                                                    |
| `@pyreon/react-compat`   | useState, useEffect, useMemo, lazy, Suspense shims                                                                                            |
| `@pyreon/storybook`      | Storybook renderer — mount, render, and interact with Pyreon components                                                                       |
| `@pyreon/typescript`     | TypeScript config presets: base, app (noEmit), lib (declarations)                                                                             |
| `@pyreon/lint`           | Pyreon-specific linter — 59 rules, 12 categories, config files, watch mode, AST cache, LSP server                                             |
| `@pyreon/test-utils`     | Testing utilities — initTestConfig, withThemeContext, getComputedTheme, renderProps, resolveRocketstyle, mountReactive, mountAndExpectOnce     |
| `@pyreon/manifest`       | Private: type + `defineManifest` helper for per-package manifests that feed the doc + MCP generators (T2.1)                                    |

### UI System (Component Library)

| Package                       | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `@pyreon/ui-core`             | Config engine, init(), utilities, HTML tags                          |
| `@pyreon/styler`              | CSS-in-JS: styled(), css, keyframes, theming                         |
| `@pyreon/unistyle`            | Responsive breakpoints, CSS property mappings, unit utilities        |
| `@pyreon/elements`            | 5 foundational primitives (Element, Text, List, Overlay, Portal)     |
| `@pyreon/attrs`               | Chainable HOC factory (.attrs(), .config(), .statics())              |
| `@pyreon/rocketstyle`         | Multi-state styling (states, sizes, variants, themes, dark mode)     |
| `@pyreon/coolgrid`            | 12-column responsive grid (Container, Row, Col)                      |
| `@pyreon/kinetic`             | CSS-transition animations (Transition, Stagger, Collapse)            |
| `@pyreon/kinetic-presets`     | 120+ animation presets                                               |
| `@pyreon/connector-document`  | Bridge between ui-system components and @pyreon/document             |
| `@pyreon/document-primitives` | Rocketstyle-based document components — render in browser AND export |

### UI Component Library (packages/ui/)

| Package                 | Description                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/ui-theme`      | Default theme (colors, spacing, typography, borders, shadows, transitions) + rocketstyle ThemeDefault/StylesDefault augmentation |
| `@pyreon/ui-components` | 75 rocketstyle components across 10 categories (Button, Card, Input, etc.)                                                       |
| `@pyreon/ui-primitives` | Headless behavior primitives (ComboboxBase, CalendarBase, etc.)                                                                  |

#### @pyreon/ui-components — Architecture

- Three base components: `el` (Element — structured layout), `txt` (Text — inline typography), `list` (List — flowing children)
- Factory at `packages/ui/components/src/factory.ts` re-exports `el`, `txt`, `list`, `rs` from `bases/`
- **Layout in `.attrs()`**: `tag`, `direction`, `alignX`, `alignY`, `gap`, `block` — these target Element's inner layout
- **CSS in `.theme()`**: colors, spacing, borders, shadows — these target the styled outer wrapper
- **Pseudo-states in `.theme()`**: `hover: {}`, `focus: {}`, `active: {}`, `disabled: {}` objects — bases generate `:hover`/`:focus-visible`/`:active`/`:disabled` CSS
- **`:hover` is unconditional** — applied to ALL components with hover theme, not just interactive ones. Only `cursor: pointer` is gated on `onClick`/`href`
- **CSS property naming**: unistyle convention (`borderWidthTop`) not CSS-spec (`borderTopWidth`)
- **useBooleans: false** is the rocketstyle default (both type-level and runtime) — dimension props accept string values (`state="primary"`, `size="level3"`), not booleans. Opt in with `rocketstyle({ useBooleans: true })` for vitus-labs-style boolean shorthand. Before April 2026 the type default was `true` while the runtime default was `false` — boolean props typechecked but were silently dropped at runtime. Fixed by aligning the type default (rocketstyle `init.ts`)
- Theme augmentation: `@pyreon/ui-theme` augments `ThemeDefault extends Theme` and `StylesDefault extends ITheme` — apps must NOT re-augment

### UI System — Key Technical Details

#### @pyreon/styler (CSS-in-JS)

- `styled('div')\`color: red\``→ returns`ComponentFn`
- `css\`...\``→ lazy`CSSResult`, resolved on use
- `keyframes\`...\`` → returns animation name string
- Theme: `ThemeContext` is a **reactive** context (`createReactiveContext<Theme>`); `useTheme()` returns a `Theme` snapshot at call time, `useThemeAccessor()` returns the raw `() => Theme` accessor for tracking inside effects. Whole-theme swaps (user-preference themes) propagate through the resolver effect in `styled()` DynamicStyled and re-resolve CSS + swap class names without remounting the VNode. `PyreonUI` wraps `enrichTheme(props.theme)` in `computed` so the enriched theme updates when `props.theme` changes
- `createGlobalStyle\`...\`` → inject global CSS
- Singleton `StyleSheet` with FNV-1a hashing, dedup cache, SSR support
- `createSheet()` for isolated sheet instances

#### @pyreon/unistyle (Responsive Props)

- Single value, mobile-first array `[xs, sm, md, lg]`, or breakpoint object `{ xs: ..., md: ... }`
- 170+ CSS property mappings for responsive shorthand
- Unit utilities for consistent spacing/sizing

#### @pyreon/attrs (HOC Factory)

- `attrs(component)` → chainable builder
- `.attrs({ prop: value })` → inject default props
- `.config({ dimensions: {...} })` → rocketstyle config
- `.statics({ method: fn })` → attach static methods
- `.compose(enhancer)` → apply HOC wrapper

#### @pyreon/rocketstyle (Multi-State Styling)

- `rocketstyle(component)` → multi-dimensional styling engine
- Dimensions: `state`, `size`, `variant`, `theme`, + custom
- Dark/light mode via `useDarkMode` dimension
- Each dimension maps prop values to CSS via `styled()` templates

#### @pyreon/kinetic (Animations)

- `kinetic(component)` → animation-enabled wrapper
- `.preset(fadeIn)` → apply preset from `@pyreon/kinetic-presets`
- `.enter({ opacity: 0 })` / `.enterTo({ opacity: 1 })` — enter animation
- `.leave({ opacity: 1 })` / `.leaveTo({ opacity: 0 })` — leave animation
- `.collapse()` — height-based collapse/expand
- `.stagger({ delay: 50 })` — staggered children
- `.group()` — TransitionGroup wrapper
- 4 modes: transition, collapse, stagger, group

#### @pyreon/kinetic-presets (120+ Presets)

- Framework-agnostic CSS transition objects
- `fade`, `slideUp`, `slideDown`, `slideLeft`, `slideRight`, `scaleIn`, + 100 more
- `compose(preset1, preset2)` — merge presets
- `withDuration(preset, ms)` — override duration
- Factory functions for custom parameterized presets

#### @pyreon/elements (Base Primitives)

- `Element` — base block with responsive style props
- `Text` — inline text with typography props
- `List` — list container (ul/ol/dl)
- `Overlay` — positioned overlay with backdrop
- `Portal` — renders children outside DOM hierarchy

#### @pyreon/ui-core — PyreonUI (Unified Provider)

- `PyreonUI` — single provider replacing 3 separate providers (theme, mode, config)
- Props: `theme` (theme object), `mode` (`"light"` | `"dark"` | `"system"`), `inversed` (boolean, flips mode)
- `mode="system"` — auto-detects OS dark mode via `prefers-color-scheme` media query
- `useMode()` — hook returning current resolved mode as a signal (`"light"` or `"dark"`)
- `enrichTheme(theme)` — utility from `@pyreon/unistyle` that merges user theme with default breakpoints/spacing
- `init()` is preserved for custom environments — `PyreonUI` calls it internally but apps can still call `init()` directly

### Fundamentals (Ecosystem Libraries)

| Package               | Description                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/store`       | Global state management — composition stores returning `StoreApi<T>`                                                                                  |
| `@pyreon/state-tree`  | Structured reactive state tree — models, snapshots, patches, middleware                                                                               |
| `@pyreon/form`        | Signal-based form management — fields, validation, submission, arrays, context                                                                        |
| `@pyreon/validation`  | Schema adapters for forms (Zod, Valibot, ArkType)                                                                                                     |
| `@pyreon/query`       | Pyreon adapter for TanStack Query                                                                                                                     |
| `@pyreon/table`       | Pyreon adapter for TanStack Table                                                                                                                     |
| `@pyreon/virtual`     | Pyreon adapter for TanStack Virtual                                                                                                                   |
| `@pyreon/i18n`        | Reactive i18n with async namespace loading, plurals, interpolation                                                                                    |
| `@pyreon/feature`     | Schema-driven CRUD primitives — auto-generated queries, forms, tables, stores                                                                         |
| `@pyreon/charts`      | Reactive ECharts bridge with lazy loading, auto-detection, typed options                                                                              |
| `@pyreon/storage`     | Reactive client-side storage — localStorage, sessionStorage, cookies, IndexedDB                                                                       |
| `@pyreon/hooks`       | 33+ signal-based hooks (useHover, useFocus, useBreakpoint, useClipboard, useDialog, useTimeAgo, useOnline, useEventListener, useInfiniteScroll, etc.) |
| `@pyreon/hotkeys`     | Keyboard shortcut management — scope-aware, modifier keys, conflict detection                                                                         |
| `@pyreon/permissions` | Reactive permissions — RBAC, ABAC, feature flags, subscription tiers                                                                                  |
| `@pyreon/machine`     | Reactive state machines — constrained signals with type-safe transitions                                                                              |
| `@pyreon/flow`        | Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs                                                                  |
| `@pyreon/code`        | Reactive code editor — CodeMirror 6 with signals, minimap, diff editor                                                                                |
| `@pyreon/document`    | Universal document rendering — 18 primitives, 14+ output formats                                                                                      |
| `@pyreon/rx`          | Signal-aware reactive transforms — filter, map, sortBy, groupBy, pipe, debounce, throttle, 24 functions                                               |
| `@pyreon/toast`       | Toast notifications — toast(), toast.success/error/warning/info/loading, Toaster component, a11y                                                      |
| `@pyreon/url-state`   | URL-synced state — useUrlState(key, default) or schema mode, auto type coercion, SSR-safe                                                             |

### Zero (Full-Stack Meta-Framework)

| Package        | Description                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/zero` | Full-stack meta-framework: file-system routing, SSR/SSG/ISR/SPA, API routes, server actions, theme, fonts, image optimization, SEO, adapters      |

#### @pyreon/zero — Key Features

- Client-safe main entry: `@pyreon/zero` exports only client-safe code (components, theme, middleware). Server-only code at `@pyreon/zero/server`
- Server import stubs: importing server-only APIs from the main entry gives clear error messages instead of silent failures
- Deployment adapters: Vercel (`vercelAdapter()`), Cloudflare Pages (`cloudflareAdapter()`), Netlify Functions (`netlifyAdapter()`) — in addition to Node, Bun, static
- CSP middleware: `cspMiddleware({ directives })` with `useNonce()` for inline scripts
- Env validation: `validateEnv({ PORT: 3000, DEBUG: false, API_KEY: String })` with `schema()` for custom parsers, `publicEnv()` for client-safe subset
- Request logging: `loggerMiddleware()` with configurable format and levels
- AI integration: `aiPlugin()` — generates llms.txt, JSON-LD inference metadata, AI plugin manifest
- `useRequestLocals()` — bridge middleware locals into component tree
- Locale-aware favicons: `faviconPlugin({ locales: { de: { source: "./icon-de.svg" } } })` — per-locale favicon generation
- OG image generation: `ogImagePlugin({ templates, locales })` — build-time OG image rendering
- Reactive favicon switching: dual light/dark PNG/ICO with theme-synced `media` attribute swap
- Meta completion: og:image:width/height, og:video, og:audio, noIndex, ogTemplate, favicon prop on Meta component

## Fundamentals — Key Technical Details

### @pyreon/store

- `defineStore(id, setup)` — composition stores, singleton by ID, returns `StoreApi<T>`
- `StoreApi<T>`: `.store` (user state/actions), `.id`, `.state` (snapshot), `patch()`, `subscribe()`, `onAction()`, `reset()`, `dispose()`
- Auto-classifies setup returns: signals → state tracking, functions → wrapped actions
- `addStorePlugin(plugin)`, `setStoreRegistryProvider()` for SSR, `resetStore(id)` / `resetAllStores()`

### @pyreon/state-tree

- `model({ state, views, actions })` — structured reactive models with nested composition
- `ModelDefinition.create(initial?)` / `.asHook(id)` — instances or singleton hooks
- `getSnapshot(instance)` / `applySnapshot(instance, snapshot)` — typed recursive serialization
- `onPatch(instance, listener)` / `applyPatch(instance, patch|patches)` — JSON patch record/replay
- `addMiddleware(instance, fn)` — action interception chain

### @pyreon/form

- `useForm({ initialValues, onSubmit, validators?, schema?, validateOn?, debounceMs? })` — reactive form state
- `useField(form, name)` — single-field hook with `hasError`, `showError`, `register()`
- `useFieldArray(initial?)` — dynamic array fields with stable keys. Full mutation surface: `append` / `prepend` / `insert` / `remove` / `update` / `move` / `swap` / `replace`. Always render with `<For each={items()} by={i => i.key}>` — `.key` is a monotonic number assigned at insert time, not the array index
- `useWatch(form, name?)` — typed overloads: single field → `Signal<T>`, multiple fields → tuple of signals, no args → `Computed<TValues>`
- `useFormState(form, selector?)` — computed form-level summary (`isValid`, `isDirty`, `isSubmitting`, `isValidating`, `submitCount`, `errors`). Selector narrows the tracked subset so a button gated on `canSubmit` doesn't re-render when `submitCount` changes
- `FormProvider` / `useFormContext<TValues>()` — context pattern for nested components, no prop drilling
- Per-field fine-grained signals: `value`, `error`, `touched`, `dirty` are independent `Signal<T>` — reading one doesn't subscribe to others
- `validateOn: 'blur' | 'change' | 'submit'` — **default is `'blur'`**, not `'change'`, so users aren't scolded mid-keystroke. `showError` (from `useField`) always gates on `touched` so even `validateOn: 'change'` forms don't flash errors until first blur
- Async validators are version-tracked — stale results discarded if user types faster than the validator resolves. Combine with `debounceMs` to cut in-flight request count. `isValidating` signal true while any field has a pending async validation
- Server errors: `form.setFieldError(name, msg)` / `form.setErrors({ email: 'Taken' })` — does NOT touch `touched` state, so errors display immediately regardless of blur status
- Manifest-driven docs (T2.1): `packages/fundamentals/form/src/manifest.ts` is the single source for the `llms.txt` bullet + `llms-full.txt` section. Inline-snapshot test (`manifest-snapshot.test.ts`) locks the rendered output locally in addition to the CI `Docs Sync` gate.

### @pyreon/i18n

- `createI18n({ locale, messages, loader?, fallbackLocale?, pluralRules?, onMissingKey? })`
- `t(key, values?)` — interpolation with `{{name}}`, pluralization with `_one`/`_other` suffixes
- Namespace lazy loading with deduplication, `addMessages()` for runtime additions
- `I18nProvider` / `useI18n()` context, `<Trans>` component for rich JSX interpolation
- **Two entry points**: `@pyreon/i18n` (full — includes JSX `Trans`/`I18nProvider`/`useI18n`) and `@pyreon/i18n/core` (framework-agnostic — only `createI18n`, `interpolate`, `resolvePluralCategory`, types). Use `/core` for backend translation pipelines, edge workers, or any non-JSX consumer. The `/core` entry transitively only depends on `@pyreon/reactivity` — zero JSX, zero `@pyreon/core`. The main entry has a `/** @jsxImportSource @pyreon/core */` pragma on `trans.tsx` so even bun runtimes without JSX-aware tsconfigs compile it correctly.

### @pyreon/query

- Full TanStack Query adapter: `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueries`
- Suspense: `useSuspenseQuery`, `useSuspenseInfiniteQuery`, `QuerySuspense` boundary
- Error recovery: `QueryErrorResetBoundary` (component) + `useQueryErrorResetBoundary()` (hook returning `{ reset }`) — pair with a sibling `ErrorBoundary` so fallback retry clears errored queries
- `useSubscription(options)` — reactive WebSocket with auto-reconnect, integrates with QueryClient for cache invalidation
- `useSSE(options)` — Server-Sent Events hook with QueryClient integration, same pattern as useSubscription but read-only. Honours the SSE `id` field via `lastEventId()` for resumable reconnects
- Global counters: `useIsFetching(filters?)` / `useIsMutating(filters?)` → `Signal<number>` for top-of-page spinners
- `useQueryClient()` — imperative access to the nearest `QueryClient` (throws if no provider mounted)
- TanStack core re-exports: `QueryClient`, `QueryCache`, `MutationCache`, `dehydrate`, `hydrate`, `keepPreviousData`, `hashKey`, `isCancelledError`, `CancelledError`, `defaultShouldDehydrateQuery`, `defaultShouldDehydrateMutation` (+ all types: `QueryKey`, `QueryFilters`, `DehydratedState`, etc.) — consumers import everything from `@pyreon/query`
- Fine-grained signals per field (data, error, isFetching independent) — each field-level read only subscribes to that field
- **Options as a function**: `useQuery` / `useInfiniteQuery` / `useQueries` / `useSuspenseQuery` take options as a FUNCTION (not an object) so `queryKey` and other fields can read Pyreon signals — changing a tracked signal re-runs the observer options and refetches automatically. `useMutation` options are a plain object (mutations are imperative, no tracking needed).
- Manifest-driven docs (T2.1 + T2.5.1): `packages/fundamentals/query/src/manifest.ts` is the single source for the `llms.txt` bullet + `llms-full.txt` section + MCP `api-reference.ts` region. 16 MCP entries generated from the manifest's enriched `api[]` (was 2 hand-written). Inline-snapshot test (`manifest-snapshot.test.ts`) locks the rendered output locally in addition to the CI `Docs Sync` gate.

### @pyreon/table

- `useTable(options)` — reactive TanStack Table with signal-driven options, auto state sync
- `flexRender(component, props)` — renders column def templates (strings, functions, VNodes)

### @pyreon/virtual

- `useVirtualizer(options)` — element-scoped with reactive `virtualItems`, `totalSize`, `isScrolling`
- `useWindowVirtualizer(options)` — window-scoped variant with SSR-safe checks

### @pyreon/validation

- `zodSchema()` / `zodField()` — duck-typed Zod adapter (works with v3 and v4)
- `valibotSchema(schema, safeParseFn)` / `valibotField()` — Valibot standalone-function style
- `arktypeSchema()` / `arktypeField()` — ArkType sync adapter

### @pyreon/feature

- `defineFeature({ name, schema, api })` — schema-driven CRUD primitives
- Auto-generates: `useList`, `useById`, `useSearch`, `useCreate`, `useUpdate`, `useDelete`, `useForm`, `useTable`, `useStore`
- Composes `@pyreon/query`, `@pyreon/form`, `@pyreon/validation`, `@pyreon/store`, `@pyreon/table`

### @pyreon/charts

- `useChart<TOption>(optionsFn, config?)` — reactive ECharts bridge with lazy loading
- `<Chart />` component with event binding, auto-detects chart types and dynamically imports
- `@pyreon/charts/manual` entry for tree-shaking control
- **Browser tests need a tslib alias**: ECharts imports `tslib` for TypeScript helpers (`__extends`, `__assign`, etc.). tslib's `./modules/index.js` ESM entry is broken — it does `import tslib from '../tslib.js'` then destructures named helpers from `default`, which fails when esbuild wraps the CJS file via `__toESM(require_tslib())`. The fix is `resolve.alias: { tslib: '<path-to>/tslib.es6.js' }` — that file is a flat ESM module with proper named exports. The shared `tslibBrowserAlias(import.meta.url)` helper from `vitest.browser.ts` resolves the right path across install layouts (bun nested, npm/pnpm/yarn hoisted) and falls back to a no-op `{}` when tslib isn't reachable. Helper unit tests live in `packages/internals/test-utils/src/tests/vitest-browser-helpers.test.ts` (8 tests + a regression guard that asserts `charts/vitest.browser.config.ts` actually uses the helper, so a future PR can't silently delete the alias). See `packages/fundamentals/charts/vitest.browser.config.ts`. Tracking upstream: [microsoft/tslib#189](https://github.com/microsoft/tslib/issues/189).

### @pyreon/storage

- `useStorage(key, default, options?)` — reactive signal backed by localStorage, cross-tab synced
- `useSessionStorage`, `useCookie`, `useIndexedDB`, `useMemoryStorage` — backend variants
- `createStorage(backend)` — factory for custom backends (encrypted, remote, etc.)
- All return `StorageSignal<T>` — extends `Signal<T>` with `.remove()`

### @pyreon/hotkeys

- `useHotkey(shortcut, handler, options?)` — component-scoped, auto-unregisters on unmount
- `useHotkeyScope(scope)` — activate a scope for a component's lifetime
- Supports `mod` (⌘ on Mac, Ctrl elsewhere), scope-based activation

### @pyreon/permissions

- `createPermissions(initial?)` — reactive permissions instance, callable as `can(key, context?)`
- `can.not(key)` / `can.all(...keys)` / `can.any(...keys)` — inverse and multi-checks
- `can.set(map)` / `can.patch(map)` — replace or merge permissions reactively
- Wildcard matching: `'posts.*'` matches any `posts.X`
- `PermissionsProvider` / `usePermissions()` — context pattern for SSR/testing

### @pyreon/machine

- `createMachine({ initial, states })` — constrained signal with type-safe transitions
- `machine()` — read state, `machine.send(event)` — trigger transition
- `machine.matches(...states)`, `machine.can(event)`, `machine.nextEvents()`
- Guards: `{ target: 'state', guard: (payload?) => boolean }` for conditional transitions

### @pyreon/flow

- `createFlow<TData>({ nodes, edges, ...config })` — generic over node `data` shape. `createFlow<MyData>(...)` returns `FlowInstance<MyData>` so `node.data.kind` narrows correctly without an `[key: string]: unknown` index signature on consumer types. Defaults to `Record<string, unknown>` if no generic supplied.
- `useFlow<TData>(config)` — component-scoped wrapper around `createFlow` that auto-disposes the instance on unmount. Use inside a component body; use `createFlow` directly only for app-store / singleton flows that outlive the component tree.
- Node/edge CRUD, selection, viewport (zoom/pan/fitView), auto-layout via elkjs (lazy-loaded)
- Components: `<Flow nodeTypes={{ custom: MyNode }}>`, `<Background>`, `<MiniMap>`, `<Controls>`, `<Handle>`, `<Panel>`. JSX components are NOT generic at the call site (`<Flow<MyData> />` is invalid JSX); `FlowProps.instance` is typed as `FlowInstance<any>` so typed consumers can pass `FlowInstance<MyData>` without casting.
- Edge paths: `getBezierPath()`, `getSmoothStepPath()`, `getStraightPath()`, `getStepPath()`
- Custom node renderers receive `NodeComponentProps<TData>`: `{ id, data: () => TData, selected: () => boolean, dragging: () => boolean }`. **All non-id props are reactive accessors** — read inside reactive scopes (JSX expression thunks, `effect()`, `computed()`) so the node patches in place when any underlying state changes. Each node mounts EXACTLY ONCE across the lifetime of the graph regardless of how many drags, selection clicks, or `updateNode` data mutations happen. Internally `<Flow>` uses `<For>` keyed by `node.id` plus per-node reactive accessors that read live state from `instance.nodes()` — so a 60fps drag in a 1000-node graph is O(1) instead of O(N) per frame.
- Custom edge renderers receive `EdgeComponentProps`: `{ edge, sourceX: () => number, sourceY: () => number, targetX: () => number, targetY: () => number, selected: () => boolean }`. Same accessor-based contract — each custom edge mounts once and recomputes path coordinates reactively when source/target nodes move. The default edge renderer (when no custom edge type is registered) uses inline reactive thunks for `d`, `stroke`, `stroke-width`, and `class`.
- `flow.toJSON()` / `flow.fromJSON()` for serialization round-trips, `flow.layout('layered', { direction, nodeSpacing, layerSpacing })` for elkjs auto-layout
- **`LayoutOptions` algorithm applicability** (verified empirically by running each algorithm twice with different option values): `direction` applies to `layered` and `tree`; `layerSpacing` and `edgeRouting` apply to `layered` only; `nodeSpacing` is the only field respected by every algorithm. The other algorithms (`force`, `stress`, `radial`, `box`, `rectpacking`) accept the option in `LayoutOptions` (so it typechecks) but silently ignore it at layout time. Use `layered` or `tree` if you need a directional layout.
- **Dev-mode safety net**: `flow.layout()` (and the underlying `computeLayout`) emits a `console.warn` in dev mode when an option is set on an algorithm that ignores it (e.g. `direction: 'RIGHT'` on a force layout). The dev gate uses `import.meta.env.DEV` (Vite/Rolldown standard, literal-replaced at build time, tree-shakes to zero bytes in prod). **Do NOT use `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` for new dev-mode warnings** — that pattern is dead code in real Vite browser bundles because Vite does not polyfill `process`. The codebase has several files that use the old pattern and need a separate cleanup PR — `flow/src/layout.ts` is the reference implementation.

  **Pattern × bundler tree-shake matrix.** Each combination has a regression test backing it; "tree-shaken" means the warning string is absent from the prod bundle, "runtime-gated" means the string is retained as data but the warn never fires:

  | Source pattern | Vite prod | Raw esbuild prod | Test |
  | --- | --- | --- | --- |
  | `if (!import.meta.env?.DEV) return` (inline early-return) | tree-shaken | tree-shaken | `flow/src/tests/integration.test.ts` (esbuild) |
  | `const __DEV__ = import.meta.env?.DEV === true; if (__DEV__) console.warn(...)` (const + simple if) | tree-shaken | mostly tree-shaken | `runtime-dom/src/tests/dev-gate-treeshake.test.ts` (Vite) |
  | `const __DEV__ = ...; __DEV__ && cond && console.warn(...)` (const + chained &&) | tree-shaken | runtime-gated only | `runtime-dom/src/tests/dev-gate-treeshake.test.ts` (Vite + non-Vite runtime smoke) |
  | `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` | dead code in browser, regardless of bundler | dead code in browser | `pyreon/no-process-dev-gate` lint rule |

  Vite is Pyreon's primary supported bundler. Non-Vite consumers (webpack, bunchee, raw esbuild bundles) may see dev-warning strings retained as data when the source uses the chained `&&` form, but runtime behavior is still correct — the `import.meta.env?.DEV === true` gate evaluates to `false` when `.DEV` is undefined, so warnings don't fire. Only a small bundle-size cost.

  **Why test runtime-dom with Vite (not raw esbuild)**: raw `esbuild --minify` cannot propagate a module-scope `const __DEV__` through chained `&&` patterns. Pyreon's runtime-dom uses that const pattern across multiple files. Raw esbuild is the wrong baseline for testing those files — Vite's full pipeline (Rolldown + `import.meta.env` replacement + tree-shake passes) is what consumers actually run. The flow test uses the inline early-return form and so works under raw esbuild; the runtime-dom test uses Vite's `build()` API to match the consumer pipeline.
- No D3 — pan/zoom via pointer events + CSS transforms
- **Peer dep**: `@pyreon/runtime-dom` is required because the JSX templates emit `_tpl()` calls — declare it in consumer apps' deps
- **MCP api-reference is manifest-driven (T2.5.1)**: the flow region in `packages/tools/mcp/src/api-reference.ts` regenerates from the same manifest's `api[]`. Eight entries today (`createFlow`, `useFlow`, `Flow`, `Background`, `Controls`, `MiniMap`, `Handle`, `Panel`) — a strict superset of the previous hand-written surface, covering all child components. First real consumer of the marker-based `<gen-docs:api-reference:start/end @pyreon/<name>>` region protocol — `query` / `form` / `hooks` flip to the same protocol in follow-up PRs as their manifests are enriched to MCP density.

### @pyreon/code

- `createEditor({ value, language, theme, minimap, lineNumbers, foldGutter, onChange, ... })` — reactive editor instance
- `editor.value` is a writable `Signal<string>` — `editor.value()` reads, `editor.value.set(next)` writes back into CodeMirror
- `editor.cursor` / `editor.selection` / `editor.lineCount` are computed signals
- `<CodeEditor instance={editor} />`, `<DiffEditor>`, `<TabbedEditor>` — mount components, auto-cleanup on unmount
- `minimapExtension()` — canvas-based code overview
- `loadLanguage(lang)` — lazy-load 19 language grammars (`json`, `typescript`, `python`, etc.)
- **Two-way binding via `bindEditorToSignal({ editor, signal, serialize, parse, onParseError? })`** — replaces the recurring loop-prevention flag-pair boilerplate from PRs #191 + #192. Accepts a `Signal<T>` or any `SignalLike<T>` and round-trips through user-supplied `serialize`/`parse` functions. Internal flags break the format-on-input race; parse failures call `onParseError` and leave the external state at its last valid value. Returns `{ dispose }` for cleanup. Both directions are loop-safe and the editor itself also has internal CM↔signal loop guards.
- Built on CodeMirror 6 (~250KB vs Monaco's ~2.5MB)
- **Peer dep**: `@pyreon/runtime-dom` is required because `<CodeEditor>` JSX emits `_tpl()` calls

### @pyreon/document

- `render(node, format, options?)` — render document node tree to any format
- `createDocument(props?)` — builder: `.heading()`, `.text()`, `.table()`, `.toPdf()`, `.toEmail()`, etc.
- JSX primitives: `Document`, `Page`, `Heading`, `Text`, `Table`, `Image`, `List`, `Code`, `Divider`, etc.
- 14+ output formats: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat
- Heavy renderers lazy-loaded (PDF ~300KB, DOCX ~100KB, XLSX ~500KB, PPTX ~200KB)

### @pyreon/document-primitives

- 18 rocketstyle components — `DocDocument`, `DocPage`, `DocSection`, `DocRow`, `DocColumn`, `DocHeading`, `DocText`, `DocLink`, `DocImage`, `DocTable`, `DocList`, `DocListItem`, `DocCode`, `DocDivider`, `DocSpacer`, `DocButton`, `DocQuote`, `DocPageBreak`
- **Same component tree renders in browser AND exports to 14+ formats** — primitives carry `_documentType` static markers; `extractDocumentTree(vnode)` from `@pyreon/connector-document` walks the tree and produces a `DocNode` for `@pyreon/document`'s `render()` to consume
- **`extractDocNode(templateFn)`** — one-step alias that replaces `createDocumentExport(templateFn).getDocNode()`. Most consumers should use this. The two-step form is still exported for callers that need to pass the helper object around
- **Reactive metadata via accessor props**: `DocDocument` accepts `title?: string | (() => string)`, `author?: string | (() => string)`, `subject?: string | (() => string)`. Function values are stored in `_documentProps` and resolved by `extractDocumentTree` at extraction time, so each export click reads the LIVE value from any underlying signal — no `const initial = get()` workaround needed
- **Framework fix in `extractDocumentTree`**: when walking a documentType vnode, the extractor now CALLS the component function to get its post-attrs vnode and reads `_documentProps` from there. Before this fix, real rocketstyle primitives' metadata never reached the export pipeline because `_documentProps` only appears AFTER the rocketstyle attrs HOC runs — the JSX vnode's props only contain the user-supplied props (`{ title, author }`). This was a latent bug that the mock-vnode tests in the existing test suite hand-bypassed by hardcoding `_documentProps`. Real consumers (like the resume builder) saw their metadata silently dropped during export. Fixed in PR #197
- `createDocumentExport(templateFn)` — kept for backward compat; internally delegates to `extractDocNode`
- Layout props live in `.attrs()` (not `.theme()`): `direction`, `gap`, `alignX`, `alignY`. Element accepts `direction: 'inline' | 'rows' | 'reverseInline' | 'reverseRows'` — `'row'` is invalid
- For fine-grained reactivity in templates that drive a live preview, pass a signal accessor (not its resolved value) and read it inside the template body via per-text-node thunks: `<DocText>{() => store.field()}</DocText>` — components run once, so reading the signal at the top of the template captures only the initial value
- Rocketstyle `.attrs<P>()` generic is the **public** prop type — runtime-filled fields like `tag` and `_documentProps` belong in the callback body, never in the generic, or they leak as required JSX props
- **Watch for prop names that collide with read-only HTML element properties.** `HTMLTableElement.rows` and `.columns` are read-only `HTMLCollection` getters — if a prop with that name reaches the DOM forwarding step, the runtime crashes with `Cannot set property rows of [object Object] which has only a getter`. Use rocketstyle's `.attrs(callback, { filter: ['rows', 'columns', ...] })` second argument to strip export-only props before they reach the DOM. `DocTable` uses this pattern. Other risky names: `style` (writable but reserved), `cells`, `tHead`, `tBodies` on table elements; `form` on form-associated inputs.

### @pyreon/storybook

- `renderToCanvas(context, canvasElement)` — core renderer for Storybook
- `Meta<TComponent>` / `StoryObj<TMeta>` — typed story definitions
- Preset: `framework: "@pyreon/storybook"` in `.storybook/main.ts`

### @pyreon/rx

- Signal-aware reactive transforms — every function overloaded: `Signal<T[]> → Computed`, `T[] → plain`
- 24 functions: `filter`, `map`, `sortBy`, `groupBy`, `keyBy`, `uniqBy`, `take`, `skip`, `last`, `chunk`, `flatten`, `find`, `mapValues`, `count`, `sum`, `min`, `max`, `average`, `distinct`, `scan`, `combine`, `debounce`, `throttle`, `search`
- `pipe(source, op1, op2, ...)` — compose transforms left-to-right
- Signal inputs produce `Computed` outputs that auto-track and re-derive when the source signal changes

### @pyreon/toast

- `toast(message)` — imperative toast creation, returns toast ID
- `toast.success(msg)`, `toast.error(msg)`, `toast.warning(msg)`, `toast.info(msg)`, `toast.loading(msg)` — preset variants
- `toast.update(id, options)` — update an existing toast (e.g., loading → success)
- `toast.dismiss(id?)` — dismiss one or all toasts
- `toast.promise(promise, { loading, success, error })` — auto-transitions through states
- `<Toaster />` — render component with Portal, CSS transitions, auto-dismiss, pause on hover
- Accessibility: `role="alert"`, `aria-live="polite"` on toast elements

### @pyreon/url-state

- `useUrlState(key, defaultValue)` — returns `UrlStateSignal` synced to URL search params
- Schema mode: `useUrlState({ page: 1, sort: "name" })` — multiple params from a single call
- Auto type coercion (numbers, booleans, arrays), uses `replaceState` (no history spam)
- Configurable debounce for high-frequency updates, SSR-safe (reads from request URL on server)

### @pyreon/lint

- `lint(options?)` — programmatic API: lint files, returns `LintResult` with counts
- `lintFile(filePath, sourceText, rules, config)` — lint a single file
- `listRules()` — returns metadata for all 59 rules
- `applyFixes(sourceText, diagnostics)` — apply auto-fixes
- `loadConfig(cwd)` — load `.pyreonlintrc.json` / `package.json` `"pyreonlint"` field
- `createIgnoreFilter(cwd)` — load `.pyreonlintignore` + `.gitignore` patterns
- `AstCache` — FNV-1a hash-keyed AST cache for repeat runs
- `watchAndLint(options)` — file watcher with 100ms debounce, re-lints changed files
- CLI: `pyreon-lint [--preset recommended|strict|app|lib] [--fix] [--format text|json|compact] [--quiet] [--list] [--watch] [--config path] [--ignore path] [--rule id=severity] [path...]`
- 59 rules across 12 categories: reactivity (10), jsx (11), lifecycle (4), performance (4), ssr (3), architecture (7), store (3), form (3), styling (4), hooks (3), accessibility (3), router (4)
- New in 2026-Q2: `pyreon/no-process-dev-gate` (architecture, error, auto-fixable) — flags `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'` dev gates that are dead code in real Vite browser bundles. Use `import.meta.env?.DEV === true` instead.
- New in T1.1 Phase 4: `pyreon/require-browser-smoke-test` (architecture, error, in `recommended`/`strict`/`lib`, off in `app`) — every browser-categorized package must ship at least one `*.browser.test.{ts,tsx}` file under `src/`. Locks in the T1.1 smoke harness so new browser packages can't quietly ship without coverage. `additionalPackages` option opts new packages in, `exemptPaths` opts out.
- 4 presets: `recommended`, `strict` (warns→errors), `app` (lib rules off), `lib` (strict + architecture)
- Powered by `oxc-parser` — ESTree/TS-ESTree AST with Visitor
- **Per-rule options** via ESLint-style tuple form in config — `"pyreon/no-window-in-ssr": ["error", { "exemptPaths": ["packages/core/runtime-dom/"] }]`. Rules that support path-based exemption read `options.exemptPaths: string[]`. Each rule declares its option shape in `meta.schema` (`Record<string, 'string' | 'string[]' | 'number' | 'boolean'>`); wrong-typed values disable the rule and surface an error on `LintResult.configDiagnostics`, unknown keys emit a warning. The Pyreon monorepo's `.pyreonlintrc.json` at repo root configures server-only / DOM-runtime / hook-foundation exemptions that were previously hardcoded in rule source. JSON Schema for the config file ships at `@pyreon/lint/schema/pyreonlintrc.schema.json` (reference via `"$schema"` for IDE autocomplete). CLI flag `--rule-options id='{json}'` passes options for a single run.
- **`no-window-in-ssr` precision.** Recognised safe contexts: `onMount`, `onUnmount`, `onCleanup`, `effect`, `renderEffect`, `requestAnimationFrame` (entire call arguments are safe). `watch(source, cb)` is handled precisely: only the 2nd arg (callback) is safe — the 1st (source) is evaluated at setup to track signals, so browser globals there still fire. Recognised typeof guards: `if (typeof X !== 'undefined')` body, ternary consequent, const-captured idiom (`const isBrowser = typeof window !== 'undefined'; if (isBrowser) { … }`), negated-form early returns (`if (typeof X === 'undefined') return` + OR-chained form), logical-and guards where either side is a typeof-derived const (`IS_BROWSER && active() ? <Portal target={document.body} /> : null`), and const bindings from AND-chains / ternaries where any term is a typeof check (`const useVT = _isBrowser && meta && typeof document.startViewTransition === 'function'`, `const handler = _isBrowser ? fn : null`). Identifiers in type position (`let x: Window`, `type T = Document`, etc.), member-expression property names (`x.addEventListener`), object-property keys, import-specifier names, **function-parameter names that happen to match a browser global** (`function push(location) { location.X }` — the parameter shadows `window.location`), and **module-level imports that shadow a browser global** (`import { history } from '@codemirror/commands'` — every later `history` references the import, not `window.history`; same for default and namespace imports) are all skipped. Test files (`__tests__/`, `*.test.*`) and `no-unbatched-updates` are both test-exemptable via `exemptPaths`. **oxc visitor gotcha**: oxc's walker does NOT pass `parent` — `VisitorCallback = (node: any) => void`. Rules needing parent context must use enter/exit depth counters or pre-mark child nodes via WeakSet on the way in. Inert `parent?.type === '…'` checks were the root cause of several silent false-positive clusters.
- **`no-imperative-navigate-in-render` precision.** Fires ONLY when `navigate()` / `router.push()` runs synchronously in the component function body (the actual infinite-render-loop case). Any nested function inside the component body — event handler (`const handleClick = (e) => router.push(…)`), `setTimeout`/`setInterval` callback, `requestAnimationFrame` callback, lifecycle hook, `.then()` callback — is deferred execution and doesn't fire. Previously only recognised `onMount`/`effect`/`onUnmount` by name; now tracks a nested-function depth counter that covers every deferred-execution shape.
- **`no-dom-in-setup` safe contexts.** `document.querySelector`/`getElementById`/etc. are silent inside `onMount`, `onUnmount`, `onCleanup`, `effect`, `renderEffect`, AND `requestAnimationFrame` (the callback always runs inside a browser frame post-setup). Also recognises early-return-on-typeof guards at function head (`if (typeof document === 'undefined') return|throw …`) — same heuristic as `no-window-in-ssr`.
- **Universal `fetch`.** Removed from the `no-window-in-ssr` browser-globals set — `fetch` is universal in Node 18+, Bun, Deno, browsers, and edge runtimes. Code using it isn't browser-specific. (`XMLHttpRequest` and `WebSocket` remain DOM-only.)
- **`no-window-in-ssr` typeof-guard functions.** A function whose body is `return <typeof check>` (or AND-chain of typeof checks) counts as a typeof guard at its call sites — e.g. `function isBrowser() { return typeof window !== 'undefined' }` makes `if (!isBrowser()) return` an early-return guard for the rule. Both function declarations and `const fn = () => …` form are recognised. Conventional names `isBrowser` / `isClient` / `isServer` / `isSSR` are pre-seeded so cross-module imports work without follow-the-import analysis (same name-convention basis as `dev-guard-warnings` recognising `__DEV__`).
- **Early-return guard `throw` form.** Both `no-window-in-ssr` and `no-dom-in-setup` recognise `if (typeof X === 'undefined') throw …` as an early-return guard (in addition to `return`). Common in entry-point functions like `startClient` that hard-fail in SSR rather than silently no-op.
- **`no-bare-signal-in-jsx` skip allowlist.** Skips call-expressions in JSX text whose callee name is one of `use…`/`get…`/`is…`/`has…`/`[A-Z]…` (hook / component conventions) OR a framework VNode-producing helper: `render` (`@pyreon/ui-core`), `h` (`@pyreon/core` hyperscript), `cloneVNode` (`@pyreon/core`). Their JSX call sites always produce a VNode, not a signal value. User-defined signals named identically would slip through — rename to `rendered`/`hyperscript`/etc. if you hit that.
- **`dev-guard-warnings` dev-flag recognition.** Accepts `__DEV__`, `import.meta.env.DEV` / `import.meta.env?.DEV`, `&&`/ternary test expressions, early-return guards (`if (!__DEV__) return` at function head), and locally-bound consts (`const flag = import.meta.env.DEV === true`). Recognised identifier names: `__DEV__`, `IS_DEV`, `IS_DEVELOPMENT`, `isDev` — extensible per project via the `"devFlagNames": ["__DEBUG__"]` rule option (merged with built-ins). The rule can't follow cross-module imports, so the name is the contract — pick one of the four defaults (or the user-configured list) for imported flags.
- **Inline suppression comments.** Two equivalent syntaxes: `// pyreon-lint-ignore <rule-id>` (legacy / short) and `// pyreon-lint-disable-next-line <rule-id>` (long-form, matches several rules' docstrings). Both suppress diagnostics on the IMMEDIATELY following line. Omitting the rule ID suppresses all rules on the next line. The runner accepts both prefixes — earlier docs documented `disable-next-line` while only `ignore` was implemented; that gap is closed.

### @pyreon/router — New Features

- `useIsActive(path, exact?)` — returns reactive boolean for whether a path matches the current route
- Segment-aware prefix matching: `/admin` matches `/admin/users` when `exact` is false
- `useTypedSearchParams({ page: 'number', q: 'string' })` — typed search params with auto-coercion
- `useTransition()` — returns `{ isTransitioning }` signal during route transitions
- Hash scrolling — navigating to `#id` auto-scrolls to the matching element
- Route error boundaries — `errorComponent` on route records catches render errors (not just loader errors)
- View Transitions API — auto-enabled for route navigations, opt out per route via `meta.viewTransition: false`
- Middleware chain — `RouteMiddleware` with `ctx.data` for passing data between middleware, `useMiddlewareData()` to read in components
- `Router<TNames>` generic — typed named navigation (`router.push({ name: 'user', params: { id: '42' } })`)

### @pyreon/hooks

- 35 signal-based hooks across 6 categories. Every hook is SSR-safe (browser API access guarded), self-cleaning (registers `onUnmount` for listeners/observers/timers), and signal-native: returns `Signal<T>` / `Computed<T>` / accessor objects, never plain values
- **State**: `useToggle`, `usePrevious`, `useLatest`, `useControllableState`
- **DOM**: `useEventListener`, `useClickOutside`, `useFocus`, `useHover`, `useFocusTrap`, `useElementSize`, `useWindowResize`, `useScrollLock`, `useIntersection`, `useInfiniteScroll`
- **Responsive**: `useBreakpoint` (theme-driven), `useMediaQuery` (raw escape hatch), `useColorScheme`, `useReducedMotion`, `useThemeValue`, `useSpacing`, `useRootSize`
- **Timing**: `useDebouncedValue`, `useDebouncedCallback`, `useThrottledCallback`, `useInterval`, `useTimeout`, `useTimeAgo`
- **Interaction**: `useClipboard` (auto-resets `copied` after 2s), `useDialog` (native `<dialog>`), `useKeyboard`, `useOnline`
- **Composition**: `useMergedRef`, `useUpdateEffect` (skips first run), `useIsomorphicLayoutEffect` (layout effect on client, no-op on SSR)
- **`useControllableState({ value, defaultValue, onChange })`** is the canonical controlled/uncontrolled pattern — every `@pyreon/ui-primitives` component uses it. Pass `value` and `defaultValue` as FUNCTIONS so signal reads track reactively. Reimplementing the `isControlled + signal + getter` shape by hand was the #1 anti-pattern across primitives before the helper landed
- **Never reach for `addEventListener` / `removeEventListener` directly in primitives** — use `useEventListener`. Same for observers (`useIntersection` / `useElementSize`) and timers (`useInterval` / `useTimeout`). The cleanup is the hook's job
- **`useBreakpoint` reads the theme**, `useMediaQuery` is raw — use the former for layout decisions tied to the design system, the latter for one-off queries (`(prefers-contrast: more)`, `(orientation: landscape)`, etc.)
- Manifest-driven docs (T2.1): `packages/fundamentals/hooks/src/manifest.ts` is the single source for the `llms.txt` bullet + `llms-full.txt` section. Inline-snapshot test (`manifest-snapshot.test.ts`) locks the rendered output locally in addition to the CI `Docs Sync` gate.

### Devtools

Stateful packages expose `./devtools` subpath exports with WeakRef-based registries for introspection. Tree-shakeable — zero cost unless imported. Available for: store, state-tree, form, i18n.

## Key Architectural Patterns

### Workspace resolution (no build needed for dev)

Each package.json has `"bun": "./src/index.ts"` in exports.
Root tsconfig has `"customConditions": ["bun"]`.

**Bootstrap on fresh worktree/clone**: the `postinstall` script (`scripts/bootstrap.ts`) automatically builds all packages if any `lib/` directory is missing. This is needed because Vite's config bundler hardcodes `conditions: ["node"]` and resolves `import: "./lib/index.js"` — which only exists after a build. The bootstrap runs `bun run --filter='./packages/*/*' build` (~45s) once on fresh install, then is a no-op (~22ms) on subsequent installs. You do NOT need to run `bun run build` manually after cloning or creating a worktree — `bun install` handles it.

### Signal implementation

`signal<T>()` returns callable function with `.set()` and `.update()`.
Subscribers tracked via `Set<() => void>`. Batch uses pointer swap.

### JSX & VNode

- JSX configured via `jsxImportSource: "@pyreon/core"` in root tsconfig (`jsx: "preserve"`)
- JSX automatic runtime: `@pyreon/core/jsx-runtime` (jsx, jsxs, Fragment)
- `h<P extends Props>(type, props, ...children)` — lower-level API, children stored in `vnode.children`
- Components must merge: `props.children = vnode.children.length === 1 ? vnode.children[0] : vnode.children`
- `ComponentFn<P> = (props: P) => VNodeChild`
- `<For each={items} by={r => r.id}>{r => <li>...</li>}</For>` — keyed list rendering
  - Prop is `by` (not `key`) because JSX extracts `key` as a special VNode reconciliation prop
- `class` prop accepts strings, arrays, objects, or nested mix — processed by `cx()` at runtime
- JSX index signature narrowed to `[key: \`data-${string}\`]` and `[key: \`aria-${string}\`]` only (catches typos)
- `TargetedEvent<E>` types `currentTarget` per element — no manual `as HTMLInputElement` casts
- New events: `onBeforeInput`, `onInvalid`, `onResize`, `onToggle`
- `style` prop accepts both string (`style="color: red"`) and object (`style={{ color: "red", fontSize: "14px" }}`)
  - String: inlined as HTML attribute by compiler
  - Object: applied via `Object.assign(el.style, obj)` by compiler
  - Reactive: `style={() => dynamicStyle()}` tracked via `_bind()`

### Props Utilities

- `splitProps(props, keys)` — split props object preserving signal reactivity
- `mergeProps(...sources)` — merge default props with component props, last source wins
- `createUniqueId()` — SSR-safe unique ID generation
- `untrack(fn)` — alias for `runUntracked`, reads signals without subscribing

### JSX Types

- `cx(…values: ClassValue[]): string` and `ClassValue` exported from `@pyreon/core`
- `PyreonHTMLAttributes`, `CSSProperties`, `StyleValue`, `CanvasAttributes` (typed `Ref<HTMLCanvasElement>`) exported from `@pyreon/core`

### Router

Context-based: `RouterContext = createContext<RouterInstance | null>(null)`.
`RouterProvider` pushes to context stack + sets module fallback.
Hash mode uses `history.pushState` (not `window.location.hash`) to avoid double-update.
View Transitions API integration: route changes wrapped in `document.startViewTransition()` when available.

**What `await router.push()` / `.replace()` waits for** — the ViewTransition object exposes three promises, and picking the wrong one is easy to re-break:

| Promise | Resolves when | Router awaits? |
| --- | --- | --- |
| `updateCallbackDone` | Callback (DOM commit) finished; new state is live | ✅ yes |
| `ready` | Snapshot captured, pseudo-elements ready for animation | no — just `.catch()` |
| `finished` | Full animation completed (typically 200-300ms) | no — just `.catch()` |

The router awaits `updateCallbackDone` so callers can inspect the new route immediately after `await router.push()`. It does NOT wait for `.finished` because blocking every programmatic navigation on a 200-300ms animation is unacceptable. `.ready` + `.finished` get empty `.catch()` handlers so their `AbortError: Transition was skipped` rejections (fired when a newer navigation interrupts an in-flight transition) don't leak as unhandled promise rejections.

**Hook ordering changed alongside this fix** — `afterEach` hooks and `scrollManager.restore` now fire AFTER the VT callback completes (previously they fired after `commitNavigation` returned but BEFORE the VT callback ran, which meant hooks briefly saw the OLD route state). This is the correct behavior per the hook's documented semantics ("after-navigation hook") but it is a silent behavior change for any app that relied on hooks running pre-commit.
Middleware chain: `RouteMiddleware[]` runs before guards, `ctx.data` passed through, `useMiddlewareData()` reads in components.
Hash scrolling: after navigation, `#id` fragments auto-scroll to matching DOM element.

### SSR

`renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming.
`mergeChildrenIntoProps(vnode)` called before `runWithHooks` in both paths.
`runWithRequestContext(fn)` isolates context + store per request via ALS.
Suspense streaming has a 30s timeout — if async children do not resolve within 30 seconds, the fallback remains.
XSS escape in Suspense swap templates — all template content is properly escaped.
`For` list SSR emits per-item key markers (`<!--k:key-->`) for precise hydration matching.

### Island Architecture

`island(loader, { name, hydrate })` → async ComponentFn → `<pyreon-island>` element.
Client: `hydrateIslands({ Name: () => import(...) })` — strategies: load, idle, visible, media, never.

### JSX Compiler

`shouldWrap` only wraps if `containsCall(node)` is true.
Static JSX nodes hoisted to module scope as `const _$h0 = ...`.
Template emission: JSX element trees with ≥1 DOM element emit `_tpl()` + `_bind()`.
Supports mixed element+expression children (via `childNodes[]` indexing), multiple expressions, and fragment inlining.
Reactive text uses `document.createTextNode()` + `.data` (not `.textContent`).
Per-text-node independent `_bind()`: each text node gets its own `_bind()` call for fine-grained reactivity (instead of grouping all bindings).
Pure static call detection: 40+ functions treated as pure (Math.*, JSON.*, Object.keys/values/entries, Array.isArray, etc.) — not wrapped in reactive getters.
Spread props on root element: when a root element has `{...props}`, emit `_tpl()` + `_applyProps()` instead of falling back to `h()` calls.
Reactive props inlining: the compiler auto-detects `const` variables derived from `props.*` or `splitProps` results and inlines them at JSX use sites. `const x = props.y ?? 'default'; return <div>{x}</div>` compiles to `_bind(() => { t.data = (props.y ?? 'default') })` — fully reactive. Transitive resolution supported: `const a = props.x; const b = a + 1` inlines `b` as `((props.x) + 1)`. Only `const` is tracked (`let`/`var` are mutable, unsafe to inline). Non-JSX usage (e.g., `console.log(x)`) stays static (uses captured value). **Circular references are safe**: `const a = b + props.x; const b = a + 1` compiles without crashing — `resolveExprTransitive` uses a `visited: Set<string>` to break cycles, leaving the cyclic identifier as-is (falls back to the captured const value at runtime).

### Context providing pattern

Two context types:
- `createContext<T>(default)` — static context, `useContext()` returns `T`, safe to destructure
- `createReactiveContext<T>(default)` — reactive context, `useContext()` returns `() => T`, must call to read

`provide(ctx, value)` — pushes context and auto-cleans up on unmount.
Low-level: `pushContext(new Map([[ctx.id, value]]))` + `onUnmount(() => popContext())`.

For reactive values (mode, locale, etc.), always use `createReactiveContext`:
```tsx
const ModeCtx = createReactiveContext<'light' | 'dark'>('light')
// Provider: provide(ModeCtx, () => modeSignal())
// Consumer: const getMode = useContext(ModeCtx); getMode() // 'light'
```

### onMount signature

`onMount(fn: () => CleanupFn | void)` — callbacks can return nothing or a cleanup function.

### Code Splitting & Dynamic Components

- `lazy(loader)` — wraps dynamic import with Suspense `__loading` integration
- `Dynamic({ component, ...props })` — renders component by reference or string tag
- Re-exported from `@pyreon/react-compat` for compatibility

### Signal-Preserving HMR (Vite plugin)

- Top-level `signal()` calls rewritten to `__hmr_signal(moduleId, name, signal, initialValue)`
- `import.meta.hot.dispose` saves signal values to `globalThis.__pyreon_hmr_registry__`
- On hot reload, signals restore their previous values instead of reinitializing
- Virtual module `virtual:pyreon/hmr-runtime` serves the HMR helpers

### Auto Signal Naming (Vite plugin, dev only)

- `const count = signal(0)` → `const count = signal(0, { name: "count" })`
- Applies to all signal() calls (module-scope and function-scope)
- Module-scope signals get names via `__hmr_signal`; function-scope via injected options
- Skips signals that already have an options argument
- Not applied in production builds (tree-shaken)

### Runtime DOM — SVG/MathML and Custom Elements

- SVG namespace: 67 SVG/MathML tags auto-detected, created via `createElementNS` with correct namespace URI
- **SVG/MathML attribute application**: SVG and MathML elements ALWAYS use `setAttribute()` for prop forwarding, never property assignment. Many SVG properties (`SVGMarkerElement.markerWidth`, `SVGMarkerElement.refX`, `SVGRectElement.x`, etc.) are read-only `SVGAnimatedLength` getters — `el[key] = value` would crash with `Cannot set property X of [object Object] which has only a getter`. Detected by `el.namespaceURI !== 'http://www.w3.org/1999/xhtml'`. Standard React/Vue/Solid behavior.
- Custom elements: props set as properties (not attributes) on elements with a hyphen in the tag name
- Transition 5s timeout: if `transitionend`/`animationend` never fires, the transition completes automatically after 5 seconds
- Duplicate key production guard: duplicate `key` values in lists emit a one-time console warning in production (not just dev)

### Dev-Mode Warnings (`__DEV__`)

- `mount()` validates container is not null/undefined
- Component output validation (must return VNode, string, null, or function)
- Duplicate `by` keys in `<For>` loops logged as warnings
- Passing raw signal (function) as child instead of calling it
- All guarded by `__DEV__` — tree-shaken in production builds

### exactOptionalPropertyTypes

Enabled in root tsconfig — optional properties need explicit `| undefined` when assigned from functions that may return undefined.

### Manifest-driven docs pipeline (T2.1 + T2.5.1)

One source of truth per package — `packages/<category>/<pkg>/src/manifest.ts` — feeds every generated doc surface. `bun run gen-docs` regenerates `llms.txt` (bullets), `llms-full.txt` (per-package sections), and `packages/tools/mcp/src/api-reference.ts` (MCP regions). CI `Docs Sync` job runs `bun run gen-docs --check` against all three.

- **llms.txt / llms-full.txt** are regenerated wholesale for every migrated package.
- **api-reference.ts** uses OPT-IN region markers per package: `// <gen-docs:api-reference:start @pyreon/<name>>` / `... end @pyreon/<name>>`. Marker-less packages stay hand-written. This lets query / form / hooks (migrated for llms but not yet for MCP) flip individually once their `api[]` entries are enriched to MCP density. Flow is the first (and currently only) package on the MCP pipeline (T2.5.1).
- **Field mapping** (manifest `ApiEntry` → MCP `ApiEntry`): `signature` / `example` passthrough; `summary` → `notes` (with `[DEPRECATED]` / `[EXPERIMENTAL]` prefix when `stability` is set, plus `seeAlso: X, Y`, `Added in vX.Y.Z`, `Deprecated since vX.Y.Z` trailers); `mistakes[]` → `mistakes` (joined `- item` bullets). The `McpApiReferenceEntry` type in `@pyreon/manifest` is asserted structurally equal to MCP's real `ApiEntry` via a compile-time `Equal<...>` check in `packages/tools/mcp/src/tests/api-reference.test.ts` — any drift fails `tsc --noEmit` before the generator produces stale output.
- **Migration recipe** for flipping a package to the MCP pipeline: (1) enrich the manifest's `api[]` entries to MCP density — 2-3 sentence `summary` carrying architectural rationale + per-API foot-gun `mistakes[]` catalog (see flow's manifest for the quality bar); (2) wrap the existing hand-written block in `api-reference.ts` with the marker pair; (3) `bun run gen-docs`; (4) add `renderApiReferenceEntries(manifest)` spot-checks to the package's `manifest-snapshot.test.ts`.

## Docs Website

VitePress documentation site at `docs/` — part of the monorepo workspace. 52 doc pages covering all packages.

```bash
cd docs && bun run dev       # local dev server
cd docs && bun run build     # production build
cd docs && bun run preview   # preview production build
```

- VitePress v1, Vue 3 components for custom UI
- Deployed via GitHub Pages
- Workspace member: `"docs"` in root `package.json` workspaces
- Has `lint` script (oxlint), no typecheck (VitePress/Vue)

## Monorepo Structure

52 packages across 5 categories under `packages/`:

- `packages/core/` — 8 packages: reactivity, core, compiler, runtime-dom, runtime-server, router, head, server
- `packages/fundamentals/` — 21 packages: store, state-tree, form, validation, query, table, virtual, i18n, feature, charts, storage, hooks, hotkeys, permissions, machine, flow, code, document, rx, toast, url-state
- `packages/tools/` — 10 packages: cli, lint, mcp, vite-plugin, typescript, storybook, react-compat, preact-compat, vue-compat, solid-compat
- `packages/ui-system/` — 11 packages: ui-core, styler, unistyle, elements, attrs, rocketstyle, coolgrid, kinetic, kinetic-presets, connector-document, document-primitives
- `packages/internals/` — 2 packages: test-utils, manifest (both private, not published)

Plus: `docs/` (VitePress site), `examples/` (example apps).

## Reactive vs Static — The Core Rule

In Pyreon, components run ONCE. What's reactive and what's static depends on WHERE you read a signal:

```tsx
// Component props with signal reads are REACTIVE — compiler wraps with _rp()
<MyComponent title={name()} />  // compiler → title: _rp(() => name()) → getter on props
// Reading props.title in an effect/accessor tracks the signal

// DOM text children are REACTIVE — compiler wraps in accessor
<div>{name()}</div>  // compiler → () => name() — re-evaluates on change

// Reactive accessor (explicit) — always reactive
<div>{() => `Hello ${name()}`}</div>

// Context reads — ReactiveContext returns () => T, regular Context returns T
const getMode = useContext(ModeCtx)  // ReactiveContext → () => ThemeMode
getMode()  // reactive read
```

Rule of thumb:

- **Component props** = reactive when expression contains signal reads (compiler wraps)
- **DOM children with signals** = reactive (compiler wraps)
- **Context reads** = ReactiveContext returns accessor, read it in reactive scope
- **Destructuring props** = captures once (static) — use `props.x` for reactivity
- **`const` from props in JSX** = reactive (compiler inlines `props.x` back at use site) — `const x = props.y; return <div>{x}</div>` is now reactive
- **`let`/`var` from props** = static (mutable variables are not inlined)

## Common Issues & Fixes

- `ComponentFn<{ name: string }>` not assignable → solved by generic h()
- `@pyreon/reactivity` missing from deps → add to package.json + `bun install`
- `noNonNullAssertion` → use `if (!x) return` guard
- SSR empty render → forgot `mergeChildrenIntoProps` in renderComponent
- DOM tests need happy-dom preload (bunfig.toml in each package)
- Vite resolves `dist/` not `src/` → add `resolve.conditions: ["bun"]` to vite.config.ts
- `signal(5)` doesn't write → use `signal.set(5)` (dev mode warns)
- `onClick={undefined}` crashes in production → runtime now bails on non-function handlers
- Context destructuring loses reactivity → keep the object reference, access properties lazily
- Theme mode switching broken → PyreonUI now uses getter properties for reactive mode
- `mergeProps` throwing `Cannot redefine property` → a source's getter descriptor was created without `configurable: true`. `mergeProps` now forces `configurable: true` on copied descriptors, but when authoring your own `Object.defineProperty` on an object that may later be merged, always set `configurable: true` explicitly.
- Symbol-keyed props silently dropped by `splitProps` / `mergeProps` → now preserved. Both utilities use `Reflect.ownKeys` so symbol-keyed brands (e.g. `REACTIVE_PROP`) survive the split and merge.
- `RefProp<T> = Ref<T> | RefCallback<T>` — the old narrow `(el: T) => void` mount-only arm was removed. Callback refs ALWAYS receive `el | null` at runtime; if you need a mount-only handler, accept `T | null` and early-return when null. Pairs with #233's null-on-unmount fix.
- `<For>` SSR key markers (`<!--k:KEY-->`) now URL-encode the key and replace every `-` with `%2D` so user-controlled keys can never form `-->` and break out of the HTML comment.

## Testing

```bash
bun run test                          # all package tests (via workspace filter)
bun run test:browser                  # all real-browser smoke tests (Chromium via @vitest/browser)
cd packages/<name> && bun run test    # single package
cd packages/<name> && bun run test -- --coverage  # with coverage
```

DOM-dependent packages (runtime-dom, router, head, compat layers) use `environment: "happy-dom"` in vitest config.

Real-browser smoke tests run under `@vitest/browser` with Playwright Chromium — files named `*.browser.test.ts(x)`, opt in per-package via `vitest.browser.config.ts` + `test:browser` script. Reference: `packages/internals/test-utils/src/browser/sanity.browser.test.ts`. See `.claude/rules/test-environment-parity.md` for the setup recipe.

### Test environment parity

Tests must run in the same environment as production. happy-dom is a Node-based DOM polyfill, NOT a real browser — it does not catch `typeof process` dead code, real `IntersectionObserver` timing, real CSS rendering, Vite's `import.meta.env` browser behavior, or other environment-divergence bugs. See `.claude/rules/test-environment-parity.md` for the categorization (browser packages, server packages, universal packages) and the rules for each.

The recurring failure mode this prevents: tests pass because vitest provides something (`process`, hand-constructed vnodes, mocked APIs) that production does not. PR #197 (mock-vnode silent metadata drop) and PR #200 (typeof process dead in browser) were both this shape. Both bugs were invisible until a real-world consumer hit them.

**Key rules**:

- **Browser packages** must have at least one Playwright/browser smoke test in addition to vitest tests (planned — see `.claude/plans/ecosystem-improvements-2026-q2.md` T1.1).
- **Mock-vnode tests must have a parallel real-`h()` test** for any contract assertion. The mock test is the fast path; the real-`h()` test is the safety net. Always have both.
- **Dev-mode warnings must use `import.meta.env.DEV`**, not `typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'`. The latter is dead code in real Vite browser bundles. Reference implementation: `flow/src/layout.ts:warnIgnoredOptions`.
- **Bisect-verify regression tests** before merge: revert the fix → run the test → assert it fails with the right error message → restore the fix → assert it passes. PR #200's first regression test passed even with the broken pattern, because esbuild's minifier folds dead code regardless. The bisect verification caught it.

## CI / Lint / Typecheck

```bash
bun run lint                          # lint all packages + examples (via workspace filter)
bun run typecheck                     # typecheck all packages + examples (via workspace filter)
oxlint .                              # lint (400+ rules, Rust-powered)
oxfmt --write .                       # auto-format
oxfmt --check .                       # check formatting
```

Every package and example must have `"lint": "oxlint ."` and `"typecheck": "tsc --noEmit"` in scripts.
Examples use `noEmit: true` in tsconfig (not `rootDir`) since they include vite.config.ts.
