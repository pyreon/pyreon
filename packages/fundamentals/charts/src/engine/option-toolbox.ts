// ECharts `toolbox` on a compiled option — its features, host-shaped.

import type { OptionWarning } from './option'
import type { ToolboxConfig } from './toolbox-config'

export interface OptionToolbox extends ToolboxConfig {
  /** `saveAsImage.name` — the file name without its extension. */
  name: string
  /** `saveAsImage.type`: png (default), jpeg or svg. */
  imageType: 'png' | 'jpeg' | 'svg'
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const on = (v: unknown): boolean => isObj(v) && v['show'] !== false

/**
 * Read `option.toolbox`, or undefined when absent or hidden. A custom
 * `myTool` (its `onclick` is a function a host cannot run from data) and a
 * y-axis box zoom are named; every other feature maps.
 */
export function readToolbox(option: Record<string, unknown>, warn: (code: OptionWarning['code'], path: string, message: string) => void): OptionToolbox | undefined {
  const raw = option['toolbox']
  const tb = Array.isArray(raw) ? raw[0] : raw
  if (!isObj(tb) || tb['show'] === false) return undefined
  const f = isObj(tb['feature']) ? tb['feature'] : {}
  const out: OptionToolbox = { name: 'echarts', imageType: 'png' }
  for (const key of Object.keys(f)) {
    const v = f[key]
    if (!on(v)) continue
    const path = 'toolbox.feature.' + key
    if (key === 'saveAsImage') {
      const t = (v as Record<string, unknown>)['type']
      out.imageType = t === 'svg' ? 'svg' : t === 'jpeg' || t === 'jpg' ? 'jpeg' : 'png'
      out.saveAsImage = true
      const name = (v as Record<string, unknown>)['name']
      if (typeof name === 'string' && name !== '') out.name = name
    } else if (key === 'restore') {
      out.restore = true
    } else if (key === 'dataView') {
      out.dataView = true
    } else if (key === 'dataZoom') {
      const y = (v as Record<string, unknown>)['yAxisIndex']
      if (y !== undefined && y !== false && y !== 'none') warn('series-option-unsupported', path + '.yAxisIndex', 'The box zoom selects along the category x axis; its y-axis zoom was ignored.')
      out.dataZoom = true
    } else if (key === 'magicType') {
      const types = (v as Record<string, unknown>)['type']
      const list: ('line' | 'bar' | 'stack' | 'tiled')[] = []
      for (const t of Array.isArray(types) ? types : []) {
        if (t === 'line' || t === 'bar' || t === 'stack' || t === 'tiled') list.push(t)
        else warn('series-option-unsupported', path + '.type', `magicType "${String(t)}" is not a switch ECharts defines; it was skipped.`)
      }
      if (list.length > 0) out.magicType = list
    } else if (key.startsWith('my')) {
      warn('series-option-unsupported', path, 'A custom toolbox tool runs a function the option cannot carry; it was skipped.')
    } else {
      warn('series-option-unsupported', path, `The toolbox feature "${key}" is not supported; it was skipped.`)
    }
  }
  return out
}
