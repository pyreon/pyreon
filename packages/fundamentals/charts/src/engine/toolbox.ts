// Toolbox — ECharts' `toolbox` component, engine-shaped.
//
// A row of small controls at the chart's top-right: save-as-image, restore,
// and the magicType switches. Pure layout: the host decides what each
// control DOES (it owns the zoom, brush, legend and mark state); this
// module only places glyph buttons and reports their hit rects, exactly the
// legend's contract.

import type { DrawCmd, Double, Rect } from './types'

export interface ToolboxOptions {
  fontSize: Double
  color: string
  /** The active magicType, drawn emphasized. */
  active?: string | undefined
  /** Every tool drawn emphasized (the magic kind, the stack mode, the zoom-select mode). */
  actives?: string[] | undefined
  /** Gap between buttons. */
  gap?: Double | undefined
}

export interface ToolboxLayout {
  cmds: DrawCmd[]
  /** Hit rects, index-aligned with the input tools. */
  boxes: Rect[]
  /** Height the row consumes, including its trailing gap. */
  height: Double
}

/** A tool's glyph — a function rather than a record, so the table crosses to native. */
export function toolboxGlyph(tool: string): string {
  if (tool === 'saveAsImage') return '⤓'
  if (tool === 'restore') return '↺'
  if (tool === 'magicLine') return '∿'
  if (tool === 'magicBar') return '▥'
  if (tool === 'magicStack') return '☰'
  if (tool === 'magicTiled') return '▦'
  if (tool === 'dataZoom') return '⊕'
  if (tool === 'dataZoomBack') return '⊖'
  return '▤'
}

/** Lay out the tools right-aligned in `box`'s top row. */
export function renderToolbox(tools: string[], box: Rect, opts: ToolboxOptions): ToolboxLayout {
  const cmds: DrawCmd[] = []
  const boxes: Rect[] = []
  if (tools.length === 0) return { cmds, boxes, height: 0.0 }
  const gap = opts.gap ?? 6.0
  const size = opts.fontSize + 8.0
  let n = 0.0
  for (const _t of tools) n = n + 1.0
  // Left to right, so the hit boxes stay index-aligned with the tools; the last tool sits at the right edge.
  let i = 0.0
  for (const tool of tools) {
    const x = box.x + box.w - size - (n - 1.0 - i) * (size + gap)
    let active = opts.active === tool
    for (const a of opts.actives ?? []) if (a === tool) active = true
    boxes.push({ x, y: box.y, w: size, h: size })
    if (active) {
      cmds.push({ kind: 'rect', rect: { x, y: box.y, w: size, h: size }, fill: 'rgba(99,102,241,0.18)' })
    }
    cmds.push({
      kind: 'text',
      text: toolboxGlyph(tool),
      at: { x: x + size / 2.0, y: box.y + size / 2.0 },
      fill: opts.color,
      size: opts.fontSize + 2.0,
      align: 'middle',
      baseline: 'middle',
    })
    i = i + 1.0
  }
  return { cmds, boxes, height: size + gap }
}

/** Which tool a point hits, or null. */
export function hitToolbox(tools: string[], boxes: Rect[], px: Double, py: Double): string | null {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    if (b === undefined) continue
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return tools[i] ?? null
  }
  return null
}

