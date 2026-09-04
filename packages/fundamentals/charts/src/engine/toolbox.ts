// Toolbox — ECharts' `toolbox` component, engine-shaped.
//
// A row of small controls at the chart's top-right: save-as-image, restore,
// and the magicType switches. Pure layout: the host decides what each
// control DOES (it owns the zoom, brush, legend and mark state); this
// module only places glyph buttons and reports their hit rects, exactly the
// legend's contract.

import type { DrawCmd, Double, Rect } from './types'

export type ToolboxTool = 'saveAsImage' | 'restore' | 'magicLine' | 'magicBar'

export interface ToolboxOptions {
  fontSize: Double
  color: string
  /** The active magicType, drawn emphasized. */
  active?: ToolboxTool | undefined
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

const GLYPH: Record<ToolboxTool, string> = {
  saveAsImage: '⤓',
  restore: '↺',
  magicLine: '∿',
  magicBar: '▥',
}

/** Lay out the tools right-aligned in `box`'s top row. */
export function renderToolbox(tools: ToolboxTool[], box: Rect, opts: ToolboxOptions): ToolboxLayout {
  const cmds: DrawCmd[] = []
  const boxes: Rect[] = []
  if (tools.length === 0) return { cmds, boxes, height: 0.0 }
  const gap = opts.gap ?? 6.0
  const size = opts.fontSize + 8.0
  let x = box.x + box.w - size
  for (let i = tools.length - 1; i >= 0; i--) {
    const tool = tools[i]!
    const active = opts.active === tool
    boxes[i] = { x, y: box.y, w: size, h: size }
    if (active) {
      cmds.push({ kind: 'rect', rect: { x, y: box.y, w: size, h: size }, fill: 'rgba(99,102,241,0.18)' })
    }
    cmds.push({
      kind: 'text',
      text: GLYPH[tool],
      at: { x: x + size / 2.0, y: box.y + size / 2.0 },
      fill: opts.color,
      size: opts.fontSize + 2.0,
      align: 'middle',
      baseline: 'middle',
    })
    x = x - size - gap
  }
  return { cmds, boxes, height: size + gap }
}

/** Which tool a point hits, or null. */
export function hitToolbox(tools: ToolboxTool[], boxes: Rect[], px: Double, py: Double): ToolboxTool | null {
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    if (b === undefined) continue
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return tools[i] ?? null
  }
  return null
}

/** Expand a toolbox config into the ordered tool list the layout draws. */
export function toolboxTools(cfg: { saveAsImage?: boolean; restore?: boolean; magicType?: ('line' | 'bar')[] }): ToolboxTool[] {
  const out: ToolboxTool[] = []
  for (const t of cfg.magicType ?? []) out.push(t === 'line' ? 'magicLine' : 'magicBar')
  if (cfg.restore === true) out.push('restore')
  if (cfg.saveAsImage === true) out.push('saveAsImage')
  return out
}
