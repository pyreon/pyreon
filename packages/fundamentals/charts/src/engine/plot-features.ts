// The interaction features `<PlotChart>` can carry, as injectable bundles.
//
// A chart that draws a line needs none of the toolbox, the SVG serializer,
// the area brush, the navigator or the range presets — together about a
// tenth of the plot bundle. The plot HOST therefore takes them as an
// argument (`plotCore(props, features)`) instead of importing them, and
// whoever builds the host decides what to hand it:
//
// - `<PlotChart>` (the array form, `/engine`) passes every feature, so it
//   behaves as it always has.
// - `<Chart>` (the grammar) passes the bundle a child asked for: `<Zoom>`
//   carries `zoomFeature`, `<Toolbox>` carries `toolboxFeature`. A chart with
//   neither never references these modules, and a bundler drops them.
//
// Every call site in the host is written so that an ABSENT feature behaves
// exactly as the feature does when it is unused: no toolbox is an empty tool
// list, no area brush is an unbrushed spec, no magic type is the spec as
// built. That is the property the grammar tests lock.

import { brushBand, brushRange, renderBrushBand } from './brush'
import { applyBrushSelection, brushAreaFromDrag, brushAreaUsable, brushOnlySeries, brushPolygonAdd, brushSelection, renderBrushAreas } from './brush-area'
import { applyMagicType } from './magic-type'
import { navigatorDrag, navigatorHit, renderNavigator } from './navigator'
import { presetHit, presetWindow, renderPresets } from './presets'
import { renderSvg } from './svg'
import { hitToolbox, renderToolbox } from './toolbox'
import { toolboxTools } from './toolbox-config'

/** The x-range brush band — drawn by `<Zoom brush>` and by the toolbox's dataZoom tool alike. */
export interface BandFeature {
  brushBand: typeof brushBand
  brushRange: typeof brushRange
  renderBrushBand: typeof renderBrushBand
}

/** `<Zoom>`: the navigator strip, the range presets and the x-range brush. */
export interface ZoomFeature extends BandFeature {
  navigatorDrag: typeof navigatorDrag
  navigatorHit: typeof navigatorHit
  renderNavigator: typeof renderNavigator
  presetHit: typeof presetHit
  presetWindow: typeof presetWindow
  renderPresets: typeof renderPresets
}

/** `<Toolbox>`: the tool strip, save-as-image, magic type and the area brushes. */
export interface ToolboxFeature extends BandFeature {
  hitToolbox: typeof hitToolbox
  renderToolbox: typeof renderToolbox
  toolboxTools: typeof toolboxTools
  renderSvg: typeof renderSvg
  applyMagicType: typeof applyMagicType
  applyBrushSelection: typeof applyBrushSelection
  brushAreaFromDrag: typeof brushAreaFromDrag
  brushAreaUsable: typeof brushAreaUsable
  brushOnlySeries: typeof brushOnlySeries
  brushPolygonAdd: typeof brushPolygonAdd
  brushSelection: typeof brushSelection
  renderBrushAreas: typeof renderBrushAreas
}

/** What a plot host was given. Read at call time, so a getter can supply it lazily. */
export interface PlotFeatures {
  readonly zoom?: ZoomFeature | undefined
  readonly toolbox?: ToolboxFeature | undefined
}

export const zoomFeature: ZoomFeature = {
  brushBand,
  brushRange,
  renderBrushBand,
  navigatorDrag,
  navigatorHit,
  renderNavigator,
  presetHit,
  presetWindow,
  renderPresets,
}

export const toolboxFeature: ToolboxFeature = {
  brushBand,
  brushRange,
  renderBrushBand,
  hitToolbox,
  renderToolbox,
  toolboxTools,
  renderSvg,
  applyMagicType,
  applyBrushSelection,
  brushAreaFromDrag,
  brushAreaUsable,
  brushOnlySeries,
  brushPolygonAdd,
  brushSelection,
  renderBrushAreas,
}

/** Every feature — what `<PlotChart>` passes. */
export const ALL_PLOT_FEATURES: PlotFeatures = { zoom: zoomFeature, toolbox: toolboxFeature }
