# Pyreon — Signal-Based UI Framework

## Overview
Full-stack UI framework with fine-grained reactivity (signals). SSR, SSG, islands, SPA.
All packages under `@pyreon/*` scope.

## Benchmark Results (Chromium via Playwright)
Pyreon (compiled) is fastest framework on all benchmarks:
- Create 1,000 rows: 9ms (1.00x) vs Solid 10ms, Vue 11ms, React 33ms
- Replace 1,000 rows: 10ms (1.00x) vs Solid 10ms, Vue 11ms, React 31ms
- Partial update: 5ms (1.00x) vs Solid 5ms, Vue 7ms, React 6ms
- Select row: 5ms (1.00x) vs Solid 5ms, Vue 5ms, React 8ms
- Create 10,000 rows: 103ms (1.00x) vs Solid 104ms, Vue 131ms, React 540ms

Key optimizations: `_tpl()` (cloneNode), `_bind()` (static-dep tracking), `TextNode.data`

## Package Overview
| Package | Description |
|---|---|
| `@pyreon/reactivity` | signal, computed, effect, onCleanup, batch, createSelector, createStore, untrack |
| `@pyreon/core` | VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId |
| `@pyreon/runtime-dom` | DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive |
| `@pyreon/compiler` | JSX transform with smart `shouldWrap`, static hoisting |
| `@pyreon/runtime-server` | renderToString, renderToStream |
| `@pyreon/router` | hash+history+SSR, context-based, prefetching, guards, loaders |
| `@pyreon/head` | useHead, HeadProvider, renderWithHead |
| `@pyreon/server` | createHandler (SSR), prerender (SSG), island(), middleware |
| `@pyreon/vite-plugin` | JSX transform + SSR dev middleware + signal-preserving HMR |
| `@pyreon/react-compat` | useState, useEffect, useMemo, lazy, Suspense shims |
| `@pyreon/typescript` | TypeScript config presets: base, app (noEmit), lib (declarations) |

UI component packages (`@pyreon/styler`, `@pyreon/hooks`, `@pyreon/elements`, etc.) live in a separate repo: `pyreon/ui-system`.

### Fundamentals (Ecosystem Libraries)
| Package | Description |
|---|---|
| `@pyreon/store` | Global state management — composition stores returning `StoreApi<T>` |
| `@pyreon/state-tree` | Structured reactive state tree — models, snapshots, patches, middleware |
| `@pyreon/form` | Signal-based form management — fields, validation, submission, arrays, context |
| `@pyreon/validation` | Schema adapters for forms (Zod, Valibot, ArkType) |
| `@pyreon/query` | Pyreon adapter for TanStack Query |
| `@pyreon/table` | Pyreon adapter for TanStack Table |
| `@pyreon/virtual` | Pyreon adapter for TanStack Virtual |
| `@pyreon/i18n` | Reactive i18n with async namespace loading, plurals, interpolation |
| `@pyreon/feature` | Schema-driven CRUD primitives — auto-generated queries, forms, tables, stores |
| `@pyreon/charts` | Reactive ECharts bridge with lazy loading, auto-detection, typed options |
| `@pyreon/storage` | Reactive client-side storage — localStorage, sessionStorage, cookies, IndexedDB |
| `@pyreon/hotkeys` | Keyboard shortcut management — scope-aware, modifier keys, conflict detection |
| `@pyreon/permissions` | Reactive permissions — RBAC, ABAC, feature flags, subscription tiers |
| `@pyreon/machine` | Reactive state machines — constrained signals with type-safe transitions |
| `@pyreon/flow` | Reactive flow diagrams — signal-native nodes, edges, pan/zoom, auto-layout via elkjs |
| `@pyreon/code` | Reactive code editor — CodeMirror 6 with signals, minimap, diff editor |
| `@pyreon/document` | Universal document rendering — 18 primitives, 14+ output formats |
| `@pyreon/storybook` | Storybook renderer for Pyreon components |

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
- `useFieldArray(initial?)` — dynamic array fields with stable keys, append/remove/move/swap
- `useWatch(form, name?)` — reactive field watcher (single, multiple, or all fields)
- `useFormState(form, selector?)` — computed form state summary
- `FormProvider` / `useFormContext()` — context pattern for nested components

### @pyreon/i18n
- `createI18n({ locale, messages, loader?, fallbackLocale?, pluralRules?, onMissingKey? })`
- `t(key, values?)` — interpolation with `{{name}}`, pluralization with `_one`/`_other` suffixes
- Namespace lazy loading with deduplication, `addMessages()` for runtime additions
- `I18nProvider` / `useI18n()` context, `<Trans>` component for rich JSX interpolation

### @pyreon/query
- Full TanStack Query adapter: `useQuery`, `useMutation`, `useInfiniteQuery`, `useQueries`
- Suspense: `useSuspenseQuery`, `useSuspenseInfiniteQuery`, `QuerySuspense` boundary
- `useSubscription(options)` — reactive WebSocket with auto-reconnect, integrates with QueryClient for cache invalidation
- Fine-grained signals per field (data, error, isFetching independent)

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
- `createFlow({ nodes, edges, ...config })` — reactive flow instance with signal-based state
- Node/edge CRUD, selection, viewport (zoom/pan/fitView), auto-layout via elkjs (lazy-loaded)
- Components: `<Flow>`, `<Background>`, `<MiniMap>`, `<Controls>`, `<Handle>`, `<Panel>`
- Edge paths: `getBezierPath()`, `getSmoothStepPath()`, `getStraightPath()`, `getStepPath()`
- No D3 — pan/zoom via pointer events + CSS transforms

### @pyreon/code
- `createEditor({ value, language, theme, minimap, ... })` — reactive editor instance
- `editor.value` — reactive Signal<string>, two-way sync with CodeMirror
- `<CodeEditor>`, `<DiffEditor>`, `<TabbedEditor>` — mount components
- `minimapExtension()` — canvas-based code overview
- `loadLanguage(lang)` — lazy-load 17+ language grammars
- Built on CodeMirror 6 (~250KB vs Monaco's ~2.5MB)

### @pyreon/document
- `render(node, format, options?)` — render document node tree to any format
- `createDocument(props?)` — builder: `.heading()`, `.text()`, `.table()`, `.toPdf()`, `.toEmail()`, etc.
- JSX primitives: `Document`, `Page`, `Heading`, `Text`, `Table`, `Image`, `List`, `Code`, `Divider`, etc.
- 14+ output formats: HTML, PDF, DOCX, XLSX, PPTX, email, Markdown, text, CSV, SVG, Slack, Teams, Discord, Telegram, Notion, Confluence, WhatsApp, Google Chat
- Heavy renderers lazy-loaded (PDF ~300KB, DOCX ~100KB, XLSX ~500KB, PPTX ~200KB)

### @pyreon/storybook
- `renderToCanvas(context, canvasElement)` — core renderer for Storybook
- `Meta<TComponent>` / `StoryObj<TMeta>` — typed story definitions
- Preset: `framework: "@pyreon/storybook"` in `.storybook/main.ts`

### Devtools
Stateful packages expose `./devtools` subpath exports with WeakRef-based registries for introspection. Tree-shakeable — zero cost unless imported. Available for: store, state-tree, form, i18n.

## Key Architectural Patterns

### Workspace resolution (no build needed)
Each package.json has `"bun": "./src/index.ts"` in exports.
Root tsconfig has `"customConditions": ["bun"]`.

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

### SSR
`renderToString(vnode)` + `renderToStream(vnode)` with Suspense streaming.
`mergeChildrenIntoProps(vnode)` called before `runWithHooks` in both paths.
`runWithRequestContext(fn)` isolates context + store per request via ALS.

### Island Architecture
`island(loader, { name, hydrate })` → async ComponentFn → `<pyreon-island>` element.
Client: `hydrateIslands({ Name: () => import(...) })` — strategies: load, idle, visible, media, never.

### JSX Compiler
`shouldWrap` only wraps if `containsCall(node)` is true.
Static JSX nodes hoisted to module scope as `const _$h0 = ...`.
Template emission: JSX element trees with ≥1 DOM element emit `_tpl()` + `_bind()`.
Supports mixed element+expression children (via `childNodes[]` indexing), multiple expressions, and fragment inlining.
Reactive text uses `document.createTextNode()` + `.data` (not `.textContent`).

### Context providing pattern
`provide(ctx, value)` — pushes context and auto-cleans up on unmount.
Low-level: `pushContext(new Map([[ctx.id, value]]))` + `onUnmount(() => popContext())`.

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

### Dev-Mode Warnings (`__DEV__`)
- `mount()` validates container is not null/undefined
- Component output validation (must return VNode, string, null, or function)
- Duplicate `by` keys in `<For>` loops logged as warnings
- Passing raw signal (function) as child instead of calling it
- All guarded by `__DEV__` — tree-shaken in production builds

### exactOptionalPropertyTypes
Enabled in root tsconfig — optional properties need explicit `| undefined` when assigned from functions that may return undefined.

## Common Issues & Fixes
- `ComponentFn<{ name: string }>` not assignable → solved by generic h()
- `@pyreon/reactivity` missing from deps → add to package.json + `bun install`
- Biome `noNonNullAssertion` → use `if (!x) return` guard
- SSR empty render → forgot `mergeChildrenIntoProps` in renderComponent
- DOM tests need happy-dom preload (bunfig.toml in each package)
- Vite resolves `dist/` not `src/` → add `resolve.conditions: ["bun"]` to vite.config.ts

## Testing
```bash
bun run test                          # all package tests (via workspace filter)
cd packages/<name> && bun run test    # single package
cd packages/<name> && bun run test -- --coverage  # with coverage
```

DOM-dependent packages (runtime-dom, router, head, compat layers) use `environment: "happy-dom"` in vitest config.

## CI / Lint / Typecheck

```bash
bun run lint                          # lint all packages + examples (via workspace filter)
bun run typecheck                     # typecheck all packages + examples (via workspace filter)
bunx biome check --write .            # auto-fix lint + format
```

Every package and example must have `"lint": "biome check ."` and `"typecheck": "tsc --noEmit"` in scripts.
Examples use `noEmit: true` in tsconfig (not `rootDir`) since they include vite.config.ts.
