/**
 * The layered graph — internal packages as boxes in one column per resolution
 * depth (ENTRY → DEPTH n), runtime edges as curves from a package to what it
 * imports. Selecting a package lights its blast radius (every transitive
 * dependent, and the edges a change travels along); cycle edges are dashed
 * red; dev edges are an opt-in dotted layer. External dependencies are not
 * drawn here — they live in the version matrix and the package list.
 *
 * SVG elements can't be rocketstyle components (Element is HTML-only), so all
 * styling lives in the global `.lm-g*` classes (`global-css.ts`), with theme
 * colours as `--lm-*` custom properties (`var()` is invalid in SVG
 * presentation attributes, but fine in CSS). The only attributes left are
 * geometry.
 *
 * Performance shape:
 *  - The SVG is built ONCE: the internal node set is fixed for the model's
 *    life. Hover, selection, blast radius, cycle and dev-edge toggles are not
 *    read by the build, so none of them rebuild the ~1,000 SVG nodes.
 *  - Selection + hover are one reactive `<style>` whose text names the lit
 *    node/edge classes (`graphSelectionCss`); the toggles are attributes.
 *  - Keyboard: one roving tab stop (the selected box). Tab enters the graph,
 *    Enter/Space select, ↑↓ walk the package list (the shell's handler).
 */
import { cx, onMount, type VNodeChild } from '@pyreon/core'
import {
  GRAPH_BOX_H,
  GRAPH_BOX_W,
  GRAPH_COL_W,
  GRAPH_PAD_L,
  layoutGraph,
  shortName,
  truncateEnd,
  type ObservatoryModel,
} from '../model'
import { graphSelectionCss } from '../selection-css'

export function GraphView(props: { model: ObservatoryModel }) {
  const m = props.model
  const list = m.internal
  const index = new Map(list.map((n, i) => [n.id, i]))
  const layout = layoutGraph(list)
  let root: HTMLElement | null = null

  const nodeEl = (id: string) => root?.querySelector<SVGGElement>(`[data-testid="gnode-${id}"]`)

  // One roving tab stop, and keep the selection on screen when it moves by
  // keyboard or ⌘K. `nearest` is a no-op when the box is already visible
  // (the pointer-click case), so this never yanks the canvas from a click.
  onMount(() => {
    let current: SVGGElement | null | undefined
    const sync = () => {
      current?.setAttribute('tabindex', '-1')
      // Nothing selected (the overview): the tab stop is the first box and
      // the canvas stays where it is — at its start, depth 0 on the left.
      const id = m.selId()
      current = nodeEl(id || (list[0]?.id ?? ''))
      current?.setAttribute('tabindex', '0')
      if (id) {
        requestAnimationFrame(() => current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
      }
    }
    sync()
    return m.selId.subscribe(sync)
  })

  const edgePath = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let x1 = a.x + GRAPH_BOX_W
    let y1 = a.y + GRAPH_BOX_H / 2
    let x2 = b.x
    let y2 = b.y + GRAPH_BOX_H / 2
    if (x2 <= x1) {
      // Same column or backwards (only inside a cycle): bottom → top.
      x1 = a.x + GRAPH_BOX_W / 2
      y1 = a.y + GRAPH_BOX_H
      x2 = b.x + GRAPH_BOX_W / 2
      y2 = b.y
      const my = (y1 + y2) / 2
      return `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
    }
    const mx = (x1 + x2) / 2
    return `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  }

  const edges: VNodeChild[] = []
  const devEdges: VNodeChild[] = []
  for (const n of list) {
    const fi = index.get(n.id)!
    const p1 = layout.pos.get(n.id)!
    for (const dep of n.deps) {
      const ti = index.get(dep)
      if (ti === undefined) continue // an external: not drawn here
      const cyc = m.cycleNodes.has(n.id) && m.cycleNodes.has(dep)
      edges.push(
        <path
          d={edgePath(p1, layout.pos.get(dep)!)}
          class={cx(['lm-gedge', `lm-ef${fi}`, `lm-et${ti}`, cyc && 'lm-ce'])}
        />,
      )
    }
    for (const dep of n.devDeps) {
      const p2 = layout.pos.get(dep)
      if (p2) devEdges.push(<path d={edgePath(p1, p2)} class="lm-gdev" />)
    }
  }

  const nodes: VNodeChild[] = []
  for (const n of list) {
    const P = layout.pos.get(n.id)!
    const i = index.get(n.id)!
    // The box fits ~25 mono characters; a longer name is cut at the END (a
    // middle cut like `compiler-…in-arm64` read as noise). The full id is the
    // <title> tooltip and the accessible name.
    const name = truncateEnd(shortName(n.id), n.private ? 21 : 25)
    const findings = n.errors + n.warnings + n.infos
    nodes.push(
      <g
        transform={`translate(${P.x},${P.y})`}
        data-testid={`gnode-${n.id}`}
        class={cx(['lm-gnode', `lm-n${i}`])}
        // An SVG <g> cannot be a <button>; the role + roving tabindex + key
        // handler are how SVG content is made operable.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="button"
        // Lowercase `tabindex` through a spread: SvgAttributes types only
        // `tabIndex`, which the runtime writes verbatim as a camelCase
        // attribute Chromium ignores on SVG (pyreon/pyreon#4466).
        {...{ tabindex: '-1' }}
        aria-label={`${n.id}, depth ${n.depth}${findings ? `, ${findings} finding${findings === 1 ? '' : 's'}` : ''}`}
        onClick={() => m.select(n.id)}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            m.select(n.id)
          }
        }}
        onMouseEnter={() => m.hoverId.set(n.id)}
        onMouseLeave={() => m.hoverId.set(null)}
      >
        <title>{n.id}</title>
        <rect class="lm-gbox" width={String(GRAPH_BOX_W)} height={String(GRAPH_BOX_H)} rx="6" />
        {n.worst ? (
          <circle class={cx([`lm-gsev--${n.worst}`])} cx="12" cy={String(GRAPH_BOX_H / 2)} r="3.5" />
        ) : null}
        <text x="22" y={String(GRAPH_BOX_H / 2 + 4)} class="lm-glabel">
          {name}
        </text>
        {n.private ? (
          <text
            x={String(GRAPH_BOX_W - 8)}
            y={String(GRAPH_BOX_H / 2 + 3)}
            text-anchor="end"
            class="lm-gpriv"
          >
            priv
          </text>
        ) : null}
      </g>,
    )
  }

  const axis = layout.depthKeys.map((d, di) => {
    // The label is computed OUT of JSX-child position deliberately — the
    // `_ssr` compile-to-string lowering once mis-substituted expressions
    // across sibling `.map()` callbacks here.
    const label = d === 0 ? 'ENTRY' : `DEPTH ${d}`
    return (
      <text x={String(GRAPH_PAD_L + di * GRAPH_COL_W)} y="24" class="lm-gaxis">
        {label}
      </text>
    )
  })

  return (
    <div
      class="lm-gpad"
      data-testid="graph-view"
      ref={(el: HTMLElement | null) => {
        root = el
      }}
    >
      <style>{() => graphSelectionCss(m, index, m.selId(), m.hoverId(), m.blast())}</style>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={String(layout.width)}
        height={String(layout.height)}
        class="lm-svg lm-g"
        // SVG has no <fieldset>; the group role names the box set for AT.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="group"
        aria-label={`Workspace dependency graph: ${list.length} packages, ${m.report.stats.edges} runtime edges`}
        data-cyc={() => (m.showCycles() ? 'on' : 'off')}
        data-dev={() => (m.showDev() ? 'on' : 'off')}
      >
        <g>{axis}</g>
        <g class="lm-gdevs">{devEdges}</g>
        <g>{edges}</g>
        <g>{nodes}</g>
      </svg>
      <div class="lm-legend" data-testid="graph-legend">
        <span>
          <i class="lm-lg-blast" />
          blast radius
        </span>
        <span>
          <i class="lm-lg-cyc" />
          cycle
        </span>
        <span>
          <i class="lm-lg-edge" />
          runtime edge
        </span>
        {() =>
          m.showDev() ? (
            <span>
              <i class="lm-lg-dev" />
              dev edge
            </span>
          ) : null
        }
      </div>
    </div>
  )
}
