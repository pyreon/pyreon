// `<ChordChart>` — flows between categories as ribbons across a circle, on a
// canvas, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { chordLegend, chordTip } from './chrome'
import { hitChordIndex, layoutChord, renderChord } from './chord'
import type { ChordArc, ChordLayout, ChordLink, ChordNode, ChordOptions } from './chord'
import type { ChartTheme } from './render'

export interface ChordChartProps extends CanvasHostProps {
  nodes: ChordNode[] | (() => ChordNode[])
  links: ChordLink[] | (() => ChordLink[])
  chord?: ChordOptions
  /** Fired with the node arc under the click, or null for a miss. */
  onSelect?: (arc: ChordArc | null) => void
  /** The engine's INDEX hit — the multiplatform-safe twin of `onSelect` (what the native tap gesture reports). */
  onSelectIndex?: (hit: number) => void
}

export function ChordChart(props: ChordChartProps): VNode {
  const readNodes = (): ChordNode[] => (typeof props.nodes === 'function' ? props.nodes() : props.nodes)
  const readLinks = (): ChordLink[] => (typeof props.links === 'function' ? props.links() : props.links)
  const opts = (t: ChartTheme): ChordOptions => ({ palette: t.palette, labelColor: t.label, ...props.chord })
  return canvasHost<ChordLayout>({
    props,
    defaultHeight: 360,
    caption: 'Chord data',
    track: () => {
      readNodes()
      readLinks()
    },
    layout: (box, measure, theme) =>
      layoutChord(readNodes(), readLinks(), { x: box.x + 8.0, y: box.y + 8.0, w: Math.max(0.0, box.w - 16.0), h: Math.max(0.0, box.h - 16.0) }, opts(theme), measure),
    animates: true,
    render: (layout, measure, theme, progress) => renderChord(layout, { ...opts(theme), progress }, measure),
    legend: chordLegend,
    select: (layout, px, py) => {
      const i = hitChordIndex(layout, px, py)
      props.onSelect?.(i < 0 ? null : layout.arcs[i]!)
      props.onSelectIndex?.(i)
    },
    tooltip: (layout, px, py) => orNull(chordTip(layout, px, py)),
    // The keyboard walks the node ARCS, one table row each — not the ribbons.
    // A ribbon belongs to two arcs, so walking ribbons would visit every flow
    // twice and give the reader no stable order to hold on to.
    pick: (layout, i) => {
      const arc = layout.arcs[i]
      if (arc === undefined) return
      props.onSelect?.(arc)
      props.onSelectIndex?.(i)
    },
    focusRect: (layout, i) => {
      const arc = layout.arcs[i]
      if (arc === undefined) return null
      // The focus ring is the arc's bounding box, sampled along the span —
      // a chord's arc is not axis-aligned, so its extent cannot be derived
      // from the two endpoints alone (an arc crossing the top of the circle
      // reaches higher than either end).
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      const steps = 12
      for (let k = 0; k <= steps; k++) {
        const angle = arc.start + ((arc.end - arc.start) * k) / steps
        for (const r of [layout.circle.radius, layout.circle.radius - layout.thickness]) {
          const x = layout.circle.center.x + Math.cos(angle) * r
          const y = layout.circle.center.y + Math.sin(angle) * r
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
      if (x0 === Infinity) return null
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    },
    a11y: () => {
      // One row per node, valued by the total through it — which is what the
      // arc encodes, so the table and the picture say the same thing.
      const nodes = readNodes()
      const links = readLinks()
      const totals = nodes.map(() => 0)
      for (const l of links) {
        const s = nodes.findIndex((n) => n.name === l.source)
        const t = nodes.findIndex((n) => n.name === l.target)
        if (s < 0 || t < 0 || !Number.isFinite(l.value) || l.value <= 0) continue
        totals[s] = totals[s]! + l.value
        totals[t] = totals[t]! + l.value
      }
      return {
        title: props.title,
        categories: nodes.map((n) => n.name),
        series: [{ label: 'Total flow', values: totals, kind: 'bar' }],
      }
    },
  })
}
