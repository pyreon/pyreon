// `<MapChart>` — a choropleth over registered or inline GeoJSON, over the shared canvas host.

import type { VNode } from '@pyreon/core'
import { canvasHost } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
import { geoDomain, geoValueOf, hitGeo, renderGeo } from './geo'
import { geoValues, getMap, layoutGeo } from './geo-web'
import type { GeoLayout, GeoOptions, GeoRegion } from './geo'
import type { GeoJson } from './geo-web'
import type { Double } from './types'

const EMPTY: GeoJson = { type: 'FeatureCollection', features: [] }

export interface MapChartProps extends CanvasHostProps {
  /** Inline GeoJSON or the name of a map registered with `registerMap`. */
  map: GeoJson | string
  values: Record<string, Double> | (() => Record<string, Double>)
  options?: GeoOptions
  /** Fired with the region under the click, or null for a miss. */
  onSelect?: (region: GeoRegion | null) => void
  /** The region's INDEX under the click (into the layout's regions), or -1 — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
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
    // Took `_theme` and threw it away, so a geo chart was the one host that
    // followed no theme at all. The border SEPARATES filled regions, so it
    // reads the ground rather than a token of its own; `background: ''` means
    // "inherit the page", whose realistic value is white.
    render: (layout, measure, theme, progress) =>
      renderGeo(
        layout,
        geoValues(readValues()),
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
      const r = hitGeo(layout, px, py)
      props.onSelect?.(r)
      props.onSelectIndex?.(r === null ? -1 : layout.regions.indexOf(r))
    },
    pick: (layout, i) => {
      const r = layout.regions[i]
      if (r === undefined) return
      props.onSelect?.(r)
      props.onSelectIndex?.(i)
    },
    focusRect: (layout, i) => layout.regions[i]?.bbox ?? null,
    tooltip: (layout, px, py) => {
      const r = hitGeo(layout, px, py)
      if (r === null) return null
      const v = readValues()[r.name]
      return v === undefined ? [r.name] : [r.name, plain(v)]
    },
    a11y: (layout) => {
      const values = geoValues(readValues())
      const dom = geoDomain(layout, values)
      const lo = dom.min
      const hi = dom.max
      return {
        title: props.title,
        categories: layout.regions.map((r) => r.name),
        series: [{ label: props.title ?? `Values from ${lo} to ${hi}`, values: layout.regions.map((r) => geoValueOf(values, r.name)), kind: 'bars' }],
      }
    },
  })
}
