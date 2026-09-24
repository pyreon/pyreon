/**
 * The pure halves of the three high-cardinality views — ordering, the
 * selection stylesheets, and label formatting — split from the `.tsx` views so
 * the contracts are unit-testable without a DOM (and measured by coverage,
 * which excludes the views).
 *
 * The selection stylesheets are the performance contract: the matrix and
 * graph render their DOM ONCE per shown set and express selection/hover as
 * ONE `<style>` text built here, so an interaction changes a string, never
 * the O(n²) cells or ~1,100 SVG nodes.
 */
import type { NodeVM, ObservatoryModel } from './model'

/** The ordered internal ids a matrix shows — deepest first, then name. Pure. */
export function matrixIds(m: ObservatoryModel): string[] {
  return m
    .shown()
    .filter((n) => n.kind === 'internal')
    .sort((a, b) => b.depth - a.depth || a.id.localeCompare(b.id))
    .map((n) => n.id)
}

/**
 * The selection stylesheet for a given ordered id list — pure, so the O(1)
 * contract (only this string changes on selection) is testable without a DOM.
 */
export function matrixSelectionCss(ids: readonly string[], sel: string): string {
  const i = ids.indexOf(sel)
  if (i < 0) return ''
  const line = i + 2 // grid line: row/col 1 is the label band
  return (
    `.lm-mx .lm-r${i}::before,.lm-mx .lm-c${i}::before{opacity:1}` +
    `.lm-mx .lm-rl${i},.lm-mx .lm-cl${i}>span{color:var(--lm-accent);font-weight:600}` +
    `.lm-mx .lm-mx-bandr{display:block;grid-row:${line};grid-column:2/-1}` +
    `.lm-mx .lm-mx-bandc{display:block;grid-column:${line};grid-row:2/-1}`
  )
}

/**
 * The hover/selection stylesheet — pure, so the "only this string changes"
 * contract is testable without a DOM. `index` maps node id → its class index.
 */
export function graphSelectionCss(
  m: Pick<ObservatoryModel, 'byId'>,
  index: ReadonlyMap<string, number>,
  sel: string,
  hov: string | null,
): string {
  const si = index.get(sel)
  const hi = hov == null ? undefined : index.get(hov)
  const li = hi ?? si
  let out = ''
  if (si !== undefined) {
    const n = `.lm-g .lm-n${si}`
    out +=
      `${n} .lm-gring{display:inline}${n} .lm-gdot{transform:scale(1.3)}` +
      `${n} .lm-glabel{fill:var(--lm-text);font-weight:600}${n} .lm-gsub{display:inline}`
  }
  if (hi !== undefined) {
    const node = m.byId.get(hov!)
    const related = new Set<number>([hi])
    for (const d of node?.deps ?? []) {
      const i = index.get(d)
      if (i !== undefined) related.add(i)
    }
    for (const d of node?.dependents ?? []) {
      const i = index.get(d)
      if (i !== undefined) related.add(i)
    }
    const sels = [...related].map((i) => `.lm-g .lm-n${i}`)
    out +=
      '.lm-g .lm-gnode{opacity:.4}.lm-g .lm-gedge{opacity:.05}' +
      `${sels.join(',')}{opacity:1}` +
      `${sels.map((s) => `${s} .lm-gsub`).join(',')}{display:inline}`
  }
  if (li !== undefined) {
    out += `.lm-g .lm-ef${li},.lm-g .lm-et${li}{stroke:var(--lm-accent);opacity:${hi !== undefined ? '.65' : '.6'};stroke-width:1.4}`
  }
  if (hi !== undefined) out += '.lm-g[data-cyc=on] .lm-gedge.lm-ce{opacity:.9}'
  return out
}

/** `2 err · 1 warn · 4 info`, zero terms dropped; `—` when there are none. */
export function findingsLabel(n: Pick<NodeVM, 'errors' | 'warnings' | 'infos'>): string {
  const parts: string[] = []
  if (n.errors) parts.push(`${n.errors} err`)
  if (n.warnings) parts.push(`${n.warnings} warn`)
  if (n.infos) parts.push(`${n.infos} info`)
  return parts.length ? parts.join(' · ') : '—'
}
