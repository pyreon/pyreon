// The web-facing graph hit: a nullable node over the crossed engine's index
// answer (a `T | null` return has no native form).

import { hitGraphIndex } from './graph'
import type { GraphLayout, GraphLayoutNode } from './graph'
import type { Double } from './types'

/** The nearest node whose symbol (plus a small halo) contains the point, or null. */
export function hitGraph(layout: GraphLayout, px: Double, py: Double): GraphLayoutNode | null {
  const i = hitGraphIndex(layout, px, py)
  return i < 0 ? null : layout.nodes[i]!
}
