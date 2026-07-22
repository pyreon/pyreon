// ============================================================================
// `@pyreon/coolgrid` native FRONTEND — the 12-column responsive grid onto native
// layout. `<Container>` / `<Row>` / `<Col>` are a Bootstrap-style flex grid:
//   Container (flex-direction: column) → a vertical Stack
//   Row       (flex-direction: row)    → a horizontal Stack
//   Col       (width = size/columns)   → an EQUAL-fill child of the Row
//
// Container/Row are exactly the canonical Stack in a different vocabulary, so
// they retag to `<Stack>` and the existing emit lowers them. Col is emitted
// specially: on native it fills its Row track equally — SwiftUI
// `.frame(maxWidth: .infinity)`, Compose `Modifier.weight(1f)` (valid because a
// Col always sits inside a Row = a horizontal Stack). Both give consistent EQUAL
// columns — the common grid.
//
// SCOPE (v1): equal columns. A FRACTIONAL `size={8}` span lowers as an equal
// column + a warning — true fractional needs SwiftUI GeometryReader (no flex
// weight) for cross-target parity, a tracked follow-up. Responsive `size`
// ({ xs, md } / [a,b,c]) likewise collapses to equal + warns.
// ============================================================================

import type { ExprIR } from './types'

// oxc/emit AST is walked loosely, matching the sibling native frontends.
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

/** coolgrid tags this frontend lowers. */
export const COOLGRID_TAGS = new Set(['Container', 'Row', 'Col'])

export function isCoolgridTag(name: string): boolean {
  return COOLGRID_TAGS.has(name)
}

// coolgrid props with no canonical-Stack equivalent (grid math) — stripped.
const STRIP = new Set(['columns', 'gutter', 'size', 'contentAlignX'])

// coolgrid `gap` is a RAW PIXEL number; the canonical Stack's `gap` is a SCALE
// INDEX (0→0, 1→4, …, 9→48px). This reverse map converts a raw-px gap to the
// matching Stack index so `gap={16}` → 16px (index 4), not "index 16" (= 0).
const PX_TO_SPACE_INDEX: Record<number, number> = {
  0: 0, 4: 1, 8: 2, 12: 3, 16: 4, 20: 5, 24: 6, 32: 7, 40: 8, 48: 9,
}

function litString(value: string): Extract<ExprIR, { kind: 'literal' }> {
  return { kind: 'literal', value }
}

/** Translate a coolgrid `gap` attr (raw px) to the Stack `gap` (scale index).
 *  A non-scale px value (e.g. 10) has no index → dropped (the caller warns). */
function translateGap(a: AnyNode): AnyNode | null {
  const v = a.value
  if (v?.kind !== 'literal' || typeof v.value !== 'number') return a // token/non-literal → pass through
  const idx = PX_TO_SPACE_INDEX[v.value]
  if (idx === undefined) return null // off-scale px → drop
  return { kind: 'attr', name: 'gap', value: { kind: 'literal', value: idx } }
}

/**
 * `<Container>` → a vertical `<Stack>`; `<Row>` → a horizontal `<Stack>`. Grid-
 * specific props (columns/gutter/size/contentAlignX) are stripped; `gap` (raw px)
 * is converted to the Stack's scale index; padding/style pass through. (`<Col>`
 * is emitted separately — it needs the equal-fill modifier.)
 */
export function coolgridToStack(e: AnyNode): AnyNode {
  const dir = e.tag === 'Row' ? 'row' : 'column'
  const attrs: AnyNode[] = []
  for (const a of e.attrs as AnyNode[]) {
    if (a.kind === 'attr' && STRIP.has(a.name)) continue
    if (a.kind === 'attr' && a.name === 'gap') {
      const translated = translateGap(a)
      if (translated) attrs.push(translated)
      continue
    }
    attrs.push(a)
  }
  attrs.push({ kind: 'attr', name: 'direction', value: litString(dir) })
  return { ...e, tag: 'Stack', attrs }
}

/** True if `<Col size=…>` carries an explicit span — v1 lowers it as an equal
 *  column, so the caller warns (fractional spans are a follow-up). */
export function colHasExplicitSize(e: AnyNode): boolean {
  return (e.attrs as AnyNode[]).some((a) => a.kind === 'attr' && a.name === 'size')
}

/** The `<Col>` body as a plain `<Stack>` (its children, column direction) — the
 *  emit wraps THIS with the per-target equal-fill modifier. */
export function colToStack(e: AnyNode): AnyNode {
  const attrs = (e.attrs as AnyNode[]).filter((a) => !(a.kind === 'attr' && STRIP.has(a.name)))
  attrs.push({ kind: 'attr', name: 'direction', value: litString('column') })
  return { ...e, tag: 'Stack', attrs }
}
