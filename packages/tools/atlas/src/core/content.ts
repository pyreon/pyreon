/**
 * Representative CONTENT for a derived scenario.
 *
 * Discovery derives controls from a component's PROPS, and the variant matrix
 * crosses its dimension AXES — neither says what the component should be
 * rendered WITH. So every derived scenario mounted `h(Button, { state, size })`
 * and nothing else: a button with no label, a heading with no text, an image
 * with no source, a Stack with no children. Measured on the deployed
 * `@pyreon/ui-components` workbench (2026-09-14): all 108 previews were empty
 * shells — `<button>` 26×10, `<h2>` 0×0, `<div>` 0×0 — and the scan still
 * reported 1090/1090 verified, because "mounts, clicks and unmounts without
 * throwing" is as true of an empty element as of a full one.
 *
 * This module answers the missing question. It is PURE and serializable: the
 * seed is plain JSON that travels with the scenario's `args` into the catalog
 * file and the generated workbench module, and `materializeContent` turns the
 * one non-JSON case (layout placeholder blocks) into vnodes at mount time — in
 * the verify harness AND in the browser, through the same function, so what
 * the scan verified is what the canvas shows.
 *
 * The decision is keyed on the rendered TAG (`<img>` wants a `src`, `<input>`
 * a `placeholder`, `<button>` a label) plus a name heuristic for layout
 * containers, whose whole point is arranging CHILDREN and which render as
 * nothing with a bare string. A hand-authored scenario always wins: seeding
 * merges UNDER `args`, key by key.
 */
import type { PropControl } from './types'

/** The marker a layout container's `children` carries through JSON. */
export interface ContentBlocks {
  readonly __atlasContent: 'blocks'
  readonly count: number
  /**
   * The element each block renders as. `div` for a flex/grid container; `li`
   * inside a list, because a `<div>` in a `<ul>` is not that list's content
   * model. A container whose content model is NEITHER (a `<table>`, a `<dl>`)
   * gets no blocks at all — the HTML parser foster-parents a `<div>` out of a
   * `<table>`, so the SSR markup and the client mount disagree and the
   * SSR-parity check reports the COMPONENT as failing to hydrate.
   */
  readonly tag?: 'div' | 'li' | 'option'
}

/** What discovery knows about how a component renders. */
export interface ContentShape {
  /** The component's importable name — the label a text component shows. */
  name: string
  /** The DOM tag the component renders as, when discovery could read it. */
  tag?: string | undefined
  /**
   * The COMPONENT a rocketstyle chain renders through (`el.config({ component:
   * ModalBase })`) — its display name, when the base is a function rather
   * than a tag. A base decides what the chain consumes the way a tag does:
   * a modal base needs `open` before it renders anything at all.
   */
  base?: string | undefined
}

/** The seed: args merged UNDER every scenario, plus the controls that edit them. */
export interface ContentSeed {
  args: Record<string, unknown>
  controls: PropControl[]
  /**
   * The prop that carries the CONTENT (`children`, `placeholder`, …) — the one
   * an edge-case scenario should blank or overflow. Absent when the seed
   * carries no text at all (a void tag, a layout container).
   */
  contentKey?: string
}

/** Tags that can carry no children at all, and what they take instead. */
const VOID_MEDIA = new Set(['img', 'picture', 'video', 'audio', 'canvas', 'iframe', 'svg', 'embed', 'object'])
const NO_CONTENT = new Set(['hr', 'br', 'wbr', 'meta', 'link', 'source', 'track', 'col', 'area', 'base', 'param'])
const FIELDS = new Set(['input', 'textarea'])

/**
 * Tags whose CONTENT MODEL is other elements — a bare string inside them is
 * either invalid (`<ul>text</ul>`) or invisible layout.
 */
const CONTAINER_TAGS = new Set([
  'ul', 'ol', 'menu', 'dl', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup',
  'nav', 'section', 'article', 'aside', 'header', 'footer', 'main', 'form', 'fieldset', 'figure', 'dialog',
])
/** Containers whose children must be `<li>`. */
const LIST_TAGS = new Set(['ul', 'ol', 'menu'])
/**
 * Containers whose content model no generic block satisfies. Seeded with
 * NOTHING rather than something the parser would relocate — see
 * `ContentBlocks.tag`.
 */
const STRICT_CONTAINERS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'colgroup', 'dl', 'datalist', 'optgroup'])
/** Containers whose children must be `<option>`. */
const OPTION_TAGS = new Set(['select', 'datalist', 'optgroup'])

/**
 * Bases that render NOTHING until they are opened — a modal, dialog, drawer,
 * sheet. Seeding `open: true` is what makes the scenario show (and verify)
 * the component rather than its closed state, which is no DOM at all. The
 * workbench wires the base's `onClose` back to this control, so closing the
 * overlay in the preview flips it off like a real app would.
 */
const OPEN_BASE = /(?:Modal|Dialog|Drawer|Sheet|Overlay)(?:Base)?$/
/** Bases that render a native `<select>` — content is `<option>`s, never text. */
const OPTION_BASE = /SelectBase$/

/**
 * Props that carry a component's CONTENT, by name. The edge-case plugin
 * blanks/overflows one of these; an arbitrary `text` control (`src`,
 * `trackColor`, `alt`) is a value, not content, and overflowing it produces a
 * request for `./The%20quick%20brown%20fox…` rather than a wrapping check.
 */
export const CONTENT_KEYS = /^(?:children|label|title|text|content|placeholder|description|caption|message|heading|subtitle|summary|name)$/

/** Is this prop name a content channel (see `CONTENT_KEYS`)? */
export function isContentKey(name: string): boolean {
  return CONTENT_KEYS.test(name)
}

/**
 * Names that read as LAYOUT: the component exists to arrange children. A
 * suffix match, so `Stack`, `VStack`, `ButtonGroup` and `SimpleGrid` all
 * qualify while `Group` alone does too.
 */
const CONTAINER_NAME =
  /(?:Stack|Group|Grid|Box|Center|Area|Ratio|Container|Flex|Layout|Columns|Column|Row|Rows|Wrapper|Panel|Section|Split|Cluster|Inline|Spacer|Scroll)$/

/** A neutral 320×180 placeholder image — no network, no external asset. */
export const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='180' viewBox='0 0 320 180'>" +
      "<rect width='320' height='180' fill='#c9ced9'/>" +
      "<path d='M40 140l60-70 50 55 35-35 95 50z' fill='#9aa3b5'/>" +
      "<circle cx='240' cy='55' r='18' fill='#f2f4f8'/>" +
      '</svg>',
  )

const BLOCKS = 3

function text(name: string, key = 'children'): ContentSeed {
  return {
    args: { [key]: name },
    controls: [{ name: key, kind: 'text', defaultValue: name, reactive: false, required: false }],
    contentKey: key,
  }
}

/** Prepend an `open: true` seed (+ its boolean control) to another seed. */
function opened(seed: ContentSeed): ContentSeed {
  return {
    args: { open: true, ...seed.args },
    controls: [
      { name: 'open', kind: 'boolean', defaultValue: true, reactive: false, required: false },
      ...seed.controls,
    ],
    ...(seed.contentKey ? { contentKey: seed.contentKey } : {}),
  }
}

/** Is this component a layout container — by tag or by name? */
export function isContainer(shape: ContentShape): boolean {
  if (shape.tag && CONTAINER_TAGS.has(shape.tag)) return true
  return CONTAINER_NAME.test(shape.name)
}

/**
 * The content a component should be rendered with when nothing else is known.
 *
 * Returns an EMPTY seed (no args, no controls) for a component that takes no
 * content, so a caller can spread the result unconditionally.
 */
export function deriveContent(shape: ContentShape): ContentSeed {
  const tag = shape.tag
  if (tag && NO_CONTENT.has(tag)) return { args: {}, controls: [] }
  if (tag === 'img') {
    return {
      args: { src: PLACEHOLDER_IMAGE, alt: `${shape.name} placeholder` },
      controls: [
        { name: 'src', kind: 'text', defaultValue: PLACEHOLDER_IMAGE, reactive: false, required: false },
        { name: 'alt', kind: 'text', defaultValue: `${shape.name} placeholder`, reactive: false, required: false },
      ],
    }
  }
  if (tag && VOID_MEDIA.has(tag)) return { args: {}, controls: [] }
  if (tag && FIELDS.has(tag)) return text('Type here…', 'placeholder')
  if (tag && STRICT_CONTAINERS.has(tag)) return { args: {}, controls: [] }
  if (tag && OPTION_TAGS.has(tag)) {
    // A `<select>` with a string child is a `<select>` with nothing in it —
    // the parser drops text that is not inside an `<option>`.
    const blocks: ContentBlocks = { __atlasContent: 'blocks', count: BLOCKS, tag: 'option' }
    return { args: { children: blocks }, controls: [] }
  }
  if (shape.base && OPTION_BASE.test(shape.base)) {
    const blocks: ContentBlocks = { __atlasContent: 'blocks', count: BLOCKS, tag: 'option' }
    return { args: { children: blocks }, controls: [] }
  }
  if (shape.base && OPEN_BASE.test(shape.base)) return opened(text(shape.name))
  if (isContainer(shape)) {
    const blocks: ContentBlocks = {
      __atlasContent: 'blocks',
      count: BLOCKS,
      ...(tag && LIST_TAGS.has(tag) ? { tag: 'li' as const } : {}),
    }
    // No control: the value is a marker, and a text field showing
    // `[object Object]` is worse than no field.
    return { args: { children: blocks }, controls: [] }
  }
  return text(shape.name)
}

/** Recognise the blocks marker after a JSON round-trip. */
export function isContentBlocks(value: unknown): value is ContentBlocks {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __atlasContent?: unknown }).__atlasContent === 'blocks'
  )
}

/** The one style a placeholder block carries — inline, because it is preview CONTENT, not workbench chrome. */
const BLOCK_STYLE =
  'box-sizing:border-box;min-width:72px;min-height:44px;padding:12px 18px;display:flex;align-items:center;justify-content:center;' +
  'border:1px dashed rgba(120,128,150,.7);border-radius:6px;background:rgba(120,128,150,.14);' +
  'font:500 12px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(80,88,110,.9);'

/**
 * Split scenario args into the props to pass and the children to pass AS REST
 * ARGUMENTS to `h(type, props, ...children)`.
 *
 * Rest form on purpose: both the client mount and the SSR renderer merge rest
 * children into `props.children`, so the same call renders identically on
 * every path the verify pipeline exercises. The blocks marker becomes real
 * elements here — through the runtime's OWN `h`, since which instance builds a
 * vnode matters (see `MountRuntime`).
 */
export function materializeContent<N>(
  args: Record<string, unknown>,
  h: (type: unknown, props?: unknown, ...children: unknown[]) => N,
): { props: Record<string, unknown>; children: N[] | unknown[] } {
  if (!('children' in args)) return { props: args, children: [] }
  const { children, ...props } = args
  if (isContentBlocks(children)) {
    const count = Math.max(1, Math.min(12, Math.floor(children.count) || BLOCKS))
    const tag = children.tag === 'li' ? 'li' : children.tag === 'option' ? 'option' : 'div'
    const blocks: N[] = []
    for (let i = 1; i <= count; i++) {
      blocks.push(
        tag === 'option'
          ? h('option', { value: String(i) }, `Option ${i}`)
          : h(tag, { 'data-atlas-content': 'block', style: BLOCK_STYLE }, String(i)),
      )
    }
    return { props, children: blocks }
  }
  if (children === undefined) return { props, children: [] }
  return { props, children: [children] }
}

/** Seed args UNDER a scenario's own — an authored value always wins, key by key. */
export function seedArgs(
  content: Readonly<Record<string, unknown>> | undefined,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!content) return args
  return { ...content, ...args }
}
