---
title: "Base Primitives — API Reference"
description: "Five foundational layout primitives — Element, Text, List, Overlay, Portal — plus the useOverlay positioning hook and the Iterator data helper"
---

# @pyreon/elements — API Reference

> **Generated** from `elements`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [elements](/docs/elements).

The structural layer every styled / rocketstyle component renders through. `Element` is the responsive flexbox block (direction / alignX / alignY / gap / block + before/after content slots); `Text` is inline typography; `List` is a flowing-children container with the four-overload Iterator data API; `Overlay` is a positioned layer with backdrop driven by `useOverlay` (viewport flip, ESC, click-outside, scroll tracking, hover delay — never reimplement this); `Portal` renders children outside the DOM hierarchy into a per-instance wrapper. Element has a 2026-Q2 simple-path fast path that inlines the Wrapper helper for non-compound, non-needsFix tags (31-45% faster mount) — its rendered VNode then exposes the HTML tag as `props.as` and layout under `props.$element.{...}` instead of flat props.

## Features

- Element — responsive flexbox block: direction / alignX / alignY / gap / block, beforeContent / afterContent slots, equalBeforeAfter (ResizeObserver-tracked)
- Text — inline typography primitive
- List — flowing-children container; data via the four-overload Iterator API
- Overlay + useOverlay — positioned layer (dropdown/modal/tooltip) with viewport flip, ESC, click-outside, scroll tracking, hover delay, and focus management (restore-to-opener on close; for type:"modal" a focus-in on open + Tab/Shift+Tab focus trap — the WAI-ARIA dialog pattern, out of the box)
- Portal — renders children into a per-instance wrapper inside a DOMLocation (default document.body)
- Iterator — Simple / Object / Children / Loose overloads keep primitive-vs-object iteration modes type-safe
- Util — bare utility primitive; Provider re-exported from @pyreon/unistyle
- Simple-path fast path: non-compound Elements skip a component invocation + splitProps + mountChild

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`Element`](#element) | component | The responsive flexbox block primitive every layout-bearing component renders through. |
| [`Text`](#text) | component | Inline typography primitive — the text counterpart to `Element`. |
| [`List`](#list) | component | A flowing-children container (`ul` / `ol` / `dl` / custom) built on the Iterator data API. |
| [`Overlay`](#overlay) | component | A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. |
| [`useOverlay`](#useoverlay) | hook | The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. |
| [`OverlayProvider`](#overlayprovider) | component | Context provider that lets nested overlays coordinate (a child overlay blocks its parent from closing while it is open). |
| [`Portal`](#portal) | component | Renders children OUTSIDE the parent DOM hierarchy — into a PER-INSTANCE wrapper element (default `<div>`, configurable v |
| [`Iterator`](#iterator) | component | The data-iteration helper backing `List` (default export of `helpers/Iterator`). |
| [`Util`](#util) | component | Injects a `className` and/or inline `style` into its CHILD, adding NO DOM node of its own — it CLONES the child (via cor |
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

**Common mistakes**

- Expecting a signal-driven `tag={sig()}` / `paragraph={sig()}` to swap the rendered element — `tag` and `paragraph` are STATIC (mount-time) by design; the styled layer applies `as` once per mount and a reactive tag swap is architecturally unsupported. To change the tag, REMOUNT (e.g. wrap in `<Show>`).
- Passing BOTH `children` and `label` expecting them to concatenate — Text resolves `children ?? label`, so `children` WINS and `label` is ignored. `label` is the inline-syntax alternative to `children`, not an extra slot.
- Driving structure through a signal but styling through a static value — it is the inverse: `css` IS reactive (a signal-driven `css` re-resolves with a class swap, no remount), while `tag` is NOT. Put dynamic STYLING in `css`; put dynamic STRUCTURE behind a remount.

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

A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. It handles viewport flipping, ESC-to-close, click-outside, scroll tracking, and hover delay — do NOT reimplement any of that in a primitive; compose `Overlay` (or `useOverlay`) instead. Takes a `trigger` render prop (receives `{ ref, active, showContent, hideContent }` — attach `ref` to the anchor) and a content render prop as `children` (receives `{ ref, active, align, alignX, alignY, … }` — attach `ref` to the floating node); the content renders through `Portal` so the layer escapes overflow/stacking contexts. `align`/`alignX`/`alignY` reach the content as LIVE reactive props, so a viewport-edge flip re-styles the content in place without remounting it.

**Example**

```tsx
import { Overlay } from "@pyreon/elements"

<Overlay
  type="dropdown"
  openOn="click"
  trigger={(t) => <button ref={t.ref}>Open menu</button>}
>
  {(c) => (
    <ul ref={c.ref}>
      <li>Profile</li>
      <li>Sign out</li>
    </ul>
  )}
</Overlay>
```

**Common mistakes**

- Hand-rolling positioning / flip / click-outside / ESC logic in a tooltip or dropdown primitive — `useOverlay` already owns all of it; reimplementing drifts from the shared behavior
- Forgetting to attach the `ref` the trigger / content render props receive — without it the hook cannot measure, position, wire click-outside, or restore focus (the layer renders at the document origin)
- Reading the rendered overlay as `document.body.firstChild` — it renders through `Portal` into a per-instance wrapper; traverse the wrapper, not body’s direct child

**See also:** `useOverlay` · `OverlayProvider` · `Portal`

---

### useOverlay `hook`

```ts
useOverlay(props?: Partial<UseOverlayProps>): { triggerRef, contentRef, active, align, alignX, alignY, showContent, hideContent, blocked, setBlocked, setUnblocked, setContentPosition, setupListeners, Provider }
```

The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. Returns `triggerRef` / `contentRef` (attach to the anchor + floating node), the `active` open-state signal, the resolved `align` accessor + `alignX` / `alignY` signals, `showContent` / `hideContent` (programmatic control), and `setContentPosition` (reposition when the content SIZE changes while open — async option lists). Options: `openOn` / `closeOn` (`click` | `hover` | …), `type` (`dropdown` | `modal` | …), `position` (`fixed` | …), `align` + `alignX` / `alignY` + `offsetX` / `offsetY`, `closeOnEsc`, `hoverDelay`, `throttleDelay`, `parentContainer`, `disabled`, `onOpen` / `onClose`. Focus management is built in: focus returns to the opener on close (all types), and `type: "modal"` additionally moves focus into the content on open and traps Tab / Shift+Tab within it (the WAI-ARIA dialog pattern — no extra wiring). Listeners auto-attach on mount (idempotent) — a hover overlay keeps open while the pointer is over its content (the content listeners re-bind as it mounts). SSR-safe: the internal positioning + focus helpers early-return under no-`window`.

**Example**

```tsx
import { useOverlay } from "@pyreon/elements"

const o = useOverlay({ openOn: "hover", type: "tooltip", hoverDelay: 150 })
// attach o.triggerRef to the anchor and o.contentRef to the floating layer;
// read o.active() for open state; call o.showContent() / o.hideContent()
```

**Common mistakes**

- Reading `o.isOpen` / spreading `o.triggerProps` / `o.overlayProps` — those do not exist; the hook returns `active` (a signal), `triggerRef` / `contentRef` (ref callbacks), and `showContent` / `hideContent`
- Passing `align` as a function accessor — it is a value option, not a signal accessor; let the compiler wrap reactive values
- Expecting positioning to run during SSR — the helpers are guarded and no-op without `window`; positioning happens post-mount on the client
- Reaching for `addEventListener` for outside-click / scroll instead of letting `useOverlay` own the listener lifecycle — it self-cleans on unmount

**See also:** `Overlay` · `OverlayProvider`

---

### OverlayProvider `component`

```ts
OverlayProvider(props?: Partial<OverlayContext> & { children?: VNodeChild }): VNodeChild
```

Context provider that lets nested overlays coordinate (a child overlay blocks its parent from closing while it is open). The coordination props (`blocked` / `setBlocked` / `setUnblocked`) are OPTIONAL — a root `<OverlayProvider>` establishes the context with no-op defaults, while `Overlay` supplies real ones internally via `useOverlay`. `useOverlay` reads it through `useOverlayContext`. Marked `nativeCompat` so it works correctly inside `@pyreon/{react,preact,vue,solid}-compat` apps (its `provide()` runs in Pyreon’s setup frame, not the compat wrapper accessor).

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
Util(props: { children: VNodeChild; className?: string | string[]; style?: object }): VNodeChild
```

Injects a `className` and/or inline `style` into its CHILD, adding NO DOM node of its own — it CLONES the child (via core `render`) with the merged props. Use it to stamp a class or inline style onto a child you do not otherwise control (a component that forwards to a single DOM node) without introducing an extra wrapper element. Reactive: a getter-shaped `className={cls()}` re-reads per change. It is NOT an Element-family layout node — it has no `tag` / `direction` / `alignX` / `alignY` / `gap`.

**Example**

```tsx
import { Util } from "@pyreon/elements"

// No wrapper div — the child gets the class/style merged in:
<Util className="highlight" style={{ opacity: 0.5 }}>
  <SomeChild />
</Util>
```

**Common mistakes**

- Expecting Util to render its own wrapper element (a `<div>`) — it adds NO DOM node; it CLONES its child and merges `className`/`style` onto it. There is no `tag`.
- Passing layout props (`direction` / `alignX` / `gap`) — Util only accepts `children` / `className` / `style`; layout props are ignored. Use `Element` for layout.

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
