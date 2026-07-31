/**
 * Graph analysis over the workspace model — pure, no filesystem.
 *
 * Edges are split by SEMANTICS, not lumped: runtime edges (`dependencies` +
 * `peerDependencies` between internal packages) are the graph that cycles,
 * layering, and blast radius are computed over; dev edges (`devDependencies`)
 * are kept separately because monorepos legitimately "cycle" through shared
 * test utilities — reporting those as circular dependencies would teach users
 * to ignore the detector (a gate that cries wolf is a dead gate).
 */
import type { GraphAnalysis, WorkspaceModel } from './types'

export function analyzeGraph(model: WorkspaceModel): GraphAnalysis {
  const internal = new Set(model.packages.map((p) => p.name))
  const edges: [string, string][] = []
  const devEdges: [string, string][] = []
  const runtimeDeps = new Map<string, string[]>()
  for (const p of model.packages) runtimeDeps.set(p.name, [])

  for (const p of model.packages) {
    for (const d of p.deps) {
      if (!internal.has(d.name) || d.name === p.name) continue
      if (d.field === 'devDependencies') {
        devEdges.push([p.name, d.name])
      } else if (d.field === 'optionalDependencies') {
        // optional internal deps are runtime when present — in a workspace
        // they are always present, so they count as runtime edges.
        edges.push([p.name, d.name])
        runtimeDeps.get(p.name)!.push(d.name)
      } else {
        edges.push([p.name, d.name])
        runtimeDeps.get(p.name)!.push(d.name)
      }
    }
  }

  // Dependents index (runtime).
  const dependents = new Map<string, string[]>()
  for (const p of model.packages) dependents.set(p.name, [])
  for (const [from, to] of edges) dependents.get(to)!.push(from)

  // Depths: entry points (no internal runtime dependents) are depth 0; a
  // package's depth is 1 + the max depth of its dependents — i.e. how far
  // below the surface it sits. Computed as longest path from any entry,
  // which is well-defined on the acyclic part; nodes on cycles get the
  // depth their first visit found (the traversal is visit-capped).
  const depths: Record<string, number> = {}
  const entries = model.packages.filter((p) => dependents.get(p.name)!.length === 0).map((p) => p.name)
  // Fallback: a fully-cyclic workspace has no entries; treat every node as one.
  const roots = entries.length > 0 ? entries : model.packages.map((p) => p.name)
  // Longest-path relaxation, HARD-BOUNDED at V-1: a simple path can never be
  // longer, and without the bound a cyclic graph relaxes forever — the
  // fixture's two-package loop hung the first cut of this BFS (the acyclic
  // dogfood repo masked it). Depth-bounded/iterative on WRITE-side graph
  // walks is the standing framework rule; it applies here too.
  const maxDepth = Math.max(0, model.packages.length - 1)
  const queue: [string, number][] = roots.map((r) => [r, 0])
  while (queue.length) {
    const [name, d] = queue.shift()!
    if (d > maxDepth) continue
    if (depths[name] !== undefined && depths[name] >= d) continue
    depths[name] = d
    for (const dep of runtimeDeps.get(name) ?? []) queue.push([dep, d + 1])
  }
  for (const p of model.packages) depths[p.name] ??= 0

  // Cycles: iterative DFS with an explicit stack over runtime edges,
  // deduplicated by the sorted member set. Depth-bounded by construction
  // (each node enters the visit set once).
  const cycles: string[][] = []
  const seenCycle = new Set<string>()
  const visited = new Set<string>()
  const onStack = new Map<string, number>()
  const stack: string[] = []

  const visit = (start: string) => {
    // Iterative DFS: frames of [node, nextChildIndex].
    const frames: [string, number][] = [[start, 0]]
    onStack.set(start, 0)
    stack.push(start)
    while (frames.length) {
      const frame = frames[frames.length - 1]!
      const [node] = frame
      const children = runtimeDeps.get(node) ?? []
      if (frame[1] < children.length) {
        const next = children[frame[1]++]!
        const at = onStack.get(next)
        if (at !== undefined) {
          const loop = stack.slice(at)
          const key = [...loop].sort().join('>')
          if (!seenCycle.has(key)) {
            seenCycle.add(key)
            cycles.push(loop)
          }
        } else if (!visited.has(next)) {
          onStack.set(next, stack.length)
          stack.push(next)
          frames.push([next, 0])
        }
      } else {
        frames.pop()
        stack.pop()
        onStack.delete(node)
        visited.add(node)
      }
    }
  }
  for (const p of model.packages) {
    if (!visited.has(p.name)) visit(p.name)
  }

  // Reach: transitive dependents (BFS up the dependents index).
  const reach: Record<string, number> = {}
  for (const p of model.packages) {
    const seen = new Set<string>()
    const q = [p.name]
    while (q.length) {
      const cur = q.shift()!
      for (const dep of dependents.get(cur) ?? []) {
        if (!seen.has(dep) && dep !== p.name) {
          seen.add(dep)
          q.push(dep)
        }
      }
    }
    reach[p.name] = seen.size
  }

  return { depths, cycles, reach, edges, devEdges }
}

/** External-usage fold: every external dep name → range → declaring users. */
export function externalUsage(model: WorkspaceModel): import('./types').ExternalUsage[] {
  const internal = new Set(model.packages.map((p) => p.name))
  const byName = new Map<string, Record<string, { user: string; field: import('./types').DepField }[]>>()
  for (const p of model.packages) {
    for (const d of p.deps) {
      if (internal.has(d.name)) continue
      const ranges = byName.get(d.name) ?? {}
      ;(ranges[d.range] ??= []).push({ user: p.name, field: d.field })
      byName.set(d.name, ranges)
    }
  }
  return [...byName.entries()]
    .map(([name, ranges]) => ({ name, ranges }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
