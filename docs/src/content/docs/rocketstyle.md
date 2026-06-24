---
title: Rocketstyle
description: Multi-dimensional style composition for Pyreon components — states, sizes, variants, themes, and dark/light mode.
---

`@pyreon/rocketstyle` is Pyreon's multi-state styling engine. Define orthogonal style **dimensions** (`state`, `size`, `variant`, + custom) on a component, and rocketstyle resolves the active value from each dimension at render time and merges them into one theme — so styles compose **multiplicatively** instead of forcing you to enumerate every combination by hand.

<PackageBadge name="@pyreon/rocketstyle" href="/docs/rocketstyle" />

## Installation

:::code-group

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

## Why Rocketstyle?

A real button has a `state` (primary / danger / ghost), a `size` (sm / md / lg), and a structural `variant` (solid / outline / ghost) — and each may also need to flip between light and dark mode. With flat variant props you end up enumerating the cartesian product:

```tsx
// ❌ Flat variants — every combination is a separate, hand-written case
// 4 states × 3 sizes × 5 variants × 2 modes = 120 combinations to maintain
const styles = {
  'primary-sm-solid-light': { /* ... */ },
  'primary-sm-solid-dark': { /* ... */ },
  'primary-md-solid-light': { /* ... */ },
  // ...117 more
}
```

Rocketstyle inverts this: you describe each **dimension independently**, and the engine merges the active value from every dimension at render time.

```tsx
// ✅ Dimensions compose — define each axis ONCE
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: '4px', cursor: 'pointer' })) // always-applied base
  .states({ primary: { /* ... */ }, danger: { /* ... */ }, ghost: { /* ... */ } })
  .sizes({ sm: { /* ... */ }, md: { /* ... */ }, lg: { /* ... */ } })
  .variants({ solid: {}, outline: { /* ... */ } })

// Each dimension becomes a prop:
<Button state="primary" size="lg" variant="solid">Submit</Button>
```

Resolution at render time is: **base theme → matched `state` slice → matched `size` slice → matched `variant` slice**, deep-merged in that order, then handed to the styling layer (`@pyreon/styler`) which produces a deduplicated, SSR-safe CSS class.

## The Factory

Calling `rocketstyle(config?)` returns a **component factory**. You call that factory with `{ name, component }` to wrap a base component into a chainable rocketstyle builder.

```tsx
import rocketstyle from '@pyreon/rocketstyle'

// 1. Create the factory once (per app / per design system)
const rs = rocketstyle({ useBooleans: false }) // useBooleans: false is the default

// 2. Wrap a base component — `name` is required, `component` is required
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: '4px', cursor: 'pointer', fontWeight: 500 }))
  .states({
    primary: { background: 'royalblue', color: 'white' },
    danger: { background: '#dc3545', color: 'white' },
  })
```

:::warning{title="The factory takes `{ name, component }`, not a tag string"}
`rocketstyle()` returns a function whose argument is the object `{ name, component }` — `rs({ name: 'Button', component: 'button' })`. Both keys are **required** (in dev mode, a missing `name`, `component`, or `dimensions` throws). There is no `rs('button')` string-tag shorthand.
:::

`rocketstyle()` accepts two optional config fields:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `dimensions` | `Record<string, DimensionValue>` | the 5 built-ins | Override or add dimension definitions (see [Custom Dimensions](#custom-dimensions)). |
| `useBooleans` | `boolean` | `false` | When `true`, dimension values become boolean prop shorthands (`<Button primary />`) instead of string props (`<Button state="primary" />`). See [Booleans vs strings](#booleans-vs-strings). |

## The Chainable Builder

Every chain method returns a **new** rocketstyle component (immutable builder — the original is untouched), so you can fork a base into variants. The canonical order is `.config()` → `.attrs()` → `.theme()` → dimension methods, but methods can be chained in any order and repeated.

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .config({ name: 'Button' })           // metadata + provider/consumer wiring
  .attrs({ type: 'button' })            // default props injected into the component
  .theme((t) => ({ /* base CSS */ }))   // always-applied styles
  .states({ /* ... */ })                // the `state` dimension
  .sizes({ /* ... */ })                 // the `size` dimension
  .variants({ /* ... */ })             // the `variant` dimension
  .compose({ withTooltip })             // wrap in HOCs
  .statics({ version: '1.0' })          // attach static metadata
```

### `.theme(callback)` — always-applied base styles

`.theme()` takes a **callback** that receives `(theme, mode, css)` and returns the base style object that applies to **every** instance regardless of dimension props. `theme` is the app theme from context, `mode` is the `mode(light, dark)` helper (see [Dark/Light Mode](#darklight-mode)), and `css` is the styling-layer's css helper.

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t, mode, css) => ({
    borderRadius: '4px',
    fontWeight: 500,
    cursor: 'pointer',
    border: 'none',
  }))
```

`.theme()` is **additive** — chaining `.theme()` twice deep-merges both results. You can also pass a plain object (no callback) when you don't need the theme/mode arguments.

:::warning{title="`.theme({})` is a no-op"}
Chaining an empty `.theme({})` does nothing useful — it merges an empty object into the base. If a component needs no base styles, skip `.theme()` entirely rather than threading a no-op through the chain.
:::

### Dimension methods — `.states()` / `.sizes()` / `.variants()`

Each dimension method declares **every valid value** for that dimension's prop. The method name is **plural**; the prop the consumer passes is **singular**:

| Method | Consumer prop | Description |
| --- | --- | --- |
| `.states(...)` | `state` | Interactive / semantic state (`primary`, `danger`, `ghost`, …). |
| `.sizes(...)` | `size` | Size scale (`sm`, `md`, `lg`, …). |
| `.variants(...)` | `variant` | Structural variation (`solid`, `outline`, `ghost`, …). |

A dimension is defined by mapping each value name to a style object (or a callback, see below). The active value's slice is merged onto the base theme:

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ borderRadius: '4px', cursor: 'pointer' }))
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
  .variants({
    solid: {},
    outline: { background: 'transparent', borderStyle: 'solid' },
  })

<Button state="primary" size="lg" variant="solid">Save</Button>
<Button state="danger" size="sm">Delete</Button>
```

A dimension prop with no matching value contributes nothing — every dimension is optional at the call site.

:::tip{title="Plural method, singular prop"}
`.states()` / `.sizes()` / `.variants()` are the **definition** methods (declared once when you build the component). `state` / `size` / `variant` are the **prop names** the consumer passes (`<Button state="primary">`). Don't confuse `.theme()` (the always-applied base-CSS callback) with a dimension — it is not a dimension.
:::

### Dimension callbacks — `(theme, mode, css)`

A dimension method can take a **callback** (instead of a plain map) that receives `(theme, mode, css)` and returns the value map. This is how you base dimension styles on theme tokens:

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .states((t) => ({
    primary: { backgroundColor: t.color.primary, color: t.color.onPrimary },
    danger: { backgroundColor: t.color.error, color: t.color.onError },
  }))
  .sizes((t) => ({
    sm: { padding: t.spacing.xs, fontSize: t.fontSize.sm },
    md: { padding: t.spacing.sm, fontSize: t.fontSize.base },
  }))
```

Individual **values** can also be callbacks receiving the component's props, for value-level conditional styling:

```tsx
const Card = rs({ name: 'Card', component: 'div' })
  .states({
    light: { background: '#fff', color: '#333' },
    dark: (props) => ({
      background: props.elevated ? '#2d2d2d' : '#1a1a1a',
      color: '#e0e0e0',
    }),
  })
```

### `.attrs(...)` — default props

`.attrs()` injects **default props** into the wrapped component. It has two forms — an object form and a callback form.

```tsx
// Object form — static default props
const SubmitButton = rs({ name: 'SubmitButton', component: 'button' })
  .attrs({ type: 'submit', 'aria-label': 'Submit form' })

// Callback form — (props, theme, helpers) => partial props
const ThemedButton = rs({ name: 'ThemedButton', component: 'button' })
  .attrs((props, theme, helpers) => ({
    'data-mode': helpers.mode, // 'light' | 'dark'
    title: props.disabled ? 'Disabled' : 'Click me',
  }))
```

The callback's third argument, `helpers`, carries the resolved mode: `{ mode, isDark, isLight, createElement }`. The callback receives the consumer's props as the first argument and the app theme as the second.

Every `.attrs()` value is a **default**, not a required prop — the consumer can always override it. The optional second argument configures the call:

```tsx
.attrs(callback, {
  priority: true,                  // run this attrs callback last (override-wins)
  filter: ['someInternalKey'],     // strip these keys before they reach the DOM
})
```

:::note{title="Layout props belong in `.attrs()`, CSS in `.theme()`"}
When you wrap a layout-aware base component (such as `@pyreon/elements`' `Element`, which the `@pyreon/ui-components` bases use), the convention is: **layout props go in `.attrs()`** (`tag`, `direction`, `alignX`, `alignY`, `gap`, `block` — these drive the Element's inner flex layout), and **visual CSS goes in `.theme()`** (colors, spacing, borders, shadows — these style the outer wrapper). A bare `rocketstyle('div')` component only forwards whatever props the wrapped component understands; the layout-prop convention applies through Element-based bases.
:::

### `.styles(css => css\`...\`)` — escape hatch to raw CSS

`.styles()` gives you the styler's tagged-template `css` helper directly, for cases the dimension model can't express (pseudo-selectors keyed on resolved state, complex interpolation, etc.). Interpolation functions receive `$rocketstyle` (the fully resolved theme object) and `$rocketstate` (the active dimension values + pseudo state):

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({ background: '#eee', hover: { background: '#ddd' } }))
  .styles(
    (css) => css`
      transition: background 0.15s ease;
      ${({ $rocketstyle }) => css`
        background: ${$rocketstyle.background};
        &:hover { background: ${$rocketstyle.hover.background}; }
      `}
    `,
  )
```

`$rocketstate.pseudo` exposes the JS-tracked interaction flags (`hover`, `focus`, `pressed`) for components that drive pseudo-state in JavaScript rather than via CSS selectors.

### `.compose(hocs)` — wrap in higher-order components

`.compose()` wraps the rocketstyle component in one or more HOCs. The argument is a record of named HOCs (`(Component) => Component`); a falsy value is skipped:

```tsx
const withTooltip = (Component) => (props) => /* ...wrap... */ Component(props)

const Button = rs({ name: 'Button', component: 'button' })
  .states({ primary: { background: 'royalblue' } })
  .compose({ withTooltip })
```

### `.statics(meta)` — attach static metadata

`.statics()` attaches arbitrary static values, readable on the component's `.meta`:

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .statics({ version: '1.0', category: 'form' })

Button.meta.version  // '1.0'
```

### `.config(options)` — metadata, provider, consumer

`.config()` sets component metadata and opts into the provider/consumer context wiring.

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .config({
    name: 'Button',         // displayName
    component: 'a',          // swap the rendered base component
    provider: true,          // expose this component's pseudo-state to descendants
    DEBUG: false,            // dev-only debug logging
    inversed: false,         // flip dark/light for this subtree
  })
```

| `.config()` key | Type | Description |
| --- | --- | --- |
| `name` | `string` | The component's `displayName`. |
| `component` | `ElementType` | Swap the wrapped base component (re-types the builder to the new component's props). |
| `provider` | `boolean` | Make this component a context provider exposing its pseudo-state to consumer descendants. |
| `consumer` | `function` | Read a parent provider's pseudo-state into this component's props. |
| `inversed` | `boolean` | Invert dark/light mode for this subtree. |
| `DEBUG` | `boolean` | Dev-only debug logging. |
| `passProps` | `keyof DimensionBooleanAttrs` | (Only with `useBooleans: true`) which boolean dimension shorthands to also forward to the DOM. |

:::warning{title="`.config({ component })` resets the attrs chain"}
Setting `.config({ component: NewBase })` to a *different* component resets the accumulated `.attrs()` / compose chains — they were tailored to the previous component's prop shape. `.theme()` / `.styles()` / dimension chains are preserved (they target rendered CSS, not prop forwarding). If you need to keep button-shaped attrs across a component swap, re-chain them after `.config()`.
:::

## Pseudo-States

Pseudo-state styles (`hover`, `focus`, `active`, `disabled`, plus `pressed` / `readOnly`) are written as **nested objects** inside any theme or dimension slice. The styling layer generates the matching CSS (`:hover`, `:focus-visible`, `:active`, `:disabled`):

```tsx
const Button = rs({ name: 'Button', component: 'button' })
  .theme((t) => ({
    background: '#3b82f6',
    color: 'white',
    cursor: 'pointer',
    hover: { background: '#2563eb' },
    focus: { boxShadow: '0 0 0 3px rgba(59,130,246,0.4)', outline: 'none' },
    active: { transform: 'scale(0.98)' },
    disabled: { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' },
  }))
  .states({
    danger: {
      background: '#dc3545',
      hover: { background: '#b91c1c' }, // per-state hover override
    },
  })
```

Pseudo-state objects compose like any other style: a `hover` written inside `.theme()` is the base, and a `hover` inside a `.states()` value overrides it for that state.

:::note{title="`:hover` is unconditional, `cursor: pointer` is not"}
The Element-based bases apply `:hover` CSS to **every** component that defines a `hover` theme — not just interactive ones. Only `cursor: pointer` is gated on the component actually being interactive (`onClick` / `href`).
:::

## Dark/Light Mode

The `mode(light, dark)` helper — the **second argument** to `.theme()` and dimension callbacks — picks a value based on the active mode. It lets a single style definition carry both light and dark values without duplicating the whole object:

```tsx
const Card = rs({ name: 'Card', component: 'div' })
  .theme((t, mode) => ({
    background: mode('#ffffff', '#1a1a1a'),  // light → '#fff', dark → '#1a1a1a'
    color: mode('#1a1a1a', '#e0e0e0'),
    borderColor: mode('#e5e7eb', '#374151'),
  }))
  .states((t, mode) => ({
    elevated: {
      boxShadow: mode('0 2px 8px rgba(0,0,0,0.1)', '0 2px 8px rgba(0,0,0,0.6)'),
    },
  }))
```

The active mode comes from the surrounding theme provider (`PyreonUI` from `@pyreon/ui-core`, or rocketstyle's own `Provider`). `mode()` is available in `.theme()`, every dimension callback, and inside transform-dimension value functions; in `.attrs()` callbacks the resolved mode is on the `helpers` argument (`helpers.mode` / `helpers.isDark` / `helpers.isLight`).

:::tip{title="Inverting a subtree"}
`.config({ inversed: true })` (or `<Provider inversed>`) flips light↔dark for that component's subtree — useful for a dark callout panel inside a light page, where descendants should resolve their `mode()` values as if dark.
:::

## Booleans vs Strings

The `useBooleans` factory option controls how dimension values are passed at the call site. The **default is `false`** — dimension props take string values:

```tsx
// useBooleans: false (DEFAULT) — string props
const rs = rocketstyle({ useBooleans: false })
const Button = rs({ name: 'Button', component: 'button' }).states({ primary: {}, danger: {} })

<Button state="primary" />
<Button state="danger" size="lg" />
```

Opt into boolean shorthands with `useBooleans: true` — each dimension *value* becomes its own boolean prop:

```tsx
// useBooleans: true — boolean shorthand props
const rs = rocketstyle({ useBooleans: true })
const Button = rs({ name: 'Button', component: 'button' }).states({ primary: {}, danger: {} })

<Button primary />
<Button danger />
```

:::warning{title="Match `useBooleans` to your prop style"}
The runtime default for `useBooleans` is `false`. With `false`, a boolean prop like `<Button primary />` is **not** a dimension selector — it's an unknown prop. With `true`, the string form `<Button state="primary" />` is the wrong shape. Pick one per design system (the `@pyreon/ui-components` library uses `false` — string props).
:::

## Custom Dimensions

The five built-in dimensions are defined at factory-init time, and you can override the whole map to add your own:

| Definition | Prop name | Multi-value? | Transform? |
| --- | --- | --- | --- |
| `states: 'state'` | `state` | no | no |
| `sizes: 'size'` | `size` | no | no |
| `variants: 'variant'` | `variant` | no | no |
| `multiple: { propName: 'multiple', multi: true }` | `multiple` | **yes** | no |
| `modifiers: { propName: 'modifier', multi: true, transform: true }` | `modifier` | **yes** | **yes** |

- A **multi** dimension (`multi: true`) accepts an array of values that all compose: `<Box multiple={['rounded', 'shadow']} />`.
- A **transform** dimension (`transform: true`) is evaluated **last**, and its values are functions receiving the fully accumulated theme — for derived styles like "inverted" or "outlined" that depend on the resolved base.

```tsx
// Override the dimension map at factory init
const rs = rocketstyle({
  dimensions: {
    states: 'state',
    sizes: 'size',
    tones: 'tone',                                  // custom single-value dimension
    decorations: { propName: 'decoration', multi: true }, // custom multi dimension
  },
})

const Badge = rs({ name: 'Badge', component: 'span' })
  .tones({ info: { color: 'blue' }, warn: { color: 'orange' } })       // method = plural key
  .decorations({ pill: { borderRadius: '999px' }, bordered: { borderWidth: 1 } })

<Badge tone="warn" decoration={['pill', 'bordered']} />
```

:::danger{title="Reserved dimension names"}
Dimension names cannot collide with reserved keys (`light`, `dark`, `provider`, `consumer`, `DEBUG`, `name`, `component`, `inversed`, `passProps`, `styled`, `theme`, `styles`, `compose`, `attrs`). In dev mode, a collision throws at factory init.
:::

## Provider & Context

`Provider` sets tree-level defaults for theme and mode. Its props are `theme`, `mode`, `inversed`, `provider`, and `children`:

```tsx
import { Provider } from '@pyreon/rocketstyle'

<Provider theme={myTheme} mode="dark">
  {/* Every rocketstyle component inside resolves mode() against 'dark' */}
  <Button state="primary">Dark mode button</Button>
  <Card>Also dark</Card>
</Provider>

{/* Invert a subtree */}
<Provider inversed>
  <Card>Renders as if the opposite mode</Card>
</Provider>
```

:::note{title="`Provider` takes `mode` / `theme`, not `value`"}
The rocketstyle `Provider`'s props are `{ theme, mode, inversed, provider, children }`. In most apps you'll use the higher-level `PyreonUI` provider from `@pyreon/ui-core` (which wraps theme + mode + config in one), and reach for rocketstyle's `Provider` only for fine-grained subtree overrides.
:::

For component-to-component context, `.config({ provider: true })` exposes a component's live pseudo-state to descendants, and `.config({ consumer })` reads a parent provider's pseudo-state into a child's props — used for compound components (e.g. a menu item reacting to its parent menu's hover).

## Integration with Styler

Rocketstyle is built on `@pyreon/styler`. Resolved dimension style objects are handed to the styler's `styled` API, which produces scoped, deduplicated CSS classes with SSR support. You don't call styler directly — rocketstyle drives it — but the resolved theme follows the same value pipeline (`@pyreon/unistyle`'s responsive props, CSS-variable mode, etc.).

When `init({ cssVariables: true })` is set on `@pyreon/ui-core`, `mode(light, dark)` pairs are emitted as hashed CSS custom properties so a dark/light flip is one attribute write with zero per-component re-resolution. The `resolveModeVar(value, mode)` export resolves a `var(--px-m-…)` mode-pair reference back to its raw value for non-CSS render targets (PDF / DOCX / email export).

## Compile-Time Collapse (opt-in)

Literal-prop call sites — `<Button state="primary" size="medium">Save</Button>` where every dimension prop is a string literal, no spread, static children — can be **collapsed at build time** from the 5-layer mount (rocketstyle → attrs → Element → Wrapper → styled) into a single `cloneNode`, measured ~44× faster for that shape. Enable via `pyreon({ collapse: true })` in `@pyreon/vite-plugin`. It is off by default (zero behavior change) and falls back to the normal mount for any call site it can't statically resolve. See the [vite-plugin docs](/docs/vite-plugin) for details.

## Common Mistakes

```tsx
// ❌ Calling the factory with a tag string
const Button = rs('button')                         // wrong — no string-tag form
// ✅ The factory takes { name, component }
const Button = rs({ name: 'Button', component: 'button' })
```

```tsx
// ❌ Function accessor for a dimension prop
<Button state={() => isActive() ? 'primary' : 'ghost'} />   // wrong shape
// ✅ Pass the value directly — the compiler handles reactivity
<Button state={isActive() ? 'primary' : 'ghost'} />
```

```tsx
// ❌ Empty .theme({}) — a no-op that does nothing
const Button = rs({ name: 'Button', component: 'button' }).theme({})
// ✅ Skip .theme() entirely when there are no base styles
const Button = rs({ name: 'Button', component: 'button' }).states({ primary: {} })
```

```tsx
// ❌ Singular dimension method name
rs({ name: 'B', component: 'button' }).state({ primary: {} })  // .state is not a method
// ✅ Dimension methods are plural
rs({ name: 'B', component: 'button' }).states({ primary: {} }) // prop stays singular: state="primary"
```

```tsx
// ❌ Boolean props with the default useBooleans: false
const rs = rocketstyle()              // useBooleans defaults to false
const Button = rs({ name: 'B', component: 'button' }).states({ primary: {} })
<Button primary />                    // 'primary' is an unknown prop, not a state selector
// ✅ Use the string prop form (or opt into useBooleans: true)
<Button state="primary" />
```

```tsx
// ❌ Numeric values to mode() under cssVariables — units can't be applied
.theme((t, mode) => ({ padding: mode(8, 12) }))       // warns: emitted verbatim, no unit
// ✅ Pass unit-complete (or unitless-valid) values
.theme((t, mode) => ({ padding: mode('8px', '12px') }))
```

```tsx
// ❌ Provider with a `value` prop (React-context muscle memory)
<Provider value={{ mode: 'dark' }}>...</Provider>     // wrong — there is no `value` prop
// ✅ Provider takes mode / theme / inversed directly
<Provider mode="dark">...</Provider>
```

## API Reference

### Exports

| Export | Type | Description |
| --- | --- | --- |
| `rocketstyle` (default + named) | `Function` | Factory — `rocketstyle(config?)` returns a `({ name, component }) => RocketStyleComponent` factory. |
| `Provider` | `Component` | Tree-level theme/mode provider (`{ theme, mode, inversed, provider, children }`). |
| `context` | `Context` | The raw Pyreon context object backing `Provider`. |
| `isRocketComponent` | `Function` | Type guard — `true` if a value is a rocketstyle component. |
| `resolveTheme` | `Function` | `resolveTheme(value)` — resolves a `$rocketstyle` accessor-or-object inside `.styles()` interpolation. |
| `resolveModeVar` | `Function` | `resolveModeVar(value, mode?)` — resolve a `var(--px-m-…)` mode-pair reference to its raw light/dark value (for non-CSS export targets). |

### `rocketstyle(config?)`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `config.dimensions` | `Record<string, DimensionValue>` | 5 built-ins | Dimension definition map. |
| `config.useBooleans` | `boolean` | `false` | Boolean-shorthand props (`true`) vs string props (`false`). |

Returns `({ name, component }) => RocketStyleComponent`. Both `name` and `component` are required.

### Builder methods

Every method returns a new `RocketStyleComponent` (immutable builder).

| Method | Signature | Description |
| --- | --- | --- |
| `.config(opts)` | `(ConfigAttrs) => RocketStyleComponent` | Metadata + provider/consumer/inversed/component-swap. |
| `.attrs(objOrCb, cfg?)` | `(props \| (props, theme, helpers) => props, { priority?, filter? }) => …` | Inject default props (object or callback form). |
| `.theme(cb)` | `((theme, mode, css) => styles) \| object => …` | Always-applied base styles (additive). |
| `.states(cb)` | `((theme, mode, css) => valueMap) \| valueMap => …` | The `state` dimension. |
| `.sizes(cb)` | same as `.states` | The `size` dimension. |
| `.variants(cb)` | same as `.states` | The `variant` dimension. |
| `.multiple(cb)` | same as `.states` | The multi-value `multiple` dimension. |
| `.modifiers(cb)` | same as `.states` | The multi-value + transform `modifier` dimension. |
| `.styles(cb)` | `((css) => css\`…\`) => …` | Raw styler `css` escape hatch. Interpolation fns get `$rocketstyle` + `$rocketstate`. |
| `.compose(hocs)` | `(Record<string, Hoc \| false \| null>) => …` | Wrap in named HOCs (falsy values skipped). |
| `.statics(meta)` | `(object) => …` | Attach static metadata (readable on `.meta`). |

### Component instance properties

| Property | Type | Description |
| --- | --- | --- |
| `IS_ROCKETSTYLE` | `true` | Marker present on every rocketstyle component. |
| `displayName` | `string` | The configured `name`. |
| `meta` | `object` | All values attached via `.statics()`. |
| `__rs_attrs` | `ReadonlyArray<fn>` | The accumulated `.attrs()` callback chain (stable, read-only — used by document-export inspectors). |

### Callback argument reference

| Callback | Arguments |
| --- | --- |
| `.theme(cb)` | `(theme, mode, css)` |
| `.states(cb)` / `.sizes(cb)` / `.variants(cb)` | `(theme, mode, css)` |
| Transform-dimension value fn (`.modifiers`) | `(theme, appTheme, mode, css)` |
| `.attrs(cb)` | `(props, theme, helpers)` — `helpers = { mode, isDark, isLight, createElement }` |
| `.styles(cb)` | `(css)`; interpolation fns receive `{ $rocketstyle, $rocketstate }` |

Here `mode` is the `mode(light, dark)` helper that returns the value matching the active theme mode.

## Key Features

- Multi-dimensional style composition — `state` × `size` × `variant` (+ multi/transform/custom dimensions) compose multiplicatively instead of by enumeration.
- Auto-generated props from dimension definitions, with string (`useBooleans: false`, default) or boolean (`useBooleans: true`) prop styles.
- Always-applied base via `.theme()`; per-value slices via dimension methods; raw escape hatch via `.styles()`.
- Built-in dark/light support through the `mode(light, dark)` callback helper.
- Nested pseudo-state objects (`hover` / `focus` / `active` / `disabled` / `pressed` / `readOnly`).
- Tree-level defaults via `Provider` and component-to-component pseudo-state via `.config({ provider, consumer })`.
- Built on `@pyreon/styler` — scoped, deduplicated, SSR-safe CSS with CSS-variables mode support.
- Immutable chainable builder — every method returns a new component, so bases fork cleanly into variants.
- Full TypeScript inference — dimension props are typed from the definitions, no manual annotations.
- Opt-in compile-time collapse (`pyreon({ collapse: true })`) flattens literal-prop call sites into a single `cloneNode`.
