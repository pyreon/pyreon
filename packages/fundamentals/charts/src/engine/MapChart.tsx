// `<MapChart>` — a choropleth over registered or inline GeoJSON, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
import { geoDomain, getMap, hitGeo, layoutGeo, renderGeo } from './geo'
import type { GeoJson, GeoLayout, GeoOptions, GeoRegion } from './geo'
import type { Double } from './types'

const EMPTY: GeoJson = { type: 'FeatureCollection', features: [] }

export interface MapChartProps extends CanvasHostProps {
  /** Inline GeoJSON or the name of a map registered with `registerMap`. */
  map: GeoJson | string
  values: Record<string, Double> | (() => Record<string, Double>)
  options?: GeoOptions
  /** Fired with the region under the click, or null for a miss. */
  onSelect?: (region: GeoRegion | null) => void
}

export function MapChart(props: MapChartProps): VNode {
  const geo = (): GeoJson => (typeof props.map === 'string' ? (getMap(props.map) ?? EMPTY) : props.map)
  const readValues = (): Record<string, Double> => (typeof props.values === 'function' ? props.values() : props.values)
  return canvasHost<GeoLayout>({
    props,
    defaultHeight: 300,
    caption: 'Map data',
    track: () => {
      readValues()
    },
    layout: (box) => layoutGeo(geo(), box, props.options),
    animates: true,
    render: (layout, measure, _theme, progress) => renderGeo(layout, readValues(), { ...props.options, progress }, measure),
    select: (layout, px, py) => {
      props.onSelect?.(hitGeo(layout, px, py))
    },
    tooltip: (layout, px, py) => {
      const r = hitGeo(layout, px, py)
      if (r === null) return null
      const v = readValues()[r.name]
      return v === undefined ? [r.name] : [r.name, plain(v)]
    },
    a11y: (layout) => {
      const values = readValues()
      const [lo, hi] = geoDomain(layout, values)
      return {
        title: props.title,
        categories: layout.regions.map((r) => r.name),
        series: [{ label: props.title ?? `Values from ${lo} to ${hi}`, values: layout.regions.map((r) => values[r.name] ?? NaN), kind: 'bars' }],
      }
    },
  })
}
