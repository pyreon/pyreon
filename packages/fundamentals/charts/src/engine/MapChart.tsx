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
import { signal } from '@pyreon/reactivity'
import { canvasHost, orNull } from './canvas-host'
import type { CanvasHostProps } from './canvas-host'
import { plain } from './format'
import { geoDomainAligned, geoRoamPan, geoRoamZoom, hitGeoIndex, layoutGeoShapes, renderGeoAligned } from './geo'
import { geoHeatStops, hitGeoOverlayPoint, renderGeoHeat, renderGeoTrails, renderGeoOverlayPaths, renderGeoOverlayPoints, renderGeoPies } from './geo-overlay'
import { alignGeoValues, geoFeatures, getMap } from './geo-web'
import type { GeoLayout, GeoOptions, GeoRegion, GeoShape, GeoValue, GeoView } from './geo'
import type { GeoHeatPoint, GeoOverlayOptions, GeoOverlayPath, GeoOverlayPoint, GeoPie, GeoTrail } from './geo-overlay'
import type { GeoJson, GeoSource } from './geo-web'
import type { Double, Rect } from './types'
import type { VisualMapSpec } from './visual-map'
import { visualMapHost } from './visual-map-host'
import type { VisualMapSelection } from './visual-map-host'

/** Region values as a record (`{ DE: 83 }`) or as the crossing list. */
export type MapChartValues = Record<string, Double> | readonly GeoValue[]

export interface MapChartProps extends CanvasHostProps {
  /**
   * Already-projected shapes (the form that lowers to native), inline GeoJSON,
   * or the name of a map registered with `registerMap`.
   */
  map: readonly GeoShape[] | GeoJson | string
  values: MapChartValues | (() => MapChartValues)
  options?: GeoOptions
  /** Native-safe point marks drawn over the regions. */
  points?: readonly GeoOverlayPoint[]
  /** Native-safe geographic paths drawn below `points`. */
  paths?: readonly GeoOverlayPath[]
  /** A heat layer: weighted samples drawn as soft blobs over the regions. */
  heat?: readonly GeoHeatPoint[]
  /** The heat blob radius in pixels (default 20) and its colour ramp (default the theme's). */
  heatRadius?: Double
  heatStops?: readonly string[]
  /** Pies placed at geographic points. */
  pies?: readonly GeoPie[]
  /**
   * An animated trail along every path (ECharts' `effect` on geo lines). The
   * canvas runs a frame clock while it is set, held still under reduced motion.
   */
  trail?: GeoTrail
  /** Appearance shared by the point and path overlays. */
  overlayOptions?: GeoOverlayOptions
  /**
   * Fired with the region under the click (null for a miss) and its info: join key, display name, value, and the
   * feature's own GeoJSON properties (web-only; empty for a `GeoShape[]` map).
   */
  onSelect?: (region: GeoRegion | null, info: MapRegionInfo | null) => void
  /**
   * The tooltip for a region: lines (or one string) from the region's info, including the feature's properties.
   * Return null for none. Web-only.
   */
  tooltipFormatter?: (info: MapRegionInfo) => string | string[] | null
  /** The region's INDEX under the click (into the layout's regions), or -1 — the multiplatform-safe twin of `onSelect`. */
  onSelectIndex?: (index: number) => void
  /** The overlay point's index under the click, or -1 for a miss. */
  onSelectPointIndex?: (index: number) => void
  /**
   * ECharts' `roam`: `true` pans and zooms, `'scale'` only zooms (wheel /
   * pinch), `'move'` only pans (drag). Starts from `options.zoom` / `panX` /
   * `panY` when given.
   */
  roam?: boolean | 'scale' | 'move' | 'pan'
  /** Zoom bounds for roaming; defaults 0.5 … 20. */
  scaleLimit?: { min?: Double; max?: Double }
  /**
   * An ECharts-style visualMap beside the chart: its domain drives the ramp,
   * a `calculable` strip's handles drag the in-range interval and a piecewise
   * strip's swatches toggle; values outside the selection take the inactive colour.
   */
  visualMap?: VisualMapSpec | (() => VisualMapSpec | undefined) | undefined
  /** Fired as the visualMap selection changes. */
  onVisualMapChange?: (selection: VisualMapSelection) => void
}

/** A region as the host's callbacks see it. */
export interface MapRegionInfo {
  /** The region's index (into the layout's regions, and the accessible table's rows). */
  index: number
  /** The join key values are matched on. */
  name: string
  /** The display name. */
  label: string
  /** The region's value, `NaN` when it has none. */
  value: Double
  /** The feature's GeoJSON `properties`, or null (a `GeoShape[]` map has none). */
  properties: Record<string, unknown> | null
}

const isShapes = (m: readonly GeoShape[] | GeoJson | string): m is readonly GeoShape[] => Array.isArray(m)
// `Array.isArray` does not narrow a union holding a READONLY array, so the
// values form gets its own guard.
const isValueList = (v: MapChartValues): v is readonly GeoValue[] => Array.isArray(v)

export function MapChart(props: MapChartProps): VNode {
  // The projected features of the map, memoised: a roam frame lays out again, and re-projecting every vertex of a
  // GeoJSON / registry map each time is the cost. Keyed on the map, its projection and the two properties.
  let sourceMemo: { m: unknown; key: string; out: GeoSource } | null = null
  const source = (): GeoSource => {
    const m = props.map
    if (isShapes(m)) return { shapes: m as GeoShape[], properties: [] }
    const json = typeof m === 'string' ? getMap(m) : m
    if (json === null) return { shapes: [], properties: [] }
    const key = `${props.options?.projection ?? 'equirectangular'}|${props.options?.nameProperty ?? 'name'}|${props.options?.idProperty ?? ''}`
    if (sourceMemo !== null && sourceMemo.m === json && sourceMemo.key === key) return sourceMemo.out
    const out = geoFeatures(json, props.options?.projection ?? 'equirectangular', props.options?.nameProperty ?? 'name', props.options?.idProperty)
    sourceMemo = { m: json, key, out }

    return out
  }
  const shapes = (): readonly GeoShape[] => source().shapes
  const rawValues = (): MapChartValues => (typeof props.values === 'function' ? props.values() : props.values)
  // The values in region order, rebuilt only when the shapes or the values change: a frame reads one array slot per region.
  let alignedMemo: { shapes: readonly GeoShape[]; values: MapChartValues; out: Double[] } | null = null
  const aligned = (): Double[] => {
    const sh = shapes()
    const v = rawValues()
    if (alignedMemo !== null && alignedMemo.shapes === sh && alignedMemo.values === v) return alignedMemo.out
    const out = alignGeoValues(sh.map((s) => s.name), v)
    alignedMemo = { shapes: sh, values: v, out }

    return out
  }
  const infoOf = (layout: GeoLayout, i: number): MapRegionInfo => {
    const r = layout.regions[i]!
    const v = aligned()[i]

    return { index: i, name: r.name, label: r.label, value: v ?? Number.NaN, properties: source().properties[i] ?? null }
  }
  const view = signal<GeoView>({ zoom: props.options?.zoom ?? 1.0, panX: props.options?.panX ?? 0.0, panY: props.options?.panY ?? 0.0 })
  let lastBox: Rect = { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
  const roamMove = (): boolean => props.roam === true || props.roam === 'move' || props.roam === 'pan'
  const roamScale = (): boolean => props.roam === true || props.roam === 'scale'
  const vm = visualMapHost(
    () => (typeof props.visualMap === 'function' ? props.visualMap() : props.visualMap),
    (sel) => props.onVisualMapChange?.(sel),
  )
  let outer: Rect = { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
  const dragSpec = {
    start: (_l: unknown, px: Double, py: Double) => vm.start(outer, px, py),
    move: (_l: unknown, px: Double, py: Double) => vm.move(outer, px, py),
    end: () => vm.end(),
  }
  const viewed = (): GeoOptions => ({ ...props.options, ...view() })
  return canvasHost<GeoLayout>({
    props,
    drag: dragSpec,
    roam: props.roam === undefined || props.roam === false
      ? undefined
      : {
          move: roamMove,
          scale: roamScale,
          zoom: (factor, px, py) => view.set(geoRoamZoom(view(), factor, px, py, lastBox, props.scaleLimit?.min ?? 0.5, props.scaleLimit?.max ?? 20.0)),
          pan: (dx, dy) => view.set(geoRoamPan(view(), dx, dy)),
        },
    defaultHeight: 300,
    caption: 'Map data',
    track: () => {
      aligned()
      void props.points
      void props.paths
      void props.heat
      void props.pies
      view()
      vm.track()
    },
    layout: (rawBox) => {
      outer = rawBox
      const box = vm.chartBox(rawBox)
      lastBox = box
      return layoutGeoShapes(shapes(), box, viewed())
    },
    animates: true,
    // Took `_theme` and threw it away, so a geo chart was the one host that
    // followed no theme at all. The border SEPARATES filled regions, so it
    // reads the ground rather than a token of its own; `background: ''` means
    // "inherit the page", whose realistic value is white.
    effectClock: () => props.trail !== undefined && (props.paths ?? []).length > 0,
    render: (layout, measure, theme, progress, time, states) => [
      ...renderGeoAligned(
        layout,
        aligned(),
        {
          emptyColor: theme.muted,
          borderColor: theme.background === '' ? '#ffffff' : theme.background,
          stops: vm.current()?.stops ?? theme.ramp,
          labelColor: theme.label,
          ...viewed(),
          ...vm.selection(),
          progress,
          hover: states.hover,
          selected: states.selected,
          emphasisColor: theme.text,
          selectColor: theme.palette[0] ?? '#2563eb',
        },
        measure,
      ),
      ...renderGeoHeat(layout, props.heat ?? [], geoHeatStops([...(props.heatStops ?? [])], [...(props.options?.stops ?? theme.ramp)]), props.heatRadius ?? 20.0, progress),
      ...renderGeoOverlayPaths(layout, props.paths ?? [], { ...props.overlayOptions, progress }),
      ...renderGeoPies(layout, props.pies ?? [], progress),
      ...(props.trail === undefined ? [] : renderGeoTrails(layout, props.paths ?? [], props.trail, time, props.overlayOptions?.color ?? '#b42318')),
      ...renderGeoOverlayPoints(layout, props.points ?? [], { labelColor: theme.label, ...props.overlayOptions, progress }),
      ...vm.cmds(outer),
    ],
    select: (layout, px, py) => {
      if (vm.click(outer, px, py)) return
      const i = hitGeoIndex(layout, px, py)
      props.onSelectPointIndex?.(hitGeoOverlayPoint(layout, props.points ?? [], px, py, props.overlayOptions?.radius))
      props.onSelect?.(i < 0 ? null : layout.regions[i]!, i < 0 ? null : infoOf(layout, i))
      props.onSelectIndex?.(i)
    },
    pick: (layout, i) => {
      const r = layout.regions[i]
      if (r === undefined) return
      props.onSelect?.(r, infoOf(layout, i))
      props.onSelectIndex?.(i)
    },
    focusRect: (layout, i) => layout.regions[i]?.bbox ?? null,
    states: { at: (layout, px, py) => hitGeoIndex(layout, px, py), label: (layout, i) => layout.regions[i]?.label ?? '' },
    tooltip: (layout, px, py) => {
      const i = hitGeoIndex(layout, px, py)
      if (i < 0) return null
      const info = infoOf(layout, i)
      if (props.tooltipFormatter !== undefined) {
        const out = props.tooltipFormatter(info)

        return out === null ? null : typeof out === 'string' ? [out] : out
      }

      return orNull(Number.isNaN(info.value) ? [info.label] : [info.label, plain(info.value)])
    },
    // A point overlay on the map wins over the region under it, as it is drawn over it.
    item: (layout, px, py) => {
      const pts = props.points ?? []
      const pi = hitGeoOverlayPoint(layout, pts, px, py, props.overlayOptions?.radius)
      const pt = pts[pi]
      if (pt !== undefined) return { seriesIndex: 0, dataIndex: pi, name: pt.name ?? '', value: pt.value === undefined ? [pt.lon, pt.lat] : [pt.lon, pt.lat, pt.value], color: pt.color }
      const i = hitGeoIndex(layout, px, py)
      const r = layout.regions[i]
      if (r === undefined) return null
      const v = aligned()[i] ?? Number.NaN
      return { seriesIndex: 0, dataIndex: i, name: r.label, value: Number.isFinite(v) ? v : Number.NaN }
    },
    a11y: (layout) => {
      const values = aligned()
      const dom = geoDomainAligned(values)
      return {
        title: props.title,
        categories: layout.regions.map((r) => r.label),
        series: [{ label: props.title ?? `Values from ${dom.min} to ${dom.max}`, values: [...values], kind: 'bars' }],
      }
    },
  })
}
