/**
 * Stacking order, shared by the web renderer and mirrored by the native views
 * (`pyreonFlowNodeZ` / `pyreonFlowEdgeZ`), so the same graph stacks the same
 * way on every target.
 */

/** A node's z-index: its own `zIndex`, +1000 while dragged, +100 while selected when `elevate`. */
export function flowNodeZ(zIndex: number | undefined, selected: boolean, dragging: boolean, elevate: boolean): number {
  return (zIndex ?? 0) + (dragging ? 1000 : selected && elevate ? 100 : 0)
}

/** An edge's stacking key: its own `zIndex`, +1000 while selected when `elevate`. */
export function flowEdgeZ(zIndex: number | undefined, selected: boolean, elevate: boolean): number {
  return (zIndex ?? 0) + (selected && elevate ? 1000 : 0)
}

/**
 * Edges in drawing order (a stable sort by {@link flowEdgeZ}). Returns the input
 * array itself when nothing would move, so an ordinary graph keeps handing the
 * renderer the same reference.
 */
export function orderEdges<E extends { id?: string; zIndex?: number }>(edges: E[], selected: ReadonlySet<string>, elevate: boolean): E[] {
  const anyZ = edges.some((e) => e.zIndex !== undefined && e.zIndex !== 0)
  if (!anyZ && !(elevate && selected.size > 0)) return edges
  return edges
    .map((e, i) => ({ e, i, z: flowEdgeZ(e.zIndex, selected.has(e.id ?? ''), elevate) }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.e)
}
