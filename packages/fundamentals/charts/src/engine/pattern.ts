// Decal geometry — the ONE place a pattern's marks are computed.
//
// Every painter (web canvas, SVG, SwiftUI, Compose) clips to the filled shape
// and paints the plain commands this returns, so a stripe angle or a tiled
// triangle cannot look different per target: there is no per-target texture
// code left to disagree. The marks cover `bounds` (the shape's box); the clip
// trims them to the shape.

import type { ChartPattern, Double, DrawCmd, Pt, Rect } from './types'

const DEG = Math.PI / 180.0

function rotated(center: Pt, x: Double, y: Double, cosA: Double, sinA: Double): Pt {
  return { x: center.x + x * cosA - y * sinA, y: center.y + x * sinA + y * cosA }
}

/** The marks of one pattern over a box. */
export function patternMarks(p: ChartPattern, bounds: Rect): DrawCmd[] {
  const out: DrawCmd[] = []
  const spacing = p.spacing > 2.0 ? p.spacing : 2.0
  const width = p.width > 0.5 ? p.width : 0.5
  const center: Pt = { x: bounds.x + bounds.w / 2.0, y: bounds.y + bounds.h / 2.0 }
  // Half the box's diagonal plus a cell: rotated rows still cover every corner.
  const reach = Math.sqrt(bounds.w * bounds.w + bounds.h * bounds.h) / 2.0 + spacing
  if (p.kind === 'image') return out
  if (p.kind === 'dots') {
    let y = bounds.y
    while (y <= bounds.y + bounds.h) {
      let x = bounds.x
      while (x <= bounds.x + bounds.w) {
        out.push({ kind: 'circle', center: { x, y }, radius: width / 2.0, fill: p.color })
        x = x + spacing
      }
      y = y + spacing
    }
    return out
  }
  if (p.kind === 'symbols') {
    const angle = (p.angle ?? 0.0) * DEG
    const cosA = Math.cos(angle)
    const sinA = Math.sin(angle)
    const stepY = (p.spacingY ?? spacing) > 2.0 ? p.spacingY ?? spacing : 2.0
    const half = width / 2.0
    const symbol = p.symbol ?? 'rect'
    const shape = p.shape ?? []
    const rings = p.shapeRings ?? []
    let gy = -reach
    while (gy <= reach) {
      let gx = -reach
      while (gx <= reach) {
        const c = rotated(center, gx, gy, cosA, sinA)
        if (symbol === 'circle') {
          out.push({ kind: 'circle', center: c, radius: half, fill: p.color })
        } else if (symbol === 'triangle') {
          out.push({ kind: 'polygon', points: [rotated(center, gx, gy - half, cosA, sinA), rotated(center, gx + half, gy + half, cosA, sinA), rotated(center, gx - half, gy + half, cosA, sinA)], fill: p.color })
        } else if (symbol === 'path') {
          // Unit-box rings, flattened: `shapeRings` holds each ring's point count.
          let at = 0
          for (const count of rings) {
            const pts: Pt[] = []
            let k = 0.0
            while (k < count && at < shape.length) {
              const q = shape[at]!
              pts.push(rotated(center, gx + q.x * width, gy + q.y * width, cosA, sinA))
              at = at + 1
              k = k + 1.0
            }
            if (pts.length >= 3) out.push({ kind: 'polygon', points: pts, fill: p.color })
          }
        } else if (symbol === 'pin') {
          // A map pin: a round head over a point, ECharts' teardrop, as one polygon.
          const pts: Pt[] = []
          const headR = half * 0.62
          const headY = gy - half + headR
          let t = 0.0
          while (t <= 1.0) {
            const a = Math.PI * (0.8 + 1.4 * t)
            pts.push(rotated(center, gx + headR * Math.cos(a), headY + headR * Math.sin(a), cosA, sinA))
            t = t + 0.125
          }
          pts.push(rotated(center, gx, gy + half, cosA, sinA))
          out.push({ kind: 'polygon', points: pts, fill: p.color })
        } else if (symbol === 'arrow') {
          // ECharts' arrow: a point at the top and a notched tail.
          out.push({ kind: 'polygon', points: [rotated(center, gx, gy - half, cosA, sinA), rotated(center, gx + half * 0.8, gy + half, cosA, sinA), rotated(center, gx, gy + half * 0.45, cosA, sinA), rotated(center, gx - half * 0.8, gy + half, cosA, sinA)], fill: p.color })
        } else if (symbol === 'diamond') {
          out.push({ kind: 'polygon', points: [rotated(center, gx, gy - half, cosA, sinA), rotated(center, gx + half, gy, cosA, sinA), rotated(center, gx, gy + half, cosA, sinA), rotated(center, gx - half, gy, cosA, sinA)], fill: p.color })
        } else {
          out.push({ kind: 'polygon', points: [rotated(center, gx - half, gy - half, cosA, sinA), rotated(center, gx + half, gy - half, cosA, sinA), rotated(center, gx + half, gy + half, cosA, sinA), rotated(center, gx - half, gy + half, cosA, sinA)], fill: p.color })
        }
        gx = gx + spacing
      }
      gy = gy + stepY
    }
    return out
  }
  // Stripes: parallel lines at `angle` (45 by default), and the perpendicular set for a cross.
  const base = p.angle ?? 45.0
  const sets = p.kind === 'cross' ? 2 : 1
  for (let set = 0; set < sets; set++) {
    const a = (set === 0 ? base : base + 90.0) * DEG
    const cosA = Math.cos(a)
    const sinA = Math.sin(a)
    let k = -reach
    while (k <= reach) {
      // Offset along the normal, run along the stripe direction (screen y is down).
      out.push({ kind: 'line', from: rotated(center, -reach, k, cosA, -sinA), to: rotated(center, reach, k, cosA, -sinA), stroke: p.color, width })
      k = k + spacing
    }
  }
  return out
}

/**
 * Where an image pattern's copies go over a box. A fill image (ECharts'
 * `color: { image, repeat }`) tiles at its natural size from the canvas origin,
 * along both axes, one, or neither; an image decal (`repeat: 'grid'`) is drawn
 * at `width` on the pitch, centred in each cell. The painter clips to the shape
 * and draws the image into each rect, so tiling is decided here, once.
 */
export function patternImageCells(p: ChartPattern, bounds: Rect, imageW: Double, imageH: Double): Rect[] {
  const out: Rect[] = []
  const repeat = p.repeat ?? 'repeat'
  if (repeat === 'grid') {
    const sx = p.spacing > 2.0 ? p.spacing : 2.0
    const sy = (p.spacingY ?? sx) > 2.0 ? p.spacingY ?? sx : 2.0
    const size = p.width > 0.5 ? p.width : 0.5
    const aspect = imageW > 0.0 && imageH > 0.0 ? imageH / imageW : 1.0
    const w = aspect <= 1.0 ? size : size / aspect
    const h = aspect <= 1.0 ? size * aspect : size
    let y = Math.floor(bounds.y / sy) * sy
    while (y < bounds.y + bounds.h) {
      let x = Math.floor(bounds.x / sx) * sx
      while (x < bounds.x + bounds.w) {
        out.push({ x: x + (sx - w) / 2.0, y: y + (sy - h) / 2.0, w, h })
        x = x + sx
      }
      y = y + sy
    }
    return out
  }
  if (!(imageW > 0.0) || !(imageH > 0.0)) return out
  const tileX = repeat === 'repeat' || repeat === 'repeat-x'
  const tileY = repeat === 'repeat' || repeat === 'repeat-y'
  let y = tileY ? Math.floor(bounds.y / imageH) * imageH : 0.0
  const yEnd = tileY ? bounds.y + bounds.h : 0.5
  while (y < yEnd) {
    let x = tileX ? Math.floor(bounds.x / imageW) * imageW : 0.0
    const xEnd = tileX ? bounds.x + bounds.w : 0.5
    while (x < xEnd) {
      out.push({ x, y, w: imageW, h: imageH })
      x = x + imageW
    }
    y = y + imageH
  }
  return out
}
