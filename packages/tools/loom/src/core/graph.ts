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
    // One edge per (from, to, class). A package routinely declares the same
    // internal dep in BOTH `dependencies` and `peerDependencies` (a plugin that
    // needs its host at build and at install); counting that twice doubled the
    // dependents index, the blast radius, and the rendered graph's edge.
    const seenRuntime = new Set<string>()
    const seenDev = new Set<string>()
    for (const d of p.deps) {
      if (!internal.has(d.name) || d.name === p.name) continue
      if (d.field === 'devDependencies') {
        if (seenDev.has(d.name)) continue
        seenDev.add(d.name)
        devEdges.push([p.name, d.name])
        continue
      }
      if (seenRuntime.has(d.name)) continue
      seenRuntime.add(d.name)
      // dependencies / peerDependencies / optionalDependencies are all runtime
      // edges — an optional internal dep is always present in a workspace.
      edges.push([p.name, d.name])
      runtimeDeps.get(p.name)!.push(d.name)
    }
  }

  // Dependents index (runtime).
  const dependents = new Map<string, string[]>()
  for (const p of model.packages) dependents.set(p.name, [])
  for (const [from, to] of edges) dependents.get(to)!.push(from)

  // Depths: how far below the surface a package sits. Entry points (no
  // internal runtime dependents) are depth 0, and a package is one below its
  // deepest dependent: the longest path from any entry.
  //
  // Longest path only means something on a DAG, so the depths are computed on
  // the CONDENSATION — each strongly connected component (a cycle and
  // everything locked into it) collapsed to one node — and every member gets
  // its component's depth. Relaxing through the cycle itself walked it again
  // and again until the V-1 cap: one three-package loop in a 14-package
  // workspace put its dependencies at depth 13 where the longest acyclic chain
  // is about 5 (#4391).
  const depths = condensedDepths(
    model.packages.map((p) => p.name),
    runtimeDeps,
  )

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

/**
 * Longest-path depth over the condensation of `deps` (see `analyzeGraph`).
 * Tarjan's SCC, iterative so a deep workspace cannot overflow the call stack.
 */
function condensedDepths(names: readonly string[], deps: ReadonlyMap<string, readonly string[]>): Record<string, number> {
  const comp = new Map<string, number>()
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  let counter = 0
  let comps = 0
  for (const root of names) {
    if (index.has(root)) continue
    const frames: [string, number][] = [[root, 0]]
    index.set(root, counter)
    low.set(root, counter++)
    stack.push(root)
    onStack.add(root)
    while (frames.length) {
      const frame = frames[frames.length - 1]!
      const [node] = frame
      const children = deps.get(node) ?? []
      if (frame[1] < children.length) {
        const next = children[frame[1]++]!
        if (!index.has(next)) {
          index.set(next, counter)
          low.set(next, counter++)
          stack.push(next)
          onStack.add(next)
          frames.push([next, 0])
        } else if (onStack.has(next)) {
          low.set(node, Math.min(low.get(node)!, index.get(next)!))
        }
        continue
      }
      frames.pop()
      const parent = frames[frames.length - 1]
      if (parent) low.set(parent[0], Math.min(low.get(parent[0])!, low.get(node)!))
      if (low.get(node) === index.get(node)) {
        let member: string
        do {
          member = stack.pop()!
          onStack.delete(member)
          comp.set(member, comps)
        } while (member !== node)
        comps++
      }
    }
  }

  // Tarjan numbers components in reverse topological order of the edges
  // (a component is completed only after everything it depends on), so the
  // highest number is a source. Walking from it down, every dependent of a
  // component is final before the component is.
  const depthOf = new Array<number>(comps).fill(0)
  const into = Array.from({ length: comps }, () => new Set<number>())
  for (const name of names) {
    for (const d of deps.get(name) ?? []) {
      const from = comp.get(name)!
      const to = comp.get(d)
      if (to !== undefined && to !== from) into[to]!.add(from)
    }
  }
  for (let c = comps - 1; c >= 0; c--) {
    for (const from of into[c]!) depthOf[c] = Math.max(depthOf[c]!, depthOf[from]! + 1)
  }
  const out: Record<string, number> = {}
  for (const name of names) out[name] = depthOf[comp.get(name)!]!

  return out
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
