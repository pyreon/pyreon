---
title: Attrs
description: Chainable HOC factory for Pyreon components — layer default props, swap the base, compose HOCs, and attach static metadata, immutably.
---

`@pyreon/attrs` wraps a Pyreon component in an immutable, chainable builder that accumulates default props (`.attrs()`), reconfigures the base component (`.config()`), composes additional higher-order components (`.compose()`), and attaches static metadata (`.statics()`). Every chain method returns a **new** component — the original is never mutated — and the TypeScript generics accumulate so prop types stay correct after each `.attrs<P>({...})` call.

It is the lower-level HOC factory that `@pyreon/rocketstyle` builds on. You'll also reach for it directly whenever you want default-prop composition and base-swapping without the multi-dimensional styling layer.

<PackageBadge name="@pyreon/attrs" href="/docs/attrs" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/attrs @pyreon/core @pyreon/ui-core
```

```bash [bun]
bun add @pyreon/attrs @pyreon/core @pyreon/ui-core
```

```bash [pnpm]
pnpm add @pyreon/attrs @pyreon/core @pyreon/ui-core
```

```bash [yarn]
yarn add @pyreon/attrs @pyreon/core @pyreon/ui-core
```

:::

`@pyreon/core` and `@pyreon/ui-core` are peer dependencies — `attrs` uses `mergeProps` / `removeUndefinedProps` from core for descriptor-safe prop forwarding, and small helpers (`compose`, `omit`, `pick`, `isEmpty`, `hoistNonReactStatics`) from ui-core.

## Quick Start

```tsx
import attrs from '@pyreon/attrs'
import { Element } from '@pyreon/elements'

// The factory takes { name, component } — NOT a bare component.
const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({
    backgroundColor: primary ? 'blue' : 'gray',
  }))

// Renders Element with the accumulated defaults
<Button label="Click me" />

// Explicit props override .attrs() defaults
<Button tag="a" href="/x" label="Link button" />
```

:::warning{title="Factory signature"}
`attrs()` is called with an **object** — `attrs({ name, component })` — not `attrs(component)`. Both `name` and `component` are required; dev builds throw a clear error (`Parameter `component` is missing in params!`) when either is absent. The `name` becomes the component's `displayName` and the dev-only `data-attrs` debug attribute.
:::

## Why attrs?

In a design system you frequently want pre-configured variants of a base primitive without writing a one-off wrapper component for each. `attrs` lets you layer defaults declaratively:

```tsx
// ❌ One-off wrapper components — boilerplate, no shared type accumulation
function PrimaryButton(props) {
  return <Element tag="button" backgroundColor="blue" {...props} />
}
function LargePrimaryButton(props) {
  return <Element tag="button" backgroundColor="blue" size="lg" {...props} />
}

// ✅ A chain — immutable, type-accumulating, base is never mutated
const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })
const PrimaryButton = Button.attrs({ backgroundColor: 'blue' })
const LargePrimaryButton = PrimaryButton.attrs({ size: 'lg' })
```

Each call returns a brand-new component (`cloneAndEnhance` clones the accumulated configuration and rebuilds the component). The original `Button` keeps its own defaults — `PrimaryButton` does not affect it. Pyreon components are plain functions that run once per mount, so there is no `forwardRef`: a `ref` flows through the chain as an ordinary prop.

## The Chain

`attrs()` returns an `AttrsComponent` — a callable Pyreon component with four chain methods plus introspection helpers. The methods can be called in any order; each produces a fresh component.

| Method | Purpose |
| ------ | ------- |
| `.attrs(props \| cb, opts?)` | Layer default props (static object or callback) |
| `.config({ name?, component?, DEBUG? })` | Rename, swap the base component, or toggle debug |
| `.compose({ name: hoc })` | Attach named higher-order components |
| `.statics({ key: value })` | Attach metadata, readable at `Component.meta` |

## `.attrs()` — Default Props

Layer default props onto the component. Accepts either a static object or a callback that receives the current resolved props and returns a partial override. Call it as many times as you like — the defaults stack left-to-right across the chain.

```tsx
// Object form — static defaults
const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })

// Callback form — receives the current resolved props
const Input = attrs({ name: 'Input', component: Element }).attrs<{ error?: boolean }>(
  (props) => ({
    'aria-invalid': props.error ? 'true' : undefined,
  }),
)

// Multiple calls stack — later wins for the same key
const Base = attrs({ name: 'Base', component: Element }).attrs({ variant: 'default', size: 'md' })
const Small = Base.attrs({ size: 'sm' }) // → { variant: 'default', size: 'sm' }
const SmallPrimary = Small.attrs({ variant: 'primary' }) // → { variant: 'primary', size: 'sm' }
```

The generic on `.attrs<P>()` widens the component's prop type so the new keys are typed at the call site and inside later callbacks.

### Merge order at render time

When the component mounts, the accumulated chains resolve and merge in this exact order (later wins):

```text
priorityAttrs  →  attrs  →  explicit (call-site) props   →   filter strips names   →   base component
```

- **`priorityAttrs`** resolve first and act as a base. They have the **lowest** precedence in the final merge — both `attrs` and explicit props override them.
- **`attrs`** callbacks resolve next, receiving `priorityAttrs` + explicit props as their input.
- **Explicit (call-site) props** always win.

So in the common case, a value you pass at the call site overrides any default the chain provides.

```tsx
const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })

<Button />            // tag = 'button' (default applies)
<Button tag="a" />    // tag = 'a'      (explicit wins)
```

### Options: `priority`

Pass `{ priority: true }` as the second argument to add the props to the `priorityAttrs` chain instead of the normal `attrs` chain. These resolve **first** and are visible to later `attrs` callbacks as input, but they sit at the **lowest** precedence in the final merge.

```tsx
const Component = attrs({ name: 'Box', component: Element })
  .attrs(() => ({ label: 'Normal' }))
  .attrs(() => ({ label: 'Priority' }), { priority: true })

// Result: label === 'Normal' — normal attrs override priority attrs
```

:::warning{title="'priority' does NOT mean 'highest precedence'"}
Despite the name, `priorityAttrs` are not "high priority" in the final merge — they are resolved **early** (so callbacks can read them) but they lose to both normal `attrs` and explicit props. The merge precedence is strictly `priorityAttrs < attrs < explicit props`. `@pyreon/rocketstyle` uses this slot to seed structural base props that the dimension layer then reads and can still override.
:::

### Options: `filter`

Pass `{ filter: [...] }` to strip prop names from the props before they reach the base component. This is how you keep internal/control props (variant flags, behavioral switches) from leaking onto the DOM.

```tsx
const Component = attrs({ name: 'Box', component: Element }).attrs(
  () => ({ label: 'Visible' }),
  { filter: ['data-internal', 'variant'] },
)

<Component data-internal="secret" variant="primary" label="x" />
// → 'data-internal' and 'variant' are omitted before forwarding to Element
```

`filter` lists **accumulate** across the chain — every name listed in any `.attrs(..., { filter })` call along the chain is stripped.

## `.config()` — Rename, Swap, Debug

Reconfigure the builder. All three keys are optional; the method returns a new component.

```tsx
type ConfigAttrs = Partial<{
  name: string
  component: ElementType
  DEBUG: boolean
}>
```

```tsx
const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })

// Rename
const Renamed = Button.config({ name: 'PrimaryButton' })
Renamed.displayName // 'PrimaryButton'
Button.displayName  // 'Button' — original untouched

// Swap the underlying component
const AnchorButton = Button.config({ component: 'a' })
```

:::note{title="Swapping the base preserves the chains"}
In `@pyreon/attrs`, `.config({ component })` **keeps** the accumulated `.attrs()` / `priorityAttrs` / `filter` / `.compose()` / `.statics()` chains and re-applies them to the new base. (This is verified by the package's tests — a `.attrs(() => ({ label: 'from-attrs' }))` set before a `.config({ component: Alt })` swap still applies the label.) The chain-reset-on-swap behavior described for the higher-level `@pyreon/rocketstyle` does **not** happen at this layer. If the new base has a different prop shape, that's on you to reconcile.
:::

## `.compose()` — Higher-Order Components

Attach named HOCs to the chain. The argument is a **record** of `{ name: hoc }`, where each HOC has the shape `(component) => component`. Setting a name to `null` / `undefined` / `false` removes a previously composed HOC of that name.

```tsx
const withTheme = (Component) => (props) => Component({ ...props, themed: true })
const withTracking = (Component) => (props) => {
  /* … */
  return Component(props)
}

const Enhanced = attrs({ name: 'Button', component: Element }).compose({
  withTheme,
  withTracking,
})

// Remove a previously composed HOC by name
const NoTracking = Enhanced.compose({ withTracking: false })
```

HOCs are applied in registration order with the **last-defined wrapping innermost**: `.compose({ withOuter, withInner })` runs `withInner` first, then `withOuter` (the chain reverses the record values so `compose(withOuter, withInner)(Component)` evaluates as `withOuter(withInner(Component))`). The built-in attrs HOC (which resolves the `.attrs()` chain) is always the outermost wrapper, so default props are computed before any user HOC runs.

## `.statics()` — Attached Metadata

Attach arbitrary metadata to the component. The values land on `Component.meta` (not directly on the component function), and successive `.statics()` calls merge.

```tsx
const Button = attrs({ name: 'Button', component: Element }).statics({
  category: 'action',
  sizes: ['sm', 'md', 'lg'],
})

Button.meta.category // 'action'
Button.meta.sizes    // ['sm', 'md', 'lg']

// Merges across calls
const Extended = Button.statics({ variant: 'primary' })
Extended.meta // { category: 'action', sizes: [...], variant: 'primary' }
```

This is the mechanism `@pyreon/document-primitives` uses to mark a component's `_documentType` so the document tree extractor can discover it after the HOC chain has run. Any system that needs post-construction component introspection can read `Component.meta`.

## Introspection

Every attrs component exposes a few runtime properties:

```tsx
const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })

Button.IS_ATTRS    // true — the marker used by isAttrsComponent()
Button.displayName // 'Button'
Button.meta        // {} (or whatever .statics() attached)

// Resolve the accumulated default props for a given input
Button.getDefaultAttrs({}) // { tag: 'button' }
```

### `getDefaultAttrs(props)`

Runs the whole `.attrs()` callback chain against the given props object and returns the merged result. Useful for testing, snapshotting effective defaults, or building tooling. Pass the props the callbacks should see (`{}` for the static defaults).

```tsx
const Component = attrs({ name: 'Box', component: Element })
  .attrs(() => ({ color: 'blue' }))
  .attrs((props) => ({ computed: props.variant === 'primary' ? 'on' : 'off' }))

Component.getDefaultAttrs({}) // { color: 'blue', computed: 'off' }
Component.getDefaultAttrs({ variant: 'primary' }) // { color: 'blue', computed: 'on' }
```

### `isAttrsComponent(value)`

Runtime type guard — returns `true` for any value carrying the `IS_ATTRS` marker (i.e. produced by `attrs()`).

```tsx
import { isAttrsComponent } from '@pyreon/attrs'

isAttrsComponent(Button) // true
isAttrsComponent('div')  // false
isAttrsComponent(() => null) // false
```

## Reactive Prop Forwarding (descriptor-safe)

Pyreon's reactive-prop contract is the reason `attrs` cannot use a naïve object spread anywhere props flow **in** from the consumer. The compiler emits a reactive prop like `<Comp value={count()} />` as a getter-shaped property (`makeReactiveProps` converts a `_rp`-branded thunk into a property *getter*). Reading that property inside a tracking scope subscribes to the underlying signal.

A plain spread (`{ ...props }`) or value-copy (`target[key] = props[key]`) **fires the getter at copy time** — outside any tracking scope — collapsing the live signal into a one-shot snapshot. Downstream reads then see the captured value forever, and the prop silently stops updating.

`attrs` avoids this on the inbound path:

- The HOC strips `undefined` values via `removeUndefinedProps` from `@pyreon/core` (a **descriptor-copy** that preserves getters), so a `{ x: undefined }` from the consumer doesn't shadow a real default — without firing any getters.
- The final merge uses the canonical `mergeProps` from `@pyreon/core` (also descriptor-safe), so getter-shaped explicit props stay **live** all the way to the wrapped component.

```tsx
const count = signal(0)

// The reactive `value` survives the attrs chain — it's still live in Element,
// not frozen at the value it had when the chain merged.
<Button value={count()} />
```

:::tip{title="Authoring your own prop-forwarding helper?"}
Copy **descriptors**, not values: `Object.getOwnPropertyDescriptors` + `Object.defineProperty`, or just use `mergeProps` / `splitProps` / `removeUndefinedProps` from `@pyreon/core` (they all preserve getters). A `result[key] = source[key]` loop fires getters and freezes reactive props.
:::

:::note{title="Why object spread is fine for .attrs() output"}
The values *returned* from your `.attrs()` callbacks are freshly-constructed object literals with plain data properties (no getters), so the chain reducer uses `Object.assign` for them — descriptor preservation only matters for props flowing in from the consumer, which is handled separately.
:::

## Relationship to `@pyreon/rocketstyle`

`@pyreon/rocketstyle` is built on top of `@pyreon/attrs`. Rocketstyle is the multi-dimensional styling engine (`state`, `size`, `variant`, `theme`, dark mode); `attrs` is the underlying prop-composition + HOC + statics machinery. Where rocketstyle's `.attrs()` targets a component's inner layout and `.theme()` targets the styled wrapper, the bare `attrs` chain just layers props and HOCs onto any component.

Use `@pyreon/attrs` directly when you want default-prop composition and base-swapping but do **not** need rocketstyle's dimension/theme resolution. Reach for `@pyreon/rocketstyle` when you need the multi-state styling layer on top.

:::warning{title="One behavioral difference vs rocketstyle"}
At the `@pyreon/attrs` layer, `.config({ component })` **preserves** the prop chains (see above). `@pyreon/rocketstyle`'s own `cloneAndEnhance` resets the `attrs` / `priorityAttrs` / `filterAttrs` / `compose` chains when you swap to a *different* component (because those chains were tailored to the previous component's prop shape). Don't carry the rocketstyle reset assumption down to plain `attrs`.
:::

## TypeScript

Each `.attrs<P>()` generic accumulates into the component's prop type. Three type-only properties expose the accumulated shapes (these exist for type inspection — they have no runtime value):

```ts
type AllProps = typeof Button.$$types // origin + extended
type OriginProps = typeof Button.$$originTypes // base component's props
type ExtendedProps = typeof Button.$$extendedTypes // everything added via .attrs<P>()
```

`ExtractProps` (also exported from `@pyreon/attrs`) recovers a component's props union when forwarding through another HOC. It is multi-overload-aware (matches up to 4 call signatures and unions their first-argument types) so wrapping a 3-overload primitive like Element / Iterator / List doesn't silently collapse its prop surface to the loosest overload.

:::note{title="Generic accumulation has a depth limit"}
TypeScript's recursive conditional-type inference caps at roughly 24–50 levels depending on the host environment. If you stack `.attrs<P>()` calls past that, narrow the generics or split the component.
:::

## Gotchas

- **Factory takes `{ name, component }`, not a bare component.** `attrs(Element)` is wrong; `attrs({ name: 'X', component: Element })` is correct.
- **`.statics()` lands on `.meta`, not the component itself.** Read `Component.meta.foo`, not `Component.foo`.
- **`.compose()` takes a record of named HOCs.** Pass `{ name: hoc }`; set a name to `null`/`false` to remove it.
- **Defaults are merged, not deep-merged.** An object-valued prop (`style={{ color: 'red' }}`) is replaced wholesale by a later default, not combined.
- **`priorityAttrs` is the lowest-precedence layer** — the name is about resolution *order*, not final precedence.
- **The dev `data-attrs` attribute** is added in dev builds for debugging and tree-shaken in production (gated on `process.env.NODE_ENV !== 'production'`).
- **`hoistNonReactStatics`** copies non-React statics from the base onto the wrapper, so `Base.someStaticMethod` survives the HOC chain.

## API Reference

### `attrs({ name, component })`

The default export. Creates an attrs-enhanced component.

| Parameter | Type | Required | Description |
| --------- | ---- | -------- | ----------- |
| `name` | `string` | yes | Becomes `displayName` + dev `data-attrs` attribute |
| `component` | `ElementType` | yes | The base component or intrinsic tag (`'a'`, `'button'`, …) to wrap |

Returns an `AttrsComponent` — a callable component with chain methods and introspection properties.

### `AttrsComponent` methods

| Member | Signature | Description |
| ------ | --------- | ----------- |
| _(callable)_ | `(props) => VNode \| null` | Render the component (Pyreon components are plain functions) |
| `.attrs()` | `(props \| (props) => Partial<props>, opts?: { priority?: boolean; filter?: string[] }) => AttrsComponent` | Layer default props; returns a new component |
| `.config()` | `({ name?, component?, DEBUG? }) => AttrsComponent` | Rename / swap base / toggle debug; returns a new component |
| `.compose()` | `(Record<string, (c) => c \| null \| undefined \| false>) => AttrsComponent` | Attach/remove named HOCs; returns a new component |
| `.statics()` | `(Record<string, unknown>) => AttrsComponent` | Attach metadata onto `.meta`; returns a new component |
| `.getDefaultAttrs()` | `(props) => Record<string, unknown>` | Resolve the accumulated `.attrs()` chain against `props` |

### `AttrsComponent` properties

| Property | Type | Description |
| -------- | ---- | ----------- |
| `IS_ATTRS` | `true` | Marker checked by `isAttrsComponent` |
| `displayName` | `string` | The resolved name (from `name`, or the base's `displayName` / `name`) |
| `meta` | `Record<string, unknown>` | Statics attached via `.statics()` |
| `$$types` | _type-only_ | Accumulated origin + extended props |
| `$$originTypes` | _type-only_ | Base component's props |
| `$$extendedTypes` | _type-only_ | Props added via `.attrs<P>()` |

### Exports

| Export | Type | Description |
| ------ | ---- | ----------- |
| `attrs` (default + named) | Function | The factory — `attrs({ name, component })` |
| `isAttrsComponent` | Function | Runtime guard — `true` for `attrs()`-produced components |

### Exported types

| Type | Description |
| ---- | ----------- |
| `Attrs` | The factory function type |
| `AttrsComponent` | The component produced by the chain (with chain methods + introspection) |
| `AttrsComponentType` | An `ElementType` carrying the `IS_ATTRS: true` marker |
| `AttrsCb` | Callback form of `.attrs()`: `(props) => Partial<props>` |
| `ConfigAttrs` | Parameters for `.config()`: `{ name?, component?, DEBUG? }` |
| `ComposeParam` | The `.compose()` argument: `Record<string, GenericHoc \| null \| undefined \| false>` |
| `GenericHoc` | A HOC: `(component: ElementType) => ElementType` |
| `ComponentFn` | A Pyreon component function with optional static props |
| `ElementType` | A `ComponentFn` or intrinsic tag string |
| `IsAttrsComponent` | Type of the `isAttrsComponent` guard |
| `TObj` | `Record<string, unknown>` |
