import { defineManifest } from '@pyreon/manifest'

export default defineManifest({
  name: '@pyreon/elements',
  title: 'Base Primitives',
  tagline:
    'Five foundational layout primitives — Element, Text, List, Overlay, Portal — plus the useOverlay positioning hook and the Iterator data helper',
  description:
    "The structural layer every styled / rocketstyle component renders through. `Element` is the responsive flexbox block (direction / alignX / alignY / gap / block + before/after content slots); `Text` is inline typography; `List` is a flowing-children container with the four-overload Iterator data API; `Overlay` is a positioned layer with backdrop driven by `useOverlay` (viewport flip, ESC, click-outside, scroll tracking, hover delay — never reimplement this); `Portal` renders children outside the DOM hierarchy into a per-instance wrapper. Element has a 2026-Q2 simple-path fast path that inlines the Wrapper helper for non-compound, non-needsFix tags (31-45% faster mount) — its rendered VNode then exposes the HTML tag as `props.as` and layout under `props.$element.{...}` instead of flat props.",
  category: 'browser',
  features: [
    'Element — responsive flexbox block: direction / alignX / alignY / gap / block, beforeContent / afterContent slots, equalBeforeAfter (ResizeObserver-tracked)',
    'Text — inline typography primitive',
    'List — flowing-children container; data via the four-overload Iterator API',
    'Overlay + useOverlay — positioned layer (dropdown/modal/tooltip) with viewport flip, ESC, click-outside, scroll tracking, hover delay, and focus management (restore-to-opener on close; for type:"modal" a focus-in on open + Tab/Shift+Tab focus trap — the WAI-ARIA dialog pattern, out of the box)',
    'Portal — renders children into a per-instance wrapper inside a DOMLocation (default document.body)',
    'Iterator — Simple / Object / Children / Loose overloads keep primitive-vs-object iteration modes type-safe',
    'Util — bare utility primitive; Provider re-exported from @pyreon/unistyle',
    'Simple-path fast path: non-compound Elements skip a component invocation + splitProps + mountChild',
  ],
  api: [
    {
      name: 'Element',
      kind: 'component',
      signature: 'Element(props: ElementProps): VNodeChild',
      summary:
        "The responsive flexbox block primitive every layout-bearing component renders through. Layout props live here (NOT in a styler `.theme()`): `direction` (`inline` | `rows` | `reverseInline` | `reverseRows` — note `row` is INVALID), `alignX`, `alignY`, `gap`, `block`, plus `beforeContent` / `afterContent` slot wrappers and `equalBeforeAfter` (equalizes the slot widths on mount AND keeps them equal via ResizeObserver). The 2026-Q2 simple-path fast path inlines the Wrapper for non-compound, non-needsFix tags: the rendered VNode then exposes the HTML tag as `props.as` and layout under `props.$element.{direction,alignX,alignY,block,equalCols,extraStyles}` rather than flat props (styled-components consumers see no change since `as` is the canonical tag selector).",
      example: `import { Element } from "@pyreon/elements"

<Element tag="section" direction="rows" gap="md" alignX="center">
  <Header />
  <Body />
</Element>`,
      mistakes: [
        'Using `direction="row"` — invalid; the values are `inline` / `rows` / `reverseInline` / `reverseRows`',
        'Putting layout props in a styler `.theme()` callback — `direction` / `alignX` / `alignY` / `gap` / `block` are Element ATTRS, not CSS; theme is for colors / spacing / borders',
        'Reading flat `props.direction` on a simple-path Element in a test or styled consumer — the fast path moves layout to `props.$element.*` and the tag to `props.as`; read both shapes via a helper',
        'Passing children to a void `tag` (`hr` / `img` / `br` / `input`) — Element correctly drops them; do not rely on a children slot for void tags',
        'Relying on `equalBeforeAfter` measuring async slot content where `ResizeObserver` is undefined (older runtimes / SSR) — it falls back to the one-shot mount measurement there',
      ],
      seeAlso: ['Text', 'List', 'Portal'],
    },
    {
      name: 'Text',
      kind: 'component',
      signature: 'Text(props: TextProps): VNodeChild',
      summary:
        'Inline typography primitive — the text counterpart to `Element`. Carries typography props and renders an inline element; use it for runs of text that need the design-system typography contract rather than a raw `<span>`. Like `Element`, visual styling belongs in the styler/rocketstyle layer; `Text` owns the inline-flow structure.',
      example: `import { Text } from "@pyreon/elements"

<Text tag="span">Inline label</Text>`,
      seeAlso: ['Element'],
    },
    {
      name: 'List',
      kind: 'component',
      signature: 'List(props: ListProps): VNodeChild',
      summary:
        'A flowing-children container (`ul` / `ol` / `dl` / custom) built on the Iterator data API. Render children directly OR drive it with `data` + a `component` renderer. Inherits Iterator’s four typed overloads (Simple / Object / Children / Loose) and additionally blocks Element-only `label` / `content` props at the type level.',
      example: `import { List } from "@pyreon/elements"

<List tag="ul" data={items()} component={(item) => <li>{item.name}</li>} />`,
      mistakes: [
        'Mixing primitive and object entries in `data` (`[1, {id:1}, null]`) — primitive arrays and object arrays are mutually exclusive iteration modes; the typed overloads reject the mix for direct callers',
        'Passing `valueName` with an object-array `data` — `valueName` is a Simple-mode (primitive) prop only',
        'Passing `children` AND `data`/`component` — Children mode and Object mode are distinct overloads; pick one',
      ],
      seeAlso: ['Iterator', 'Element'],
    },
    {
      name: 'Overlay',
      kind: 'component',
      signature: 'Overlay(props: OverlayProps): VNodeChild',
      summary:
        'A positioned layer (dropdown / modal / tooltip / popover) with an optional backdrop, driven internally by `useOverlay`. It handles viewport flipping, ESC-to-close, click-outside, scroll tracking, and hover delay — do NOT reimplement any of that in a primitive; compose `Overlay` (or `useOverlay`) instead. Renders through `Portal` so the layer escapes overflow/stacking contexts.',
      example: `import { Overlay } from "@pyreon/elements"

<Overlay isOpen={open()} type="dropdown" align="bottom" onClose={() => open.set(false)}>
  <Menu />
</Overlay>`,
      mistakes: [
        'Hand-rolling positioning / flip / click-outside / ESC logic in a tooltip or dropdown primitive — `useOverlay` already owns all of it; reimplementing drifts from the shared behavior',
        'Reading the rendered overlay as `document.body.firstChild` — it renders through `Portal` into a per-instance wrapper; traverse the wrapper, not body’s direct child',
      ],
      seeAlso: ['useOverlay', 'OverlayProvider', 'Portal'],
    },
    {
      name: 'useOverlay',
      kind: 'hook',
      signature:
        'useOverlay(props?: Partial<UseOverlayProps>): { isOpen, open, close, toggle, triggerProps, overlayProps, /* … */ }',
      summary:
        'The positioning + interaction engine `Overlay` is built on, exposed for headless consumers. Options: `openOn` / `closeOn` (`click` | `hover` | …), `type` (`dropdown` | `modal` | …), `position` (`fixed` | …), `align` + `alignX` / `alignY` + `offsetX` / `offsetY`, `closeOnEsc`, `hoverDelay`, `throttleDelay`, `parentContainer`, `disabled`, `onOpen` / `onClose`. Focus management is built in: focus returns to the opener on close (all types), and `type: "modal"` additionally moves focus into the content on open and traps Tab / Shift+Tab within it (the WAI-ARIA dialog pattern — no extra wiring). SSR-safe: the internal positioning + focus helpers early-return under no-`window` so the contract is documented at the call site rather than crashing on the server.',
      example: `import { useOverlay } from "@pyreon/elements"

const o = useOverlay({ openOn: "hover", type: "tooltip", hoverDelay: 150 })
// spread o.triggerProps on the anchor, o.overlayProps on the floating layer`,
      mistakes: [
        'Passing `align` as a function accessor — it is a value option, not a signal accessor; let the compiler wrap reactive values',
        'Expecting positioning to run during SSR — the helpers are guarded and no-op without `window`; positioning happens post-mount on the client',
        'Reaching for `addEventListener` for outside-click / scroll instead of letting `useOverlay` own the listener lifecycle — it self-cleans on unmount',
      ],
      seeAlso: ['Overlay', 'OverlayProvider'],
    },
    {
      name: 'OverlayProvider',
      kind: 'component',
      signature: 'OverlayProvider(props: { children?: VNodeChild }): VNodeChild',
      summary:
        'Context provider that lets nested overlays coordinate (shared root, stacking, outside-click scoping). `useOverlay` reads it via `useOverlayContext`. Marked `nativeCompat` so it works correctly inside `@pyreon/{react,preact,vue,solid}-compat` apps (its `provide()` runs in Pyreon’s setup frame, not the compat wrapper accessor).',
      example: `import { OverlayProvider } from "@pyreon/elements"

<OverlayProvider>
  <App />
</OverlayProvider>`,
      seeAlso: ['useOverlay', 'Overlay'],
    },
    {
      name: 'Portal',
      kind: 'component',
      signature: 'Portal(props: PortalProps): VNodeChild',
      summary:
        'Renders children OUTSIDE the parent DOM hierarchy — into a PER-INSTANCE wrapper element (default `<div>`, configurable via `tag`) created inside a `DOMLocation` (default `document.body`). Multiple Portals sharing a location each get their OWN wrapper so children never intermingle, which gives cleanup isolation when several modals / tooltips share a portal root.',
      example: `import { Portal } from "@pyreon/elements"

<Portal>
  <Modal />
</Portal>`,
      mistakes: [
        'Asserting `document.body.firstChild === modalRoot` in a test — the Portal nests one level deeper; query the per-instance wrapper (`document.body.querySelector("[data-…]").parentElement`) instead',
        'Assuming all Portals share one container — each instance gets its own wrapper inside the DOMLocation; they do not merge',
      ],
      seeAlso: ['Overlay', 'Element'],
    },
    {
      name: 'Iterator',
      kind: 'component',
      signature: 'Iterator<T>(props: IteratorProps<T>): VNodeChild',
      summary:
        'The data-iteration helper backing `List` (default export of `helpers/Iterator`). FOUR typed overloads keep iteration modes honest: `SimpleProps<T>` (primitive arrays — `valueName` allowed), `ObjectProps<T>` (object arrays — `valueName` and `children` FORBIDDEN), `ChildrenProps` (no data/component, only children), and a `LooseProps` fallback that exists so rocketstyle/attrs forwarding patterns (`<Iterator {...wrapperProps} />`) bind without a per-call-site overload error. The discriminator picks the overload via `unknown extends T ? Loose : T extends SimpleValue ? Simple : T extends ObjectValue ? Object : Children`.',
      example: `import Iterator from "@pyreon/elements/helpers/Iterator"

<Iterator data={users()} component={(u) => <Row user={u} />} />`,
      mistakes: [
        'Mixed-shape `data` (`[1, {id:1}, null]`) — primitive and object iteration are mutually exclusive; the narrow overloads reject it (the Loose fallback only catches forwarding-pattern shapes)',
        '`valueName` with object-array `data` — Simple-mode only; ObjectProps forbids it',
        '`children` together with `data`/`component` — Children and Object are distinct overloads; the runtime picks the mode by which props are populated, but the types steer you to one',
      ],
      seeAlso: ['List'],
    },
    {
      name: 'Util',
      kind: 'component',
      signature: 'Util(props: UtilProps): VNodeChild',
      summary:
        'A bare utility primitive — the minimal structural wrapper when you need an Element-family node without layout semantics (no flex direction / align). Use it for thin passthrough containers where `Element` would impose unwanted flex defaults.',
      example: `import { Util } from "@pyreon/elements"

<Util>{children}</Util>`,
      seeAlso: ['Element'],
    },
    {
      name: 'Provider',
      kind: 'component',
      signature: 'Provider(props: { children?: VNodeChild }): VNodeChild',
      summary:
        'Re-exported from `@pyreon/unistyle` for convenience (responsive/breakpoint context). Most apps mount the unified `<PyreonUI>` from `@pyreon/ui-core` instead, which wires this internally — reach for the bare `Provider` only outside the `ui-core` provider tree.',
      example: `import { Provider } from "@pyreon/elements"`,
      seeAlso: ['Element'],
    },
  ],
  gotchas: [
    {
      label: 'Layout in attrs, not theme',
      note: 'Element/Text/List layout props (`direction`, `alignX`, `alignY`, `gap`, `block`, `tag`) are primitive ATTRS — they target the inner flex wrapper. Colors / spacing / borders / shadows belong in the styler or rocketstyle `.theme()` layer. `direction` accepts `inline` / `rows` / `reverseInline` / `reverseRows` — `row` is invalid.',
    },
    {
      label: 'Simple-path fast path changed the VNode shape',
      note: 'A non-compound, non-needsFix Element renders a VNode exposing the HTML tag as `props.as` and layout under `props.$element.{direction,alignX,alignY,block,equalCols,extraStyles}` — NOT flat `props.{tag,direction,…}`. Production styled-components consumers are unaffected (`as` is canonical); test/introspection code must read both shapes.',
    },
    {
      label: 'Overlay positioning is centralised',
      note: 'Viewport flip, ESC, click-outside, scroll tracking, hover delay all live in `useOverlay`. Never reimplement them in a tooltip / dropdown / popover primitive — compose `Overlay` or `useOverlay`. The positioning helpers are SSR-guarded (no-op without `window`).',
    },
    {
      label: 'Portal nests a per-instance wrapper',
      note: '`Portal` renders into its OWN wrapper element inside the DOMLocation (default `document.body`), not directly as a body child. DOM assertions must traverse one extra level; multiple Portals do not share a container.',
    },
  ],
})
