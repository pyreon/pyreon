# @pyreon/rocketstyle

Multi-dimensional component styling — states, sizes, variants, themes, light/dark, all cached.

`@pyreon/rocketstyle` is the styling layer Pyreon's UI system builds on. Organize styles by named DIMENSIONS — `state` (`primary` / `danger` / `success`), `size` (`sm` / `md` / `lg`), `variant`, plus any custom dimension you declare — instead of flat boolean props. Each dimension is a chainable method (`.states({...})`, `.sizes({...})`); per-dimension values are themed via `.theme()` callbacks that receive `(theme, mode, css)`, with light/dark mode threaded through and pseudo-states (`hover` / `focus` / `pressed` / `active` / `disabled`) auto-detected. Built on `@pyreon/attrs` + `@pyreon/styler`. Per-definition WeakMap caches make per-mount cost near zero for same-definition components — verified 73% reduction in `styler.resolve` calls on real-app benchmarks.

## Install

```bash
bun add @pyreon/rocketstyle @pyreon/core @pyreon/reactivity @pyreon/ui-core @pyreon/styler
```

## Quick start

```tsx
import rocketstyle from '@pyreon/rocketstyle'
import { Element } from '@pyreon/elements'

const Button = rocketstyle()({ name: 'Button', component: Element })
  .attrs({ tag: 'button' })
  .theme({
    fontSize: 16,
    paddingX: 16,
    paddingY: 8,
    borderRadius: 4,
    color: '#fff',
    backgroundColor: '#0d6efd',
    hover: { backgroundColor: '#0b5ed7' },
  })
  .states({
    primary: { backgroundColor: '#0d6efd', hover: { backgroundColor: '#0b5ed7' } },
    danger:  { backgroundColor: '#dc3545', hover: { backgroundColor: '#bb2d3b' } },
    success: { backgroundColor: '#198754', hover: { backgroundColor: '#157347' } },
  })
  .sizes({
    sm: { fontSize: 14, paddingX: 12, paddingY: 6 },
    md: { fontSize: 16, paddingX: 16, paddingY: 8 },
    lg: { fontSize: 18, paddingX: 20, paddingY: 10 },
  })

<Button state="danger" size="lg">Delete</Button>
```

## Core concepts

### Dimensions

A dimension is a named axis of style variation. Defaults ship four:

| Dimension  | Prop name | Multi? | Example                        |
| ---------- | --------- | ------ | ------------------------------ |
| `states`   | `state`   | no     | `primary`, `danger`, `success` |
| `sizes`    | `size`    | no     | `sm`, `md`, `lg`               |
| `variants` | `variant` | no     | `outlined`, `filled`           |
| `multiple` | —         | yes    | `rounded`, `shadow`            |

Each declared dimension creates a chain method AND a corresponding prop on the component. Multi-dimensions accept multiple active values at once.

### Default: `useBooleans: false` (string prop values)

```tsx
<Button state="primary" size="lg">Save</Button>
```

Boolean shorthand (`<Button primary lg>Save</Button>`) is opt-in via `rocketstyle({ useBooleans: true })`. **Important**: before April 2026 the type default was `true` but the runtime was `false` — boolean props typechecked but were silently dropped at runtime. Fixed in `rocketstyle/init.ts`; new code should not rely on the historical behaviour.

### Theme + pseudo-states

```ts
.theme({
  color: '#333',
  fontSize: 16,
  hover:    { color: '#000' },
  focus:    { outline: '2px solid blue' },
  active:   { transform: 'scale(0.98)' },
  disabled: { opacity: 0.5 },
})
```

Pseudo-state keys nest directly. Bases (`@pyreon/elements`) generate `:hover` / `:focus-visible` / `:active` / `:disabled` CSS from the nested objects. `:hover` is unconditional — applied to EVERY component with hover theme; only `cursor: pointer` is gated on `onClick` / `href`.

### Styles callback

```ts
.styles((css) => css`
  cursor: pointer;
  border: none;
  transition: all 0.2s;

  ${({ $rocketstyle, $rocketstate }) => {
    // $rocketstyle — computed theme (base + active dimension values merged)
    // $rocketstate — { hover, focus, pressed, active, disabled, pseudo }
    return /* css string */
  }}
`)
```

`$rocketstyle` is identity-cached — same dimension-prop combo produces the same object identity, which lets the styler's `classCache` skip resolve work entirely on cache hits.

## API

### `rocketstyle(options?)({ name, component })`

Factory initializer. Returns a function that accepts component configuration.

```ts
const factory = rocketstyle({
  dimensions: { /* custom dimensions */ },
  useBooleans: true,
})

const Button = factory({ name: 'Button', component: Element })
```

### `.attrs(props | callback, options?)`

Same as `@pyreon/attrs` — accumulate defaults, supports callback / priority / filter.

### `.theme(values | callback)`

Base theme applied to every instance.

```ts
.theme({ fontSize: 16, color: '#fff', hover: { opacity: 0.9 } })
.theme((theme, mode, css) => ({
  fontSize: 16,
  color: mode === 'dark' ? '#fff' : '#333',
}))
```

### `.states()` / `.sizes()` / `.variants()` / `.multiple()`

Define per-dimension values.

```ts
.states({ primary: { backgroundColor: '#0d6efd' }, danger: { backgroundColor: '#dc3545' } })
.sizes({ sm: { fontSize: 14, paddingX: 8 }, lg: { fontSize: 18, paddingX: 20 } })
.multiple({ rounded: { borderRadius: 999 }, shadow: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' } })

// Callback form — receives (theme, mode, css)
.states((theme) => ({
  primary: { backgroundColor: theme.colors?.primary ?? '#0d6efd' },
}))
```

### `.styles(callback)`

CSS template using `@pyreon/styler`'s `css` tagged template.

### `.config(options)`

```ts
Button.config({
  name: 'PrimaryButton',
  component: NewBase,         // swap base — resets prop chains
  provider: true,             // make this a context provider for children
  consumer: (ctx) => …,       // consume parent component context
  inversed: true,             // invert theme mode for subtree
  DEBUG: true,
})
```

### `.compose(hocs)` / `.statics(metadata)`

Same API as `@pyreon/attrs`.

### `isRocketComponent(value)` / `resolveTheme(value)`

Runtime guard and theme accessor for use inside styled-component interpolations:

```ts
import { isRocketComponent, resolveTheme } from '@pyreon/rocketstyle'

isRocketComponent(Button) // true

styled(Component)`
  color: ${(props) => resolveTheme(props.$rocketstyle).color};
`
```

`resolveTheme` handles both function-accessor (reactive) and plain-object `$rocketstyle` shapes.

## Custom dimensions

```ts
const rocketButton = rocketstyle({
  dimensions: {
    intent: 'intent',                                  // prop: intent="primary"
    size:   'size',
    appearance: { propName: 'appearance', multi: true },
  },
})
```

Creates `.intent()`, `.size()`, `.appearance()` chain methods.

### Transform dimensions

Mark `transform: true` to make a dimension receive the accumulated theme from all prior dimensions — ideal for modifiers like `outlined` that derive from the active state.

```ts
const rocketButton = rocketstyle({
  dimensions: {
    states: 'state',
    modifiers: { propName: 'modifier', multi: true, transform: true },
  },
})

const Button = rocketButton({ name: 'Button', component: Element })
  .theme({ backgroundColor: '#0d6efd', color: '#fff' })
  .states({ danger: { backgroundColor: '#dc3545', color: '#fff' } })
  .modifiers({
    outlined: (theme) => ({
      color: theme.backgroundColor,        // receives merged theme from prior dimensions
      backgroundColor: 'transparent',
    }),
  })

<Button state="danger" modifier="outlined" />  // outlined sees danger's red, becomes red-on-transparent
```

## Provider / Consumer — parent-child state propagation

```ts
// Parent provides its state
const ButtonGroup = Button.config({ provider: true })

// Child consumes parent state
const ButtonIcon = rocketstyle()({ name: 'ButtonIcon', component: Element })
  .config({
    consumer: (ctx) => ctx(({ pseudo }) => ({
      state: pseudo.hover ? 'active' : 'default',
    })),
  })
  .states({
    default: { color: '#666' },
    active:  { color: '#fff' },
  })

<ButtonGroup state="primary">
  <ButtonIcon />
  Label
</ButtonGroup>
```

## Light / dark mode

Theme + dimension callbacks receive `(theme, mode, css)`. `mode === 'light' | 'dark'`. Use `inversed: true` on `.config()` to flip the mode for a subtree.

```ts
Button.theme((theme, mode) => ({
  color: mode === 'dark' ? '#fff' : '#1a1a1a',
  backgroundColor: mode === 'dark' ? '#333' : '#fff',
}))
```

## Performance

Per-definition WeakMap caches keep per-mount cost flat as instance count grows:

- **`_dimensionsCache`** — `getDimensionsMap` result keyed on dimension-themes identity
- **`_reservedKeysCache`** — `Object.keys(reservedPropNames)` keyed on keywords identity
- **`_omitSetCache`** — pre-built `Set<string>` for `omit()` (avoids per-mount Set allocation)
- **`LocalThemeManager`** — WeakMap tiers for baseTheme, dimensionThemes, and per-mode resolved themes
- **`_rsMemo`** — dimension-prop memo keyed by `mode|dimensionPropTuple|pseudoState`, LRU-bounded at 128 entries per theme. Hit returns identity-stable `{ rocketstyle, rocketstate }` so the downstream styler `classCache` skips resolve entirely. Real-app E2 benchmark: 200 Buttons × 5 runs, baseline dropped from 8.80ms to 4.80ms (-45%); per-Button `styler.resolve` from 22 to 6 (-73%).

Real apps MUST mount one shared `<PyreonUI>` provider for the memo to span instances — each provider mount creates a fresh `enrichedTheme` via `computed()`, which produces a different WeakMap key.

For a 150-component page with 8 dimensions each: ~1,350 Set allocations, ~300 array spreads, and ~150 map rebuilds eliminated vs naive implementation.

## Gotchas

- **`.config({ component: NewBase })` resets `attrs` / `priorityAttrs` / `filterAttrs` / `compose` chains** — they were tailored to the previous component's prop shape. `theme` / `styles` / dimension chains are preserved. Re-chain shared attrs explicitly if you swap the base.
- **`useBooleans: false` is the default** (since April 2026 alignment fix). String props are the idiomatic surface.
- **Cache keys are downstream of normalization.** Under `useBooleans: true`, the memo correctly keys by the resolved dimension (not the raw boolean prop) — otherwise every boolean variant would collide on the first cached entry.
- **Dimension props don't accept function accessors directly.** `state={() => signal()}` is wrong — write `state={signal()}` and let the compiler emit reactive `_rp()` wrapping. Caught by the Reactivity Lens.
- **`provider: true` + `consumer:` on the same component** is a legal but rare shape. Most apps separate the two for clarity.

## Documentation

Full docs: [pyreon.dev/docs/rocketstyle](https://pyreon.dev/docs/rocketstyle) (or `docs/src/content/docs/rocketstyle.md` in this repo).

## License

MIT
