// The web-facing polar hit: a discriminated union over the crossed engine's
// index answer (a TS union of differently-shaped objects has no native form,
// so the engine reports indices and this thin layer names them).

import { hitPolarIndex } from './polar'
import type { PolarLayout, PolarPoint, PolarSector } from './polar'
import type { Double } from './types'

export type PolarHit = { kind: 'sector'; sector: PolarSector } | { kind: 'point'; point: PolarPoint } | null

/** A sector under the point, else the nearest line point within 6px, else null. */
export function hitPolar(layout: PolarLayout, px: Double, py: Double): PolarHit {
  const hit = hitPolarIndex(layout, px, py)
  if (hit.sector >= 0) return { kind: 'sector', sector: layout.sectors[hit.sector]! }
  if (hit.line >= 0 && hit.point >= 0) return { kind: 'point', point: layout.lines[hit.line]!.points[hit.point]! }
  return null
}
