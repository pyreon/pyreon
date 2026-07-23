// ============================================================================
// `@pyreon/coolgrid` native FRONTEND — the 12-column responsive grid onto native
// layout. `<Container>` / `<Row>` / `<Col>` are a Bootstrap-style flex grid:
//   Container (flex-direction: column) → a vertical Stack
//   Row       (flex-direction: row)    → a horizontal Stack
//   Col       (width = size/columns)   → a fractional (or equal-fill) child
//
// Container/Row are exactly the canonical Stack in a different vocabulary, so
// they retag to `<Stack>` and the existing emit lowers them. Col is emitted
// specially:
//   - `<Col size={8}>` (a LITERAL integer span) → a FRACTIONAL width of a
//     12-column grid: SwiftUI `.containerRelativeFrame(.horizontal, count: 12,
//     span: 8, spacing: 0)` (iOS 17 native grid-column primitive), Compose
//     `Modifier.fillMaxWidth(8f / 12f)`. Both give the same size/12 absolute
//     fraction, so a partial row (cols summing < 12) leaves the rest empty —
//     faithful to coolgrid.
//   - `<Col>` with no size → an EQUAL-fill child (SwiftUI `.frame(maxWidth:
//     .infinity)`, Compose `Modifier.weight(1f)`), valid because a Col always
//     sits inside a Row = a horizontal Stack.
//
// SCOPE (v1) + honest caveats: only a LITERAL integer `size` is fractional; a
// responsive `size` ({ xs, md } / [a,b,c]) or non-literal collapses to equal +
// warns. The grid is assumed 12-column — a custom `columns` on the Row is not
// threaded to its Cols. SwiftUI's `containerRelativeFrame` is relative to the
// nearest CONTAINER (≈ the Row when the Container is full-width, the coolgrid
// norm; a deeply-nested narrow row is approximate); the gutter is not subtracted
// from the fractional width (cols summing to exactly 12 + a large gap can
// slightly overflow on a very narrow screen). Compose `fillMaxWidth` is exact +
// parent-relative.
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

/** The default coolgrid column count. A `<Col size>` is a span out of this.
 *  v1 assumes the default — a custom `columns` on the Row is not threaded to
 *  its Cols (documented). */
export const DEFAULT_COLUMNS = 12

/** True if `<Col size=…>` carries an explicit span (of any shape — literal,
 *  responsive object/array, or non-literal). */
export function colHasExplicitSize(e: AnyNode): boolean {
  return (e.attrs as AnyNode[]).some((a) => a.kind === 'attr' && a.name === 'size')
}

/** The `<Col size={n}>` LITERAL integer span (clamped to 1..DEFAULT_COLUMNS), or
 *  null when absent / non-literal / responsive (`{ xs, md }` / `[a,b]`). Only a
 *  plain literal integer gets a fractional width; every other shape falls back
 *  to an equal column (the caller warns on a present-but-non-literal size). */
export function colSizeLiteral(e: AnyNode): number | null {
  const a = (e.attrs as AnyNode[]).find((x) => x.kind === 'attr' && x.name === 'size')
  if (!a) return null
  const v = a.value
  if (v?.kind !== 'literal' || typeof v.value !== 'number' || !Number.isInteger(v.value) || v.value <= 0) {
    return null
  }
  return Math.min(v.value, DEFAULT_COLUMNS)
}

/** The `<Col>` body as a plain `<Stack>` (its children, column direction) — the
 *  emit wraps THIS with the per-target equal-fill modifier. */
export function colToStack(e: AnyNode): AnyNode {
  const attrs = (e.attrs as AnyNode[]).filter((a) => !(a.kind === 'attr' && STRIP.has(a.name)))
  attrs.push({ kind: 'attr', name: 'direction', value: litString('column') })
  return { ...e, tag: 'Stack', attrs }
}
