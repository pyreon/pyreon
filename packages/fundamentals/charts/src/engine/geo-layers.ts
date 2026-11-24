// Map layers beyond the regions: the sphere outline and graticule, great-circle flows, the bubble size legend and the
// fit-to-region view. Pure geometry over `GeoLayout`, so the same source runs on the web and, through the generated
// engine, on iOS and Android.

import { geoPlaneToPx, geoProject } from './geo'
import type { GeoLayout, GeoOptions, GeoView } from './geo'
import { geoSeamLon, geoSphereRing } from './geo-projection'
import type { GeoCoordinate, GeoOverlayPoint } from './geo-overlay'
import { geoOverlayPointRadii } from './geo-overlay'
import { withAlpha } from './radar'
import type { Double, DrawCmd, Pt, Rect } from './types'

const GEO_RAD = 0.017453292519943295
const GEO_DEG = 57.29577951308232

// --- sphere and graticule ---------------------------------------------------------

/** The outline of the whole sphere behind the regions, filled and stroked; nothing for a projection with no single outline (Albers USA). */
export function renderGeoSphere(layout: GeoLayout, fill: string, stroke: string): DrawCmd[] {
  const ring = geoSphereRing(layout.transform.projection, layout.transform.params)
  if (ring.length < 3) return []
  const pts: Pt[] = ring.map((p) => geoPlaneToPx(layout.transform, p))
  const closed: Pt[] = [...pts, pts[0]!]

  return [
    { kind: 'polygon', points: pts, fill },
    { kind: 'polyline', points: closed, stroke, width: 1.0 },
  ]
}

/**
 * Meridians and parallels every `step` degrees, as thin polylines. Sampled inside the window half a turn either side of
 * the central meridian, so no line runs across the seam. Nothing for Albers USA, whose three insets share no graticule.
 */
export function renderGeoGraticule(layout: GeoLayout, step: Double, stroke: string): DrawCmd[] {
  const out: DrawCmd[] = []
  const t = layout.transform
  if (t.projection === 'albersUsa' || step < 1.0) return out
  const lon0 = t.params.lon0
  const top = t.projection === 'mercator' ? 80.0 : 90.0
  // Meridians, outward from the central one.
  const half = Math.floor(180.0 / step)
  let k = -half
  while (k <= half) {
    const run: Pt[] = []
    let lat = -top
    while (lat <= top) {
      run.push(geoProject(t, lon0 + k * step, lat))
      lat = lat + 3.0
    }
    out.push({ kind: 'polyline', points: run, stroke, width: 0.5 })
    k = k + 1.0
  }
  // Parallels, without the poles (a point).
  let parallel = -top + step
  while (parallel < top) {
    const run: Pt[] = []
    let x = -180.0
    while (x <= 180.0) {
      run.push(geoProject(t, lon0 + x, parallel))
      x = x + 3.0
    }
    out.push({ kind: 'polyline', points: run, stroke, width: 0.5 })
    parallel = parallel + step
  }

  return out
}

/**
 * What sits BEHIND the regions when the options ask for it: the sphere outline (`sphere`) and the graticule
 * (`graticule` degrees). Neutral translucent greys read on a light and on a dark page, so they need no theme.
 */
export function renderGeoBelow(layout: GeoLayout, options?: GeoOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const sphereColor = options?.sphereColor ?? 'rgba(148,163,184,0.16)'
  if (options?.sphere === true) for (const c of renderGeoSphere(layout, sphereColor, 'rgba(148,163,184,0.55)')) out.push(c)
  const step = options?.graticule ?? 0.0
  if (step >= 1.0) for (const c of renderGeoGraticule(layout, step, options?.graticuleColor ?? 'rgba(148,163,184,0.38)')) out.push(c)

  return out
}

// --- great-circle flows -----------------------------------------------------------

/** A flow between two places, drawn along the great circle joining them. */
export interface GeoFlow {
  from: GeoCoordinate
  to: GeoCoordinate
  /** The flow's size: it sets the line width between `minWidth` and `maxWidth`. */
  value?: Double | undefined
  color?: string | undefined
  name?: string | undefined
}

export interface GeoFlowOptions {
  color?: string | undefined
  minWidth?: Double | undefined
  maxWidth?: Double | undefined
  /** 0..1: how much of EACH arc is drawn, by arc length along the great circle (the entrance). */
  progress?: Double | undefined
  opacity?: Double | undefined
}

/** The point at fraction `u` (0 to 1) along the great circle from `a` to `b`, by arc length. */
export function greatCirclePoint(a: GeoCoordinate, b: GeoCoordinate, u: Double): GeoCoordinate {
  const la = a.lat * GEO_RAD
  const lb = b.lat * GEO_RAD
  const ax = Math.cos(la) * Math.cos(a.lon * GEO_RAD)
  const ay = Math.cos(la) * Math.sin(a.lon * GEO_RAD)
  const az = Math.sin(la)
  const bx = Math.cos(lb) * Math.cos(b.lon * GEO_RAD)
  const by = Math.cos(lb) * Math.sin(b.lon * GEO_RAD)
  const bz = Math.sin(lb)
  const dot = ax * bx + ay * by + az * bz
  const omega = Math.acos(dot > 1.0 ? 1.0 : dot < -1.0 ? -1.0 : dot)
  if (omega < 1e-9) return { lon: a.lon, lat: a.lat }
  const sa = Math.sin((1.0 - u) * omega) / Math.sin(omega)
  const sb = Math.sin(u * omega) / Math.sin(omega)
  const x = sa * ax + sb * bx
  const y = sa * ay + sb * by
  const z = sa * az + sb * bz

  return { lon: Math.atan2(y, x) * GEO_DEG, lat: Math.asin(z > 1.0 ? 1.0 : z < -1.0 ? -1.0 : z) * GEO_DEG }
}

/** The angular length of the great circle between two places, in degrees. */
export function greatCircleDegrees(a: GeoCoordinate, b: GeoCoordinate): Double {
  const la = a.lat * GEO_RAD
  const lb = b.lat * GEO_RAD
  const dot = Math.sin(la) * Math.sin(lb) + Math.cos(la) * Math.cos(lb) * Math.cos((a.lon - b.lon) * GEO_RAD)

  return Math.acos(dot > 1.0 ? 1.0 : dot < -1.0 ? -1.0 : dot) * GEO_DEG
}

/**
 * Flows as great-circle arcs, projected. An arc is sampled every few degrees of arc, so it curves with the projection;
 * `progress` reveals the first fraction of its LENGTH ON THE SPHERE (not of its sample count or its pixels), and an arc
 * that crosses the seam is drawn as two runs, never as a chord across the map.
 */
export function renderGeoFlows(layout: GeoLayout, flows: readonly GeoFlow[], options?: GeoFlowOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  const rawP = options?.progress ?? 1.0
  const progress = rawP < 0.0 ? 0.0 : rawP > 1.0 ? 1.0 : rawP
  if (progress <= 0.0) return out
  const hi = largestFlow(flows)
  const minW = options?.minWidth ?? 1.0
  const maxW = options?.maxWidth ?? 4.0
  const alpha = options?.opacity ?? 0.7
  for (const f of flows) {
    const width = flowWidth(f.value, hi, minW, maxW)
    const stroke = withAlpha(f.color ?? options?.color ?? '#b42318', alpha)
    const samples = Math.max(8.0, Math.min(128.0, Math.ceil(greatCircleDegrees(f.from, f.to) / 2.0)))
    const runs = flowRuns(layout, f, samples, progress)
    for (const run of runs) if (run.length > 1) out.push({ kind: 'polyline', points: run, stroke, width })
  }

  return out
}

/** The largest flow value (0 when none has one). */
function largestFlow(flows: readonly GeoFlow[]): Double {
  let hi = 0.0
  for (const f of flows) if ((f.value ?? 0.0) > hi) hi = f.value ?? 0.0

  return hi
}

/** A flow's line width: the midpoint without a value, else between the bounds by the root of its share of the largest. */
// oxlint-disable-next-line max-params -- positional like the other width rules
function flowWidth(value: Double | undefined, hi: Double, minW: Double, maxW: Double): Double {
  if (value === undefined) return (minW + maxW) / 2.0
  const share = hi <= 0.0 ? 0.5 : Math.sqrt(Math.max(0.0, value) / hi)

  return minW + (maxW - minW) * share
}

/** The projected runs of one flow up to `progress`, split wherever the great circle crosses the seam. */
function flowRuns(layout: GeoLayout, f: GeoFlow, samples: Double, progress: Double): Pt[][] {
  const t = layout.transform
  const pts: Pt[] = []
  // The indices at which a new run starts (the seam was crossed between the previous point and this one).
  const cuts: number[] = []
  let lastLon = 0.0
  const steps = Math.ceil(samples * progress)
  let i = 0.0
  while (i <= steps) {
    // The last sample sits exactly at `progress`, so the drawn length is the asked fraction of the arc.
    const u = i >= steps ? progress : i / samples
    const c = greatCirclePoint(f.from, f.to, u)
    const lon = geoSeamLon(t.projection, t.params, c.lon)
    if (i > 0.0 && Math.abs(lon - lastLon) > 180.0) cuts.push(pts.length)
    pts.push(geoProject(t, c.lon, c.lat))
    lastLon = lon
    i = i + 1.0
  }
  const runs: Pt[][] = []
  let from = 0
  for (const cut of cuts) {
    runs.push(runBetween(pts, from, cut))
    from = cut
  }
  runs.push(runBetween(pts, from, pts.length))

  return runs
}

/** `pts[from..to)` as its own array. */
function runBetween(pts: Pt[], from: number, to: number): Pt[] {
  const out: Pt[] = []
  for (let k = from; k < to; k++) out.push(pts[k]!)

  return out
}

// --- the bubble size legend ---------------------------------------------------------

/** A "nice" 1, 2 or 5 times a power of ten not above `v`. */
function niceBelow(v: Double): Double {
  if (v <= 0.0) return 0.0
  const mag = Math.pow(10.0, Math.floor(Math.log10(v)))
  const f = v / mag

  return (f >= 5.0 ? 5.0 : f >= 2.0 ? 2.0 : 1.0) * mag
}

export interface GeoSizeLegendOptions {
  /** The base radius the points were drawn with (`overlayOptions.radius`, default 5). */
  radius?: Double | undefined
  color?: string | undefined
  labelColor?: string | undefined
  fontSize?: Double | undefined
  /** The unit text under the circles. */
  title?: string | undefined
}

/**
 * Nested circles for three nice values (the largest not above the data's, a half and a tenth of it), sized by the same
 * rule as the points, bottoms aligned, labelled on the right: a key to read a bubble's value. Bottom-left of `box`.
 * Nothing when no point has a value.
 */
export function renderGeoSizeLegend(points: readonly GeoOverlayPoint[], box: Rect, options?: GeoSizeLegendOptions): DrawCmd[] {
  const out: DrawCmd[] = []
  let hi = 0.0
  for (const p of points) if ((p.value ?? 0.0) > hi) hi = p.value ?? 0.0
  if (hi <= 0.0) return out
  const base = options?.radius ?? 5.0
  const fontSize = options?.fontSize ?? 10.0
  const labelColor = options?.labelColor ?? '#1e293b'
  const color = options?.color ?? '#b42318'
  const top = niceBelow(hi)
  const values: Double[] = [top, top / 2.0, top / 10.0]
  // The radius of a value, by the points' own rule, with `hi` as the scale.
  const radiusOf = (v: Double): Double => {
    const sample: GeoOverlayPoint[] = [{ lon: 0.0, lat: 0.0, value: hi }, { lon: 0.0, lat: 0.0, value: v }]

    return geoOverlayPointRadii(sample, base)[1]!
  }
  const big = radiusOf(top)
  const cx = box.x + 12.0 + big
  const title = options?.title ?? ''
  const bottom = box.y + box.h - 12.0 - (title === '' ? 0.0 : fontSize + 4.0)
  for (const v of values) {
    const r = radiusOf(v)
    out.push({ kind: 'circle', center: { x: cx, y: bottom - r }, radius: r, fill: withAlpha(color, 0.18) })
    out.push({ kind: 'polyline', points: circleRing(cx, bottom - r, r), stroke: color, width: 1.0 })
  }
  // Each circle's label sits at its top, pushed down where two would touch.
  let lastY = -1000000.0
  for (const v of values) {
    const r = radiusOf(v)
    const ringTop = bottom - 2.0 * r
    const y = Math.max(ringTop, lastY + fontSize + 3.0)
    lastY = y
    out.push({ kind: 'polyline', points: [{ x: cx, y: ringTop }, { x: cx + big + 6.0, y }], stroke: withAlpha(labelColor, 0.5), width: 0.5 })
    out.push({ kind: 'text', text: legendNumber(v), at: { x: cx + big + 9.0, y }, fill: labelColor, size: fontSize, align: 'start', baseline: 'middle' })
  }
  if (title !== '') out.push({ kind: 'text', text: title, at: { x: box.x + 12.0, y: bottom + 4.0 }, fill: labelColor, size: fontSize, align: 'start', baseline: 'top' })

  return out
}

/** A circle as a closed polyline (the legend's outline). */
function circleRing(cx: Double, cy: Double, r: Double): Pt[] {
  const out: Pt[] = []
  let a = 0.0
  while (a <= 48.0) {
    out.push({ x: cx + r * Math.cos((a * Math.PI * 2.0) / 48.0), y: cy + r * Math.sin((a * Math.PI * 2.0) / 48.0) })
    a = a + 1.0
  }

  return out
}

/** A legend value as text: 1,200,000 as "1.2M", 15,000 as "15k", small numbers as they are. */
function legendNumber(v: Double): string {
  if (v >= 1000000.0) return `${trimZero(v / 1000000.0)}M`
  if (v >= 1000.0) return `${trimZero(v / 1000.0)}k`

  return trimZero(v)
}

function trimZero(v: Double): string {
  const r = Math.round(v * 100.0) / 100.0

  return `${r}`
}

// --- fit a view to regions ---------------------------------------------------------------

/**
 * The roam view (`zoom`, `panX`, `panY`) that brings the regions at `indices` to fill `box` (less `padding` pixels),
 * given the layout at zoom 1 and no pan. An empty or out-of-range selection returns the fitted view.
 */
export function geoFitView(fitted: GeoLayout, box: Rect, indices: readonly number[], padding: Double): GeoView {
  let x0 = 0.0
  let y0 = 0.0
  let x1 = 0.0
  let y1 = 0.0
  let seen = 0
  for (const i of indices) {
    if (i < 0 || i >= fitted.regions.length) continue
    const b = fitted.regions[i]!.bbox
    if (seen === 0) {
      x0 = b.x
      y0 = b.y
      x1 = b.x + b.w
      y1 = b.y + b.h
    }
    if (b.x < x0) x0 = b.x
    if (b.y < y0) y0 = b.y
    if (b.x + b.w > x1) x1 = b.x + b.w
    if (b.y + b.h > y1) y1 = b.y + b.h
    seen = seen + 1
  }
  if (seen === 0 || x1 <= x0 || y1 <= y0) return { zoom: 1.0, panX: 0.0, panY: 0.0 }
  const availW = Math.max(1.0, box.w - padding * 2.0)
  const availH = Math.max(1.0, box.h - padding * 2.0)
  const zoom = Math.min(availW / (x1 - x0), availH / (y1 - y0))
  const cx = box.x + box.w / 2.0
  const cy = box.y + box.h / 2.0
  // A fitted point p lands at cx + (p - cx) * zoom + pan; put the selection's centre at the box centre.
  const mx = (x0 + x1) / 2.0
  const my = (y0 + y1) / 2.0

  return { zoom, panX: cx - (cx + (mx - cx) * zoom), panY: cy - (cy + (my - cy) * zoom) }
}
