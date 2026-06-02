---
title: Rocketstyle
description: Multi-dimensional style composition for Pyreon components -- themes, sizes, variants, and states.
---

`@pyreon/rocketstyle` enables multi-dimensional style composition for Pyreon components. Define orthogonal style dimensions (themes, sizes, variants, states) and compose them declaratively.

<PackageBadge name="@pyreon/rocketstyle" href="/docs/rocketstyle" />

## Installation

::: code-group

```bash [npm]
npm install @pyreon/rocketstyle
```

```bash [bun]
bun add @pyreon/rocketstyle
```

```bash [pnpm]
pnpm add @pyreon/rocketstyle
```

```bash [yarn]
yarn add @pyreon/rocketstyle
```

:::

## Overview

Rocketstyle lets you define multiple independent style dimensions on a component -- for example, `theme`, `size`, `variant`, and `state`. Each dimension has a set of named values, and each value maps to a style callback. At render time, the active value from each dimension is resolved and all styles are merged together.

This approach scales better than flat variant props because dimensions compose multiplicatively without requiring you to enumerate every combination.

## Quick Start

The canonical chain is `.config(...)` → `.attrs(...)` → `.theme((t) => ({...}))` → dimension methods (`.states` / `.sizes` / `.variants` / `.multiple` / `.modifiers`).

```tsx
import rocketstyle from '@pyreon/rocketstyle'

// Create the rocketstyle factory once (per app / per design system).
// `useBooleans: false` is the default since 2026-04 — dimension props
// accept string values (`state="primary"`), not boolean shorthand.
const rs = rocketstyle({ useBooleans: false })

const Button = rs('button')
  .config({ name: 'Button' })
  .attrs({
    tag: 'button',
    direction: 'inline',
    alignX: 'center',
    alignY: 'center',
    gap: 8,
  })
  .theme((t) => ({
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500,
    border: 'none',
  }))
  .states({
    primary: { background: 'royalblue', color: 'white' },
    danger: { background: '#dc3545', color: 'white' },
    ghost: { background: 'transparent', color: '#333', borderWidth: '1px', borderColor: '#ccc' },
  })
  .sizes({
    sm: { padding: '4px 8px', fontSize: '12px' },
    md: { padding: '8px 16px', fontSize: '14px' },
    lg: { padding: '12px 24px', fontSize: '16px' },
  })

// Dimensions become props
<Button state="primary" size="lg">Submit</Button>
<Button state="danger" size="sm">Delete</Button>
<Button state="ghost" size="md">Cancel</Button>
```

::: tip Dimension method names
Pay attention to the **plural** suffix: dimension methods are `.states()`, `.sizes()`, `.variants()` — not `.state()` / `.size()` / `.variant()`. The singular forms (`state`, `size`, `variant`) are the **prop names** the consumer passes (`<Button state="primary">`). The plural forms are the **definition methods** that declare every valid value for that prop.

`.theme(...)` accepts a CALLBACK receiving the theme — it's the styled-callback that returns base CSS, NOT a dimension definition. The base theme is always-applied; dimensions are conditional based on the prop value.
:::

## Dimensions

Rocketstyle supports five built-in dimension types — every one is optional:

| Method | Prop name | Multi? | Description |
| --- | --- | --- | --- |
| `.states(...)` | `state` | no | Interactive state (e.g., `primary`, `secondary`, `disabled`, `loading`). |
| `.sizes(...)` | `size` | no | Size scale (e.g., `sm`, `md`, `lg`, `xl`). |
| `.variants(...)` | `variant` | no | Structural variation (e.g., `outlined`, `filled`, `text`). |
| `.multiple(...)` | `multiple` | yes | Multi-select dimension — accepts an array of values that compose. |
| `.modifiers(...)` | `modifier` | yes | Multi-select with prop-name transform — for cross-cutting style flags. |

Each dimension is defined by calling its method with a map of named values to style objects or styled-callbacks. Custom dimensions can be declared via `rocketstyle({ dimensions: { ... } })` at factory-init time.

## Style Callbacks

Dimension values can be static objects or dynamic callbacks that receive the component's props and theme:

```tsx
const Card = rs('div')
  .states({
    light: { background: '#fff', color: '#333' },
    dark: (props) => ({
      background: props.elevated ? '#2d2d2d' : '#1a1a1a',
      color: '#e0e0e0',
    }),
  })
```

## Chaining with Attrs

Rocketstyle builds on `@pyreon/attrs`, so you can chain `.attrs()` calls alongside dimension definitions:

```tsx
const IconButton = rs('button')
  .config({ name: 'IconButton' })
  .attrs({ 'aria-label': 'icon button', direction: 'inline', alignX: 'center', alignY: 'center' })
  .states({
    primary: { background: 'royalblue', color: 'white' },
  })
  .sizes({
    sm: { width: '32px', height: '32px' },
    md: { width: '40px', height: '40px' },
  })
```

## Provider and Context

Rocketstyle components can be configured at the tree level using the built-in `Provider`:

```tsx
import { Provider } from '@pyreon/rocketstyle'

;<Provider value={{ state: 'dark', size: 'sm' }}>
  {/* All rocketstyle components inside inherit these defaults */}
  <Button>Uses dark state, sm size</Button>
  <Card>Also dark and small</Card>
</Provider>
```

## Integration with Styler

Rocketstyle is designed to work with `@pyreon/styler`. Dimension style objects are resolved into CSS classes via the styler's `styled` API, giving you scoped styles with deduplication and SSR support.

## API Reference

| Export              | Type      | Description                                                   |
| ------------------- | --------- | ------------------------------------------------------------- |
| `rocketstyle`       | Function  | Wraps a component and returns a multi-dimension style builder |
| `Provider`          | Component | Context provider for tree-level dimension defaults            |
| `context`           | Context   | The raw Pyreon context object used by Provider                |
| `isRocketComponent` | Function  | Type guard to check if a value is a rocketstyle component     |

## Types

| Type                   | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `Rocketstyle`          | The builder interface with `.config()`, `.attrs()`, `.theme()`, `.states()`, `.sizes()`, `.variants()`, `.multiple()`, `.modifiers()` |
| `RocketStyleComponent` | A component produced by the rocketstyle builder                                        |
| `Dimensions`           | Map of dimension names to their value definitions                                      |
| `DimensionProps`       | Props auto-generated from dimension definitions                                        |
| `ThemeMode`            | Theme mode configuration type                                                          |
| `StylesCb`             | Style callback signature: `(props) => StyleObject`                                     |

## Key Features

- Multi-dimensional style composition (states, sizes, variants, multiple, modifiers + custom)
- Auto-generated props from dimension definitions
- Static style objects or dynamic style callbacks
- Built on `@pyreon/attrs` -- chainable `.attrs()` calls
- Tree-level defaults via Provider/Context
- Works with `@pyreon/styler` for scoped CSS-in-JS
- Full TypeScript support with inferred dimension props
- **Compile-time wrapper collapse** (opt-in) — literal-prop call sites like `<Button state="primary" size="medium">Save</Button>` collapse the 5-layer mount (rocketstyle → attrs → Element → Wrapper → styled) into one `cloneNode` at build time (~44× faster for that shape). Enable via `pyreon({ collapse: true })` — see [Compile-time rocketstyle collapse](/docs/vite-plugin#compile-time-rocketstyle-collapse).
