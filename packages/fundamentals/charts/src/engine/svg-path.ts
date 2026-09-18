// SVG path parsing for `path://` decal symbols. Web-side only: the option
// layer turns a path into unit-box rings once (at compile time for native), so
// the crossing engine only ever tiles plain points.

import type { Double, Pt } from './types'

function isDigitCode(c: Double): boolean {
  return (c >= 48.0 && c <= 57.0) || c === 46.0 || c === 45.0 || c === 43.0 || c === 101.0 || c === 69.0
}

/** Numbers in an SVG path argument run (`10,-2.5e1 .5`), as a list. */
function pathNumbers(d: string, start: Double, end: Double): Double[] {
  const out: Double[] = []
  let i = start
  while (i < end) {
    const c = d.charCodeAt(i)
    if (!isDigitCode(c) || c === 101.0 || c === 69.0) {
      i = i + 1.0
      continue
    }
    let j = i + 1.0
    let dot = c === 46.0
    while (j < end) {
      const cj = d.charCodeAt(j)
      const prev = d.charCodeAt(j - 1.0)
      if ((cj === 45.0 || cj === 43.0) && prev !== 101.0 && prev !== 69.0) break
      if (cj === 46.0) {
        if (dot) break
        dot = true
      }
      if (!isDigitCode(cj)) break
      j = j + 1.0
    }
    const n = Number(d.substring(i, j))
    if (Number.isFinite(n)) out.push(n)
    i = j
  }
  return out
}

/**
 * An SVG path (`M L H V C Q Z`, absolute and relative) as closed rings. Curves
 * are sampled, so a curved symbol stays curved at decal sizes. Commands outside
 * the subset end the current ring.
 */
export function svgPathRings(d: string): Pt[][] {
  const rings: Pt[][] = []
  let ring: Pt[] = []
  let x = 0.0
  let y = 0.0
  let startX = 0.0
  let startY = 0.0
  let i = 0.0
  const n = d.length
  while (i < n) {
    const code = d.charCodeAt(i)
    const cmd = d.substring(i, i + 1.0)
    const isLetter = (code >= 65.0 && code <= 90.0) || (code >= 97.0 && code <= 122.0)
    if (!isLetter || code === 101.0 || code === 69.0) {
      i = i + 1.0
      continue
    }
    let j = i + 1.0
    while (j < n) {
      const cj = d.charCodeAt(j)
      if (((cj >= 65.0 && cj <= 90.0) || (cj >= 97.0 && cj <= 122.0)) && cj !== 101.0 && cj !== 69.0) break
      j = j + 1.0
    }
    const args = pathNumbers(d, i + 1.0, j)
    const rel = code >= 97.0
    const up = cmd.toUpperCase()
    if (up === 'M') {
      if (ring.length >= 3) rings.push(ring)
      ring = []
      let k = 0
      while (k + 1 < args.length) {
        x = rel ? x + args[k]! : args[k]!
        y = rel ? y + args[k + 1]! : args[k + 1]!
        if (k === 0) {
          startX = x
          startY = y
        }
        ring.push({ x, y })
        k = k + 2
      }
    } else if (up === 'L') {
      let k = 0
      while (k + 1 < args.length) {
        x = rel ? x + args[k]! : args[k]!
        y = rel ? y + args[k + 1]! : args[k + 1]!
        ring.push({ x, y })
        k = k + 2
      }
    } else if (up === 'H') {
      for (const a of args) {
        x = rel ? x + a : a
        ring.push({ x, y })
      }
    } else if (up === 'V') {
      for (const a of args) {
        y = rel ? y + a : a
        ring.push({ x, y })
      }
    } else if (up === 'C' || up === 'Q') {
      const step = up === 'C' ? 6 : 4
      let k = 0
      while (k + step - 1 < args.length) {
        const x1 = rel ? x + args[k]! : args[k]!
        const y1 = rel ? y + args[k + 1]! : args[k + 1]!
        const x2 = up === 'C' ? (rel ? x + args[k + 2]! : args[k + 2]!) : x1
        const y2 = up === 'C' ? (rel ? y + args[k + 3]! : args[k + 3]!) : y1
        const ex = rel ? x + args[k + step - 2]! : args[k + step - 2]!
        const ey = rel ? y + args[k + step - 1]! : args[k + step - 1]!
        let t = 0.125
        while (t <= 1.0) {
          const u = 1.0 - t
          if (up === 'C') {
            ring.push({ x: u * u * u * x + 3.0 * u * u * t * x1 + 3.0 * u * t * t * x2 + t * t * t * ex, y: u * u * u * y + 3.0 * u * u * t * y1 + 3.0 * u * t * t * y2 + t * t * t * ey })
          } else {
            ring.push({ x: u * u * x + 2.0 * u * t * x1 + t * t * ex, y: u * u * y + 2.0 * u * t * y1 + t * t * ey })
          }
          t = t + 0.125
        }
        x = ex
        y = ey
        k = k + step
      }
    } else if (up === 'Z') {
      if (ring.length >= 3) rings.push(ring)
      ring = []
      x = startX
      y = startY
    } else {
      if (ring.length >= 3) rings.push(ring)
      ring = []
    }
    i = j
  }
  if (ring.length >= 3) rings.push(ring)
  return rings
}

/** A path's rings fitted, aspect kept, into a unit box centred on 0 — ECharts' symbolKeepAspect. */
export function unitPolygons(d: string): Pt[][] {
  const rings = svgPathRings(d)
  let x0 = 0.0
  let y0 = 0.0
  let x1 = 0.0
  let y1 = 0.0
  let seen = 0
  for (const r of rings) {
    for (const q of r) {
      if (seen === 0 || q.x < x0) x0 = q.x
      if (seen === 0 || q.y < y0) y0 = q.y
      if (seen === 0 || q.x > x1) x1 = q.x
      if (seen === 0 || q.y > y1) y1 = q.y
      seen = seen + 1
    }
  }
  const span = x1 - x0 > y1 - y0 ? x1 - x0 : y1 - y0
  const out: Pt[][] = []
  if (!(span > 0.0)) return out
  const cx = (x0 + x1) / 2.0
  const cy = (y0 + y1) / 2.0
  for (const r of rings) {
    const ring: Pt[] = []
    for (const q of r) ring.push({ x: (q.x - cx) / span, y: (q.y - cy) / span })
    out.push(ring)
  }
  return out
}

