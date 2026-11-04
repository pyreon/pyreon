// ============================================================================
// `@pyreon/elements` native FRONTEND — map the elements layout primitives onto
// the canonical native primitives, so the WHOLE ui-system built on them (the 67
// `@pyreon/ui-components`, which are `rocketstyle` over `el`/`txt`/`list` =
// Element/Text/List) lowers to SwiftUI/Compose.
//
//   <Element direction="rows" alignX="center" gap="md">  ──▶  <Stack direction="column" align="center" gap="md">
//
// Element is a flex container: its core layout (`direction`/`gap`/`alignX`/
// `alignY`) is exactly the canonical Stack's model in a different vocabulary, so
// this frontend TRANSLATES the props and rewrites `<Element>` → `<Stack>`, then
// the existing Stack emit (+ the styler/rocketstyle style connector) lowers it
// unchanged. elements `Text` is the SAME name as the canonical `Text` (no work).
//
// SCOPE (v1): the CORE layout translation. Element's cross-axis alignment maps
// to Stack's single `align` (SwiftUI/Compose have no constructor main-axis
// alignment — the same limit the canonical Stack has). Rich Element features
// (before/after content slots, equalBeforeAfter, responsive arrays, block, the
// `tag` override) are web-only and pass through / are dropped by the Stack emit.
//
// `List` (data iteration) lowers to the same Stack holding a keyed `<For>`:
//
//   <List data={rows} component={Row} itemKey="id" direction="inline" />
//     ──▶  <Stack direction="row"><For each={rows} by={(pyreonItem) => pyreonItem.id}>
//              {(pyreonItem) => <Row {...pyreonItem} />}</For></Stack>
//
// which the compiler already lowers (a keyed ForEach / items, the item spread
// onto Row's declared props). `valueName` (an array of strings/numbers) passes
// the item as that one prop. `itemProps` / `wrapProps` / `wrapComponent` and a
// non-identifier `component` do not lower yet — each is warned by name.
// ============================================================================

import {
  unconsumedSlotWarning,
  type AttrIR,
  type CompilerPlugin,
  type ElementLowering,
  type JsxElementIR,
  type RetagContext,
} from '@pyreon/native-compiler/plugin-api'

/** elements primitives this lowering maps to a canonical native primitive. */
export const ELEMENTS_PRIMITIVE_ALIAS: Readonly<Record<string, string>> = {
  Element: 'Stack',
  // elements `Text` == canonical `Text` (same name) — no alias needed.
}

// Element `direction` values that are HORIZONTAL (a Compose Row / SwiftUI HStack);
// everything else (incl. the default) stacks VERTICALLY (Column / VStack).
const HORIZONTAL_DIRECTIONS = new Set(['cols', 'columns', 'inline', 'reverseInline', 'row'])

// Element's 2-D align vocabulary → the canonical Stack's cross-axis align token.
const CROSS_ALIGN: Record<string, string> = {
  left: 'start',
  right: 'end',
  top: 'start',
  bottom: 'end',
  center: 'center',
}

// Element layout props consumed/translated here — removed from the rewritten
// attrs (their canonical equivalents `direction`/`align` are re-added).
const CONSUMED = new Set(['direction', 'alignX', 'alignY'])

function stringAttr(name: string, value: string): AttrIR {
  return { kind: 'attr', name, value: { kind: 'literal', value } }
}

/** Read a static string-literal attr value by name (the compiler resolves theme
 *  tokens / consts to literals before emit). */
function literalAttr(e: JsxElementIR, name: string): string | undefined {
  const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
  if (a && a.kind === 'attr' && a.value.kind === 'literal' && typeof a.value.value === 'string') {
    return a.value.value
  }
  return undefined
}

/**
 * Translate an `<Element …>` jsx-element IR to an equivalent `<Stack …>`:
 *   direction rows→column, cols/columns/inline→row; the CROSS-axis align
 *   (alignX for a column, alignY for a row) → Stack's `align`; `gap` + `style`
 *   + any other attrs pass through. The existing Stack emit lowers the result.
 */
export function elementToStack(e: JsxElementIR): JsxElementIR {
  const dir = literalAttr(e, 'direction')
  const isRow = dir !== undefined && HORIZONTAL_DIRECTIONS.has(dir)
  const crossVal = isRow ? literalAttr(e, 'alignY') : literalAttr(e, 'alignX')
  const align = crossVal !== undefined ? CROSS_ALIGN[crossVal] : undefined

  const attrs = e.attrs.filter((a) => !(a.kind === 'attr' && CONSUMED.has(a.name)))
  if (dir !== undefined) attrs.push(stringAttr('direction', isRow ? 'row' : 'column'))
  if (align !== undefined) attrs.push(stringAttr('align', align))
  return { ...e, tag: 'Stack', attrs }
}

const LIST_ITEM = 'pyreonItem'
const LIST_ONLY = new Set(['data', 'component', 'itemKey', 'valueName', 'itemProps', 'wrapProps', 'wrapComponent'])

/**
 * Translate `<List data component itemKey? valueName?>` to a Stack (List's own
 * layout props, through {@link elementToStack}) holding a keyed `<For>` that
 * renders `component` per item. Returns `undefined` — with a named warning —
 * for a shape that cannot lower, so the core reports the element as before.
 */
export function listToStack(e: JsxElementIR, warn: (message: string) => void): JsxElementIR | undefined {
  const attr = (name: string) => {
    const a = e.attrs.find((x) => x.kind === 'attr' && x.name === name)
    return a?.kind === 'attr' ? a.value : undefined
  }
  const data = attr('data')
  const component = attr('component')
  if (data === undefined) {
    warn('<List> needs `data` to lower natively.')
    return undefined
  }
  if (component === undefined || component.kind !== 'identifier' || !/^[A-Z]/.test(component.name)) {
    warn('<List component> must name a component (`component={Row}`) to lower natively — an inline function or an HTML tag string does not.')
    return undefined
  }
  for (const name of ['itemProps', 'wrapProps', 'wrapComponent']) {
    if (attr(name) !== undefined) warn(`<List ${name}> has no native lowering yet — it is DROPPED on iOS/Android (the rows still render).`)
  }
  const item = { kind: 'identifier' as const, name: LIST_ITEM }
  // A string `valueName` passes a primitive item as that one prop; otherwise the
  // item object spreads onto the component's declared props.
  const valueName = literalAttr(e, 'valueName')
  const rowAttrs: AttrIR[] =
    valueName !== undefined
      ? [{ kind: 'attr', name: valueName, value: item }]
      : [{ kind: 'spread', argument: item } as unknown as AttrIR]
  const row: JsxElementIR = { kind: 'jsx-element', tag: component.name, attrs: rowAttrs, children: [] }
  const keyAttr = attr('itemKey')
  let by: AttrIR | undefined
  if (keyAttr !== undefined) {
    if (keyAttr.kind === 'literal' && typeof keyAttr.value === 'string') {
      by = {
        kind: 'attr',
        name: 'by',
        value: { kind: 'arrow', async: false, params: [LIST_ITEM], paramTypes: [null], body: { kind: 'member', object: item, property: keyAttr.value } } as never,
      }
    } else if (keyAttr.kind === 'arrow') {
      by = { kind: 'attr', name: 'by', value: keyAttr }
    } else {
      warn('<List itemKey> must be a property name or an inline function to lower natively — the rows are keyed by position instead.')
    }
  }
  const forEl: JsxElementIR = {
    kind: 'jsx-element',
    tag: 'For',
    // `pyreonEager`: a List is a plain flex container, so its rows lay out in the
    // Stack itself — never in a Compose LazyColumn of their own.
    attrs: [
      { kind: 'attr', name: 'each', value: data },
      ...(by !== undefined ? [by] : []),
      { kind: 'attr', name: 'pyreonEager', value: { kind: 'literal', value: true } },
    ],
    children: [
      {
        kind: 'expr',
        expr: { kind: 'arrow', async: false, params: [LIST_ITEM], paramTypes: [null], body: row } as never,
      },
    ],
  }
  const layout = elementToStack({ ...e, attrs: e.attrs.filter((a) => !(a.kind === 'attr' && LIST_ONLY.has(a.name))) })
  return { ...layout, children: [{ kind: 'expr', expr: forEl }] }
}

export const listLowering: ElementLowering = Object.freeze({
  module: '@pyreon/elements',
  tags: Object.freeze(['List']),
  retag(el: JsxElementIR, ctx: RetagContext): JsxElementIR | undefined {
    const stack = listToStack(el, (m) => ctx.warn(m))
    if (stack === undefined) return undefined
    return { ...stack, attrs: stack.attrs.filter((a: AttrIR) => unconsumedSlotWarning('Stack', a) === undefined) }
  },
})

export const elementsLowering: ElementLowering = Object.freeze({
  module: '@pyreon/elements',
  tags: Object.freeze(Object.keys(ELEMENTS_PRIMITIVE_ALIAS)),
  retag(el: JsxElementIR, ctx: RetagContext): JsxElementIR {
    // Name a dropped JSX slot (`beforeContent={<…/>}`) against the tag the author WROTE, then strip
    // it so the lowered `<Stack>` does not warn a second time under another name.
    for (const a of el.attrs) {
      const w = unconsumedSlotWarning('Element', a)
      if (w !== undefined) ctx.warn(w)
    }
    const stack = elementToStack(el)
    return { ...stack, attrs: stack.attrs.filter((a: AttrIR) => unconsumedSlotWarning('Stack', a) === undefined) }
  },
  styleBase: true,
})

/** The `@pyreon/elements` native plugin — discovered from the package manifest when a source imports it. */
export const elementsPlugin: CompilerPlugin = Object.freeze({
  name: elementsLowering.module,
  apiVersion: 2,
  elements: Object.freeze([elementsLowering, listLowering]),
  unlowered: Object.freeze({
    // Measured every export: only `Element` lowers (to Stack). Text, List, Overlay and Portal all failed both
    // targets SILENTLY — Overlay and Portal are inherently DOM (positioning, document-level mounting), and the
    // Text/List variants are the rich web-only siblings of the canonical primitives. Inverse shape to
    // @pyreon/rx: there, one export lowered and the rest did not, so `supported` carries the exception in both
    // cases rather than splitting the map into two mechanisms.
    '@pyreon/elements': Object.freeze({
      advice:
        '`Element` lowers to Stack and `List` to a keyed Stack of its rows — Text / Overlay / Portal are DOM-based; use the canonical `Text` / `Stack` from @pyreon/primitives, or keep them in a `<Web>` branch',
      supported: Object.freeze([...Object.keys(ELEMENTS_PRIMITIVE_ALIAS), 'List']),
    }),
  }),
})
