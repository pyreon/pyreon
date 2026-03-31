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

| Package                  | Description                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@pyreon/reactivity`     | signal, computed, effect, onCleanup, batch, createSelector, createStore, untrack                                                              |
| `@pyreon/core`           | VNode, h(), Fragment, lifecycle, context, JSX runtime, Suspense, ErrorBoundary, lazy(), Dynamic, cx(), splitProps, mergeProps, createUniqueId |
| `@pyreon/runtime-dom`    | DOM renderer, mount, hydrateRoot, Transition, TransitionGroup, KeepAlive                                                                      |
| `@pyreon/compiler`       | JSX transform with smart `shouldWrap`, static hoisting                                                                                        |
| `@pyreon/runtime-server` | renderToString, renderToStream                                                                                                                |
| `@pyreon/router`         | hash+history+SSR, context-based, prefetching, guards, loaders, useIsActive                                                                    |
| `@pyreon/head`           | useHead, HeadProvider, renderWithHead                                                                                                         |
| `@pyreon/server`         | createHandler (SSR), prerender (SSG), island(), middleware                                                                                    |
| `@pyreon/vite-plugin`    | JSX transform + SSR dev middleware + signal-preserving HMR                                                                                    |
| `@pyreon/react-compat`   | useState, useEffect, useMemo, lazy, Suspense shims                                                                                            |
| `@pyreon/storybook`      | Storybook renderer — mount, render, and interact with Pyreon components                                                                       |
| `@pyreon/typescript`     | TypeScript config presets: base, app (noEmit), lib (declarations)                                                                             |
| `@pyreon/lint`           | Pyreon-specific linter — 57 rules, 12 categories, config files, watch mode, AST cache, LSP server                                             |
| `@pyreon/test-utils`     | Testing utilities — initTestConfig, withThemeContext, getComputedTheme, renderProps, resolveRocketstyle                                        |

### UI System (Component Library)

| Package                       | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `@pyreon/ui-core`             | Config engine, init(), utilities, HTML tags                      |
| `@pyreon/styler`              | CSS-in-JS: styled(), css, keyframes, theming                     |
| `@pyreon/unistyle`            | Responsive breakpoints, CSS property mappings, unit utilities    |
| `@pyreon/elements`            | 5 foundational primitives (Element, Text, List, Overlay, Portal) |
| `@pyreon/attrs`               | Chainable HOC factory (.attrs(), .config(), .statics())          |
| `@pyreon/rocketstyle`         | Multi-state styling (states, sizes, variants, themes, dark mode) |
| `@pyreon/coolgrid`            | 12-column responsive grid (Container, Row, Col)                  |
| `@pyreon/kinetic`             | CSS-transition animations (Transition, Stagger, Collapse)        |
| `@pyreon/kinetic-presets`     | 120+ animation presets                                           |
| `@pyreon/connector-document`  | Bridge between ui-system components and @pyreon/document         |
| `@pyreon/document-primitives` | Rocketstyle-based document export components                     |

### UI System — Key Technical Details

#### @pyreon/styler (CSS-in-JS)

- `styled('div')\`color: red\``→ returns`ComponentFn`
- `css\`...\``→ lazy`CSSResult`, resolved on use
- `keyframes\`...\`` → returns animation name string
- Theme: `ThemeContext` (Context object) + `useTheme()` helper
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
- `useSSE(options)` — Server-Sent Events hook with QueryClient integration, same pattern as useSubscription but read-only
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
- `listRules()` — returns metadata for all 57 rules
- `applyFixes(sourceText, diagnostics)` — apply auto-fixes
- `loadConfig(cwd)` — load `.pyreonlintrc.json` / `package.json` `"pyreonlint"` field
- `createIgnoreFilter(cwd)` — load `.pyreonlintignore` + `.gitignore` patterns
- `AstCache` — FNV-1a hash-keyed AST cache for repeat runs
- `watchAndLint(options)` — file watcher with 100ms debounce, re-lints changed files
- CLI: `pyreon-lint [--preset recommended|strict|app|lib] [--fix] [--format text|json|compact] [--quiet] [--list] [--watch] [--config path] [--ignore path] [--rule id=severity] [path...]`
- 57 rules across 12 categories: reactivity (10), jsx (11), lifecycle (4), performance (4), ssr (3), architecture (5), store (3), form (3), styling (4), hooks (3), accessibility (3), router (4)
- 4 presets: `recommended`, `strict` (warns→errors), `app` (lib rules off), `lib` (strict + architecture)
- Powered by `oxc-parser` — ESTree/TS-ESTree AST with Visitor

### @pyreon/router — useIsActive

- `useIsActive(path, exact?)` — returns reactive boolean for whether a path matches the current route
- Segment-aware prefix matching: `/admin` matches `/admin/users` when `exact` is false

### @pyreon/hooks — New Hooks

- `useClipboard()` — copy text to clipboard + `copied` reactive state with auto-reset
- `useDialog()` — native `<dialog>` management (open, close, return value)
- `useTimeAgo(date)` — reactive relative time string ("5 minutes ago"), auto-updates
- `useOnline()` — reactive `navigator.onLine` signal
- `useEventListener(target, event, handler, options?)` — auto-cleanup on unmount
- `useInfiniteScroll(onLoadMore, options)` — IntersectionObserver-based infinite loading

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

### Dev-Mode Warnings (`__DEV__`)

- `mount()` validates container is not null/undefined
- Component output validation (must return VNode, string, null, or function)
- Duplicate `by` keys in `<For>` loops logged as warnings
- Passing raw signal (function) as child instead of calling it
- All guarded by `__DEV__` — tree-shaken in production builds

### exactOptionalPropertyTypes

Enabled in root tsconfig — optional properties need explicit `| undefined` when assigned from functions that may return undefined.

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

51 packages across 5 categories under `packages/`:

- `packages/core/` — 8 packages: reactivity, core, compiler, runtime-dom, runtime-server, router, head, server
- `packages/fundamentals/` — 21 packages: store, state-tree, form, validation, query, table, virtual, i18n, feature, charts, storage, hooks, hotkeys, permissions, machine, flow, code, document, rx, toast, url-state
- `packages/tools/` — 10 packages: cli, lint, mcp, vite-plugin, typescript, storybook, react-compat, preact-compat, vue-compat, solid-compat
- `packages/ui-system/` — 11 packages: ui-core, styler, unistyle, elements, attrs, rocketstyle, coolgrid, kinetic, kinetic-presets, connector-document, document-primitives
- `packages/internals/` — 1 package: test-utils (private, not published)

Plus: `docs/` (VitePress site), `examples/` (example apps).

## Reactive vs Static — The Core Rule

In Pyreon, components run ONCE. What's reactive and what's static depends on WHERE you read a signal:

```tsx
// Component props are STATIC — evaluated once at mount
<MyComponent title={name()} />  // name() called once, value captured

// DOM text children are REACTIVE — compiler wraps in accessor
<div>{name()}</div>  // compiler → () => name() — re-evaluates on change

// Reactive accessor (explicit) — always reactive
<div>{() => `Hello ${name()}`}</div>

// Context reads are STATIC at setup, REACTIVE inside accessors
const ctx = useContext(ThemeCtx)
ctx.mode  // static if destructured: const { mode } = ctx
() => ctx.mode  // reactive inside accessor — re-evaluates
```

Rule of thumb:

- **Component props** = static (called once)
- **DOM children with signals** = reactive (compiler wraps)
- **Context reads** = static at setup, reactive inside `() => ...`
- **To make anything reactive**: wrap in `() => ...` accessor

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
oxlint .                              # lint (400+ rules, Rust-powered)
oxfmt --write .                       # auto-format
oxfmt --check .                       # check formatting
```

Every package and example must have `"lint": "oxlint ."` and `"typecheck": "tsc --noEmit"` in scripts.
Examples use `noEmit: true` in tsconfig (not `rootDir`) since they include vite.config.ts.
