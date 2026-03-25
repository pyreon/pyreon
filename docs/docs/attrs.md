---
title: Attrs
description: Chainable component factory for composing default props, styles, and behaviors on Pyreon components.
---

`@pyreon/attrs` provides a chainable component factory (`attrs()`) that lets you compose default props, styles, and behaviors on any Pyreon component. Each `.attrs()` call returns a new component with the merged defaults.

<PackageBadge name="@pyreon/attrs" href="/docs/attrs" />

## Installation

::: code-group
```bash [npm]
npm install @pyreon/attrs
```
```bash [bun]
bun add @pyreon/attrs
```
```bash [pnpm]
pnpm add @pyreon/attrs
```
```bash [yarn]
yarn add @pyreon/attrs
```
:::

## Overview

The `attrs` function wraps a base component and lets you layer default props onto it through a chainable `.attrs()` API. Each call returns a new component -- the original is never mutated. At render time, all layered defaults are merged with the props passed at the call site, with call-site props taking precedence.

This is useful for building design-system components where you want to pre-configure common prop combinations without creating one-off wrapper components.

## Quick Start

```tsx
import attrs from '@pyreon/attrs'

// Start with a base component
const BaseButton = (props) => <button {...props}>{props.children}</button>

// Layer defaults
const Button = attrs(BaseButton)
  .attrs({ type: 'button' })

const PrimaryButton = Button
  .attrs({ class: 'btn-primary', role: 'button' })

const LargePrimaryButton = PrimaryButton
  .attrs({ class: 'btn-primary btn-lg' })

// Use like any component -- call-site props override defaults
<LargePrimaryButton onClick={handleClick}>Submit</LargePrimaryButton>
```

## Dynamic Defaults

Pass a function to `.attrs()` to compute defaults based on incoming props:

```tsx
const Input = attrs(BaseInput)
  .attrs((props) => ({
    'aria-invalid': props.error ? 'true' : undefined,
    class: props.error ? 'input-error' : 'input',
  }))
```

## Chaining

Each `.attrs()` call creates a new component in the chain. Defaults are merged in order -- later calls override earlier ones for the same prop:

```tsx
const Base = attrs(Component)
  .attrs({ variant: 'default', size: 'md' })

const Small = Base
  .attrs({ size: 'sm' })
// Effective defaults: { variant: 'default', size: 'sm' }

const SmallPrimary = Small
  .attrs({ variant: 'primary' })
// Effective defaults: { variant: 'primary', size: 'sm' }
```

## Integration with Rocketstyle

`@pyreon/attrs` is used internally by `@pyreon/rocketstyle` to build its multi-dimensional style composition. You can also use it standalone for simpler prop-composition needs.

## API Reference

| Export | Type | Description |
|---|---|---|
| `attrs` | Function | Wraps a component and returns a chainable attrs builder |
| `isAttrsComponent` | Function | Type guard to check if a value is an attrs-wrapped component |

## Types

| Type | Description |
|---|---|
| `Attrs` | The attrs builder interface with the `.attrs()` method |
| `AttrsComponent` | A component produced by the attrs chain |
| `AttrsCb` | Callback signature for dynamic attrs: `(props) => Partial<Props>` |
| `ConfigAttrs` | Internal configuration type for attrs layers |

## Key Features

- Chainable `.attrs()` API for layering default props
- Static object or dynamic function defaults
- Immutable -- each `.attrs()` call returns a new component
- Call-site props always override defaults
- Works with any Pyreon component
- Used internally by `@pyreon/rocketstyle` for style composition
- Full TypeScript support with inferred prop types
