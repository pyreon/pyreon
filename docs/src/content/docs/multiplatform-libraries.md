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
- Code and rich-text own the WebView bridge to their editors: `<CodeWebView>` and `<RichTextWebView>` lower to a native `<WebView src>`, and each package builds the page from the app's installed CodeMirror or TipTap (`webHosts`, run by `pyreon-native assets`). The editors themselves are DOM engines and stay web; every other export of those packages warns by name.
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
| A WebView page the lowered view loads          | `webHosts`                                          |
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
| `@pyreon/elements` | Element→Stack, Text, and List (a keyed Stack of its rows: data + component + itemKey / valueName) lower via elements-native; the rich web-only surfaces (Overlay/Portal, List itemProps/wrapProps/wrapComponent) warn per-construct |
| `@pyreon/primitives` | the 19 canonical primitives: real web DOM runtime AND SwiftUI/Compose emit — the compiler's native target vocabulary |
| `@pyreon/reactivity` | L0 of the shared-code model: the package plugin maps signal/computed to native state; PyreonReactivity runtime ports ship on both targets, while bare effect statements require a supported lifecycle hook |
| `@pyreon/rocketstyle` | rocketstyle-over-primitive chains lower (static cascade + any number of dynamic dimensions) through its package-owned native plugin |
| `@pyreon/rx` | supported namespace and standalone transforms lower recursively to native collection operations, including import aliases; unsupported methods warn |
| `@pyreon/sized-map` | pure-logic bounded FIFO/LRU map with no platform edge; `new SizedMap<K, V>(&#123; maxEntries &#125;)` lowers to the co-located PyreonSizedMap runtime on both native targets (a computed cap stays web — the literal is baked into the emit) |
| `@pyreon/styler` | styled(Prim) factories lower through its package-owned native plugin with shared defineTheme token resolution; the CSS-in-JS runtime is web, the authored patterns compile |
| `@pyreon/ui-core` | `<PyreonUI>` lowers through the package-owned native-plugin entry (theme is compile-time; dark mode is the system read) |

### `service-backend` — one API, per-target runtime backends (11)

| Package | Why |
| --- | --- |
| `@pyreon/auth` | useOidc lowers to the native OIDC session container (PyreonOidcAuth, co-sourced Swift/Kotlin): system browser (ASWebAuthenticationSession / Custom Tab), PKCE, the code exchange, ID-token verification against the provider keys, refresh and provider logout, with the session kept in the Keychain / Keystore. The lower-level API (createAuth, sessions, TOTP, passkeys, guards) is web/server code |
| `@pyreon/flow` | one API with a web engine and a Swift/Kotlin port: `createFlow`/`useFlow`, the whole FlowInstance surface and all seven layouts lower to `PyreonFlowState`, and `<Flow instance>` lowers to the interactive `PyreonFlowView` (static custom node/edge maps, connection lines, handles, resizing, toolbars, background, controls, minimap, panels, colorMode including system, gestures, keyboard commands, culling, portable inline styles). The native engines replay shared scenarios against the web engine as oracle, and the iOS/Android device suites assert the rendered chrome and interactions. A `<path d>` in a custom edge or connection line lowers for any SVG path data, an inline `<svg>` in a renderer draws its shapes natively scaled by the viewBox, and plain `<div>`/`<p>`/`<span>` lower where the layout provably matches the browser. Browser-only by member and warned by name: `FlowLayersContext`, `flowStyles`, CSS-dependent renderers (a `class`/`style`, inline-flow mixes, CSS selectors), SVG `<text>`/gradients/`transform`, and renderer maps computed at runtime; `@pyreon/flow/webview` hosts the unchanged browser renderer for those. |
| `@pyreon/form` | useForm v2 + useFieldArray lower to PyreonForm/PyreonFieldArray; device-proven both platforms |
| `@pyreon/hooks` | the L2 service-hook layer: every hook in PMTC's NATIVE_LOWERED_HOOKS has a web implementation and Swift/Kotlin runtime ports; the remaining hooks are web conveniences |
| `@pyreon/i18n` | createI18n core (t(), interpolation, CLDR plural categories, and switching language via i18n.locale() / i18n.locale.set()) lowers to PyreonI18n; translation and locale switching asserted on device on both platforms |
| `@pyreon/machine` | createMachine lowers to PyreonMachine on both targets; transition device-asserted |
| `@pyreon/permissions` | usePermissions read surface lowers to PyreonPermissions (callable can/all/any) |
| `@pyreon/router` | web history/hash router + @pyreon/native-router-&#123;swift,kotlin&#125; ports; nav/params/guards/loaders device-proven |
| `@pyreon/state-tree` | model() lowers to PyreonModel singletons on both targets |
| `@pyreon/storage` | useStorage family over @PyreonAppStorage (Swift) / rememberPyreonStorage (Kotlin); persistence device-proven |
| `@pyreon/store` | defineStore lowers to @Observable singleton (Swift) / mutableStateOf object (Kotlin); cross-screen state device-proven |

### `web-only` — architecturally coupled to the web platform (35)

| Package | Why |
| --- | --- |
| `@pyreon/a11y` | mostly DOM/ARIA utilities (the native element a11y story is the AccessibilityProps vocabulary on @pyreon/primitives); `announce(...)` now lowers to the native PyreonA11y runtime |
| `@pyreon/atlas` | the component workbench — dev tooling that runs in a browser, not app runtime |
| `@pyreon/code` | wraps CodeMirror 6 (DOM editor engine, so the editor itself stays web); the `@pyreon/code/webview` bridge crosses — see nativeFrontend |
| `@pyreon/compiler` | the web JSX compiler + build tooling itself; the native sibling is @pyreon/native-compiler — nothing here ships to an app runtime |
| `@pyreon/config` | build-time config shape read by the tooling that assembles an app — never part of a rendered app on any target |
| `@pyreon/connector-document` | bridges ui-components to @pyreon/document extraction — both ends are web/document engines |
| `@pyreon/dnd` | `useSortable` (list reorder), `useDraggable` and `useDroppable` lower to native drag engines; the page-global useDragMonitor and the OS-file useFileDrop stay web — they are not gesture-shaped |
| `@pyreon/document` | wraps pdfmake/docx/exceljs/pptxgenjs (browser/node document engines); no native lowering. Build the file on a server and fetch it (useFetch / @pyreon/http lower), or hand the result to the platform share sheet (useShare lowers). |
| `@pyreon/document-primitives` | document-authoring primitives feeding the pdfmake/docx renderers |
| `@pyreon/feature` | CRUD composite over query/form/store/validation. The RUNTIME half stays web — the generated hooks (useList / useById / useCreate / useUpdate / useDelete / useSearch), the network fetcher, and validator/form integration all lower only when every dependency does. The DECLARATION half already crosses (see nativeFrontend) |
| `@pyreon/head` | document `<head>` management — a native app has no document, so there is nothing to describe: `useHead(...)` compiles to nothing and `<HeadProvider>` is transparent (so shared source builds); the head context and SSR helpers have no native equivalent |
| `@pyreon/hotkeys` | keyboard-shortcut layer over DOM KeyboardEvent. The REGISTRY half (registerHotkey / scopes / conflict reporting) is web; the `useHotkey` authoring hook lowers — see nativeFrontend |
| `@pyreon/http` | universal web/node HTTP client (WHATWG fetch); the imperative client (api.get/post, custom middleware functions) stays web — native networking is the PyreonFetch/PyreonHttp runtime layer, which applies the lowerable middleware, plus the co-located PyreonStream runtime for SSE / NDJSON |
| `@pyreon/kinetic` | CSS-transition animation engine (classes + rAF over real CSSOM). The CLASS/style machinery is web; the PRESET vocabulary crosses — see nativeFrontend |
| `@pyreon/kinetic-presets` | preset pack for the kinetic CSS engine; the presets whose motion exists in the native vocabulary cross — see nativeFrontend |
| `@pyreon/lathe` | the code generator — build-time tooling that emits app code, not app runtime itself |
| `@pyreon/lint` | lint tooling — runs at dev time, not app runtime |
| `@pyreon/loom` | the dependency observatory — dev tooling, not app runtime |
| `@pyreon/mcp` | the MCP server — dev/AI tooling, not app runtime |
| `@pyreon/query` | wraps TanStack Query (a JS runtime cache), so the full client — QueryClient config, devtools, infinite/suspense queries — stays web; `useQuery` itself lowers to the PyreonQuery runtime |
| `@pyreon/rich-text` | wraps TipTap/ProseMirror (DOM editor, so the editor itself stays web); the `@pyreon/rich-text/webview` bridge crosses — see nativeFrontend |
| `@pyreon/runtime-dom` | the DOM renderer — on native, PMTC emits SwiftUI/Compose instead of running a renderer; `<Transition>` / `<TransitionGroup>` DO cross, but import them from `@pyreon/primitives` (this package is web-only, so importing them from here warns) |
| `@pyreon/runtime-server` | server-side HTML rendering (SSR/streaming) — a web-platform concern with no native analogue |
| `@pyreon/server` | SSR handler + islands for web deployments; native apps have no server-rendered HTML |
| `@pyreon/sync` | the Yjs engine + IndexedDB/WebSocket transports stay web; the engine-neutral PyreonCrdt core + `syncedSignal` lower to a native runtime, cross-device transport tracked |
| `@pyreon/table` | the TanStack-backed `useTable` (row model / faceting / virtual sizing) stays web; the dependency-free `createTableState` engine lowers to the native PyreonTableState port, rendered with `<For>` + primitives |
| `@pyreon/testing` | the web testing kit (Testing-Library parity over the DOM renderer); native testing is XCUITest/Compose-test territory |
| `@pyreon/toast` | the core `toast(...)` + `<Toaster>` lower to the native PyreonToast runtime: a screen-anchored overlay (a pass-through window on iOS, a window-anchored Popup on Android) styled per type, honouring literal position / max / gap / offset / duration, animating in and out, with a dismiss button (a literal `dismissible: false` hides it) and a text `description` line, and visible on every screen; the rich surface (toast.promise/update, a JSX description, icon / action, onDismiss, the hover/focus countdown pause) stays web, each warned by name natively |
| `@pyreon/unistyle` | responsive breakpoints + CSS-variable theming over real CSS; native theming is compile-time tokens + the 2-bucket size-class model |
| `@pyreon/url-state` | the address bar is the web's own surface — history entries, `popstate`, `batchUrlUpdates` and the pluggable serializers stay web; on native the equivalent is the router's search parameters |
| `@pyreon/validate` | pure-logic schema DSL; the runtime engine (JIT, JSON-schema export, async refinements, the v1/mini compat surfaces) stays web, and inline uses like `s.string().parse(x)` do not lower |
| `@pyreon/validation` | Standard Schema adapters (zod/valibot/arktype are JS libraries), so the adapters themselves stay web; the declarative schema FORMS lower to native validators (Gap-4 v1) |
| `@pyreon/virtual` | DOM virtualization (scroll containers, measured rows). Native lists are lazy by construction: render the rows with a `<For>` as the ONLY child of a `<Scroll>` (LazyVStack on iOS, LazyColumn on Android) and no virtualizer is needed. Do not nest that `<For>` among other children inside a `<Scroll>`: Compose rejects a lazy list inside a scrolling Column at measure time. |
| `@pyreon/zero` | the web meta-framework (SSR/SSG/ISR, Vite, fs-router); native apps are built by PMTC + create-multiplatform, not zero |
| `@pyreon/zero-content` | markdown/MDX content pipeline for zero's web rendering |

{/* gen:multiplatform-tiers:end */}

## How each package crosses to native

{/* gen:native-crossing:start */}

> Generated from the native coverage registry (`scripts/check-native-coverage.ts`) by
> `bun scripts/gen-native-crossing-table.ts` — edit the registry, not this table. The
> coverage gate compiles every entry for both targets; `--check` fails when this drifts.

### Lowers — the authoring API compiles to SwiftUI and Compose (15)

Write it once in TypeScript; the compiler emits native code for both targets with no warnings.

| Package | How it crosses |
| --- | --- |
| `@pyreon/attrs` | attrs(&#123; name, component &#125;).attrs(defaults) HOC lowers via the wrapped native component. |
| `@pyreon/charts` | the plot engine is generated into the native runtimes and every host lowers to PyreonChartCanvas (a native Canvas over the same draw list); &lt;MapChart> needs a precomputed GeoShape[]; a bare host follows the runtime colour scheme |
| `@pyreon/coolgrid` | Container/Row/Col grid lowers to native stack layouts. |
| `@pyreon/core` | VNode/components + For/Show control flow lower to SwiftUI/Compose view trees; render props, function-as-children and `VNodeChild` slots lower to generic `@ViewBuilder` closures / `@Composable` lambdas. |
| `@pyreon/elements` | the Element flex primitive lowers to native stacks (its own Text is not a native primitive). |
| `@pyreon/flow` | createFlow/useFlow and the interactive Flow host lower to PyreonFlowState + SwiftUI/Compose on both targets: complete public state operations, all seven layouts, gestures, built-in/static custom renderers, handles, resizing, multiple toolbars, custom edges/connection lines, background, controls, minimap, panels, accessibility, and portable inline styles. Device-proven on iOS Simulator and Android Emulator by the native-counter and native-tasks apps (rendered chrome read from pixels and frames, every gesture, the keyboard commands, colorMode including system, a 400-node culled scale scenario); the state surface is replayed against the web engine as oracle. Inline &lt;svg> shapes and plain div/p/span structure inside a renderer lower natively (device-proven by a native-tasks custom node); CSS-dependent renderers, SVG text/gradients/transforms and runtime renderer maps remain explicit platform boundaries that warn by name. |
| `@pyreon/head` | a native app has no document `&lt;head>`, so the package crosses by BEING INERT: `useHead(...)` lowers to nothing and `&lt;HeadProvider>` is transparent, which lets shared source that sets a page title for the web build compile for iOS and Android. The head context and SSR helpers have no native equivalent and warn by name. |
| `@pyreon/primitives` | the canonical native UI vocabulary (Stack/Inline/Text/Button/…) — the primitives that DEFINE what lowers. |
| `@pyreon/reactivity` | signal/computed/effect lower to native @Observable state on both targets. |
| `@pyreon/rocketstyle` | rocketstyle(Element).theme()/.attrs() dimensions lower to native styled components, and the SAME chain now styles on the web: a chain with `.theme()` and no `.styles()` renders its theme through unistyle's responsive engine, reached via ui-core's engine seam (rocketstyle carries no unistyle dependency and degrades to no CSS without it). Before that a theme-only chain was fully styled on iOS/Android and completely unstyled in a browser. |
| `@pyreon/router` | RouterLink/navigation lower onto the native router runtimes (@pyreon/native-router-&#123;swift,kotlin&#125;). |
| `@pyreon/rx` | source-first collection transforms (filter/map/take/…) lower to chained computeds; `pipe` stays web-only. |
| `@pyreon/styler` | styled() style objects lower to native view modifiers. |
| `@pyreon/ui-core` | the PyreonUI theme provider lowers transparently around a native tree. |
| `@pyreon/validate` | the schema-authoring surface (s.object/s.string/…) lowers to a native Codable struct with parse/safeParse. |

### Native runtime — the package ships a Swift and a Kotlin runtime (15)

The same API is backed by a runtime shipped as Swift and Kotlin source.

| Package | How it crosses |
| --- | --- |
| `@pyreon/a11y` | ships the native accessibility runtime; component-level helpers (VisuallyHidden) do not lower — a11y crosses via native accessibility modifiers. |
| `@pyreon/auth` | useOidc(&#123; issuer, clientId, redirectUri, nativeRedirectUri &#125;) lowers to the native OIDC session (PyreonOidcAuth): system browser, PKCE, ID-token verification, Keychain/Keystore persistence. |
| `@pyreon/form` | useForm(&#123; initialValues &#125;) lowers to a native form controller over the form runtime. |
| `@pyreon/hooks` | the device/data hooks (useFetch/useAuth/useCamera/…) lower onto ~30 co-located native service runtimes. |
| `@pyreon/i18n` | createI18n(&#123; locale, messages &#125;) lowers to a native PyreonI18n container with baked dictionaries. |
| `@pyreon/machine` | createMachine(config) lowers to a native state machine over the machine runtime. |
| `@pyreon/permissions` | usePermissions(grants) lowers to a native PyreonPermissions container over the permissions runtime. |
| `@pyreon/query` | useQuery&lt;T>(() => (&#123; queryKey, queryFn, staleTime &#125;)) lowers to a native PyreonQuery over the query runtime, and useMutation&lt;T>(endpoint.mutation()) to a native PyreonMutation whose mutate / mutateAsync build the request at the call site from runtime values. |
| `@pyreon/sized-map` | ships a co-located native bounded-map runtime used by the data packages. |
| `@pyreon/state-tree` | model(id, shape) lowers to a native observable model over the state-tree runtime. |
| `@pyreon/storage` | useStorage(key, default) lowers to native persistence over the storage backends runtime. |
| `@pyreon/store` | defineStore(id, () => &#123;…&#125;) lowers to a native @Observable singleton over PyreonStore runtime. |
| `@pyreon/sync` | syncedSignal(&#123; key, initial &#125;) lowers to a native CRDT-backed signal over the sync runtime. |
| `@pyreon/table` | ships the PyreonTable native runtime; the useTable() authoring lowering is a documented open refinement. |
| `@pyreon/toast` | ships the PyreonToast native runtime; the useToast() authoring lowering is a documented open refinement. |

### WebView-hosted — the same web engine inside a native shell (3)

the SAME web bundle inside a native shell — real, shipping, one codebase; NOT a native view: WebView startup cost, JSON-bridge latency, no native gesture/accessibility integration for hosted content, host page must be bundled

| Package | How it crosses |
| --- | --- |
| `@pyreon/code` | CodeMirror 6 is a DOM editor with no native equivalent, so it crosses by HOSTING the same editor in a native &lt;WebView>: &lt;CodeWebView> from @pyreon/code/webview lowers (through the package's own native plugin) to a &lt;WebView src> pointed at a page that `pyreon-native assets` builds from the app's installed CodeMirror and the grammars it has. Edits arrive as plain `v:&lt;text>` messages and host failures as `e:&lt;message>`. Bridge proven in real Chromium against real CodeMirror; the page bundles and executes (node); the lowered host is emit + stub-typecheck proven on both targets and device-proven on iOS Simulator and Android Emulator by examples/native-tasks (the value reaches the editor and an edit comes back out; a lasting soft-keyboard session is not exercised). Every other export of the package is a DOM editor API and warns by name. |
| `@pyreon/flow/webview` | Optional compatibility bridge for applications that deliberately need the browser SVG/DOM/CSS renderer unchanged inside WKWebView or Android WebView; the regular @pyreon/flow editor has a direct SwiftUI/Compose lowering path. Bridge proven in real Chromium, and device-proven on iOS Simulator and Android Emulator by examples/native-tasks: graph and command push in, selection and viewport events back out, once-only commands, and a reactive html swap that re-injects the bridge. |
| `@pyreon/rich-text` | TipTap/ProseMirror is a DOM editor with no native equivalent, so it crosses by HOSTING the same WYSIWYG in a native &lt;WebView>: &lt;RichTextWebView> from @pyreon/rich-text/webview lowers (through the package's own native plugin) to a &lt;WebView src> pointed at a page that `pyreon-native assets` builds from the app's installed TipTap. The document crosses as TEXT both ways (TipTap JSON serialized to a string; HTML also accepted), edits arrive as `c:&lt;text>` and host failures as `e:&lt;message>`. Bridge proven in real Chromium against real TipTap; the page bundles and executes (node); the lowered host is emit + stub-typecheck proven on both targets and device-proven on iOS Simulator and Android Emulator by examples/native-tasks (the value reaches the editor and an edit comes back out; a lasting soft-keyboard session is not exercised). Every other export of the package is a DOM editor API and warns by name. |

### Partial — a declared subset crosses; the rest warns by name (7)

Only the listed surface lowers. Anything else produces a named compiler warning rather than a silent drop.

| Package | How it crosses |
| --- | --- |
| `@pyreon/dnd` | the pdnd/DOM-shaped surface stays web (useDragMonitor is a page-global drag bus, useFileDrop is an OS file picker — each still warns BY NAME). Three hooks lower: useSortable becomes a co-located PyreonSortableState engine; useDraggable(&#123; data &#125;) / useDroppable(&#123; canDrop, onDrop, edges &#125;) become PyreonDraggableState / PyreonDroppableState with `ref=&#123;d.ref&#125;` as the platform drag source / drop target, the payload crossing as JSON and decoded into the ANNOTATED type of the onDrop source parameter. What cannot cross warns by name (onDragStart / onDragEnd / preview / handle on a draggable, onDragEnter with a source, sticky) — SwiftUI reports no drag start/end/cancel callback, so isDragging clears on the next drop rather than on a cancel. The sortable contract is required in full — items, a single-param `by`, and an arrow `onReorder`. |
| `@pyreon/feature` | CRUD composite. The RUNTIME half stays web — generated hooks (useList / useById / useCreate / useUpdate / useDelete / useSearch), the network fetcher and validator/form integration lower only when every dependency does. The DECLARATION half crosses today: the literal field-type map emits a Codable struct + a module-scope const with `name` and `initialValues` on both targets. An object literal of scalar validators (`z.object(&#123; id: z.string() &#125;)`) lowers the same way and ALSO to the validation schema struct, so `Todo.schema.safeParse(x)` enforces the constraints on device (what cannot be enforced — `.refine()`, `.transform()`, `.default()`, `.parse()` — is reported by name); a schema held in a variable, `v.pipe(…)` and ArkType warn by name. |
| `@pyreon/hotkeys` | the REGISTRY half (registerHotkey / scopes / conflict reporting) is web; the `useHotkey` authoring hook lowers to a SwiftUI `.keyboardShortcut` on a hidden Button and a Compose focused key handler. `mod` resolves per platform: Command on iOS, Ctrl on Android. |
| `@pyreon/http` | imperative client calls (api.get/post) stay web, but same-file endpoint calls DO lower: createHttp(&#123; baseUrl &#125;) + api.endpoint(…) resolve through useFetch/useQuery to native PyreonFetch/PyreonQuery, an endpoint awaited in an async event handler (`await ep(&#123; json, query, headers &#125;)`, every value read at the call) to a native PyreonHttp.call that rejects a non-2xx and ends the handler, a `multipart` body carrying a picked file (`fileFromUri`) to a streamed PyreonMultipartBody, and useStream over openEventStream/openNdjsonStream to the co-located PyreonStream runtime (SSE + NDJSON, reconnect with Last-Event-ID). A literal `use: [...]` array crosses too — bearer / retry / logger lower to PyreonHttpMiddleware (an onion with the web semantics, parity-tested by execution) and forwardHeaders is the browser no-op; refresh / dedupe / a custom function keep that client web by name, and useStream refuses a middleware client by name. Verified zero-warning on both targets; the snippet exercises all of it so the real-runtime batch compiles each. |
| `@pyreon/kinetic` | the CSS class/style engine is web; a `.preset()` chain lowers through the same &lt;Transition> path the primitive uses, with a synthesized mount flag driving the enter. A preset-less chain degrades to a plain container and warns by name. |
| `@pyreon/url-state` | history entries, popstate and the pluggable serializers stay web, but useUrlState(key, 'default') with a STRING default DOES lower, bound to the native router's query. Verified zero-warning on both targets (a typed/number default still warns on this branch — #2943 widens that). |
| `@pyreon/validation` | the zod/valibot/arktype ADAPTERS stay web, but the declarative form DOES lower: a top-level zodSchema(z.object(&#123;…&#125;)) emits native field validators, and `useForm(&#123; schema &#125;)` wires one per string field. Several schemas may share one `const a = …, b = …` statement, and `.safeParse(x)` on a declared binding or an inline adapter call lowers to the same `&#123; success, data &#125;` result the web returns. Verified zero-warning on both targets; `.parse()` (throws), a schema declared inside a component body, `.refine/.transform/.default` chains (each named per field) and the async validate path stay web. |

{/* gen:native-crossing:end */}
