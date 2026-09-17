// The web toolbox API: the named tools and ECharts' feature config. The
// crossing layout lives in `toolbox.ts`, which takes tool names as strings.

export type ToolboxTool = 'saveAsImage' | 'restore' | 'magicLine' | 'magicBar' | 'magicStack' | 'magicTiled' | 'dataZoom' | 'dataZoomBack' | 'dataView'

/** A toolbox config: ECharts' `toolbox.feature`, host-shaped. */
export interface ToolboxConfig {
  saveAsImage?: boolean | 'svg' | 'png' | undefined
  restore?: boolean | undefined
  /** `magicType.type`: any of line / bar / stack / tiled. */
  magicType?: ('line' | 'bar' | 'stack' | 'tiled')[] | undefined
  /** `dataZoom`: a box-select zoom tool and its back button. */
  dataZoom?: boolean | undefined
  /** `dataView`: the data as a table over the chart. */
  dataView?: boolean | undefined
}

/** Expand a toolbox config into the ordered tool list the layout draws — ECharts' feature order. */
export function toolboxTools(cfg: ToolboxConfig): ToolboxTool[] {
  const out: ToolboxTool[] = []
  if (cfg.dataZoom === true) {
    out.push('dataZoom')
    out.push('dataZoomBack')
  }
  if (cfg.dataView === true) out.push('dataView')
  for (const t of cfg.magicType ?? []) out.push(t === 'line' ? 'magicLine' : t === 'bar' ? 'magicBar' : t === 'stack' ? 'magicStack' : 'magicTiled')
  if (cfg.restore === true) out.push('restore')
  if (cfg.saveAsImage === true || cfg.saveAsImage === 'svg' || cfg.saveAsImage === 'png') out.push('saveAsImage')
  return out
}
