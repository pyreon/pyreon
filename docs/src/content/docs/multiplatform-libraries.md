---
title: Multi-Platform Libraries — package-owned native plugins
---

# Multi-Platform Libraries

Pyreon's native compiler lowers supported TypeScript and JSX into SwiftUI and Jetpack Compose. A package owns the rules that translate its API. The compiler supplies shared state, function, JSX, theme-token and native style operations.

This keeps the source-facing API in the package that publishes it. Adding a library does not require adding that library's names, payloads or target templates to the compiler. Native support remains a declared subset: a plugin can lower one API while other exports need a `<Web>` branch or a native adapter. The [capability matrix](./multiplatform.md) and [supported TypeScript](./pmtc-supported-typescript.md) describe those limits.

## Using package plugins

The native CLI discovers a package's plugin from `package.json` when the application declares that package and its source imports it. The public tooling entry is `@pyreon/<package>/native-plugin`; normal web runtime imports do not load it. The native compiler is an optional peer of each owner.

```sh
pyreon-native plugins --app=./my-app
pyreon-native explain ./my-app/src/App.tsx --app=./my-app
pyreon-native build --target=all --source=./my-app/src --out=./generated
```

`plugins` lists installed owners and their capabilities. Discovery follows runtime dependencies and peers, including installed optional peers, while development dependencies are read only from the application. Plain Mode imports from `@pyreon/core/plain` activate the reactivity owner before the Plain Mode pass injects its signal/computed imports. `explain` shows the lowerings used by a file. The `--plugin` option adds a local extension, and `--no-plugins` disables package discovery for diagnosis.

Programmatic compilation loads the owners explicitly:

```ts
import { createCompiler } from '@pyreon/native-compiler'
import reactivity from '@pyreon/reactivity/native-plugin'
import primitives from '@pyreon/primitives/native-plugin'
import attrs from '@pyreon/attrs/native-plugin'

const compiler = createCompiler({ plugins: [reactivity, primitives, attrs] })
const source = `
  import { signal } from '@pyreon/reactivity'
  import { Stack, Text } from '@pyreon/primitives'
  import attrs from '@pyreon/attrs'
  const Card = attrs({ name: 'Card', component: Stack }).attrs({ padding: 4 })
  export function Counter() {
    const count = signal(0)
    return <Card><Text>{count()}</Text></Card>
  }
`
const swift = compiler.transform(source, { target: 'swift' })
const kotlin = compiler.transform(source, { target: 'kotlin' })
```

Load every owning package used by the source. For example, a form using schema validation also needs the schema package's plugin; a kinetic factory using an imported preset needs both `kinetic` and `kinetic-presets`. An absent plugin can leave an unresolved source call or JSX tag, so inspect diagnostics and compile the generated output.

## What the packages own

- State and data packages own their declarations, receiver rewrites, native runtime calls and validation stubs. This includes store, state-tree, form and field arrays, hooks, queries, schemas, tables and synchronization.
- The router owns hook bindings. The compiler retains the shared navigation host and canonical link operations.
- Reactivity owns import recognition for `signal` and `computed`, mapped to generic compiler state operations, plus advice for unsupported exports. The core operation spellings remain available in unimported standalone snippets.
- Attrs, styler and rocketstyle own their factory parsers, definition payloads and JSX rewrites. Generic theme tokens and the native style connector remain compiler operations. Static factory definitions and supported dimension expressions cross; arbitrary CSS callbacks and browser CSSOM behavior do not.
- UI core owns `PyreonUI` providers. Each provider controls its own scope while the compiler saves and restores scope state.
- Kinetic owns its factory and transition rewrite. Kinetic-presets owns which exported motion names have a native equivalent. Unsupported presets produce a named diagnostic instead of selecting a different animation.
- Charts owns its chart hosts, draw-list integration, typing and target code. The web rendering implementation is not embedded in the native app.

## Authoring a native plugin

Publish a tooling entry separately from the runtime barrel:

```json
{
  "exports": {
    "./native-plugin": {
      "bun": "./src/native-plugin.ts",
      "import": "./lib/native-plugin.js",
      "types": "./lib/native-plugin.d.ts"
    }
  },
  "peerDependencies": { "@pyreon/native-compiler": "^0.53.0" },
  "peerDependenciesMeta": { "@pyreon/native-compiler": { "optional": true } },
  "pyreon": {
    "native": {
      "plugin": "./lib/native-plugin.js",
      "modules": ["@acme/camera"]
    }
  }
}
```

Use the compiler version that provides the API your plugin needs. Import compiler types and helpers through `@pyreon/native-compiler/plugin-api`. The [native packages guide](./native-packages.md) describes the broader toolchain; the compiler package README documents the extension protocol.

Choose the seam that matches the source:

| Source shape                                   | Plugin capability                                   |
| ---------------------------------------------- | --------------------------------------------------- |
| Service hook backed by a native container      | `services`                                          |
| Component declaration or statement call        | `calls`, `statementCalls`, `patternCalls`, `decls`  |
| Generic state operation under a package export | `intrinsicCalls`                                    |
| Imported compile-time string vocabulary        | `constants`, consumed through `ModuleScan.constant` |
| File-scope declaration, schema or singleton    | `topLevel` and `items`                              |
| JSX naming a file-scope factory definition     | `items.<type>.element`                              |
| Imported JSX host or provider                  | `elements` and `scopes`                             |
| Package expression or receiver chain           | `callExprs`, `exprs`, `receivers`                   |

Factory recognizers can inspect `ModuleParseContext.binding(name)` to distinguish an import alias from a local or foreign binding. They read static theme tokens through `theme`. Item element hooks return ordinary JSX/style IR; the shared backend handles its native rendering. Plugin memory is scoped to one file or component, and an unsupported source shape should report an actionable diagnostic.

## Verification

Every package declaring `shared`, `service-backend`, or a partial `nativeFrontend` must publish its own plugin. The multiplatform metadata gate checks the entry, activation modules and optional compiler peer. The compiler boundary test independently discovers all package entries, checks their public-facade imports, and verifies the shared fixture catalog contains every owner.

The golden corpus holds generated code and warnings stable across ownership moves. Toy-plugin tests prove extension seams work for unrelated libraries. Installed-entry tests exercise built tooling through CLI discovery. Swift and Kotlin compile gates check generated source, while real SDK and device jobs cover the applications they execute. A green metadata gate or unchanged golden output alone does not establish that a native feature works on a device.

## Declared package tiers

The table below comes from each package manifest. `shared` describes an authoring surface that lowers across targets; `service-backend` uses a platform runtime behind that API; `web-only` can still list a specific partial native frontend in its rationale. Consult each package's manifest and the capability matrix before relying on a particular API.

{/* gen:multiplatform-tiers:start */}

> Generated from each package manifest's `multiplatform` declaration by
> `bun scripts/check-multiplatform-tier.ts --write-table` — edit the
> manifests, not this table. The gate fails when they drift.

### `shared` — the authoring surface lowers on every target (12)

| Package | Why |
| --- | --- |
| `@pyreon/attrs` | attrs(&#123; name, component &#125;) default-prop HOC lowers through its package-owned native plugin (use-site wins) |
| `@pyreon/charts` | the engine is generated into the native runtimes and every chart component lowers to a native PyreonChartCanvas over the same draw list: `<Chart>` with its marks (desugared to `<PlotChart marks>`), the family components (Pie / Gauge / Funnel / Radar / Candlestick / Heatmap / Boxplot / Treemap / Sunburst / Tree / Sankey / Graph / Chord / River / Polar / SingleAxis / Gantt / Calendar / Parallel, and `<MapChart>` from a precomputed `GeoShape[]` — the map registry, raw GeoJSON and `geoShapes()` stay web and warn by name). Theme tokens (`chartThemes`, `palettes`) resolve at compile time and `<ChartThemeProvider mode>` is a compile-time scope. |
| `@pyreon/coolgrid` | Container/Row/Col lower (equal-fill + literal fractional Col spans) |
| `@pyreon/core` | the JSX authoring surface PMTC compiles — For/Show/Suspense/ErrorBoundary lower; Switch/Match/Dynamic/Portal/Index warn with concrete alternatives |
| `@pyreon/elements` | Element→Stack and Text lower via elements-native; the rich web-only surfaces (Overlay/Portal/List slots) warn per-construct |
| `@pyreon/primitives` | the 17 canonical primitives: real web DOM runtime AND SwiftUI/Compose emit — the compiler's native target vocabulary |
| `@pyreon/reactivity` | L0 of the shared-code model: the package plugin maps signal/computed to native state; PyreonReactivity runtime ports ship on both targets, while bare effect statements require a supported lifecycle hook |
| `@pyreon/rocketstyle` | rocketstyle-over-primitive chains lower (static cascade + one dynamic dimension) through its package-owned native plugin |
| `@pyreon/rx` | supported namespace and standalone transforms lower recursively to native collection operations, including import aliases; unsupported methods warn |
| `@pyreon/sized-map` | pure-logic bounded FIFO/LRU map with no platform edge; `new SizedMap<K, V>(&#123; maxEntries &#125;)` lowers to the co-located PyreonSizedMap runtime on both native targets (a computed cap stays web — the literal is baked into the emit) |
| `@pyreon/styler` | styled(Prim) factories lower through its package-owned native plugin with shared defineTheme token resolution; the CSS-in-JS runtime is web, the authored patterns compile |
| `@pyreon/ui-core` | `<PyreonUI>` lowers through the package-owned native-plugin entry (theme is compile-time; dark mode is the system read) |

### `service-backend` — one API, per-target runtime backends (10)

| Package | Why |
| --- | --- |
| `@pyreon/flow` | one API with a web engine and a Swift/Kotlin port: `createFlow`/`useFlow`, the whole FlowInstance surface and all seven layouts lower to `PyreonFlowState`, and `<Flow instance>` lowers to the interactive `PyreonFlowView` (static custom node/edge maps, connection lines, handles, resizing, toolbars, background, controls, minimap, panels, colorMode including system, gestures, keyboard commands, culling, portable inline styles). The native engines replay shared scenarios against the web engine as oracle, and the iOS/Android device suites assert the rendered chrome and interactions. A `<path d>` in a custom edge or connection line lowers for any SVG path data, an inline `<svg>` in a renderer draws its shapes natively scaled by the viewBox, and plain `<div>`/`<p>`/`<span>` lower where the layout provably matches the browser. Browser-only by member and warned by name: `FlowLayersContext`, `flowStyles`, CSS-dependent renderers (a `class`/`style`, inline-flow mixes, CSS selectors), SVG `<text>`/gradients/`transform`, and renderer maps computed at runtime; `@pyreon/flow/webview` hosts the unchanged browser renderer for those. |
| `@pyreon/form` | useForm v2 + useFieldArray lower to PyreonForm/PyreonFieldArray; device-proven both platforms |
| `@pyreon/hooks` | the L2 service-hook layer: every hook in PMTC's NATIVE_LOWERED_HOOKS has a web implementation and Swift/Kotlin runtime ports; the remaining hooks are web conveniences |
| `@pyreon/i18n` | createI18n core (t(), interpolation, one/other plurals) lowers to PyreonI18n; translation device-proven both platforms |
| `@pyreon/machine` | createMachine lowers to PyreonMachine on both targets; transition device-asserted |
| `@pyreon/permissions` | usePermissions read surface lowers to PyreonPermissions (callable can/all/any) |
| `@pyreon/router` | web history/hash router + @pyreon/native-router-&#123;swift,kotlin&#125; ports; nav/params/guards/loaders device-proven |
| `@pyreon/state-tree` | model() lowers to PyreonModel singletons on both targets |
| `@pyreon/storage` | useStorage family over @PyreonAppStorage (Swift) / rememberPyreonStorage (Kotlin); persistence device-proven |
| `@pyreon/store` | defineStore lowers to @Observable singleton (Swift) / mutableStateOf object (Kotlin); cross-screen state device-proven |

### `web-only` — architecturally coupled to the web platform (36)

| Package | Why |
| --- | --- |
| `@pyreon/a11y` | mostly DOM/ARIA utilities (the native element a11y story is the AccessibilityProps vocabulary on @pyreon/primitives); `announce(...)` now lowers to the native PyreonA11y runtime |
| `@pyreon/atlas` | the component workbench — dev tooling that runs in a browser, not app runtime |
| `@pyreon/auth` | the native OIDC/PKCE mechanism (PyreonOidc.swift/.kt) is co-sourced and device-tested in isolation, but no PMTC recognizer lowers the web API yet; native apps use the existing useAuth container from @pyreon/hooks for state, and this package supplies the sign-in mechanism that drives it |
| `@pyreon/code` | wraps CodeMirror 6 (DOM editor engine); consume on native via the `<WebView>` bridge subpath |
| `@pyreon/compiler` | the web JSX compiler + build tooling itself; the native sibling is @pyreon/native-compiler — nothing here ships to an app runtime |
| `@pyreon/config` | build-time config shape read by the tooling that assembles an app — never part of a rendered app on any target |
| `@pyreon/connector-document` | bridges ui-components to @pyreon/document extraction — both ends are web/document engines |
| `@pyreon/dnd` | `useSortable` now lowers to the native PyreonSortableState engine (list reorder, the highest-value case); the element-getter hooks (useDraggable/useDroppable), the page-global useDragMonitor and the OS-file useFileDrop stay web — they are pdnd/DOM-shaped, not gesture-shaped |
| `@pyreon/document` | wraps pdfmake/docx/exceljs/pptxgenjs (browser/node document engines); no native lowering |
| `@pyreon/document-primitives` | document-authoring primitives feeding the pdfmake/docx renderers |
| `@pyreon/feature` | CRUD composite over query/form/store/validation. The RUNTIME half stays web — the generated hooks (useList / useById / useCreate / useUpdate / useDelete / useSearch), the network fetcher, and validator/form integration all lower only when every dependency does. The DECLARATION half already crosses (see nativeFrontend) |
| `@pyreon/head` | document `<head>` management — no equivalent surface exists on iOS/Android |
| `@pyreon/hotkeys` | keyboard-shortcut layer over DOM KeyboardEvent. The REGISTRY half (registerHotkey / scopes / conflict reporting) is web; the `useHotkey` authoring hook lowers — see nativeFrontend |
| `@pyreon/http` | universal web/node HTTP client (WHATWG fetch); the transport (middleware, interceptors) stays web — native networking is the PyreonFetch/PyreonHttp runtime layer, plus the co-located PyreonStream runtime for SSE / NDJSON |
| `@pyreon/kinetic` | CSS-transition animation engine (classes + rAF over real CSSOM). The CLASS/style machinery is web; the PRESET vocabulary crosses — see nativeFrontend |
| `@pyreon/kinetic-presets` | preset pack for the kinetic CSS engine; the presets whose motion exists in the native vocabulary cross — see nativeFrontend |
| `@pyreon/lathe` | the code generator — build-time tooling that emits app code, not app runtime itself |
| `@pyreon/lint` | lint tooling — runs at dev time, not app runtime |
| `@pyreon/loom` | the dependency observatory — dev tooling, not app runtime |
| `@pyreon/mcp` | the MCP server — dev/AI tooling, not app runtime |
| `@pyreon/query` | wraps TanStack Query (a JS runtime cache), so the full client — QueryClient config, devtools, infinite/suspense queries — stays web; `useQuery` itself lowers to the PyreonQuery runtime |
| `@pyreon/rich-text` | wraps TipTap/ProseMirror (DOM editor); consume on native via the `<WebView>` bridge subpath |
| `@pyreon/runtime-dom` | the DOM renderer — on native, PMTC emits SwiftUI/Compose instead of running a renderer; `<Transition>` / `<TransitionGroup>` DO cross, but import them from `@pyreon/primitives` (this package is web-only, so importing them from here warns) |
| `@pyreon/runtime-server` | server-side HTML rendering (SSR/streaming) — a web-platform concern with no native analogue |
| `@pyreon/server` | SSR handler + islands for web deployments; native apps have no server-rendered HTML |
| `@pyreon/sync` | the Yjs engine + IndexedDB/WebSocket transports stay web; the engine-neutral PyreonCrdt core + `syncedSignal` lower to a native runtime, cross-device transport tracked |
| `@pyreon/table` | the TanStack-backed `useTable` (row model / faceting / virtual sizing) stays web; the dependency-free `createTableState` engine lowers to the native PyreonTableState port, rendered with `<For>` + primitives |
| `@pyreon/testing` | the web testing kit (Testing-Library parity over the DOM renderer); native testing is XCUITest/Compose-test territory |
| `@pyreon/toast` | the core `toast(...)` + `<Toaster>` now lower to the native PyreonToast runtime (v1); the rich surface (toast.promise/update, options, animation) stays web |
| `@pyreon/unistyle` | responsive breakpoints + CSS-variable theming over real CSS; native theming is compile-time tokens + the 2-bucket size-class model |
| `@pyreon/url-state` | the address bar is the web's own surface — history entries, `popstate`, `batchUrlUpdates` and the pluggable serializers stay web; on native the equivalent is the router's search parameters |
| `@pyreon/validate` | pure-logic schema DSL; the runtime engine (JIT, JSON-schema export, async refinements, the v1/mini compat surfaces) stays web, and inline uses like `s.string().parse(x)` do not lower |
| `@pyreon/validation` | Standard Schema adapters (zod/valibot/arktype are JS libraries), so the adapters themselves stay web; the declarative schema FORMS lower to native validators (Gap-4 v1) |
| `@pyreon/virtual` | DOM virtualization (scroll containers, measured rows); native lists are lazy by construction (LazyColumn/LazyVStack) |
| `@pyreon/zero` | the web meta-framework (SSR/SSG/ISR, Vite, fs-router); native apps are built by PMTC + create-multiplatform, not zero |
| `@pyreon/zero-content` | markdown/MDX content pipeline for zero's web rendering |

{/* gen:multiplatform-tiers:end */}
