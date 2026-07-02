---
title: "Chainable HOC Factory — API Reference"
description: "Chainable HOC factory — default props (.attrs), base swaps (.config), HOC composition (.compose), statics (.statics)"
---

# @pyreon/attrs — API Reference

> **Generated** from `attrs`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [attrs](/docs/attrs).

Chainable HOC factory for Pyreon components. `attrs({ name, component })` wraps a component in an immutable builder that accumulates default props (`.attrs()`), reconfigures the base (`.config()`), composes named HOCs (`.compose()`), and attaches static metadata (`.statics()`). Every chain method returns a NEW component — the original is never mutated — and `.attrs<P>()` generics accumulate into the component's prop type. It is the chaining foundation `@pyreon/rocketstyle` builds on; use it directly for default-prop composition without the dimension-styling layer.

## Features

- attrs(&#123; name, component &#125;) factory — immutable chainable builder, every method returns a new component
- .attrs(object | callback, &#123; priority?, filter? &#125;) — stacking default props; callbacks receive the current resolved props
- Merge precedence priorityAttrs &lt; attrs &lt; explicit props — call-site props always win; undefined values never shadow defaults
- .config(&#123; name?, component?, DEBUG? &#125;) — rename / base swap / dev logging; chains are PRESERVED across a swap
- .compose(&#123; name: hoc &#125;) — named HOC record; falsy value removes a previously composed HOC
- .statics(meta) — metadata on Component.meta, merged across calls
- TypeScript accumulation — .attrs&lt;P&gt;() widens the prop type; $$types / $$originTypes / $$extendedTypes expose the shapes
- Descriptor-safe prop forwarding — reactive getter props survive the HOC chain (mergeProps, not spread)

## Complete example

A full, end-to-end usage of the package:

```tsx
import attrs, { isAttrsComponent } from '@pyreon/attrs'
import { Element } from '@pyreon/elements'

// Factory takes { name, component } — BOTH required (dev mode throws)
const Button = attrs({ name: 'Button', component: Element })
  // Object form — static default props
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' })
  // Callback form — receives the current resolved props; the generic
  // accumulates into the component's prop type
  .attrs<{ primary?: boolean }>(({ primary }) => ({
    backgroundColor: primary ? 'blue' : 'gray',
  }))

// Defaults apply; explicit call-site props always win
<Button label="Click me" />
<Button tag="a" href="/x" label="Link" />      // tag: 'a' overrides the default

// Strip internal control props before they reach the base / DOM
const Card = attrs({ name: 'Card', component: Element })
  .attrs(({ elevated }) => ({ shadow: elevated ? 'lg' : 'none' }), { filter: ['elevated'] })

// Swap the base — attrs' .config PRESERVES the accumulated chains
// (unlike @pyreon/rocketstyle, which resets them on a component swap)
const Anchor = Button.config({ component: 'a', name: 'Anchor' })

// Named HOC composition — falsy value removes a previously composed HOC
const Tracked = Button.compose({ withTracking: (C) => (props) => C(props) })
const Untracked = Tracked.compose({ withTracking: null })

// Static metadata lands on .meta
const Tagged = Button.statics({ category: 'action' })
Tagged.meta.category                            // 'action'

// Introspection
Button.getDefaultAttrs({})                      // resolved default props
isAttrsComponent(Button)                        // true (IS_ATTRS marker)
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`attrs`](#attrs) | function | Factory entry (default + named export). |
| [`.attrs()`](#attrs) | function | Add default props. |
| [`.config()`](#config) | function | Reconfigure the builder: rename (`name` → new `displayName`), swap the underlying base component (`component`), or toggl |
| [`.compose()`](#compose) | function | Attach named higher-order components. |
| [`.statics()`](#statics) | function | Attach arbitrary metadata, readable on the component's `.meta` object. |
| [`.getDefaultAttrs()`](#getdefaultattrs) | function | Resolve the accumulated `.attrs()` chain for a given props bag — every callback in the chain runs against `props` and th |
| [`isAttrsComponent`](#isattrscomponent) | function | Runtime type guard — `true` when a value was created by `attrs()` (checks the own `IS_ATTRS` marker). |

## API

### attrs `function`

```ts
<C extends ElementType>({ name, component }: { name: string; component: C }) => AttrsComponent
```

Factory entry (default + named export). Wraps `component` in a Pyreon `ComponentFn` enhanced with the chain methods (`.attrs()` / `.config()` / `.compose()` / `.statics()` / `.getDefaultAttrs()`). `name` becomes the `displayName` and, in dev builds, a `data-attrs` attribute on the rendered output for debugging. Both fields are required — dev mode throws a descriptive error on a missing one. Non-React statics from the base are hoisted onto the wrapper so `Base.someStatic` survives the chain; the component carries the `IS_ATTRS: true` marker.

**Example**

```tsx
import attrs from '@pyreon/attrs'
import { Element } from '@pyreon/elements'

const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({
    backgroundColor: primary ? 'blue' : 'gray',
  }))

<Button label="Click me" />
<Button tag="a" href="/x" />   // explicit props override the defaults
```

**Common mistakes**

- Calling the factory with a bare component — `attrs(Element)` is wrong; the argument is the object `{ name, component }` and both keys are required (dev mode throws)
- Expecting chain calls to mutate — every method returns a NEW component; `Button.attrs({...})` without assigning the return value changes nothing
- Expecting deep merges — defaults are shallow-merged; an object-valued prop (`style={{ color: "red" }}`) from the call site REPLACES the default object, it does not combine with it
- Stacking very deep `.attrs<P>()` generic chains — TypeScript's recursive conditional-type inference caps at roughly 24-50 levels depending on the host; past that, narrow the generics or split the component
- Forwarding props onward with a plain spread inside a composed HOC — `{ ...props }` fires reactive getter props once and collapses them to static values; pass by reference or merge with `mergeProps` from `@pyreon/core`
- Relying on the `data-attrs` debug attribute in production — it is dev-only (`process.env.NODE_ENV !== "production"`) and tree-shaken from production builds

**See also:** `isAttrsComponent` · `@pyreon/rocketstyle` · `@pyreon/core`

---

### .attrs() `function`

```ts
<P>(attrs: object | ((props) => object), opts?: { priority?: boolean; filter?: string[] }) => AttrsComponent
```

Add default props. Object form for static defaults; callback form receives the CURRENT resolved props (priority attrs + explicit props) and returns a partial. Calls stack — later `.attrs()` calls override earlier ones for the same key. Render-time merge precedence is `priorityAttrs < attrs < explicit call-site props` (last wins); explicit `undefined` values are stripped first so they never shadow a default. `{ priority: true }` routes the entry to the priority chain — resolved FIRST and visible as input to later `.attrs()` callbacks, but LOWEST precedence in the final merge. `{ filter: [...] }` strips those prop names before they reach the base component; filter lists accumulate across the chain. The `<P>` generic widens the component's prop type.

**Example**

```tsx
const Input = attrs({ name: 'Input', component: Element })
  // Callback form — reads the resolved props
  .attrs<{ error?: boolean }>((props) => ({
    'aria-invalid': props.error ? 'true' : undefined,
  }))
  // Keep the control prop off the DOM
  .attrs({}, { filter: ['error'] })

// Later calls override earlier ones
const Base = attrs({ name: 'Base', component: Element }).attrs({ size: 'md' })
const Small = Base.attrs({ size: 'sm' })     // → size: 'sm'
```

**Common mistakes**

- Assuming `{ priority: true }` means highest precedence — despite the name, priority attrs are resolved EARLY (so normal `.attrs()` callbacks can read them as input) but sit at the LOWEST precedence in the final merge: `priorityAttrs < attrs < explicit props`
- Expecting an explicit `undefined` at the call site to defeat a default — `undefined`-valued props are stripped before merging, so the `.attrs()` default still applies
- Expecting the callback to re-run reactively — `.attrs()` callbacks run once per mount during the HOC's prop resolution; reactive getter props flowing THROUGH the merge stay live for downstream JSX, but a value the callback READS is a one-shot snapshot
- Forgetting `filter` accumulates — every name listed in any `.attrs(..., { filter })` call along the chain is stripped; a later call cannot un-filter an earlier name
- Confusing this chain method with rocketstyle's `.attrs()` — the rocketstyle variant passes extra callback arguments `(props, theme, helpers)`; the plain attrs callback receives only the resolved props

**See also:** `.config()` · `.getDefaultAttrs()`

---

### .config() `function`

```ts
(opts: { name?: string; component?: ElementType; DEBUG?: boolean }) => AttrsComponent
```

Reconfigure the builder: rename (`name` → new `displayName`), swap the underlying base component (`component`), or toggle dev debugging (`DEBUG`). Returns a new component; the original keeps its own name/base. Unlike `@pyreon/rocketstyle`, swapping `component` at this layer PRESERVES the accumulated `.attrs()` / `priorityAttrs` / `filter` / `.compose()` / `.statics()` chains and re-applies them to the new base — reconciling the new base's prop shape is the caller's responsibility.

**Example**

```tsx
const Button = attrs({ name: 'Button', component: Element }).attrs({ tag: 'button' })

const Renamed = Button.config({ name: 'PrimaryButton' })
Renamed.displayName   // 'PrimaryButton'
Button.displayName    // 'Button' — original untouched

// Base swap — the .attrs() chain still applies to the new base
const Anchor = Button.config({ component: 'a', name: 'Anchor' })
```

**Common mistakes**

- Expecting the rocketstyle chain-reset behavior — `@pyreon/attrs`' `.config({ component })` KEEPS the accumulated chains across a base swap (test-locked); only `@pyreon/rocketstyle`'s `.config()` resets prop-shape-coupled chains. If the new base has a different prop shape, stale defaults can leak invalid props — audit them yourself
- Passing dimension or theme options — this `.config()` accepts only `name` / `component` / `DEBUG`; dimensions/provider/consumer/inversed are `@pyreon/rocketstyle` `.config()` surface
- Reading `displayName` off the original after renaming — `.config()` is immutable; the rename lands on the RETURNED component

**See also:** `attrs` · `.attrs()` · `@pyreon/rocketstyle`

---

### .compose() `function`

```ts
(hocs: Record<string, ((c: ComponentFn) => ComponentFn) | null | false>) => AttrsComponent
```

Attach named higher-order components. The argument is a RECORD of `{ name: hoc }` — the name is the removal handle: a later `.compose({ name: null })` (or `undefined` / `false`) removes that HOC from the chain; only function values are kept. Application order: the record's values are reversed so the LAST-defined HOC wraps innermost, and the built-in attrs HOC (which resolves the `.attrs()` chain) is always the outermost wrapper — default props are computed before any user HOC runs.

**Example**

```tsx
const withTheme = (Component) => (props) => Component(props)
const withTracking = (Component) => (props) => Component(props)

const Enhanced = attrs({ name: 'Button', component: Element })
  .compose({ withTheme, withTracking })

// Remove one by its name
const NoTracking = Enhanced.compose({ withTracking: null })
```

**Common mistakes**

- Passing an array of HOCs — `.compose()` takes a named record; the names are what make falsy-removal possible
- A composed HOC that value-copies props (`const next = { ...props }`) — fires reactive getter props at setup and collapses them to static values; copy descriptors (`mergeProps` / `splitProps` from `@pyreon/core`) or pass by reference
- Assuming record order equals wrap order outside-in — values are REVERSED before composition, so the last-defined HOC runs closest to the component; the attrs HOC always stays outermost regardless

**See also:** `attrs` · `.config()`

---

### .statics() `function`

```ts
(meta: Record<string, unknown>) => AttrsComponent
```

Attach arbitrary metadata, readable on the component's `.meta` object. Successive `.statics()` calls merge (later keys win). Used by systems that need post-construction component introspection — e.g. `@pyreon/document-primitives` reads `_documentType` this way.

**Example**

```tsx
const Btn = attrs({ name: 'Btn', component: Element }).statics({
  category: 'action',
  sizes: ['sm', 'md', 'lg'],
})

Btn.meta.category   // 'action'
Btn.meta.sizes      // ['sm', 'md', 'lg']
```

**Common mistakes**

- Reading statics directly off the component — in `@pyreon/attrs` they land on `Component.meta`, NOT on the component object itself (rocketstyle's `.statics()` additionally assigns onto the component; this layer does not)
- Using `.statics()` for per-instance data — statics are definition-level metadata shared by every instance

**See also:** `.compose()` · `isAttrsComponent`

---

### .getDefaultAttrs() `function`

```ts
(props: TObj) => TObj
```

Resolve the accumulated `.attrs()` chain for a given props bag — every callback in the chain runs against `props` and the results merge left-to-right (later calls win). Useful for introspection and testing the resolved defaults without mounting.

**Example**

```tsx
const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({ kind: primary ? 'primary' : 'plain' }))

Button.getDefaultAttrs({})                  // { tag: 'button', alignX: 'center', kind: 'plain' }
Button.getDefaultAttrs({ primary: true })   // { ..., kind: 'primary' }
```

**Common mistakes**

- Expecting priority attrs in the result — `getDefaultAttrs` resolves only the normal `.attrs()` chain, not `priorityAttrs`
- Calling with no argument when callbacks destructure props — pass at least `{}` so `({ primary }) => ...` callbacks don't destructure `undefined`

**See also:** `.attrs()`

---

### isAttrsComponent `function`

```ts
<T>(component: T) => boolean
```

Runtime type guard — `true` when a value was created by `attrs()` (checks the own `IS_ATTRS` marker). Use it to discriminate attrs-wrapped components from plain functions; `typeof value === "function"` cannot tell them apart because an attrs component IS callable.

**Example**

```tsx
import { isAttrsComponent } from '@pyreon/attrs'

isAttrsComponent(Button)      // true
isAttrsComponent('div')       // false
isAttrsComponent(() => null)  // false — plain functions lack the marker
```

**Common mistakes**

- Discriminating with `typeof value === "function"` — attrs components are callable, so use the marker guard instead
- Testing a rocketstyle component — rocketstyle components carry `IS_ROCKETSTYLE`, not `IS_ATTRS`; use `isRocketComponent` from `@pyreon/rocketstyle` for those

**See also:** `attrs` · `@pyreon/rocketstyle`

---

## Package-level notes

> **Note:** 'priority' does NOT mean 'highest precedence' — priorityAttrs resolve FIRST (so later .attrs() callbacks can read them as input) but sit at the LOWEST precedence in the final merge: priorityAttrs &lt; attrs &lt; explicit props. @pyreon/rocketstyle uses the slot to seed structural base props the dimension layer can still override.

> **Chains survive base swaps:** `.config({ component })` at this layer PRESERVES the accumulated chains and re-applies them to the new base — the chain-reset-on-swap behavior belongs to `@pyreon/rocketstyle`, one layer up. Reconciling the new base's prop shape is on the caller.

> **Type accumulation:** Each `.attrs<P>()` generic accumulates into the component's prop type; the type-only `$$types` (origin + extended), `$$originTypes`, and `$$extendedTypes` properties expose the accumulated shapes, and `ExtractProps<typeof C>` from `@pyreon/core` recovers the union for HOC forwarding.

> **Descriptor-safe forwarding:** The attrs HOC merges consumer props via `mergeProps` / `removeUndefinedProps` from `@pyreon/core` (descriptor copies), so compiler-emitted reactive getter props survive the chain. Any HOC you `.compose()` must do the same — a plain `{ ...props }` spread collapses reactive props to static values.
