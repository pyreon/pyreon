---
title: Package catalog
description: Public Pyreon framework packages, with links to their guides or source.
generated_by: docs/scripts/gen-package-catalog.ts
---

# Package catalog

76 public framework packages across 6 categories, discovered from `packages/<category>/<package>`. This inventory describes the current source tree; see each package on npm for the published version.

The platform-specific compiler binaries under `packages/core/compiler/npm/` are optional dependencies of [@pyreon/compiler](/docs/compiler) and are not included in this framework package count.

Explore the [live examples](/docs/examples) and the [UI component workbench](/atlas/). The component library is a separate, private workspace and is not included in the public package count.

## core (10)

| Package | Description |
| --- | --- |
| [@pyreon/compiler](/docs/compiler) | Template and JSX compiler for Pyreon |
| [@pyreon/core](/docs/core) | Core component model and lifecycle for Pyreon |
| [@pyreon/head](/docs/head) | Head tag management for Pyreon — works in SSR and CSR |
| [@pyreon/primitives](/docs/primitives) | Canonical multi-platform UI primitives — semantic vocabulary that compiles to DOM (web), SwiftUI (iOS), and Compose (Android). The Pyreon Multi-Target story. |
| [@pyreon/reactivity](/docs/reactivity) | Signals-based reactivity system for Pyreon |
| [@pyreon/router](/docs/router) | Official router for Pyreon |
| [@pyreon/runtime-dom](/docs/runtime-dom) | DOM renderer for Pyreon |
| [@pyreon/runtime-server](/docs/runtime-server) | SSR/SSG renderer for Pyreon — streaming HTML + static generation |
| [@pyreon/server](/docs/server) | SSR handler, SSG prerender, and island architecture for Pyreon |
| [@pyreon/sized-map](/docs/sized-map) | Bounded `Map<K, V>` primitive — FIFO (default) or LRU-on-read mode. Used internally across Pyreon packages for sized cache eviction; safe to use directly. |

## fundamentals (27)

| Package | Description |
| --- | --- |
| [@pyreon/a11y](/docs/a11y) | Accessibility primitives for Pyreon — screen-reader announcements, visually-hidden content, and stable ARIA ids, with zero setup |
| [@pyreon/charts](/docs/charts) | Charts for Pyreon on the web, iOS and Android: &lt;Chart&gt; with mark children over a first-party engine (21 chart families, one flat draw list), canvas and SVG, tree-shakeable marks |
| [@pyreon/code](/docs/code) | Reactive code editor for Pyreon — CodeMirror 6 with signals, minimap, diff editor, lazy-loaded languages |
| [@pyreon/dnd](/docs/dnd) | Signal-driven drag and drop for Pyreon — wraps @atlaskit/pragmatic-drag-and-drop |
| [@pyreon/document](/docs/document) | Universal document rendering for Pyreon — one template, every output format (HTML, PDF, DOCX, email, XLSX, Markdown, and more) |
| [@pyreon/feature](/docs/feature) | Schema-driven feature primitives — define once, get CRUD hooks, forms, tables, and stores |
| [@pyreon/flow](/docs/flow) | Reactive flow diagrams for Pyreon — signal-native nodes, edges, pan/zoom, auto-layout |
| [@pyreon/form](/docs/form) | Signal-based form management for Pyreon |
| [@pyreon/hooks](/docs/hooks) | Signal-based reactive utilities for Pyreon |
| [@pyreon/hotkeys](/docs/hotkeys) | Reactive keyboard shortcut management for Pyreon — scope-aware, conflict detection |
| [@pyreon/http](/docs/http) | Pyreon HTTP client — onion middleware, typed errors, optional schema-validated responses. The transport layer under @pyreon/query. |
| [@pyreon/i18n](/docs/i18n) | Reactive internationalization for Pyreon with async namespace loading |
| [@pyreon/machine](/docs/machine) | Reactive state machines for Pyreon — constrained signals with type-safe transitions |
| [@pyreon/permissions](/docs/permissions) | Reactive permissions for Pyreon — type-safe, signal-driven, universal |
| [@pyreon/query](/docs/query) | Pyreon adapter for TanStack Query |
| [@pyreon/rich-text](/docs/rich-text) | Reactive WYSIWYG rich-text editor for Pyreon — signal-backed layer over TipTap (ProseMirror); collaboration composes with @pyreon/sync |
| [@pyreon/rx](/docs/rx) | Signal-aware reactive transforms — filter, map, sort, group, pipe for Pyreon signals |
| [@pyreon/state-tree](/docs/state-tree) | Structured reactive state tree — composable models with snapshots, patches, and middleware |
| [@pyreon/storage](/docs/storage) | Reactive client-side storage for Pyreon — localStorage, sessionStorage, cookies, IndexedDB |
| [@pyreon/store](/docs/store) | Global state management for Pyreon — Pinia-inspired composition stores |
| [@pyreon/sync](/docs/sync) | Local-first CRDT-backed sync for signals — a synced signal is just a signal, so remote ops drive surgical fine-grained updates |
| [@pyreon/table](/docs/table) | Pyreon adapter for TanStack Table |
| [@pyreon/toast](/docs/toast) | Imperative toast notifications for Pyreon — no provider needed |
| [@pyreon/url-state](/docs/url-state) | Reactive URL search-param state for Pyreon — signal-backed, type-coerced, SSR-safe |
| [@pyreon/validate](/docs/validate) | Pyreon DX layer over Standard Schema — withField metadata, reactive parse, i18n-aware error formatting. Works with Zod, Valibot, ArkType, or any Standard Schema-compliant validator. |
| [@pyreon/validation](/docs/validation) | Schema validation adapters for Pyreon forms (Zod, Valibot, ArkType) |
| [@pyreon/virtual](/docs/virtual) | Pyreon adapter for TanStack Virtual |

## native (6)

| Package | Description |
| --- | --- |
| [@pyreon/native-cli](/docs/native-packages) | CLI for the Pyreon Multi-Target Compiler: builds a directory of Pyreon sources to SwiftUI and Jetpack Compose with @pyreon/native-compiler. |
| [@pyreon/native-compiler](/docs/native-packages) | Pyreon Multi-Target Compiler (PMTC): compiles Pyreon JSX to native Swift (SwiftUI) and Kotlin (Jetpack Compose). |
| [@pyreon/native-router-kotlin](/docs/native-packages) | @pyreon/router's API (RouterProvider, RouterView, PyreonLink, useNavigate, useParams) for Android Jetpack Compose. |
| [@pyreon/native-router-swift](/docs/native-packages) | @pyreon/router's API (RouterProvider, RouterView, Link, useNavigate, useParams) for SwiftUI, built on NavigationStack. |
| [@pyreon/native-runtime-kotlin](/docs/native-packages) | Kotlin runtime that compiler-emitted Jetpack Compose code links against on Android. |
| [@pyreon/native-runtime-swift](/docs/native-packages) | Swift Package Manager runtime that compiler-emitted SwiftUI code links against on iOS. |

## tools (16)

| Package | Description |
| --- | --- |
| [@pyreon/atlas](/docs/atlas) | AI-native component workbench for the Pyreon ecosystem — derives, verifies, and serves a machine-readable component catalog. |
| [@pyreon/cli](/docs/cli) | CLI tools for Pyreon — doctor, generate, context |
| [@pyreon/config](https://github.com/pyreon/pyreon/tree/main/packages/tools/config) | One pyreon.config.ts for the whole ecosystem — a typed section per package. |
| [@pyreon/lathe](/docs/lathe) | Spec-to-Pyreon code generator — OpenAPI in, typed schemas / endpoints / queries out, with a multiplatform mode that proves its own output lowers to Swift and Kotlin. |
| [@pyreon/lint](/docs/lint) | Pyreon-specific linter — 133 rules across 25 categories for signals, JSX, lifecycle, SSR, performance, architecture, routing, SSG, and opt-in best practices |
| [@pyreon/loom](/docs/loom) | Monorepo dependency observatory — workspace graph, version-sync drift, cycles, phantom deps, and blast radius, as data. |
| [@pyreon/mcp](/docs/mcp) | MCP server for Pyreon — AI-powered framework assistance |
| [@pyreon/preact-compat](/docs/preact-compat) | Preact-compatible API shim for Pyreon — write Preact-style code that runs on Pyreon's reactive engine |
| [@pyreon/react-compat](/docs/react-compat) | React-compatible API shim for Pyreon — write React-style hooks that run on Pyreon's reactive engine |
| [@pyreon/solid-compat](/docs/solid-compat) | SolidJS-compatible API shim for Pyreon — write Solid-style code that runs on Pyreon's reactive engine |
| [@pyreon/storybook](/docs/storybook) | Storybook renderer for Pyreon — mount, render, and interact with Pyreon components in Storybook |
| [@pyreon/svelte-compat](/docs/svelte-compat) | Svelte-compatible API shim for Pyreon — write Svelte-style stores / lifecycle code that runs on Pyreon's reactive engine |
| [@pyreon/testing](/docs/guides/testing) | Official testing utilities for Pyreon — Testing-Library-style render/screen/fireEvent plus reactive-native matchers |
| [@pyreon/typescript](/docs/typescript) | TypeScript configuration presets for Pyreon projects |
| [@pyreon/vite-plugin](/docs/vite-plugin) | Vite plugin for Pyreon — .pyreon SFC support, HMR, compiler integration |
| [@pyreon/vue-compat](/docs/vue-compat) | Vue 3-compatible Composition API shim for Pyreon — write Vue-style code that runs on Pyreon's reactive engine |

## ui-system (11)

| Package | Description |
| --- | --- |
| [@pyreon/attrs](/docs/attrs) | Attrs HOC chaining for Pyreon components |
| [@pyreon/connector-document](/docs/connector-document) | Bridge between @pyreon/pyreon styled components and @pyreon/document rendering |
| [@pyreon/coolgrid](/docs/coolgrid) | Responsive grid system for Pyreon |
| [@pyreon/document-primitives](/docs/document-primitives) | Rocketstyle document components — render in browser, export to 18 formats |
| [@pyreon/elements](/docs/elements) | Foundational UI components for Pyreon |
| [@pyreon/kinetic](/docs/kinetic) | CSS-transition-based animation components for Pyreon |
| [@pyreon/kinetic-presets](/docs/kinetic-presets) | 120+ animation presets for Pyreon transitions |
| [@pyreon/rocketstyle](/docs/rocketstyle) | Multi-dimensional style composition for Pyreon components |
| [@pyreon/styler](/docs/styler) | Lightweight CSS-in-JS engine for Pyreon |
| [@pyreon/ui-core](/docs/ui-core) | Core utilities, config, and context for Pyreon UI System |
| [@pyreon/unistyle](/docs/unistyle) | Responsive theming and breakpoint utilities for Pyreon |

## zero (6)

| Package | Description |
| --- | --- |
| [@pyreon/create-multiplatform](/docs/create-multiplatform) | Scaffold a multiplatform Pyreon app — one src/App.tsx → web + iOS (SwiftUI) + Android (Compose). Invoke as `create-multiplatform`. |
| [@pyreon/create-zero](/docs/create-zero) | Create a new Pyreon project — invoke as `create-pyreon-app` (canonical) or `create-zero` (alias) |
| [@pyreon/meta](/docs/meta) | Pyreon Meta — barrel package re-exporting the full Pyreon fundamentals ecosystem |
| [@pyreon/zero](/docs/zero) | Pyreon Zero — zero-config full-stack framework powered by Pyreon and Vite |
| [@pyreon/zero-cli](/docs/zero-cli) | CLI for Pyreon Zero — dev, build, preview |
| [@pyreon/zero-content](/docs/zero-content) | Pyreon Zero — content layer for markdown-driven Pyreon sites. Compile-time .md/.mdx → Pyreon JSX, typed content collections (zod), convention-scanned MDX components. |
