/**
 * The layered node-link graph — columns by resolution depth (ENTRY → DEPTH n),
 * curved edges, cycle edges dashed + animated, hover dims unrelated nodes.
 *
 * SVG elements can't be rocketstyle components (Element is HTML-only), so all
 * styling lives in the global `.lm-g*` classes (`global-css.ts`), with theme
 * colours as `--lm-*` custom properties (`var()` is invalid in SVG
 * presentation attributes, but fine in CSS). The only attributes left are
 * geometry.
 *
 * Performance shape:
 *  - The SVG is built once per shown ID SET. Hover, selection, cycle
 *    highlighting and theme are not read by the build, so none of them
 *    rebuild ~1,100 SVG nodes (they used to — every hover recreated the whole
 *    canvas and re-ran the layout).
 *  - Hover + selection are one reactive `<style>` whose text names the lit
 *    node/edge classes (`graphSelectionCss`), so moving the pointer rewrites a
 *    single text node.
 */
import { cx, onMount, type VNodeChild } from '@pyreon/core'
import { computed } from '@pyreon/reactivity'
import {
  GRAPH_COL_W,
  GRAPH_PAD_L,
  layoutGraph,
  shortName,
  truncateMiddle,
  type NodeVM,
  type ObservatoryModel,
} from '../model'
import { graphSelectionCss } from '../selection-css'

const sameIds = (a: readonly NodeVM[], b: readonly NodeVM[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

export function GraphView(props: { model: ObservatoryModel }) {
  const m = props.model
  const shown = computed(() => m.shown(), { equals: sameIds })
  const index = computed(() => new Map(shown().map((n, i) => [n.id, i])))

  let root: HTMLElement | null = null

  // Keep the selection on screen when it moves by keyboard or ⌘K. `nearest`
  // is a no-op when the node is already visible (the pointer-click case), so
  // this never yanks the canvas out from under a click.
  onMount(() => {
    const reveal = () =>
      requestAnimationFrame(() => {
        root
          ?.querySelector(`[data-testid="gnode-${m.selId()}"]`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      })
    reveal()
    return m.selId.subscribe(reveal)
  })

  const build = (list: NodeVM[], idx: ReadonlyMap<string, number>) => {
    const layout = layoutGraph(list)

    const edges: VNodeChild[] = []
    for (const n of list) {
      const fi = idx.get(n.id)!
      const p1 = layout.pos.get(n.id)
      if (!p1) continue
      for (const dep of n.deps) {
        const ti = idx.get(dep)
        const p2 = layout.pos.get(dep)
        if (ti === undefined || !p2) continue
        const cyc = m.cycleNodes.has(n.id) && m.cycleNodes.has(dep)
        const dx = Math.max(48, Math.abs(p2.x - p1.x) * 0.45)
        const d = `M ${p1.x + 11} ${p1.y} C ${p1.x + 11 + dx} ${p1.y}, ${p2.x - 11 - dx} ${p2.y}, ${p2.x - 11} ${p2.y}`
        edges.push(
          <path d={d} class={cx(['lm-gedge', `lm-ef${fi}`, `lm-et${ti}`, cyc && 'lm-ce'])} />,
        )
      }
    }

    const nodes: VNodeChild[] = []
    for (const n of list) {
      const P = layout.pos.get(n.id)
      if (!P) continue
      const i = idx.get(n.id)!
      // Externals keep their FULL id: stripping the scope made `@types/node`
      // and a bare `node` indistinguishable on the canvas.
      const full = n.kind === 'internal' ? shortName(n.id) : n.id
      // Long ids bled across the next depth column — truncate for the canvas
      // (middle, so prefix-sharing siblings stay distinguishable), keep the
      // full name as a native <title> tooltip.
      const name = truncateMiddle(full, 20)
      const cls = `lm-gnode lm-n${i} ${n.kind === 'internal' ? 'lm-ki' : 'lm-ke'}${m.cycleNodes.has(n.id) ? ' lm-cn' : ''}`
      const version = n.kind === 'internal' ? `v${n.version}` : n.version
      nodes.push(
        <g
          transform={`translate(${P.x},${P.y})`}
          data-testid={`gnode-${n.id}`}
          class={cls}
          onClick={() => m.select(n.id)}
          onMouseEnter={() => m.hoverId.set(n.id)}
          onMouseLeave={() => m.hoverId.set(null)}
        >
          <title>{n.id}</title>
          <circle class="lm-ghit" r="13" />
          <circle class="lm-gring" r="14" />
          <circle class="lm-gdot" r="7" />
          <text x="18" y="4" class="lm-glabel">
            {name}
          </text>
          <text x="18" y="17" class="lm-gsub">
            {version}
          </text>
        </g>,
      )
    }

    const axis: VNodeChild[] = []
    layout.depthKeys.forEach((d, di) => {
      // The label is computed OUT of JSX-child position deliberately — see the
      // history: the `_ssr` compile-to-string lowering once mis-substituted
      // expressions across sibling `.map()` callbacks here.
      const label = d === 0 ? 'ENTRY' : `DEPTH ${d}`
      axis.push(
        <text x={String(GRAPH_PAD_L + di * GRAPH_COL_W - 4)} y="22" class="lm-gaxis">
          {label}
        </text>,
      )
    })

    return (
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        class="lm-svg lm-g"
        data-cyc={() => (m.showCycles() ? 'on' : 'off')}
        style={
          // Data-driven: the floor tracks the MEASURED layout width so a
          // dense workspace keeps a horizontal scroll instead of crushing.
          `min-width:${Math.round(layout.width * 0.86)}px`
        }
      >
        <g>{axis}</g>
        <g>{edges}</g>
        <g>{nodes}</g>
      </svg>
    )
  }

  return (
    <div
      class="lm-gpad"
      data-testid="graph-view"
      ref={(el: HTMLElement | null) => {
        root = el
      }}
    >
      <style>{() => graphSelectionCss(m, index(), m.selId(), m.hoverId())}</style>
      {() => build(shown(), index())}
    </div>
  )
}
