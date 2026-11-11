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

/** The ordered internal ids the import matrix shows — deepest first, then
 * name. Over every internal package (the package-list filter does not narrow
 * it), so nothing but the workspace itself changes the set. Pure. */
export function matrixIds(m: Pick<ObservatoryModel, 'internal'>): string[] {
  return [...m.internal]
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
 * The graph's selection + hover stylesheet — pure, so the "only this string
 * changes" contract is testable without a DOM. `index` maps node id → its
 * class index; `blast` is the selection's transitive dependents.
 *
 *  - selection: the node is filled with the accent, its blast radius is
 *    outlined, and every edge INSIDE {selection ∪ blast} turns accent — the
 *    path a change travels.
 *  - hover: everything dims, then the hovered node and its direct neighbours
 *    relight (the old reading, kept for exploring a dense column).
 */
export function graphSelectionCss(
  m: Pick<ObservatoryModel, 'byId'>,
  index: ReadonlyMap<string, number>,
  sel: string,
  hov: string | null,
  blast: readonly string[] = [],
): string {
  const si = index.get(sel)
  const hi = hov == null ? undefined : index.get(hov)
  let out = ''
  if (si !== undefined) {
    const n = `.lm-g .lm-n${si}`
    out += `${n} .lm-gbox{fill:var(--lm-selFill);stroke:var(--lm-accent);stroke-width:1.6}${n} .lm-glabel{fill:var(--lm-text)}`
    const lit = new Set<string>([sel])
    const hot: number[] = []
    for (const id of blast) {
      const i = index.get(id)
      if (i === undefined) continue
      lit.add(id)
      hot.push(i)
    }
    if (hot.length) {
      const sels = hot.map((i) => `.lm-g .lm-n${i}`)
      out +=
        `${sels.map((s) => `${s} .lm-gbox`).join(',')}{stroke:var(--lm-accent);stroke-opacity:.55}` +
        `${sels.map((s) => `${s} .lm-glabel`).join(',')}{fill:var(--lm-text)}`
    }
    const edges: string[] = []
    for (const id of lit) {
      const from = index.get(id)!
      for (const dep of m.byId.get(id)?.deps ?? []) {
        const to = index.get(dep)
        if (to !== undefined && lit.has(dep)) edges.push(`.lm-g .lm-ef${from}.lm-et${to}`)
      }
    }
    if (edges.length) out += `${edges.join(',')}{stroke:var(--lm-accent);opacity:.9;stroke-width:1.6}`
  }
  if (hi !== undefined) {
    const node = m.byId.get(hov!)
    const related = new Set<number>([hi])
    for (const d of [...(node?.deps ?? []), ...(node?.dependents ?? [])]) {
      const i = index.get(d)
      if (i !== undefined) related.add(i)
    }
    const sels = [...related].map((i) => `.lm-g .lm-n${i}`)
    out +=
      '.lm-g .lm-gnode{opacity:.35}.lm-g .lm-gedge{opacity:.05}' +
      `${sels.join(',')}{opacity:1}` +
      `.lm-g .lm-ef${hi},.lm-g .lm-et${hi}{stroke:var(--lm-accent);opacity:.8;stroke-width:1.4}` +
      '.lm-g[data-cyc=on] .lm-gedge.lm-ce{opacity:.9}'
  }
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

/**
 * The version matrix's selection sheet: a selected PACKAGE lights its column
 * (header + band), a selected EXTERNAL lights its row. Pure, like the others:
 * the cells are built once per row set, a selection rewrites this string.
 */
export function versionSelectionCss(
  cols: readonly string[],
  rows: readonly string[],
  sel: string,
): string {
  const c = cols.indexOf(sel)
  if (c >= 0) {
    return (
      `.lm-vm .lm-vc${c}>button{color:var(--lm-accent);font-weight:600}` +
      `.lm-vm .lm-vm-bandc{display:block;grid-column:${c + 2};grid-row:2/-1}`
    )
  }
  const r = rows.indexOf(sel)
  if (r >= 0) {
    return (
      `.lm-vm .lm-vr${r}>button{color:var(--lm-accent);font-weight:600}` +
      `.lm-vm .lm-vm-bandr{display:block;grid-row:${r + 2};grid-column:2/-1}`
    )
  }
  return ''
}
