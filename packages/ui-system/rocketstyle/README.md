# @pyreon/rocketstyle

Multi-dimensional styling system for Pyreon.

Organize component styles by dimensions — states, sizes, variants — instead of flat props. Chain theme values, attach CSS via `@pyreon/styler`, and get full TypeScript inference. Built-in pseudo-state handling, light/dark mode, and provider/consumer patterns for parent-child state propagation.

## Features

- **Dimension-based theming** — define style variations as named dimensions (states, sizes, variants)
- **Immutable chaining** — `.attrs()`, `.theme()`, `.states()`, `.sizes()`, `.styles()` and more
- **Boolean shorthand** — `Button({ primary: true, lg: true })` instead of `Button({ state: 'primary', size: 'lg' })`
- **Pseudo-state detection** — hover, focus, pressed tracked via signals and context
- **Light/dark mode** — theme callbacks receive a mode parameter
- **Provider/Consumer** — propagate parent state to children through context
- **WeakMap caching** — computed themes cached per component instance
- **TypeScript inference** — dimension values and prop types inferred through the chain

## Installation

```bash
bun add @pyreon/rocketstyle
```

## Quick Start

```ts
import rocketstyle from '@pyreon/rocketstyle'
import { Element } from '@pyreon/elements'

const Button = rocketstyle()({
  name: 'Button',
  component: Element,
})
  .attrs({ tag: 'button' })
  .theme({
    fontSize: 16,
    paddingX: 16,
    paddingY: 8,
    borderRadius: 4,
    color: '#fff',
    backgroundColor: '#0d6efd',
    hover: {
      backgroundColor: '#0b5ed7',
    },
  })
  .states({
    primary: {
      backgroundColor: '#0d6efd',
      hover: { backgroundColor: '#0b5ed7' },
    },
    danger: {
      backgroundColor: '#dc3545',
      hover: { backgroundColor: '#bb2d3b' },
    },
    success: {
      backgroundColor: '#198754',
      hover: { backgroundColor: '#157347' },
    },
  })
  .sizes({
    sm: { fontSize: 14, paddingX: 12, paddingY: 6 },
    md: { fontSize: 16, paddingX: 16, paddingY: 8 },
    lg: { fontSize: 18, paddingX: 20, paddingY: 10 },
  })
```

```ts
// Named props
Button({ state: 'danger', size: 'lg', label: 'Delete' })

// Boolean shorthand (when useBooleans is enabled)
Button({ danger: true, lg: true, label: 'Delete' })
```

## Core Concepts

### Dimensions

A dimension is a named axis of style variation. The factory ships with four defaults:

| Dimension | Prop name | Multi | Example |
| --------- | --------- | ----- | ------- |
| `states` | `state` | no | `primary`, `danger`, `success` |
| `sizes` | `size` | no | `sm`, `md`, `lg` |
| `variants` | `variant` | no | `outlined`, `filled` |
| `multiple` | — | yes | `rounded`, `shadow` |

Each dimension creates a chain method (`.states()`, `.sizes()`, etc.) and a corresponding prop on the component.

**Multi dimensions** allow multiple values at once: `Button({ rounded: true, shadow: true })`.

### Theme Object

The `.theme()` method defines base CSS property values. Values are processed by `@pyreon/unistyle` — numbers convert to rem, shorthand properties expand automatically.

Pseudo-state keys nest directly in the theme object:

```ts
.theme({
  color: '#333',
  fontSize: 16,
  hover: { color: '#000' },
  focus: { outline: '2px solid blue' },
  active: { transform: 'scale(0.98)' },
})
```

### Styles Function

The `.styles()` method defines the CSS template that receives the computed theme:

```ts
.styles((css) => css`
  ${({ $rocketstyle, $rocketstate }) => {
    // $rocketstyle — computed theme values (base + active dimension values merged)
    // $rocketstate — { hover, focus, pressed, active, disabled, pseudo }
    return css`...`
  }}
`)
```

## API

### rocketstyle(options?)

Factory initializer. Returns a function that accepts component configuration.

```ts
const factory = rocketstyle({
  dimensions: { /* custom dimensions */ },
  useBooleans: true,
})

const Component = factory({
  name: 'ComponentName',
  component: BaseComponent,
})
```

### .attrs(props | callback, options?)

Same API as `@pyreon/attrs`. Define default props with optional priority and filter.

```ts
Button.attrs({ tag: 'button', role: 'button' })
Button.attrs((props) => ({ 'aria-label': props.label }))
```

### .theme(values | callback)

Base theme values applied to every instance.

```ts
// Object form
Button.theme({
  fontSize: 16,
  color: '#fff',
  hover: { opacity: 0.9 },
})

// Callback form — receives the theme context and mode
Button.theme((theme, mode, css) => ({
  fontSize: 16,
  color: mode === 'dark' ? '#fff' : '#333',
}))
```

### .states() / .sizes() / .variants() / .multiple()

Define values for each dimension. Each key becomes a selectable option.

```ts
Button.states({
  primary: { backgroundColor: '#0d6efd' },
  danger: { backgroundColor: '#dc3545' },
})

Button.sizes({
  sm: { fontSize: 14, paddingX: 8 },
  lg: { fontSize: 18, paddingX: 20 },
})

// Multi dimension — multiple can be active at once
Button.multiple({
  rounded: { borderRadius: 999 },
  shadow: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' },
})
```

Dimension methods also accept callbacks:

```ts
Button.states((theme, mode, css) => ({
  primary: { backgroundColor: theme.colors?.primary ?? '#0d6efd' },
}))
```

### .styles(callback)

Define the CSS template using `@pyreon/styler`'s `css` tagged template.

```ts
Button.styles((css) => css`
  cursor: pointer;
  border: none;
  transition: all 0.2s;

  ${({ $rocketstyle }) =>
    makeItResponsive({ theme: $rocketstyle, styles, css })
  }
`)
```

### .config(options)

Reconfigure the component.

```ts
Button.config({
  name: 'PrimaryButton',    // change displayName
  component: NewBase,        // swap base component
  provider: true,            // make this component a context provider
  consumer: (ctx) => ...,   // consume parent component context
  inversed: true,            // invert theme mode
  DEBUG: true,               // enable debug logging
})
```

### .compose(hocs) / .statics(metadata)

Same API as `@pyreon/attrs`:

```ts
Button.compose({ withTracking: trackingHoc })
Button.statics({ category: 'action' })

Button.meta.category // => 'action'
```

### isRocketComponent(value)

Runtime type guard.

```ts
import { isRocketComponent } from '@pyreon/rocketstyle'

isRocketComponent(Button) // => true
```

## Custom Dimensions

Define your own dimensions by passing them to the factory:

```ts
const rocketButton = rocketstyle({
  dimensions: {
    intent: 'intent',                    // prop: intent="primary"
    size: 'size',                        // prop: size="lg"
    appearance: {
      propName: 'appearance',
      multi: true,                       // allows multiple values
    },
  },
})
```

This creates `.intent()`, `.size()`, and `.appearance()` chain methods.

## Transform Dimensions

Mark a dimension as `transform: true` to make its values receive the accumulated theme from all prior dimensions. This is ideal for modifiers like `outlined` that derive styles from the active state:

```ts
const rocketButton = rocketstyle({
  dimensions: {
    states: 'state',
    modifiers: { propName: 'modifier', multi: true, transform: true },
  },
})

const Button = rocketButton({ name: 'Button', component: Element })
  .theme({ backgroundColor: '#0d6efd', color: '#fff' })
  .states({
    danger: { backgroundColor: '#dc3545', color: '#fff' },
  })
  .modifiers({
    outlined: (theme) => ({
      color: theme.backgroundColor,
      backgroundColor: 'transparent',
    }),
  })

// outlined receives { backgroundColor: '#dc3545', color: '#fff' } from the danger state
Button({ state: 'danger', modifier: 'outlined' })
```

## Provider / Consumer

Propagate parent component state to children through Pyreon's context system.

```ts
// Parent provides its state
const ButtonGroup = Button.config({ provider: true })

// Child consumes parent state
const ButtonIcon = rocketstyle()({
  name: 'ButtonIcon',
  component: Element,
})
  .config({
    consumer: (ctx) => ctx(({ pseudo }) => ({
      state: pseudo.hover ? 'active' : 'default',
    })),
  })
  .states({
    default: { color: '#666' },
    active: { color: '#fff' },
  })

// Icon reacts to parent's hover state
ButtonGroup({ state: 'primary', children: [
  ButtonIcon({}),
  'Label',
]})
```

## Light / Dark Mode

Theme callbacks receive a `mode` parameter:

```ts
Button.theme((theme, mode) => ({
  color: mode === 'dark' ? '#fff' : '#1a1a1a',
  backgroundColor: mode === 'dark' ? '#333' : '#fff',
}))
```

Use `inversed: true` in `.config()` to flip the mode for a component subtree.

## Peer Dependencies

| Package | Version |
| ------- | ------- |
| @pyreon/core | * |
| @pyreon/reactivity | * |
| @pyreon/ui-core | * |
| @pyreon/styler | * |

## License

MIT
