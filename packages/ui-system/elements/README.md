# @pyreon/elements

Five foundational layout primitives — Element, Text, List, Overlay, Portal — plus an Iterator helper.

`@pyreon/elements` is the layer between `@pyreon/styler`/`@pyreon/unistyle` and the high-level UI components. Every layout prop is responsive (single value, mobile-first array, or breakpoint object). `Element` is a three-section flex container (`beforeContent` / `content` / `afterContent`) with an internal fast path that collapses one wrapper layer when only `content` is present — measured 31-45% faster across mount benchmarks. `Overlay` ships a full `useOverlay` hook handling open/close, viewport flipping, ESC, click-outside, scroll tracking, hover delay, and modal overflow-locking — no positioning logic to reinvent. `Iterator` and `List` cover data-driven children with positional metadata; `Portal` renders into an isolated wrapper inside a configurable DOM location.

## Install

```bash
bun add @pyreon/elements @pyreon/core @pyreon/reactivity @pyreon/ui-core @pyreon/unistyle
```

## Quick start

```tsx
import { Element, Text, List, Overlay, Portal, Provider } from '@pyreon/elements'

<Provider>
  <Element
    tag="button"
    direction="inline"
    alignX="center"
    alignY="center"
    gap={8}
    beforeContent={<Icon name="star" />}
    afterContent={<Icon name="chevron-right" />}
  >
    Click me
  </Element>
</Provider>
```

`Provider` is re-exported from `@pyreon/unistyle` — set it once near the app root to scope breakpoints, root-size, and theme defaults.

## `Element` — three-section flex layout

Most-used primitive. Renders an outer container with optional `beforeContent` / `afterContent` slots flanking the main `content` (children).

```tsx
<Element
  tag="button"
  direction="inline"        // 'inline' | 'rows' | 'reverseInline' | 'reverseRows'
  alignX="center"            // 'left' | 'center' | 'right' | 'spaceBetween' | ...
  alignY="center"            // 'top' | 'center' | 'bottom' | 'stretch' | ...
  gap={8}
  block                     // flex vs inline-flex
  equalCols                  // equalize before/after widths via ResizeObserver
  equalBeforeAfter
  beforeContent={<Icon />}
  afterContent={<Icon />}
>
  Action
</Element>
```

**Content slots** (priority: `children` > `content` > `label`):

| Prop | Type | Notes |
|---|---|---|
| `children` | `VNodeChild` | Standard JSX children |
| `content` | `VNodeChild` | Alternative slot when `children` is awkward |
| `label` | `VNodeChild` | Third fallback; useful in data-driven `List` |
| `beforeContent` | `VNodeChild` | Rendered before the main slot |
| `afterContent` | `VNodeChild` | Rendered after the main slot |

**Layout props** (all responsive):

| Prop | Default | Description |
|---|---|---|
| `tag` | `'div'` | Outer HTML tag |
| `direction` | `'inline'` | `'inline'` (row) / `'rows'` (column) / `'reverseInline'` / `'reverseRows'` |
| `alignX` | `'left'` | Horizontal alignment along the flex direction |
| `alignY` | `'center'` | Cross-axis alignment |
| `gap` | — | Gap between sections |
| `block` | — | `flex` vs `inline-flex` |
| `equalCols` | — | Equal width for before/after columns (snapshot at mount) |
| `equalBeforeAfter` | — | Equalize before/after via live `ResizeObserver` (resilient to async font/content changes) |
| `dangerouslySetInnerHTML` | — | Forwards to `runtime-dom` / `runtime-server` |

Per-section overrides: `contentDirection`, `contentAlignX`, `beforeContentAlignY`, `afterContentDirection`, etc. — every section accepts the same axis props prefixed with the section name.

**Simple-path fast path**: when there's no `beforeContent` / `afterContent` and the tag doesn't need the button/fieldset/legend two-layer flex fix, Element inlines the wrapper helper into ONE styled invocation. Saves one component invocation + one `splitProps` + one `mountChild` per Element. Real-Chromium benchmark drops a 500-child mount from 2.9ms to 1.6ms (-45%).

## `Text` — semantic typography

```tsx
<Text tag="h1">Heading</Text>
<Text paragraph>This renders as a <p>.</Text>
<Text tag="strong">Bold</Text>
```

| Prop | Type | Notes |
|---|---|---|
| `tag` | `'h1'`-`'h6'` / `'p'` / `'span'` / `'strong'` / `'em'` / `'small'` / … | Inline-by-default |
| `paragraph` | `boolean` | Shorthand for `tag="p"` |
| `children` / `label` | `VNodeChild` | Text content |
| `css` | `ExtendCss` | Extend styling |

## `List` — data-driven children with positional metadata

```tsx
<List
  component={ListItem}
  data={[
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ]}
  itemKey="id"
  itemProps={(item, { first, last, odd, even, index }) => ({
    highlighted: first,
    separator: !last,
  })}
/>

// With root Element wrapper — gap/direction/align take effect
<List
  rootElement
  direction="rows"
  gap={8}
  component={Card}
  data={items}
/>
```

| Prop | Type | Notes |
|---|---|---|
| `data` | `Array<string \| number \| object>` | Source data |
| `component` | `ComponentFn` | Renders per item |
| `valueName` | `string` | Prop name for scalar values (default `'children'`) |
| `itemKey` | `string \| (item) => Key` | Key extractor |
| `itemProps` | `object \| (item, meta) => object` | Extra props injected per item |
| `wrapComponent` | `ComponentFn` | Wrapper around each item |
| `rootElement` | `boolean` | Wrap in an `Element` (enables `direction` / `gap` / `align`) |

Positional metadata (`{ index, first, last, odd, even, position }`) is passed to both `itemKey` and `itemProps` callbacks.

## `Iterator` — lower-level data iterator

Same data/component model as `List`, four typed overloads (simple values, object values, children-only, loose forwarding) so spread-pattern wrapping (`<Iterator {...wrapperProps} />`) typechecks. Use when you don't need List's auto-wrap layout — e.g. emitting a flat array of `<option>` elements inside a `<select>`.

## `Overlay` + `useOverlay` — dropdowns / tooltips / popovers / modals

```tsx
<Overlay
  openOn="click"
  closeOn="clickOutsideContent"
  type="dropdown"
  align="bottom"
  alignX="left"
  offsetX={0}
  offsetY={4}
  closeOnEsc
  hoverDelay={150}
  trigger={<Button>Open menu</Button>}
>
  <DropdownMenu />
</Overlay>
```

For headless control, use the hook directly:

```tsx
const overlay = useOverlay({
  openOn: 'click',
  closeOn: 'clickOnTrigger',
  type: 'tooltip',
  align: 'top',
  onOpen: () => track('tooltip-open'),
})
// overlay.isOpen / overlay.toggle / overlay.open / overlay.close / overlay.position()
```

Built-in behaviour:
- **Viewport-edge flipping** — automatically flips align when the content would overflow.
- **Throttled positioning** — scroll + resize listeners throttled (default delay 60ms).
- **ESC + click-outside** — opt-in via `closeOnEsc` / `closeOn: 'clickOutsideContent'`.
- **Hover delay** — `hoverDelay` debounces both open and close for `openOn: 'hover'`.
- **Modal overflow lock** — `type: 'modal'` ref-counts `document.body` overflow so nested modals don't double-lock.

`OverlayProvider` + `useOverlayContext` coordinate nested overlays (a parent dropdown can block its children's click-outside).

## `Portal` — render into a different DOM location

```tsx
<Portal target={document.body} tag="div" data-modal-id="settings">
  <Modal />
</Portal>
```

Creates a per-instance wrapper element (default `<div>`, configurable via `tag`) INSIDE `target` (default `document.body`). Multiple portals share `target` without intermingling children — each gets its own wrapper.

| Prop | Default | Notes |
|---|---|---|
| `target` | `document.body` | Destination element (`HTMLElement \| (() => HTMLElement) \| null`) |
| `tag` | `'div'` | Wrapper HTML tag |
| Any data-/aria- attrs | — | Forwarded to the wrapper |

## `Util` — utility wrapper for non-layout primitives

Reserved escape-hatch for components that need styler integration without Element's layout props (e.g. SVG roots). Same theme/style pipeline, no axis/gap props.

## Responsive values

```ts
direction="inline"                                  // single value
direction={['rows', 'inline']}                       // mobile-first array
direction={{ xs: 'rows', md: 'inline', lg: 'inline' }} // breakpoint object
```

Applies to `tag`, `direction`, `alignX`, `alignY`, `gap`, `block`, `equalCols`, and every per-section variant.

## Gotchas

- **Wrapper drops the children slot for void tags** (`<hr>`, `<input>`, `<img>`, `<br>`, etc.) so `{undefined}` JSX slots don't trip runtime-dom's "void element cannot have children" warning. If you author a custom wrapper that forwards `children`, branch on `getShouldBeEmpty(tag)` first.
- **`<Portal>` creates a per-instance wrapper INSIDE `target`** — `document.body.firstChild` is not your modal; query via `document.body.querySelector('[data-modal-id]').parentElement`.
- **`equalBeforeAfter` uses `ResizeObserver`** and falls back to a one-shot measurement when the API is unavailable (SSR, older runtimes). For async content (font swaps, lazy images) you want `equalBeforeAfter`, not `equalCols`.
- **Element's `direction` accepts `'inline' | 'rows' | 'reverseInline' | 'reverseRows'`** — `'row'` is invalid (caught by TS).
- **`Iterator` ships 4 overloads with a `LooseProps` fallback** so `<Iterator {...wrapperProps} />` forwarding patterns typecheck. The trade-off: mixed-shape arrays (`[1, {id:1}, null]`) bind to the fallback rather than failing at the type level. Runtime still picks the right mode based on which props are populated.

## Documentation

Full docs: [docs.pyreon.dev/docs/elements](https://docs.pyreon.dev/docs/elements) (or `docs/docs/elements.md` in this repo).

## License

MIT
