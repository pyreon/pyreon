# @pyreon/attrs

Chainable HOC factory for default props, base swaps, composition, and statics.

`@pyreon/attrs` wraps a Pyreon component in an immutable, chainable builder that accumulates default props (`.attrs()`), reconfigures the base component (`.config()`), composes additional HOCs (`.compose()`), and attaches static metadata (`.statics()`). Every chain method returns a new component — the original is never mutated — and TypeScript generics accumulate so prop types stay correct after each `.attrs<P>({...})` call. It's the foundation `@pyreon/rocketstyle` builds on; you'll also use it directly when you want default-prop composition without the dimension-styling layer.

## Install

```bash
bun add @pyreon/attrs @pyreon/core @pyreon/ui-core
```

## Quick start

```tsx
import attrs from '@pyreon/attrs'
import { Element } from '@pyreon/elements'

const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({
    backgroundColor: primary ? 'blue' : 'gray',
  }))

// Renders Element with the accumulated defaults
<Button label="Click me" />

// Explicit props override .attrs() defaults (unless `priority: true`)
<Button tag="a" href="/x" label="Link button" />
```

## API

### `attrs({ name, component })`

Factory entry. Returns a Pyreon `ComponentFn` enhanced with chainable methods. Both `name` (used as `displayName` and a dev `data-attrs` attribute) and `component` (the base) are required — dev mode throws on missing values.

### `.attrs(props | callback, options?)`

Add default props. Call multiple times — defaults stack left-to-right in the chain.

```ts
// Object form
Button.attrs({ tag: 'button' })

// Callback form — receives the current resolved props
Button.attrs<{ label: string }>((props) => ({
  'aria-label': props.label,
}))

// Priority — wins over EXPLICIT props at the call site
Button.attrs({ tag: 'button' }, { priority: true })

// Filter — strip these prop names before forwarding to the base
Button.attrs({}, { filter: ['internalFlag', 'variant'] })
```

**Merge order at render time:**

```text
priorityAttrs  →  attrs  →  explicit props  →  filterAttrs strips → base component
```

For regular `attrs`, explicit props win. For `priorityAttrs`, the priority value wins (used by `rocketstyle` to lock structural props like `tag`).

### `.config({ name?, component?, DEBUG? })`

Swap the underlying component, rename, or toggle dev debugging. Returns a new instance.

```ts
const Anchor = Button.config({ component: 'a', name: 'Anchor' })
```

**Gotcha**: swapping `component` resets the `attrs` / `priorityAttrs` / `filterAttrs` / `compose` chains because they were tailored to the previous component's prop shape (applying them blindly leaks invalid attrs to the DOM). `theme` / `styles` / dimension chains are preserved. Re-chain shared attrs explicitly if you need them.

### `.compose({ hocName: hocFn })`

Attach named HOCs to the chain. Applied in registration order — outermost wraps first. Pass `null` to remove a previously composed HOC.

```ts
const Enhanced = Button.compose({
  withTheme: (Component) => (props) => Component({ ...props, themed: true }),
  withTracking: trackingHoc,
})

const NoTracking = Enhanced.compose({ withTracking: null })
```

### `.statics({ key: value })`

Attach arbitrary metadata on `.meta`. Used by `@pyreon/document-primitives` (`_documentType`) and other systems that need post-construction component introspection.

```ts
const Btn = attrs({ name: 'Btn', component: Element }).statics({
  category: 'action',
  sizes: ['sm', 'md', 'lg'],
})

Btn.meta.category // 'action'
```

### `.getDefaultAttrs()`

Resolve the accumulated default props (calls every `.attrs()` callback with `{}`).

```ts
Button.getDefaultAttrs() // { tag: 'button', alignX: 'center', alignY: 'center' }
```

### `isAttrsComponent(value)`

Runtime guard — returns `true` for components produced by `attrs()`.

```ts
import { isAttrsComponent } from '@pyreon/attrs'
isAttrsComponent(Button) // true
isAttrsComponent('div')   // false
```

## TypeScript

Each `.attrs<P>()` generic accumulates into the component's prop type. Three type-only properties expose the accumulated shapes:

```ts
type AllProps      = typeof Button.$$types          // origin + extended
type OriginProps   = typeof Button.$$originTypes    // base component's props
type ExtendedProps = typeof Button.$$extendedTypes  // everything added through .attrs<P>()
```

Use `ExtractProps<typeof Button>` from `@pyreon/core` to recover the union when forwarding through another HOC.

## Gotchas

- **`.config({ component })` resets the prop chains.** Re-chain shared attrs explicitly if you swap the base. `theme` / `styles` / dimension chains survive.
- **Defaults are merged, not deep-merged.** Object-valued props (e.g. `style={{ color: 'red' }}`) get replaced, not combined.
- **The dev `data-attrs` attribute is added in dev builds** to aid debugging. Tree-shaken in production (gated on `process.env.NODE_ENV !== 'production'`).
- **`hoistNonReactStatics`** copies non-React statics from the base onto the wrapper, so `MyComponent.someStaticMethod` survives the HOC chain.
- **Generic accumulation has a depth limit** — TypeScript's recursive conditional-type inference caps at ~24-50 levels depending on the host environment. If you stack `.attrs<P>()` calls past that, narrow generics or split the component.

## Documentation

Full docs: [pyreon.dev/docs/attrs](https://pyreon.dev/docs/attrs) (or `docs/src/content/docs/attrs.md` in this repo).

## License

MIT
