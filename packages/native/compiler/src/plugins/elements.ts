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
// `List` (data iteration) is a separate follow-up.
// ============================================================================

import type { ElementLowering } from '../element-lowering'
import type { AttrIR, JsxElementIR } from '../types'

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

export const elementsLowering: ElementLowering = Object.freeze({
  module: '@pyreon/elements',
  tags: Object.freeze(Object.keys(ELEMENTS_PRIMITIVE_ALIAS)),
  retag: elementToStack,
  styleBase: true,
})
