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
import { withItemStates } from './host-states'
import type { ItemStateProps } from './host-states'
import { fillMessage } from './a11y'
import { plain } from './format'
import { chartMessagesFor, chartNumber } from './locale'
import { GEO_RAMP_DARK, GEO_RAMP_LIGHT, geoDomainAligned, geoOptionParams, geoRoamPan, geoRoamZoom, hitGeoIndex, layoutGeoShapes, renderGeoAligned } from './geo'
import { geoHeatStops, hitGeoOverlayPoint, renderGeoHeat, renderGeoTrails, renderGeoOverlayPaths, renderGeoOverlayPoints, renderGeoPies } from './geo-overlay'
import { alignGeoValues, geoFeatures, getMapDefinition, resolveMapSource } from './geo-web'
import type { GeoLayout, GeoOptions, GeoProjection, GeoRegion, GeoShape, GeoValue, GeoView } from './geo'
import { geoFitView, renderGeoBelow, renderGeoFlows, renderGeoSizeLegend } from './geo-layers'
import type { GeoFlow, GeoFlowOptions, GeoSizeLegendOptions } from './geo-layers'
import type { GeoHeatPoint, GeoOverlayOptions, GeoOverlayPath, GeoOverlayPoint, GeoPie, GeoTrail } from './geo-overlay'
import type { GeoJson, GeoSource, MapDefinition } from './geo-web'
import type { Topology } from './geo-topo'
import type { ChartTheme } from './render'
import type { Double, DrawCmd, Pt, Rect } from './types'
import { visualStripOf } from './visual-map'
import { visualStripPlace, visualStripSize } from './visual-strip'
import type { VisualMapSpec } from './visual-map'
import { visualMapHost } from './visual-map-host'
import type { VisualMapSelection } from './visual-map-host'

/** Region values as a record (`{ DE: 83 }`) or as the crossing list. */
export type MapChartValues = Record<string, Double> | readonly GeoValue[]

export interface MapChartProps extends CanvasHostProps, ItemStateProps {
  /**
   * Already-projected shapes (the form that lowers to native), inline GeoJSON,
   * or the name of a map registered with `registerMap`.
   */
  map: readonly GeoShape[] | GeoJson | Topology | MapDefinition | string
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
  /** Flows between places, drawn along great circles (arc length is what `progress` reveals; a seam crossing draws as two runs). */
  flows?: readonly GeoFlow[]
  flowOptions?: GeoFlowOptions
  /** A key for the bubble sizes (nested circles of nice values, bottom-left); `true` or its options. */
  sizeLegend?: boolean | GeoSizeLegendOptions
  /** Zoom to these regions (names, labels or join keys) on load, and whenever the value changes. */
  fitTo?: string | readonly string[] | undefined
  /** A click on a region zooms to it; a click on empty ground returns to the whole map. */
  zoomOnClick?: boolean
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

/** Whether a theme's page colour is dark (an empty background is the page, taken as white). */
function darkGround(background: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(background)
  if (m === null) return false
  const n = parseInt(m[1]!, 16)

  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 110
}

/** The legend entry for regions without a value: a hatched swatch and "No data", beside the visualMap strip. */
function noDataKey(spec: VisualMapSpec | undefined, box: Rect, wanted: boolean, theme: ChartTheme, label: string): DrawCmd[] {
  if (spec === undefined || !wanted) return []
  const strip = visualStripOf(spec)
  const place = visualStripPlace(strip, box.w, box.h)
  const size = visualStripSize(strip)
  const s = 12.0
  // Beside a horizontal strip, above a vertical one.
  const x = box.x + (spec.orient === 'vertical' ? place.at.x : place.at.x + size.x + 16.0)
  const y = box.y + (spec.orient === 'vertical' ? place.at.y - s - 8.0 : place.at.y + (size.y - s) / 2.0)
  const ring: Pt[] = [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]

  return [
    { kind: 'polygon', points: ring, fill: theme.muted, pattern: { kind: 'diagonal', color: theme.label, spacing: 4.0, width: 1.0 } },
    { kind: 'text', text: label, at: { x: x + s + 6.0, y: y + s / 2.0 }, fill: theme.label, size: spec.fontSize, align: 'start', baseline: 'middle' },
  ]
}

const isShapes = (m: unknown): m is readonly GeoShape[] => Array.isArray(m)

export function MapChart(props: MapChartProps): VNode {
  // The projected features of the map, memoised: a roam frame lays out again, and re-projecting every vertex of a
  // GeoJSON / registry map each time is the cost. Keyed on the map, its projection and the two properties.
  let sourceMemo: { m: unknown; key: string; out: GeoSource } | null = null
  // The projection the shapes were projected with (the chart's option, else the map's own default).
  let projectionNow: GeoProjection = 'equirectangular'
  const source = (): GeoSource => {
    const m = props.map
    if (isShapes(m)) return { shapes: m as GeoShape[], properties: [], points: [], lines: [] }
    // A registered name, TopoJSON, a definition or GeoJSON: decode to GeoJSON and pick up the map's own defaults,
    // which an explicit `options` value overrides.
    const registered = typeof m === 'string' ? getMapDefinition(m) : null
    if (typeof m === 'string' && registered === null) return { shapes: [], properties: [], points: [], lines: [] }
    const base = registered ?? resolveMapSource(m as GeoJson | Topology | MapDefinition)
    const projection = props.options?.projection ?? base.projection ?? 'equirectangular'
    const nameProperty = props.options?.nameProperty ?? base.nameProperty ?? 'name'
    const idProperty = props.options?.idProperty ?? base.idProperty
    projectionNow = projection
    const params = geoOptionParams(projection, props.options)
    const key = `${projection}|${nameProperty}|${idProperty ?? ''}|${params.lon0}|${params.lat0}|${params.p1}|${params.p2}`
    if (sourceMemo !== null && sourceMemo.m === m && sourceMemo.key === key) return sourceMemo.out
    const out = geoFeatures(base.geo, projection, nameProperty, idProperty, params)
    sourceMemo = { m, key, out }

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
  /** The bubble size key, when asked for. */
  const sizeKey = (labelColor: string): DrawCmd[] =>
    props.sizeLegend === undefined || props.sizeLegend === false ? [] : renderGeoSizeLegend(allPoints(), lastBox, { radius: props.overlayOptions?.radius, color: props.overlayOptions?.color, labelColor, ...(props.sizeLegend === true ? {} : props.sizeLegend) })
  /** The point marks of the call and of the map's own Point / MultiPoint features. */
  const allPoints = (): readonly GeoOverlayPoint[] => [...(props.points ?? []), ...source().points]
  const allPaths = (): readonly GeoOverlayPath[] => [...(props.paths ?? []), ...source().lines]
  const view = signal<GeoView>({ zoom: props.options?.zoom ?? 1.0, panX: props.options?.panX ?? 0.0, panY: props.options?.panY ?? 0.0 })
  let lastBox: Rect = { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
  /** The view that brings regions `indices` to fill the box, from the fitted (zoom 1, no pan) layout. */
  const fitIndices = (laid: readonly GeoShape[], box: Rect, indices: readonly number[]): GeoView =>
    geoFitView(layoutGeoShapes(laid, box, { ...props.options, projection: projectionNow, zoom: 1.0, panX: 0.0, panY: 0.0 }), box, indices, 12.0)
  const zoomTo = (indices: readonly number[]): void => view.set(indices.length === 0 ? { zoom: 1.0, panX: 0.0, panY: 0.0 } : fitIndices(shapes(), lastBox, indices))
  // `fitTo` is applied once per value, after the first layout knows the box (a write inside the draw is deferred a microtask).
  let fitApplied = ''
  const applyFitTo = (_layout: GeoLayout, laid: readonly GeoShape[], box: Rect): void => {
    const want = props.fitTo === undefined ? [] : typeof props.fitTo === 'string' ? [props.fitTo] : [...props.fitTo]
    const key = want.join('\u0000')
    if (key === fitApplied) return
    fitApplied = key
    if (want.length === 0) return
    const indices = laid.flatMap((s, i) => (want.includes(s.name) || want.includes(s.label ?? s.name) ? [i] : []))
    queueMicrotask(() => view.set(fitIndices(laid, box, indices)))
  }
  const roamMove = (): boolean => props.roam === true || props.roam === 'move' || props.roam === 'pan'
  const roamScale = (): boolean => props.roam === true || props.roam === 'scale'
  const vm = visualMapHost(
    () => (typeof props.visualMap === 'function' ? props.visualMap() : props.visualMap),
    (sel) => props.onVisualMapChange?.(sel),
    // The strip's numbers: `format`, else the chart's `locale` digits.
    chartNumber(props),
  )
  let outer: Rect = { x: 0.0, y: 0.0, w: 0.0, h: 0.0 }
  const dragSpec = {
    start: (_l: unknown, px: Double, py: Double) => vm.start(outer, px, py),
    move: (_l: unknown, px: Double, py: Double) => vm.move(outer, px, py),
    end: () => vm.end(),
  }
  const viewed = (): GeoOptions => ({ ...props.options, ...view() })

  return canvasHost<GeoLayout>(withItemStates<GeoLayout>({
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
      void props.flows
      void props.fitTo
      void props.heat
      void props.pies
      view()
      vm.track()
    },
    layout: (rawBox) => {
      outer = rawBox
      const box = vm.chartBox(rawBox)
      lastBox = box

      const laid = shapes()

      const laidOut = layoutGeoShapes(laid, box, { ...viewed(), projection: projectionNow })
      applyFitTo(laidOut, laid, box)

      return laidOut
    },
    animates: true,
    // Took `_theme` and threw it away, so a geo chart was the one host that
    // followed no theme at all. The border SEPARATES filled regions, so it
    // reads the ground rather than a token of its own; `background: ''` means
    // "inherit the page", whose realistic value is white.
    effectClock: () => props.trail !== undefined && allPaths().length > 0,
    // oxlint-disable-next-line max-params -- the host's render takes the item states as its sixth argument
    render: (layout, measure, theme, progress, time, states) => [
      ...renderGeoBelow(layout, viewed()),
      ...renderGeoAligned(
        layout,
        aligned(),
        {
          emptyColor: theme.muted,
          borderColor: theme.background === '' ? '#ffffff' : theme.background,
          stops: vm.current()?.stops ?? (darkGround(theme.background) ? GEO_RAMP_DARK : GEO_RAMP_LIGHT),
          hatchColor: theme.label,
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
      ...renderGeoOverlayPaths(layout, allPaths(), { ...props.overlayOptions, progress }),
      ...renderGeoFlows(layout, props.flows ?? [], { ...props.flowOptions, progress }),
      ...renderGeoPies(layout, props.pies ?? [], progress),
      ...(props.trail === undefined ? [] : renderGeoTrails(layout, allPaths(), props.trail, time, props.overlayOptions?.color ?? '#b42318')),
      ...renderGeoOverlayPoints(layout, allPoints(), { labelColor: theme.label, ...props.overlayOptions, progress }),
      ...sizeKey(theme.label),
      ...vm.cmds(outer),
      ...noDataKey(vm.current(), outer, aligned().some((v) => !Number.isFinite(v)), theme, chartMessagesFor(props.locale, props.messages)?.noDataLabel ?? 'No data'),
    ],
    select: (layout, px, py) => {
      if (vm.click(outer, px, py)) return
      const i = hitGeoIndex(layout, px, py)
      props.onSelectPointIndex?.(hitGeoOverlayPoint(layout, allPoints(), px, py, props.overlayOptions?.radius))
      if (props.zoomOnClick === true) zoomTo(i < 0 ? [] : [i])
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
      const pts = allPoints()
      const pi = hitGeoOverlayPoint(layout, pts, px, py, props.overlayOptions?.radius)
      const pt = pts[pi]
      if (pt !== undefined) return { seriesIndex: 0, dataIndex: pi, name: pt.name ?? '', value: pt.value === undefined ? [pt.lon, pt.lat] : [pt.lon, pt.lat, pt.value], color: pt.color }
      const i = hitGeoIndex(layout, px, py)
      const r = layout.regions[i]
      if (r === undefined) return null
      const v = aligned()[i] ?? Number.NaN

      return { seriesIndex: 0, dataIndex: i, name: r.label, value: Number.isFinite(v) ? v : Number.NaN }
    },
    a11y: (layout, m, num) => {
      const values = aligned()
      const dom = geoDomainAligned(values)
      const fmt = num ?? String
      return {
        title: props.title,
        categories: layout.regions.map((r) => r.label),
        series: [{ label: props.title ?? fillMessage(fillMessage(m?.valuesLabel ?? 'Values from {min} to {max}', 'min', fmt(dom.min)), 'max', fmt(dom.max)), values: [...values], kind: 'bars' }],
      }
    },
  }))
}
