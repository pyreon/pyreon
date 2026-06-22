---
title: "Base Primitives — API Reference"
description: "Five foundational layout primitives — Element, Text, List, Overlay, Portal — plus the useOverlay positioning hook and the Iterator data helper"
---

# @pyreon/elements — API Reference

> **Generated** from `elements`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [elements](/docs/elements).

The structural layer every styled / rocketstyle component renders through. `Element` is the responsive flexbox block (direction / alignX / alignY / gap / block + before/after content slots); `Text` is inline typography; `List` is a flowing-children container with the four-overload Iterator data API; `Overlay` is a positioned layer with backdrop driven by `useOverlay` (viewport flip, ESC, click-outside, scroll tracking, hover delay — never reimplement this); `Portal` renders children outside the DOM hierarchy into a per-instance wrapper. Element has a 2026-Q2 simple-path fast path that inlines the Wrapper helper for non-compound, non-needsFix tags (31-45% faster mount) — its rendered VNode then exposes the HTML tag as `props.as` and layout under `props.$element.{...}` instead of flat props.

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`Element`](#element) | component | The responsive flexbox block primitive every layout-bearing component renders through. |
| [`Text`](#text) | component | Inline typography primitive — the text counterpart to `Element`. |
| [`List`](#list) | component | A flowing-children container (`ul` / `ol` / `dl` / custom) built on the Iterator data API. |
| [`Overlay`](#overlay) | component | A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. |
| [`useOverlay`](#useoverlay) | hook | The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. |
| [`OverlayProvider`](#overlayprovider) | component | Context provider that lets nested overlays coordinate (shared root, stacking, outside-click scoping). |
| [`Portal`](#portal) | component | Renders children OUTSIDE the parent DOM hierarchy — into a PER-INSTANCE wrapper element (default `<div>`, configurable v |
| [`Iterator`](#iterator) | component | The data-iteration helper backing `List` (default export of `helpers/Iterator`). |
| [`Util`](#util) | component | A bare utility primitive — the minimal structural wrapper when you need an Element-family node without layout semantics  |
| [`Provider`](#provider) | component | Re-exported from `@pyreon/unistyle` for convenience (responsive/breakpoint context). |

## API

### Element `component`

```ts
Element(props: ElementProps): VNodeChild
```

The responsive flexbox block primitive every layout-bearing component renders through. Layout props live here (NOT in a styler `.theme()`): `direction` (`inline` | `rows` | `reverseInline` | `reverseRows` — note `row` is INVALID), `alignX`, `alignY`, `gap`, `block`, plus `beforeContent` / `afterContent` slot wrappers and `equalBeforeAfter` (equalizes the slot widths on mount AND keeps them equal via ResizeObserver). The 2026-Q2 simple-path fast path inlines the Wrapper for non-compound, non-needsFix tags: the rendered VNode then exposes the HTML tag as `props.as` and layout under `props.$element.{direction,alignX,alignY,block,equalCols,extraStyles}` rather than flat props (styled-components consumers see no change since `as` is the canonical tag selector).

**Example**

```tsx
import { Element } from "@pyreon/elements"

<Element tag="section" direction="rows" gap="md" alignX="center">
  <Header />
  <Body />
</Element>
```

**Common mistakes**

- Using `direction="row"` — invalid; the values are `inline` / `rows` / `reverseInline` / `reverseRows`
- Putting layout props in a styler `.theme()` callback — `direction` / `alignX` / `alignY` / `gap` / `block` are Element ATTRS, not CSS; theme is for colors / spacing / borders
- Reading flat `props.direction` on a simple-path Element in a test or styled consumer — the fast path moves layout to `props.$element.*` and the tag to `props.as`; read both shapes via a helper
- Passing children to a void `tag` (`hr` / `img` / `br` / `input`) — Element correctly drops them; do not rely on a children slot for void tags
- Relying on `equalBeforeAfter` measuring async slot content where `ResizeObserver` is undefined (older runtimes / SSR) — it falls back to the one-shot mount measurement there

**See also:** `Text` · `List` · `Portal`

---

### Text `component`

```ts
Text(props: TextProps): VNodeChild
```

Inline typography primitive — the text counterpart to `Element`. Carries typography props and renders an inline element; use it for runs of text that need the design-system typography contract rather than a raw `<span>`. Like `Element`, visual styling belongs in the styler/rocketstyle layer; `Text` owns the inline-flow structure.

**Example**

```tsx
import { Text } from "@pyreon/elements"

<Text tag="span">Inline label</Text>
```

**See also:** `Element`

---

### List `component`

```ts
List(props: ListProps): VNodeChild
```

A flowing-children container (`ul` / `ol` / `dl` / custom) built on the Iterator data API. Render children directly OR drive it with `data` + a `component` renderer. Inherits Iterator’s four typed overloads (Simple / Object / Children / Loose) and additionally blocks Element-only `label` / `content` props at the type level.

**Example**

```tsx
import { List } from "@pyreon/elements"

<List tag="ul" data={items()} component={(item) => <li>{item.name}</li>} />
```

**Common mistakes**

- Mixing primitive and object entries in `data` (`[1, {id:1}, null]`) — primitive arrays and object arrays are mutually exclusive iteration modes; the typed overloads reject the mix for direct callers
- Passing `valueName` with an object-array `data` — `valueName` is a Simple-mode (primitive) prop only
- Passing `children` AND `data`/`component` — Children mode and Object mode are distinct overloads; pick one

**See also:** `Iterator` · `Element`

---

### Overlay `component`

```ts
Overlay(props: OverlayProps): VNodeChild
```

A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. It handles viewport flipping, ESC-to-close, click-outside, scroll tracking, and hover delay — do NOT reimplement any of that in a primitive; compose `Overlay` (or `useOverlay`) instead. Renders through `Portal` so the layer escapes overflow/stacking contexts.

**Example**

```tsx
import { Overlay } from "@pyreon/elements"

<Overlay isOpen={open()} type="dropdown" align="bottom" onClose={() => open.set(false)}>
  <Menu />
</Overlay>
```

**Common mistakes**

- Hand-rolling positioning / flip / click-outside / ESC logic in a tooltip or dropdown primitive — `useOverlay` already owns all of it; reimplementing drifts from the shared behavior
- Reading the rendered overlay as `document.body.firstChild` — it renders through `Portal` into a per-instance wrapper; traverse the wrapper, not body’s direct child

**See also:** `useOverlay` · `OverlayProvider` · `Portal`

---

### useOverlay `hook`

```ts
useOverlay(props?: Partial<UseOverlayProps>): { isOpen, open, close, toggle, triggerProps, overlayProps, /* … */ }
```

The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. Options: `openOn` / `closeOn` (`click` | `hover` | …), `type` (`dropdown` | `modal` | …), `position` (`fixed` | …), `align` + `alignX` / `alignY` + `offsetX` / `offsetY`, `closeOnEsc`, `hoverDelay`, `throttleDelay`, `parentContainer`, `disabled`, `onOpen` / `onClose`. SSR-safe: the internal positioning helpers early-return under no-`window` so the contract is documented at the call site rather than crashing on the server.

**Example**

```tsx
import { useOverlay } from "@pyreon/elements"

const o = useOverlay({ openOn: "hover", type: "tooltip", hoverDelay: 150 })
// spread o.triggerProps on the anchor, o.overlayProps on the floating layer
```

**Common mistakes**

- Passing `align` as a function accessor — it is a value option, not a signal accessor; let the compiler wrap reactive values
- Expecting positioning to run during SSR — the helpers are guarded and no-op without `window`; positioning happens post-mount on the client
- Reaching for `addEventListener` for outside-click / scroll instead of letting `useOverlay` own the listener lifecycle — it self-cleans on unmount

**See also:** `Overlay` · `OverlayProvider`

---

### OverlayProvider `component`

```ts
OverlayProvider(props: { children?: VNodeChild }): VNodeChild
```

Context provider that lets nested overlays coordinate (shared root, stacking, outside-click scoping). `useOverlay` reads it via `useOverlayContext`. Marked `nativeCompat` so it works correctly inside `@pyreon/{react,preact,vue,solid}-compat` apps (its `provide()` runs in Pyreon’s setup frame, not the compat wrapper accessor).

**Example**

```tsx
import { OverlayProvider } from "@pyreon/elements"

<OverlayProvider>
  <App />
</OverlayProvider>
```

**See also:** `useOverlay` · `Overlay`

---

### Portal `component`

```ts
Portal(props: PortalProps): VNodeChild
```

Renders children OUTSIDE the parent DOM hierarchy — into a PER-INSTANCE wrapper element (default `<div>`, configurable via `tag`) created inside a `DOMLocation` (default `document.body`). Multiple Portals sharing a location each get their OWN wrapper so children never intermingle, which gives cleanup isolation when several modals / tooltips share a portal root.

**Example**

```tsx
import { Portal } from "@pyreon/elements"

<Portal>
  <Modal />
</Portal>
```

**Common mistakes**

- Asserting `document.body.firstChild === modalRoot` in a test — the Portal nests one level deeper; query the per-instance wrapper (`document.body.querySelector("[data-…]").parentElement`) instead
- Assuming all Portals share one container — each instance gets its own wrapper inside the DOMLocation; they do not merge

**See also:** `Overlay` · `Element`

---

### Iterator `component`

```ts
Iterator<T>(props: IteratorProps<T>): VNodeChild
```

The data-iteration helper backing `List` (default export of `helpers/Iterator`). FOUR typed overloads keep iteration modes honest: `SimpleProps<T>` (primitive arrays — `valueName` allowed), `ObjectProps<T>` (object arrays — `valueName` and `children` FORBIDDEN), `ChildrenProps` (no data/component, only children), and a `LooseProps` fallback that exists so rocketstyle/attrs forwarding patterns (`<Iterator {...wrapperProps} />`) bind without a per-call-site overload error. The discriminator picks the overload via `unknown extends T ? Loose : T extends SimpleValue ? Simple : T extends ObjectValue ? Object : Children`.

**Example**

```tsx
import Iterator from "@pyreon/elements/helpers/Iterator"

<Iterator data={users()} component={(u) => <Row user={u} />} />
```

**Common mistakes**

- Mixed-shape `data` (`[1, {id:1}, null]`) — primitive and object iteration are mutually exclusive; the narrow overloads reject it (the Loose fallback only catches forwarding-pattern shapes)
- `valueName` with object-array `data` — Simple-mode only; ObjectProps forbids it
- `children` together with `data`/`component` — Children and Object are distinct overloads; the runtime picks the mode by which props are populated, but the types steer you to one

**See also:** `List`

---

### Util `component`

```ts
Util(props: UtilProps): VNodeChild
```

A bare utility primitive — the minimal structural wrapper when you need an Element-family node without layout semantics (no flex direction / align). Use it for thin passthrough containers where `Element` would impose unwanted flex defaults.

**Example**

```tsx
import { Util } from "@pyreon/elements"

<Util>{children}</Util>
```

**See also:** `Element`

---

### Provider `component`

```ts
Provider(props: { children?: VNodeChild }): VNodeChild
```

Re-exported from `@pyreon/unistyle` for convenience (responsive/breakpoint context). Most apps mount the unified `<PyreonUI>` from `@pyreon/ui-core` instead, which wires this internally — reach for the bare `Provider` only outside the `ui-core` provider tree.

**Example**

```tsx
import { Provider } from "@pyreon/elements"
```

**See also:** `Element`

---

## Package-level notes

> **Layout in attrs, not theme:** Element/Text/List layout props (`direction`, `alignX`, `alignY`, `gap`, `block`, `tag`) are primitive ATTRS — they target the inner flex wrapper. Colors / spacing / borders / shadows belong in the styler or rocketstyle `.theme()` layer. `direction` accepts `inline` / `rows` / `reverseInline` / `reverseRows` — `row` is invalid.

> **Simple-path fast path changed the VNode shape:** A non-compound, non-needsFix Element renders a VNode exposing the HTML tag as `props.as` and layout under `props.$element.{direction,alignX,alignY,block,equalCols,extraStyles}` — NOT flat `props.{tag,direction,…}`. Production styled-components consumers are unaffected (`as` is canonical); test/introspection code must read both shapes.

> **Overlay positioning is centralised:** Viewport flip, ESC, click-outside, scroll tracking, hover delay all live in `useOverlay`. Never reimplement them in a tooltip / dropdown / popover primitive — compose `Overlay` or `useOverlay`. The positioning helpers are SSR-guarded (no-op without `window`).

> **Portal nests a per-instance wrapper:** `Portal` renders into its OWN wrapper element inside the DOMLocation (default `document.body`), not directly as a body child. DOM assertions must traverse one extra level; multiple Portals do not share a container.
