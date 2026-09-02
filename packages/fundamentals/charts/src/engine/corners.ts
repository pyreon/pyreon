// Rounded-rect geometry — the one place the four executors agree.
//
// A radius bigger than the rect can hold is not an error, it is the ordinary
// case (a bar animating up from the zero line is 2px tall for a frame while
// its radius says 6), so the clamp has to be part of the contract rather than
// four independent platform behaviours. Keeping it here means the generated
// Swift and Kotlin engines carry it too: a native canvas calls the SAME
// function the web canvas does.

import type { ChartGradient, DrawCmd, Double, Pt, Rect } from './types'

/**
 * The four radii a rect will actually be drawn with, clamped.
 *
 * Returns `[topLeft, topRight, bottomRight, bottomLeft]`, each in
 * `0 ..= min(|w|, |h|) / 2` — half the shorter side is the largest radius a
 * corner can take before neighbouring arcs would cross. A missing, short or
 * empty input reads as square, which is what an unset `borderRadius` means.
 */
export function cornerRadii(rect: Rect, corners: Double[] | undefined): Double[] {
  const c = corners ?? []
  if (c.length < 4) return [0.0, 0.0, 0.0, 0.0]
  const w = rect.w < 0.0 ? -rect.w : rect.w
  const h = rect.h < 0.0 ? -rect.h : rect.h
  const max = (w < h ? w : h) / 2.0
  const out: Double[] = []
  for (const raw of c) {
    const v = raw < 0.0 ? 0.0 : raw
    out.push(v > max ? max : v)
  }
  return [out[0]!, out[1]!, out[2]!, out[3]!]
}

/** True when at least one clamped radius would actually round something. */
export function hasCorners(radii: Double[]): boolean {
  for (const r of radii) if (r > 0.0) return true
  return false
}

/**
 * A rect command — square or rounded, solid or gradient-filled.
 *
 * Four literals rather than one with optional keys: an absent `corners` or
 * `grad` must serialize exactly as it did before either existed, on every
 * backend, and the native subset has no way to add a key conditionally.
 */
export function rectCmd(
  rect: Rect,
  fill: string,
  corners: Double[] | undefined,
  grad: ChartGradient | undefined,
): DrawCmd {
  if (corners === undefined && grad === undefined) return { kind: 'rect', rect, fill }
  if (grad === undefined) return { kind: 'rect', rect, fill, corners }
  if (corners === undefined) return { kind: 'rect', rect, fill, grad }
  return { kind: 'rect', rect, fill, corners, grad }
}

/** A polygon command, solid or gradient-filled — the area mark's shape. */
export function polygonCmd(points: Pt[], fill: string, grad: ChartGradient | undefined): DrawCmd {
  if (grad === undefined) return { kind: 'polygon', points, fill }
  return { kind: 'polygon', points, fill, grad }
}
