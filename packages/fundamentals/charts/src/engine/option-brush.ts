// ECharts `brush` on a compiled option — the component's settings, host-shaped.
//
// As in ECharts, the component alone arms nothing: a brush is taken up
// through a toolbox brush tool, whose list defaults to `brush.toolbox`.

import type { OptionWarning } from './option'

export type BrushToolName = 'rect' | 'polygon' | 'lineX' | 'lineY' | 'keep' | 'clear'

export interface OptionBrush {
  /** `brush.brushType`: the type a tool click without its own type takes (default rect). */
  brushType: 'rect' | 'polygon' | 'lineX' | 'lineY'
  /** `brush.brushMode`: multiple keeps every drawn area. */
  multiple: boolean
  /** `brush.outOfBrush.colorAlpha` (default 0.1). */
  outOpacity: number
  /** `brush.toolbox`: the tools a `toolbox.feature.brush` without its own `type` shows. */
  tools: BrushToolName[]
  /** `brush.seriesIndex`: the series a brush selects; empty = all. */
  seriesIndex: number[]
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const TOOL_NAMES: readonly BrushToolName[] = ['rect', 'polygon', 'lineX', 'lineY', 'keep', 'clear']

/** A tool list from an ECharts `type` / `toolbox` array; unknown names are warned and skipped. */
export function brushToolList(raw: unknown, path: string, warn: (code: OptionWarning['code'], path: string, message: string) => void): BrushToolName[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: BrushToolName[] = []
  for (const t of raw) {
    if (TOOL_NAMES.includes(t as BrushToolName)) out.push(t as BrushToolName)
    else warn('series-option-unsupported', path, `The brush tool "${String(t)}" is not one ECharts defines; it was skipped.`)
  }
  return out
}

/** Read `option.brush`, or undefined when absent. */
export function readBrush(option: Record<string, unknown>, warn: (code: OptionWarning['code'], path: string, message: string) => void): OptionBrush | undefined {
  const raw = option['brush']
  const b = Array.isArray(raw) ? raw[0] : raw
  if (!isObj(b)) return undefined
  const t = b['brushType']
  const out: OptionBrush = {
    brushType: t === 'polygon' || t === 'lineX' || t === 'lineY' ? t : 'rect',
    multiple: b['brushMode'] === 'multiple',
    outOpacity: 0.1,
    tools: brushToolList(b['toolbox'], 'brush.toolbox', warn) ?? ['rect', 'polygon', 'keep', 'clear'],
    seriesIndex: [],
  }
  const ob = b['outOfBrush']
  if (isObj(ob)) {
    for (const k of Object.keys(ob)) {
      if (k === 'colorAlpha' && typeof ob[k] === 'number') out.outOpacity = Math.max(0, Math.min(1, ob[k] as number))
      else warn('series-option-unsupported', 'brush.outOfBrush.' + k, `The out-of-brush visual "${k}" is named; outside datums fade by colorAlpha only.`)
    }
  }
  if (isObj(b['inBrush'])) warn('series-option-unsupported', 'brush.inBrush', 'Brushed datums keep their own style; the in-brush visual was ignored.')
  const si = b['seriesIndex']
  if (typeof si === 'number') out.seriesIndex = [si]
  else if (Array.isArray(si)) out.seriesIndex = si.filter((x): x is number => typeof x === 'number')
  for (const k of ['geoIndex', 'xAxisIndex', 'yAxisIndex']) {
    if (b[k] !== undefined && b[k] !== 'all' && b[k] !== 0) warn('series-option-unsupported', 'brush.' + k, `The option chart has one grid; brush.${k} was ignored.`)
  }
  return out
}
