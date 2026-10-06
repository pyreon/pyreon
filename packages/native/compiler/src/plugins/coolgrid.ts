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

import type { EmitContext } from '../emit-context'
import type { ElementLowering } from '../element-lowering'
import { NATIVE_COMPILER_PLUGIN_API_VERSION, type CompilerPlugin } from '../plugin'
import type { AttrIR, JsxElementIR } from '../types'

/** coolgrid tags this lowering claims. */
export const COOLGRID_TAGS = ['Container', 'Row', 'Col'] as const

export function isCoolgridTag(name: string): boolean {
  return (COOLGRID_TAGS as readonly string[]).includes(name)
}

// coolgrid props with no canonical-Stack equivalent (grid math) — stripped.
const STRIP = new Set(['columns', 'gutter', 'size', 'contentAlignX'])

// coolgrid `gap` is a RAW PIXEL number; the canonical Stack's `gap` is a SCALE
// INDEX (0→0, 1→4, …, 9→48px). This reverse map converts a raw-px gap to the
// matching Stack index so `gap={16}` → 16px (index 4), not "index 16" (= 0).
const PX_TO_SPACE_INDEX: Record<number, number> = {
  0: 0, 4: 1, 8: 2, 12: 3, 16: 4, 20: 5, 24: 6, 32: 7, 40: 8, 48: 9,
}

function directionAttr(value: string): AttrIR {
  return { kind: 'attr', name: 'direction', value: { kind: 'literal', value } }
}

/** Translate a coolgrid `gap` attr (raw px) to the Stack `gap` (scale index).
 *  A non-scale px value (e.g. 10) has no index → dropped. */
function translateGap(a: Extract<AttrIR, { kind: 'attr' }>): AttrIR | null {
  const v = a.value
  if (v.kind !== 'literal' || typeof v.value !== 'number') return a // token/non-literal → pass through
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
export function coolgridToStack(e: JsxElementIR): JsxElementIR {
  const dir = e.tag === 'Row' ? 'row' : 'column'
  const attrs: AttrIR[] = []
  for (const a of e.attrs) {
    if (a.kind === 'attr' && STRIP.has(a.name)) continue
    if (a.kind === 'attr' && a.name === 'gap') {
      const translated = translateGap(a)
      if (translated) attrs.push(translated)
      continue
    }
    attrs.push(a)
  }
  attrs.push(directionAttr(dir))
  return { ...e, tag: 'Stack', attrs }
}

/** The default coolgrid column count. A `<Col size>` is a span out of this.
 *  v1 assumes the default — a custom `columns` on the Row is not threaded to
 *  its Cols (documented). */
export const DEFAULT_COLUMNS = 12

/** True if `<Col size=…>` carries an explicit span (of any shape — literal,
 *  responsive object/array, or non-literal). */
export function colHasExplicitSize(e: JsxElementIR): boolean {
  return e.attrs.some((a) => a.kind === 'attr' && a.name === 'size')
}

/** The `<Col size={n}>` LITERAL integer span (clamped to 1..DEFAULT_COLUMNS), or
 *  null when absent / non-literal / responsive (`{ xs, md }` / `[a,b]`). Only a
 *  plain literal integer gets a fractional width; every other shape falls back
 *  to an equal column (the caller warns on a present-but-non-literal size). */
export function colSizeLiteral(e: JsxElementIR): number | null {
  const a = e.attrs.find((x) => x.kind === 'attr' && x.name === 'size')
  if (!a || a.kind !== 'attr') return null
  const v = a.value
  if (v.kind !== 'literal' || typeof v.value !== 'number' || !Number.isInteger(v.value) || v.value <= 0) {
    return null
  }
  return Math.min(v.value, DEFAULT_COLUMNS)
}

/** The `<Col>` body as a plain `<Stack>` (its children, column direction) — the
 *  emit wraps THIS with the per-target equal-fill modifier.
 *
 *  `dropTestId` moves the column's `data-testid` OUT of the inner stack so the
 *  caller can put it on the node that actually carries the WIDTH. Device-found:
 *  with the id on the inner stack, the tagged node hugs its glyph (a 3/12
 *  column measured 7.2dp of a 308dp row — 2.3%, not 25%), so the column's real
 *  geometry was unaddressable and therefore unassertable. Same class as the
 *  `<Link>` identifier drop: an element you cannot select is an element nobody
 *  can prove works. Swift never had the split — it puts
 *  `.accessibilityIdentifier` and `.containerRelativeFrame` on one node. */
export function colToStack(e: JsxElementIR, dropTestId = false): JsxElementIR {
  const attrs = e.attrs.filter(
    (a) => !(a.kind === 'attr' && (STRIP.has(a.name) || (dropTestId && a.name === 'data-testid'))),
  )
  attrs.push(directionAttr('column'))
  return { ...e, tag: 'Stack', attrs }
}

function warnNonLiteralSize(e: JsxElementIR, ctx: EmitContext): void {
  if (colHasExplicitSize(e)) {
    // A responsive / non-literal `size` can't resolve to a static span → equal.
    ctx.warn(
      `<Col size=…>: only a LITERAL integer span lowers to a fractional width; ` +
        `a responsive ({ xs, md } / [a,b]) or non-literal size lowers as an EQUAL column.`,
    )
  }
}

function emitSwiftCol(e: JsxElementIR, ctx: EmitContext): string {
  const body = ctx.emit(colToStack(e))
  const size = colSizeLiteral(e)
  if (size !== null) {
    // Fractional span of a 12-column grid — iOS 17's native grid-column
    // primitive (relative to the nearest container; greediness-free, unlike a
    // GeometryReader). A partial row (cols summing < 12) leaves the rest empty.
    return `${body}.containerRelativeFrame(.horizontal, count: ${DEFAULT_COLUMNS}, span: ${size}, spacing: 0)`
  }
  warnNonLiteralSize(e, ctx)
  return `${body}.frame(maxWidth: .infinity)`
}

function emitKotlinCol(e: JsxElementIR, ctx: EmitContext): string {
  const p = ctx.pad()
  // The test id rides the SIZED node (the Box), not the inner stack — see
  // colToStack's `dropTestId`. The id is emitted here as part of the Box's
  // modifier chain so exactly one node carries it.
  const colTestId = ctx.staticAttr(e, 'data-testid')
  const idMod = typeof colTestId === 'string' ? `.testTag(${ctx.stringLiteral(colTestId)})` : ''
  const inner = `${ctx.pad(ctx.indent + 2)}${ctx.emit(colToStack(e, true), ctx.indent + 2)}`
  const size = colSizeLiteral(e)
  if (size !== null) {
    // A 12-column span lowers to RowScope `weight`, NOT `fillMaxWidth(n/12)`.
    // Device-found: a Row measures each child against the REMAINING width, so
    // fractional fills compound — 3/12 then 9/12 yields 25% + 56%, and the row
    // never adds up. `weight(3f)` + `weight(9f)` divides the row exactly, which
    // is what a grid means and what the Swift twin's
    // `containerRelativeFrame(count:span:)` already did.
    return `Box(modifier = Modifier.weight(${size}f)${idMod}) {\n${inner}\n${p}}`
  }
  warnNonLiteralSize(e, ctx)
  return `Box(modifier = Modifier.weight(1f)${idMod}) {\n${inner}\n${p}}`
}

export const coolgridLowering: ElementLowering = Object.freeze({
  module: '@pyreon/coolgrid',
  tags: COOLGRID_TAGS,
  retag: (e: JsxElementIR) => (e.tag === 'Col' ? undefined : coolgridToStack(e)),
  emit: Object.freeze({ swift: emitSwiftCol, kotlin: emitKotlinCol }),
})

/** The coolgrid lowering as a built-in plugin — registered like any third-party one. */
export const coolgridPlugin: CompilerPlugin = Object.freeze({
  name: coolgridLowering.module,
  apiVersion: NATIVE_COMPILER_PLUGIN_API_VERSION,
  builtIn: true,
  elements: Object.freeze([coolgridLowering]),
})
