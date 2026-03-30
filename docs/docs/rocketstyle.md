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

```tsx
import rocketstyle from '@pyreon/rocketstyle'
import { styled } from '@pyreon/styler'

const BaseButton = styled('button')`
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
`

const Button = rocketstyle(BaseButton)
  .theme({
    primary: { background: 'royalblue', color: 'white' },
    danger: { background: '#dc3545', color: 'white' },
    ghost: { background: 'transparent', color: '#333', border: '1px solid #ccc' },
  })
  .size({
    sm: { padding: '4px 8px', fontSize: '12px' },
    md: { padding: '8px 16px', fontSize: '14px' },
    lg: { padding: '12px 24px', fontSize: '16px' },
  })
  .state({
    disabled: { opacity: 0.5, cursor: 'not-allowed' },
    loading: { opacity: 0.7, cursor: 'wait' },
  })

// Dimensions become props
<Button theme="primary" size="lg">Submit</Button>
<Button theme="danger" size="sm" state="disabled">Delete</Button>
<Button theme="ghost" size="md">Cancel</Button>
```

## Dimensions

Rocketstyle supports four built-in dimension types:

| Dimension | Description                                         |
| --------- | --------------------------------------------------- |
| `theme`   | Visual theme (e.g., primary, secondary, danger)     |
| `size`    | Size scale (e.g., sm, md, lg, xl)                   |
| `variant` | Structural variation (e.g., outlined, filled, text) |
| `state`   | Interactive state (e.g., disabled, loading, active) |

Each dimension is defined by calling the corresponding method on the rocketstyle builder and passing a map of named values to style objects or callbacks.

## Style Callbacks

Dimension values can be static objects or dynamic callbacks that receive the component's props and theme:

```tsx
const Card = rocketstyle(BaseCard).theme({
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
const IconButton = rocketstyle(BaseButton)
  .attrs({ 'aria-label': 'icon button' })
  .theme({
    primary: { background: 'royalblue', color: 'white' },
  })
  .size({
    sm: { width: '32px', height: '32px' },
    md: { width: '40px', height: '40px' },
  })
```

## Provider and Context

Rocketstyle components can be configured at the tree level using the built-in `Provider`:

```tsx
import { Provider } from '@pyreon/rocketstyle'

;<Provider value={{ theme: 'dark', size: 'sm' }}>
  {/* All rocketstyle components inside inherit these defaults */}
  <Button>Uses dark theme, sm size</Button>
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
| `Rocketstyle`          | The builder interface with `.theme()`, `.size()`, `.variant()`, `.state()`, `.attrs()` |
| `RocketStyleComponent` | A component produced by the rocketstyle builder                                        |
| `Dimensions`           | Map of dimension names to their value definitions                                      |
| `DimensionProps`       | Props auto-generated from dimension definitions                                        |
| `ThemeMode`            | Theme mode configuration type                                                          |
| `StylesCb`             | Style callback signature: `(props) => StyleObject`                                     |

## Key Features

- Multi-dimensional style composition (theme, size, variant, state)
- Auto-generated props from dimension definitions
- Static style objects or dynamic style callbacks
- Built on `@pyreon/attrs` -- chainable `.attrs()` calls
- Tree-level defaults via Provider/Context
- Works with `@pyreon/styler` for scoped CSS-in-JS
- Full TypeScript support with inferred dimension props
