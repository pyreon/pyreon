// `<MapChart>` — a choropleth over registered GeoJSON, inline GeoJSON, or
// already-projected shapes, over the shared canvas host.
//
// THREE `map` shapes, and only the last one crosses to native. GeoJSON's
// `geometry` is a `Polygon | MultiPolygon` union whose `coordinates` are
// `number[][][]` and `number[][][][]` — different depths for one field, which
// the fat-struct lowering correctly refuses to merge. `GeoShape[]` is that
// union already normalised to rings, so a `map={geoShapes(json)}` (or a
// `GeoShape[]` const) lowers; the registry name and the raw GeoJSON stay web.

import type { VNode } from '@pyreon/core'
import { canvasHost, orNull } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { geoTip } from './chrome'
import { geoDomain, geoValueOf, hitGeoIndex, layoutGeoShapes, renderGeo } from './geo'
import { geoShapes, geoValues, getMap } from './geo-web'
import type { GeoLayout, GeoOptions, GeoRegion, GeoShape, GeoValue } from './geo'
import type { GeoJson } from './geo-web'
import type { Double } from './types'

/** Region values as a record (`{ DE: 83 }`) or as the crossing list. */
export type MapChartValues = Record<string, Double> | GeoValue[]

export interface MapChartProps extends CanvasHostProps {
  /**
   * Already-projected shapes (the form that lowers to native), inline GeoJSON,
   * or the name of a map registered with `registerMap`.
   */
  map: GeoShape[] | GeoJson | string
  values: MapChartValues | (() => MapChartValues)
  options?: GeoOptions
  /** Fired with the region under the click, or null for a miss. */
  onSelect?: (region: GeoRegion | null) => void
  /** The region's INDEX under the click (into the layout's regions), or -1 — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
}

const isShapes = (m: GeoShape[] | GeoJson | string): m is GeoShape[] => Array.isArray(m)

export function MapChart(props: MapChartProps): VNode {
  const shapes = (): GeoShape[] => {
    const m = props.map
    if (isShapes(m)) return m
    const json = typeof m === 'string' ? getMap(m) : m
    if (json === null) return []
    return geoShapes(json, props.options?.projection ?? 'equirectangular', props.options?.nameProperty ?? 'name')
  }
  const readValues = (): GeoValue[] => {
    const v = typeof props.values === 'function' ? props.values() : props.values
    return Array.isArray(v) ? v : geoValues(v)
  }
  return canvasHost<GeoLayout>({
    props,
    defaultHeight: 300,
    caption: 'Map data',
    track: () => {
      readValues()
    },
    layout: (box) => layoutGeoShapes(shapes(), box, props.options),
    animates: true,
    // Took `_theme` and threw it away, so a geo chart was the one host that
    // followed no theme at all. The border SEPARATES filled regions, so it
    // reads the ground rather than a token of its own; `background: ''` means
    // "inherit the page", whose realistic value is white.
    render: (layout, measure, theme, progress) =>
      renderGeo(
        layout,
        readValues(),
        {
          emptyColor: theme.muted,
          borderColor: theme.background === '' ? '#ffffff' : theme.background,
          stops: theme.ramp,
          labelColor: theme.label,
          ...props.options,
          progress,
        },
        measure,
      ),
    select: (layout, px, py) => {
      const i = hitGeoIndex(layout, px, py)
      props.onSelect?.(i < 0 ? null : layout.regions[i]!)
      props.onSelectIndex?.(i)
    },
    pick: (layout, i) => {
      const r = layout.regions[i]
      if (r === undefined) return
      props.onSelect?.(r)
      props.onSelectIndex?.(i)
    },
    focusRect: (layout, i) => layout.regions[i]?.bbox ?? null,
    tooltip: (layout, px, py) => orNull(geoTip(layout, readValues(), px, py)),
    a11y: (layout) => {
      const values = readValues()
      const dom = geoDomain(layout, values)
      return {
        title: props.title,
        categories: layout.regions.map((r) => r.name),
        series: [{ label: props.title ?? `Values from ${dom.min} to ${dom.max}`, values: layout.regions.map((r) => geoValueOf(values, r.name)), kind: 'bars' }],
      }
    },
  })
}
