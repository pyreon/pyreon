---
title: Pyreon
description: A signal-based UI framework with fine-grained reactivity and a rich ecosystem.
---

Pyreon is a signal-based UI framework that renders directly to the DOM without a virtual DOM. It provides fine-grained reactivity, streaming SSR, a JSX compiler, and compatibility layers for React, Vue, Solid, and Preact.

<div class="flex flex-wrap gap-2 my-6">
  <PackageBadge name="@pyreon/core" href="/docs/core" />
  <PackageBadge name="@pyreon/reactivity" href="/docs/reactivity" />
  <PackageBadge name="@pyreon/zero" href="/docs/zero" />
  <PackageBadge name="@pyreon/router" href="/docs/router" />
</div>

## Core Framework

The foundation — reactivity engine, component model, renderers, router, and build tooling.

| Package | Description |
|---------|-------------|
| [@pyreon/reactivity](/docs/reactivity) | Signals, computed values, effects, stores, and resources |
| [@pyreon/core](/docs/core) | Component model, JSX runtime, lifecycle hooks, control flow |
| [@pyreon/compiler](/docs/compiler) | JSX compiler with reactivity wrapping and static hoisting |
| [@pyreon/runtime-dom](/docs/runtime-dom) | DOM renderer — mount, hydrate, transitions, keep-alive |
| [@pyreon/runtime-server](/docs/runtime-server) | SSR/SSG with streaming Suspense and store isolation |
| [@pyreon/router](/docs/router) | Type-safe routing with nested routes, guards, and loaders |
| [@pyreon/head](/docs/head) | Reactive document head management with SSR support |
| [@pyreon/server](/docs/server) | SSR handler, SSG, island architecture, and middleware |
| [@pyreon/vite-plugin](/docs/vite-plugin) | Vite integration with JSX transform and HMR |
| [@pyreon/typescript](/docs/typescript) | Shared TypeScript configuration presets |
| [@pyreon/cli](/docs/cli) | CLI tools — doctor, generate, and context commands |
| [@pyreon/mcp](/docs/mcp) | MCP server for AI-assisted development |

## Compatibility Layers

Use the API you already know, powered by Pyreon's signal engine.

| Package | Description |
|---------|-------------|
| [@pyreon/react-compat](/docs/react-compat) | React hooks API — useState, useEffect, useMemo, etc. |
| [@pyreon/preact-compat](/docs/preact-compat) | Preact API — h(), Component class, signals integration |
| [@pyreon/solid-compat](/docs/solid-compat) | SolidJS API — createSignal, createEffect, control flow |
| [@pyreon/vue-compat](/docs/vue-compat) | Vue 3 Composition API — ref, computed, reactive, watch |

<CompatMatrix
  :features='[
    "Signals / reactive state",
    "Computed / derived values",
    "Effects / watchers",
    "Lifecycle hooks",
    "Control flow components",
    "Component model",
    "Context / provide-inject",
    "Store / state management",
  ]'
  :layers='[
    { name: "React", support: ["full", "full", "full", "full", "partial", "full", "full", "partial"] },
    { name: "Preact", support: ["full", "full", "full", "full", "partial", "full", "full", "partial"] },
    { name: "Solid", support: ["full", "full", "full", "full", "full", "full", "full", "full"] },
    { name: "Vue", support: ["full", "full", "full", "full", "partial", "full", "full", "full"] },
  ]'
/>

## State & Data

Signal-native state management, forms, i18n, and data fetching.

| Package | Description |
|---------|-------------|
| [@pyreon/store](/docs/store) | Pinia-inspired composition stores with SSR isolation |
| [@pyreon/state-tree](/docs/state-tree) | Structured state tree with snapshots, patches, and middleware |
| [@pyreon/form](/docs/form) | Signal-based form management with field arrays |
| [@pyreon/validation](/docs/validation) | Schema validation adapters for Zod, Valibot, and ArkType |
| [@pyreon/i18n](/docs/i18n) | Reactive i18n with async namespace loading |
| [@pyreon/query](/docs/query) | TanStack Query adapter with Suspense and SSR dehydration |
| [@pyreon/table](/docs/table) | TanStack Table adapter for reactive table state |
| [@pyreon/virtual](/docs/virtual) | TanStack Virtual adapter for virtual scrolling |
| [@pyreon/machine](/docs/machine) | Reactive state machines with type-safe transitions |
| [@pyreon/storage](/docs/storage) | Reactive client-side storage — localStorage, sessionStorage, cookies, IndexedDB |
| [@pyreon/permissions](/docs/permissions) | Type-safe reactive permissions — RBAC, ABAC, feature flags |
| [@pyreon/hotkeys](/docs/hotkeys) | Keyboard shortcut management with scopes and modifiers |

## Meta-Framework

Zero-config full-stack framework and developer tooling.

| Package | Description |
|---------|-------------|
| [@pyreon/zero](/docs/zero) | Full-stack meta-framework — file routing, SSR/SSG/ISR, optimized components |
| [@pyreon/create-zero](/docs/create-zero) | Project scaffolding for new Zero applications |
| [@pyreon/meta](/docs/meta) | Barrel package re-exporting the full fundamentals ecosystem |
| [@pyreon/storybook](/docs/storybook) | Storybook renderer for developing and documenting Pyreon components |

## UI System

Styling, theming, components, hooks, and animations.

| Package | Description |
|---------|-------------|
| [@pyreon/ui-core](/docs/ui-core) | Core initialization, CSS engine connector, and shared utilities |
| [@pyreon/styler](/docs/styler) | CSS-in-JS engine with theme support |
| [@pyreon/unistyle](/docs/unistyle) | Responsive breakpoints and media query utilities |
| [@pyreon/hooks](/docs/hooks) | 16 signal-based hooks for common UI patterns |
| [@pyreon/elements](/docs/elements) | Foundational components — Element, List, Overlay, Portal, Text |
| [@pyreon/attrs](/docs/attrs) | Chainable component factory for composing default props |
| [@pyreon/rocketstyle](/docs/rocketstyle) | Multi-dimensional style composition — themes, sizes, variants |
| [@pyreon/coolgrid](/docs/coolgrid) | Responsive grid system with Container, Row, Col |
| [@pyreon/kinetic](/docs/kinetic) | CSS-transition animation components — Transition, Stagger, Collapse |
| [@pyreon/kinetic-presets](/docs/kinetic-presets) | 120+ animation presets and composition utilities |
| [@pyreon/connector-document](/docs/connector-document) | Bridge between styled components and @pyreon/document |
| [@pyreon/document-primitives](/docs/document-primitives) | Rocketstyle document components for multi-format export |

## Ecosystem

Specialized packages for rich application features.

| Package | Description |
|---------|-------------|
| [@pyreon/document](/docs/document) | Universal document rendering — one template, 14+ output formats |
| [@pyreon/charts](/docs/charts) | Reactive ECharts bridge with lazy loading |
| [@pyreon/code](/docs/code) | Reactive CodeMirror 6 code editor with signals |
| [@pyreon/flow](/docs/flow) | Reactive flow diagrams with signal-native nodes and auto-layout |
| [@pyreon/feature](/docs/feature) | Schema-driven CRUD primitives with auto-generated hooks |

## Developer Tools

| Package | Description |
|---------|-------------|
| [@pyreon/devtools](/docs/devtools) | Chrome DevTools extension for component tree and signal inspection |

## Quick Start

Install the core packages:

::: code-group
```bash [npm]
npm install @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```
```bash [bun]
bun add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```
```bash [pnpm]
pnpm add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```
```bash [yarn]
yarn add @pyreon/core @pyreon/reactivity @pyreon/runtime-dom @pyreon/vite-plugin
```
:::

Create a component:

```tsx
import { signal, computed } from '@pyreon/reactivity'
import { defineComponent, Show } from '@pyreon/core'
import { mount } from '@pyreon/runtime-dom'

const count = signal(0)
const doubled = computed(() => count() * 2)

const App = defineComponent(() => {
  return () => (
    <div>
      <button onClick={() => count(count() + 1)}>
        Count: {count()} (doubled: {doubled()})
      </button>
      <Show when={() => count() > 5}>
        <p>Count is greater than 5!</p>
      </Show>
    </div>
  )
})

mount(App, document.getElementById('app')!)
```
