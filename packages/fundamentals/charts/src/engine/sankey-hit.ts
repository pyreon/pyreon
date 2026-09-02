// The web-facing sankey hit: a discriminated union over the crossed engine's
// index answer (a TS union of differently-shaped objects has no native form).

import { hitSankeyIndex } from './sankey'
import type { SankeyLayout, SankeyLayoutLink, SankeyLayoutNode } from './sankey'
import type { Double } from './types'

export type SankeyHit = { kind: 'node'; node: SankeyLayoutNode } | { kind: 'link'; link: SankeyLayoutLink } | null

/** A node band under the point, else a ribbon, else null. */
export function hitSankey(layout: SankeyLayout, px: Double, py: Double): SankeyHit {
  const hit = hitSankeyIndex(layout, px, py)
  if (hit.node >= 0) return { kind: 'node', node: layout.nodes[hit.node]! }
  if (hit.link >= 0) return { kind: 'link', link: layout.links[hit.link]! }
  return null
}
