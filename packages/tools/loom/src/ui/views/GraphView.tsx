/**
 * The layered node-link graph — columns by resolution depth (ENTRY → DEPTH n),
 * curved edges, cycle edges dashed + animated, hover dims unrelated nodes.
 *
 * SVG elements can't be rocketstyle components (Element is HTML-only), so
 * their STATIC styling lives in the global `.lm-g*` classes (ui/index.ts);
 * theme-token paints ride as ATTRIBUTES (`var()` is invalid in SVG
 * presentation attributes — the flow-package precedent) and the only inline
 * `style` left is data-driven geometry (the measured min-width). Everything
 * outside the SVG is rocketstyle chrome.
 */
import * as C from '../chrome'
import type { LoomTokens } from '../theme'
import { GRAPH_COL_W, GRAPH_PAD_L, layoutGraph, shortName, type ObservatoryModel } from '../model'

export function GraphView(props: { model: ObservatoryModel; theme: () => LoomTokens }) {
  const m = props.model

  return (
    <C.GraphPad data-testid="graph-view">
      {() => {
        const t = props.theme()
        const shown = m.shown()
        const layout = layoutGraph(shown)
        const shownIds = new Set(shown.map((n) => n.id))
        const sel = m.selId()
        const hov = m.hoverId()
        const focus = hov
        const lit = hov ?? sel
        const related = new Set<string>()
        if (focus) {
          related.add(focus)
          const node = m.byId.get(focus)
          for (const d of node?.deps ?? []) related.add(d)
          for (const d of node?.dependents ?? []) related.add(d)
        }

        const edges: import('@pyreon/core').VNodeChild[] = []
        for (const n of shown) {
          for (const dep of n.deps) {
            if (!shownIds.has(dep)) continue
            const p1 = layout.pos.get(n.id)
            const p2 = layout.pos.get(dep)
            if (!p1 || !p2) continue
            const isCyc = m.showCycles() && m.cycleNodes.has(n.id) && m.cycleNodes.has(dep)
            const on = lit && (n.id === lit || dep === lit)
            const dx = Math.max(48, Math.abs(p2.x - p1.x) * 0.45)
            const d = `M ${p1.x + 11} ${p1.y} C ${p1.x + 11 + dx} ${p1.y}, ${p2.x - 11 - dx} ${p2.y}, ${p2.x - 11} ${p2.y}`
            const stroke = isCyc ? t.danger : on ? t.accent : t.edge
            // At ~700 edges the ambient layer must stay a whisper (0.1) or the
            // whole canvas reads as spaghetti; a lit fan of 20+ deps at 0.95
            // was a flare that washed out its own labels — 0.65 keeps it the
            // loudest thing on screen without drowning the nodes.
            const opacity = focus ? (isCyc ? 0.9 : on ? 0.65 : 0.05) : on ? 0.6 : isCyc ? 0.85 : 0.1
            edges.push(
              <path
                d={d}
                fill="none"
                stroke={stroke}
                stroke-width={isCyc ? '1.8' : on ? '1.4' : '1'}
                stroke-dasharray={isCyc ? '5 4' : undefined}
                opacity={String(opacity)}
                class={isCyc ? 'lm-gedge--cyc' : undefined}
              />,
            )
          }
        }

        const nodes = shown.map((n) => {
          const P = layout.pos.get(n.id)
          if (!P) return null
          const full = shortName(n.id)
          // Long ids (`example-fundamentals-playground`) bled across the next
          // depth column — truncate for the canvas, keep the full name as a
          // native <title> tooltip. Selection shows it whole in the detail rail.
          const name = full.length > 19 ? `${full.slice(0, 18)}…` : full
          const isSel = n.id === sel
          const isCyc = m.showCycles() && m.cycleNodes.has(n.id)
          const dimmed = focus && !related.has(n.id)
          const fill = isCyc ? t.danger : n.kind === 'internal' ? t.accent : t.ext
          // Version sublabels only where the eye is — on the selected node and
          // the focused neighborhood. 293 always-on sublabels were pure noise.
          const showVersion = isSel || (focus != null && related.has(n.id))
          return (
            <g
              transform={`translate(${P.x},${P.y})`}
              data-testid={`gnode-${n.id}`}
              class="lm-gnode"
              opacity={dimmed ? '0.4' : '1'}
              onClick={() => m.select(n.id)}
              onMouseEnter={() => m.hoverId.set(n.id)}
              onMouseLeave={() => m.hoverId.set(null)}
            >
              <title>{n.id}</title>
              {isSel ? <circle r="16" fill="none" stroke={fill} stroke-width="1.2" opacity="0.5" /> : null}
              <circle r={isSel ? '9' : '7'} fill={n.kind === 'internal' ? fill : t.surface} stroke={fill} stroke-width="2" />
              <text
                x="15"
                y="4"
                class={isSel ? 'lm-glabel lm-glabel--sel' : 'lm-glabel'}
                fill={isSel ? t.text : t.muted}
                stroke={t.bg}
              >
                {name}
              </text>
              {showVersion ? (
                <text
                  x="15"
                  y="17"
                  class="lm-gsub"
                  fill={t.faint}
                  stroke={t.bg}
                >
                  {n.kind === 'internal' ? `v${n.version}` : n.version}
                </text>
              ) : null}
            </g>
          )
        })

        const axis = layout.depthKeys.map((d, di) => (
          <text
            x={String(GRAPH_PAD_L + di * GRAPH_COL_W - 4)}
            y="22"
            class="lm-gaxis"
            fill={t.faint}
          >
            {d === 0 ? 'ENTRY' : `DEPTH ${d}`}
          </text>
        ))

        return (
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width="100%"
            preserveAspectRatio="xMidYMid meet"
            class="lm-svg"
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
      }}
    </C.GraphPad>
  )
}
