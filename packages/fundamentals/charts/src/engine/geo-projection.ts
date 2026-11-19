// Map projections: lon/lat degrees to a plane and back. Pure arithmetic over numbers, so the same source runs on the
// web and (through the generated engine) on iOS and Android.
//
// Every projection works on the UNIT sphere and returns x east, y NORTH (the box fit flips y). The fit into a box
// scales to the shapes' extent, so no projection here carries a pixel scale or a translation of its own.
//
// Sources, for the formulas (the tests check the properties they guarantee: round trip, equal-area, the published
// reference values):
//   - Equal Earth: Šavrič, Patterson & Jenny (2018), "The Equal Earth map projection", Int. J. Geographical
//     Information Science 33(3); coefficients A1..A4 and the pole value y = 1.3173627591574 are from that paper.
//   - Natural Earth 1: Šavrič, Jenny, White & Strebe (2015), "The Natural Earth II / Natural Earth projection family",
//     Cartography and Geographic Information Science; the polynomial coefficients are the published ones.
//   - Albers equal-area conic: Snyder (1987), "Map Projections - A Working Manual", USGS Professional Paper 1395,
//     eq. 14-1 .. 14-19 (forward, and the inverse via 14-18/14-19).
//   - Albers USA: the composite of three Albers conics (the lower 48, Alaska at 0.35 scale, Hawaii) whose parameters
//     and inset placement follow the common composite used by d3-geo's `geoAlbersUsa` (Mike Bostock, BSD-3).
//
// Antimeridian: a vertex is projected on its own, with its longitude relative to the central meridian wrapped into
// (-180, 180]. A shape that is already cut at the antimeridian (as Natural Earth and world-atlas ship Russia and Fiji)
// draws whole when the central meridian is 0. Moving the central meridian puts a new seam somewhere else, and a shape
// that crosses it is NOT clipped: it draws a chord across the map. Shapes are not cut or re-stitched here.

import type { GeoProjection } from './geo'
import type { Double, Pt } from './types'

/** The numeric parameters of a projection (see `geoProjectionParams`): central meridian, latitude of origin and the Albers parallels. */
export interface GeoProjectionParams {
  /** The central meridian (the longitude that maps to x = 0), degrees. */
  lon0: Double
  /** The latitude of origin, degrees (the Albers conic's y offset; the fit removes it from the picture). */
  lat0: Double
  /** The first standard parallel (Albers), degrees. */
  p1: Double
  /** The second standard parallel (Albers), degrees. */
  p2: Double
}

// Literals, not `Math.PI / 180` and `Math.sqrt(3) / 2`: a top-level call is a side effect a bundler must keep, which put
// these two constants into every chart's bundle, map or not.
const RAD = 0.017453292519943295
const SQRT3_2 = 0.8660254037844386

// Equal Earth coefficients (Šavrič et al. 2018).
const EA1 = 1.340264
const EA2 = -0.081106
const EA3 = 0.000893
const EA4 = 0.003796

/** The central meridian and parallels a projection uses unless the caller sets them. */
export function geoProjectionParams(projection: GeoProjection, lon0?: Double, lat0?: Double, p1?: Double, p2?: Double): GeoProjectionParams {
  const albers = projection === 'albers'
  return { lon0: lon0 ?? (albers ? -96.0 : 0.0), lat0: lat0 ?? 0.0, p1: p1 ?? 29.5, p2: p2 ?? 45.5 }
}

/** Longitude relative to the central meridian, wrapped into [-180, 180]. */
function relLon(lon: Double, lon0: Double): Double {
  let d = lon - lon0
  while (d > 180.0) d = d - 360.0
  while (d < -180.0) d = d + 360.0

  return d
}

function signOf(v: Double): Double {
  return v < 0.0 ? -1.0 : 1.0
}

// --- Equal Earth -----------------------------------------------------------

function equalEarth(lonRad: Double, latRad: Double): Pt {
  const th = Math.asin(SQRT3_2 * Math.sin(latRad))
  const t2 = th * th
  const t6 = t2 * t2 * t2

  return { x: (lonRad * Math.cos(th)) / (SQRT3_2 * (EA1 + 3.0 * EA2 * t2 + t6 * (7.0 * EA3 + 9.0 * EA4 * t2))), y: th * (EA1 + EA2 * t2 + t6 * (EA3 + EA4 * t2)) }
}

function equalEarthInvert(x: Double, y: Double): Pt {
  // Newton's method on the parametric latitude th: y = th * (A1 + A2 th^2 + th^6 (A3 + A4 th^2)).
  let th = y
  for (let i = 0; i < 12; i++) {
    const t2 = th * th
    const t6 = t2 * t2 * t2
    const f = th * (EA1 + EA2 * t2 + t6 * (EA3 + EA4 * t2)) - y
    const df = EA1 + 3.0 * EA2 * t2 + t6 * (7.0 * EA3 + 9.0 * EA4 * t2)
    th = th - f / df
  }
  const t2 = th * th
  const t6 = t2 * t2 * t2
  const lonRad = (x * SQRT3_2 * (EA1 + 3.0 * EA2 * t2 + t6 * (7.0 * EA3 + 9.0 * EA4 * t2))) / Math.cos(th)
  const s = Math.sin(th) / SQRT3_2

  return { x: lonRad, y: Math.asin(s > 1.0 ? 1.0 : s < -1.0 ? -1.0 : s) }
}

// --- Natural Earth 1 --------------------------------------------------------

function naturalEarth1(lonRad: Double, latRad: Double): Pt {
  const p2 = latRad * latRad
  const p4 = p2 * p2

  return {
    x: lonRad * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
    y: latRad * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))),
  }
}

function naturalEarth1Invert(x: Double, y: Double): Pt {
  let phi = y
  for (let i = 0; i < 25; i++) {
    const p2 = phi * phi
    const p4 = p2 * p2
    const f = phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4))) - y
    // d/dphi of 1.007226 phi + 0.015085 phi^3 - 0.044475 phi^7 + 0.028874 phi^9 - 0.005916 phi^11
    const df = 1.007226 + 3.0 * 0.015085 * p2 - 7.0 * 0.044475 * p4 * p2 + 9.0 * 0.028874 * p4 * p4 - 11.0 * 0.005916 * p4 * p4 * p2
    phi = phi - f / df
  }
  const p2 = phi * phi
  const p4 = p2 * p2

  return { x: x / (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))), y: phi }
}

// --- Albers equal-area conic (Snyder 14) ---------------------------------------

function conic(lonRad: Double, latRad: Double, phi1: Double, phi2: Double): Pt {
  const sy0 = Math.sin(phi1)
  const n = (sy0 + Math.sin(phi2)) / 2.0
  // Two parallels symmetric about the equator: the cone opens flat, a cylindrical equal-area projection.
  if (Math.abs(n) < 1e-9) return { x: lonRad * Math.cos(phi1), y: Math.sin(latRad) / Math.cos(phi1) }
  const c = 1.0 + sy0 * (2.0 * n - sy0)
  const r0 = Math.sqrt(c) / n
  const r = Math.sqrt(c - 2.0 * n * Math.sin(latRad)) / n

  return { x: r * Math.sin(lonRad * n), y: r0 - r * Math.cos(lonRad * n) }
}

function conicInvert(x: Double, y: Double, phi1: Double, phi2: Double): Pt {
  const sy0 = Math.sin(phi1)
  const n = (sy0 + Math.sin(phi2)) / 2.0
  if (Math.abs(n) < 1e-9) {
    const s = y * Math.cos(phi1)

    return { x: x / Math.cos(phi1), y: Math.asin(s > 1.0 ? 1.0 : s < -1.0 ? -1.0 : s) }
  }
  const c = 1.0 + sy0 * (2.0 * n - sy0)
  const r0 = Math.sqrt(c) / n
  const r0y = r0 - y
  let l = Math.atan2(x, Math.abs(r0y)) * signOf(r0y)
  if (r0y * n < 0.0) l = l - Math.PI * signOf(x) * signOf(r0y)
  const s = (c - (x * x + r0y * r0y) * n * n) / (2.0 * n)

  return { x: l / n, y: Math.asin(s > 1.0 ? 1.0 : s < -1.0 ? -1.0 : s) }
}

// --- Albers USA (a composite of three conics) ---------------------------------

// Each sub-projection: central meridian, the parallels, the point that maps to the composite's own origin, a scale
// and where its origin sits relative to the lower 48's (in units of the lower 48's radius; y up).
const US_K = 1.0
const AK_SCALE = 0.35
const AK_AT = { x: -0.307, y: -0.201 }
const HI_AT = { x: -0.205, y: -0.212 }

function usLower48(lon: Double, lat: Double): Pt {
  const p = conic(relLon(lon, -96.0) * RAD, lat * RAD, 29.5 * RAD, 45.5 * RAD)
  const c = conic(-0.6 * RAD, 38.7 * RAD, 29.5 * RAD, 45.5 * RAD)

  return { x: (p.x - c.x) * US_K, y: (p.y - c.y) * US_K }
}

function usAlaska(lon: Double, lat: Double): Pt {
  // Relative to the Alaska conic's central meridian (-154), wrapped: the Aleutians west of the antimeridian (lon > 172)
  // are 26 to 34 degrees WEST of it, not 326 degrees east.
  const p = conic(relLon(lon, -154.0) * RAD, lat * RAD, 55.0 * RAD, 65.0 * RAD)
  const c = conic(-2.0 * RAD, 58.5 * RAD, 55.0 * RAD, 65.0 * RAD)

  return { x: (p.x - c.x) * AK_SCALE + AK_AT.x, y: (p.y - c.y) * AK_SCALE + AK_AT.y }
}

function usHawaii(lon: Double, lat: Double): Pt {
  const p = conic(relLon(lon, -157.0) * RAD, lat * RAD, 8.0 * RAD, 18.0 * RAD)
  const c = conic(-3.0 * RAD, 19.9 * RAD, 8.0 * RAD, 18.0 * RAD)

  return { x: p.x - c.x + HI_AT.x, y: p.y - c.y + HI_AT.y }
}

function albersUsa(lon: Double, lat: Double): Pt {
  // Alaska (the Aleutians cross the antimeridian) and Hawaii are drawn in their insets; everything else on the lower 48.
  if (lat >= 51.0 && (lon <= -129.0 || lon >= 172.0)) return usAlaska(lon, lat)
  if (lat >= 18.0 && lat <= 23.0 && lon >= -161.0 && lon <= -154.0) return usHawaii(lon, lat)

  return usLower48(lon, lat)
}

function albersUsaInvert(x: Double, y: Double): Pt {
  // The inset a point falls in is decided by where it is on the plane, as the composite's own layout defines it.
  if (y >= -0.234 && y < -0.12 && x >= -0.425 && x < -0.214) {
    const c = conic(-2.0 * RAD, 58.5 * RAD, 55.0 * RAD, 65.0 * RAD)
    const p = conicInvert((x - AK_AT.x) / AK_SCALE + c.x, (y - AK_AT.y) / AK_SCALE + c.y, 55.0 * RAD, 65.0 * RAD)

    return { x: relLon(p.x / RAD - 154.0, 0.0), y: p.y / RAD }
  }
  if (y >= -0.234 && y < -0.166 && x >= -0.214 && x < -0.115) {
    const c = conic(-3.0 * RAD, 19.9 * RAD, 8.0 * RAD, 18.0 * RAD)
    const p = conicInvert(x - HI_AT.x + c.x, y - HI_AT.y + c.y, 8.0 * RAD, 18.0 * RAD)

    return { x: p.x / RAD - 157.0, y: p.y / RAD }
  }
  const c = conic(-0.6 * RAD, 38.7 * RAD, 29.5 * RAD, 45.5 * RAD)
  const p = conicInvert(x / US_K + c.x, y / US_K + c.y, 29.5 * RAD, 45.5 * RAD)

  return { x: p.x / RAD - 96.0, y: p.y / RAD }
}

// --- the dispatch -----------------------------------------------------------------

/** lon/lat (degrees) to the projection's plane (unit sphere, x east, y north). */
export function projectLonLatWith(lon: Double, lat: Double, projection: GeoProjection, params: GeoProjectionParams): Pt {
  if (projection === 'mercator') {
    const clamped = lat > 85.0 ? 85.0 : lat < -85.0 ? -85.0 : lat
    const phi = (clamped * Math.PI) / 180.0
    return { x: lon, y: (Math.log(Math.tan(Math.PI / 4.0 + phi / 2.0)) * 180.0) / Math.PI }
  }
  if (projection === 'equalEarth') return equalEarth(relLon(lon, params.lon0) * RAD, lat * RAD)
  if (projection === 'naturalEarth1') return naturalEarth1(relLon(lon, params.lon0) * RAD, lat * RAD)
  if (projection === 'albers') return conic(relLon(lon, params.lon0) * RAD, lat * RAD, params.p1 * RAD, params.p2 * RAD)
  if (projection === 'albersUsa') return albersUsa(lon, lat)

  return { x: lon, y: lat }
}

/** The inverse of `projectLonLatWith`: a point on the plane back to lon/lat (degrees). */
export function unprojectLonLatWith(x: Double, y: Double, projection: GeoProjection, params: GeoProjectionParams): Pt {
  if (projection === 'mercator') return { x, y: (2.0 * Math.atan(Math.exp((y * Math.PI) / 180.0)) - Math.PI / 2.0) * (180.0 / Math.PI) }
  if (projection === 'equalEarth') {
    const p = equalEarthInvert(x, y)

    return { x: p.x / RAD + params.lon0, y: p.y / RAD }
  }
  if (projection === 'naturalEarth1') {
    const p = naturalEarth1Invert(x, y)

    return { x: p.x / RAD + params.lon0, y: p.y / RAD }
  }
  if (projection === 'albers') {
    const p = conicInvert(x, y, params.p1 * RAD, params.p2 * RAD)

    return { x: p.x / RAD + params.lon0, y: p.y / RAD }
  }
  if (projection === 'albersUsa') return albersUsaInvert(x, y)

  return { x, y }
}
