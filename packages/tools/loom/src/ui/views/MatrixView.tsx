/**
 * Adjacency matrix — rows depend on columns; back-edges inside a cycle render
 * red when cycle-highlighting is on. Internal packages only (an external
 * column can never depend on anything, so the interesting quadrant is the
 * internal×internal block — the design's "scope prefix stripped" note).
 *
 * Ordered DEEPEST first (the foundations everything imports), then name:
 * every dependency sits before its dependents, so every forward edge lands
 * BELOW the diagonal and a mark above it is a back-edge — the classic DSM
 * reading, where a cycle shows up in the wrong triangle. Foundations-first
 * also puts the dense block in the top-left, where the view opens; entries-
 * first opened on a screen-sized empty square (examples never import each
 * other).
 *
 * Performance shape (the reason this is plain DOM + global classes, not
 * rocketstyle components — see `global-css.ts`):
 *  - The grid is a CSS grid with only the EDGE cells rendered, each placed
 *    by `grid-area`. On this repo that is ~900 nodes instead of n² ≈ 23k.
 *  - It is built once per shown ID SET. Selection, cycle-highlighting and
 *    theme are not read by the build, so they never rebuild it.
 *  - Selection is one reactive `<style>` (crosshair bands + lit row/column),
 *    so a selection change rewrites a single text node — O(1) DOM work.
 */
import { cx, type VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import { shortName, type ObservatoryModel } from '../model'
import { matrixIds, matrixSelectionCss } from '../selection-css'

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

export function MatrixView(props: { model: ObservatoryModel }) {
  const m = props.model
  const ids = computed(() => matrixIds(m), { equals: sameIds })

  const build = (list: string[]) => {
    if (list.length === 0) {
      return (
        <div class="lm-mx-empty" data-testid="matrix-empty">
          The matrix covers internal packages — switch the kind filter to “all” or “internal”.
        </div>
      )
    }
    const index = new Map(list.map((id, i) => [id, i]))
    const depthOf = (id: string) => m.byId.get(id)?.depth ?? 0
    const children: VNodeChild[] = [
      <div class="lm-mx-corner" />,
      <div class="lm-mx-band lm-mx-bandr" />,
      <div class="lm-mx-band lm-mx-bandc" />,
    ]
    list.forEach((id, i) => {
      const name = shortName(id)
      children.push(
        <div class={cx(['lm-mx-ch', `lm-cl${i}`])} style={`grid-column:${i + 2}`} title={id}>
          <span>{name}</span>
        </div>,
        <button
          type="button"
          class={cx(['lm-mx-rl', `lm-rl${i}`])}
          style={`grid-row:${i + 2}`}
          title={id}
          onClick={() => m.select(id)}
        >
          {name}
        </button>,
        <span class="lm-mx-d" style={`grid-area:${i + 2}/${i + 2}`} />,
      )
    })
    for (const r of list) {
      const ri = index.get(r)!
      for (const c of m.byId.get(r)?.deps ?? []) {
        const ci = index.get(c)
        if (ci === undefined) continue
        const back = depthOf(c) <= depthOf(r) && m.cycleNodes.has(r) && m.cycleNodes.has(c)
        // A real <button> per edge cell: keyboard-reachable + the a11y
        // rules' point, not just their letter. Empty cells are not rendered.
        children.push(
          <button
            type="button"
            class={cx(['lm-mx-c', `lm-r${ri}`, `lm-c${ci}`, back && 'lm-back'])}
            style={`grid-area:${ri + 2}/${ci + 2}`}
            title={`${r} → ${c}`}
            aria-label={`${r} depends on ${c}`}
            onClick={() => m.select(c)}
          />,
        )
      }
    }
    return (
      <div
        class="lm-mx"
        data-testid="matrix-grid"
        style={`--lm-n:${list.length}`}
        data-cyc={() => (m.showCycles() ? 'on' : 'off')}
      >
        {children}
      </div>
    )
  }

  return (
    <div class="lm-mxwrap" data-testid="matrix-view">
      <style>{() => matrixSelectionCss(ids(), m.selId())}</style>
      <div class="lm-mxnote">
        {`rows depend on columns · ${m.report.stats.edges} edges · foundations first — marks above the diagonal are back-edges · scope prefix stripped`}
      </div>
      {() => build(ids())}
    </div>
  )
}
