/**
 * The observatory's reactive state + pure view-data derivation, split from the
 * views so the real logic (filtering, statuses, layout, ranking, selection
 * metrics) is unit-testable without a DOM — the Atlas `model.ts` discipline.
 */
import { computed, signal, type Signal } from '@pyreon/reactivity'
import type { LoomReport } from '../core/types'

export type ViewId = 'graph' | 'matrix' | 'cycles' | 'impact' | 'table'
export type KindFilter = 'all' | 'internal' | 'external'
export type NodeStatus = 'circular' | 'drift' | 'issue' | 'current'

/** One node of the observatory — internal member or external dependency. */
export interface NodeVM {
  id: string
  kind: 'internal' | 'external'
  /** Version for internal; declared range (or range count) for external. */
  version: string
  license: string
  /** Runtime dependency ids (internal graph edges + externals it declares). */
  deps: string[]
  /** Reverse edges (who depends on this). */
  dependents: string[]
  /** Column for the layered graph (internal: resolution depth; external: after its users). */
  depth: number
  status: NodeStatus
  /** Issue counts attributed to this node (as pkg or dep). */
  errors: number
  warnings: number
}

export interface ObservatoryModel {
  report: LoomReport
  nodes: NodeVM[]
  byId: Map<string, NodeVM>
  cycleNodes: Set<string>
  view: Signal<ViewId>
  kind: Signal<KindFilter>
  query: Signal<string>
  selId: Signal<string>
  hoverId: Signal<string | null>
  showCycles: Signal<boolean>
  dark: Signal<boolean>
  navOpen: Signal<boolean>
  panelOpen: Signal<boolean>
  /** Nodes passing the kind + query filters (sidebar, table, graph). */
  shown: () => NodeVM[]
  sel: () => NodeVM
  /** Select a node and keep it selected across view jumps. */
  select: (id: string) => void
}

/** Build the node universe from a report — pure. */
export function buildNodes(report: LoomReport): NodeVM[] {
  const cycleMembers = new Set(report.graph.cycles.flat())
  const errorsByTarget = new Map<string, { e: number; w: number }>()
  for (const issue of report.issues) {
    for (const target of [issue.pkg, issue.dep]) {
      if (!target || target === 'ROOT') continue
      const rec = errorsByTarget.get(target) ?? { e: 0, w: 0 }
      if (issue.severity === 'error') rec.e += 1
      else if (issue.severity === 'warning') rec.w += 1
      errorsByTarget.set(target, rec)
    }
  }

  const internalNames = new Set(report.model.packages.map((p) => p.name))
  const runtimeDeps = new Map<string, string[]>()
  for (const p of report.model.packages) {
    runtimeDeps.set(
      p.name,
      p.deps.filter((d) => d.field !== 'devDependencies').map((d) => d.name),
    )
  }

  const dependents = new Map<string, string[]>()
  for (const [from, deps] of runtimeDeps) {
    for (const to of deps) {
      const list = dependents.get(to) ?? []
      list.push(from)
      dependents.set(to, list)
    }
  }

  const nodes: NodeVM[] = []
  for (const p of report.model.packages) {
    const counts = errorsByTarget.get(p.name) ?? { e: 0, w: 0 }
    const status: NodeStatus = cycleMembers.has(p.name)
      ? 'circular'
      : counts.e > 0
        ? 'issue'
        : 'current'
    nodes.push({
      id: p.name,
      kind: 'internal',
      version: p.version,
      license: p.license ?? '—',
      deps: runtimeDeps.get(p.name) ?? [],
      dependents: (dependents.get(p.name) ?? []).filter((d) => internalNames.has(d)),
      depth: report.graph.depths[p.name] ?? 0,
      status,
      errors: counts.e,
      warnings: counts.w,
    })
  }

  const maxDepth = Math.max(0, ...Object.values(report.graph.depths))
  for (const ext of report.external) {
    const ranges = Object.keys(ext.ranges)
    const users = [...new Set(Object.values(ext.ranges).flat().map((u) => u.user))]
    const counts = errorsByTarget.get(ext.name) ?? { e: 0, w: 0 }
    const drift = ranges.length > 1
    // Externals sit one column past their deepest internal user.
    const userDepths = users.map((u) => report.graph.depths[u] ?? 0)
    const depth = userDepths.length ? Math.max(...userDepths) + 1 : maxDepth + 1
    nodes.push({
      id: ext.name,
      kind: 'external',
      version: ranges.length === 1 ? ranges[0]! : `${ranges.length} ranges`,
      license: '—',
      deps: [],
      dependents: users,
      depth,
      status: drift ? 'drift' : counts.e > 0 ? 'issue' : 'current',
      errors: counts.e,
      warnings: counts.w,
    })
  }
  return nodes
}

export function createModel(report: LoomReport): ObservatoryModel {
  const nodes = buildNodes(report)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const cycleNodes = new Set(report.graph.cycles.flat())

  const view = signal<ViewId>('graph')
  const kind = signal<KindFilter>('all')
  const query = signal('')
  const selId = signal(nodes[0]?.id ?? '')
  const hoverId = signal<string | null>(null)
  const showCycles = signal(true)
  const dark = signal(true)
  const navOpen = signal(true)
  const panelOpen = signal(true)

  const shown = computed(() => {
    const q = query().trim().toLowerCase()
    const k = kind()
    return nodes.filter(
      (n) => (k === 'all' || n.kind === k) && (!q || n.id.toLowerCase().includes(q)),
    )
  })

  const sel = computed(() => byId.get(selId()) ?? nodes[0]!)

  return {
    report,
    nodes,
    byId,
    cycleNodes,
    view,
    kind,
    query,
    selId,
    hoverId,
    showCycles,
    dark,
    navOpen,
    panelOpen,
    shown: () => shown(),
    sel: () => sel(),
    select: (id) => selId.set(id),
  }
}

// ── Pure per-view derivations (each takes the model + returns plain data) ──

/** The BFS path root → node over runtime edges (internal), for the panel. */
export function pathTo(model: ObservatoryModel, id: string): string[] {
  const roots = model.nodes.filter((n) => n.kind === 'internal' && n.dependents.length === 0)
  const prev = new Map<string, string>()
  const seen = new Set(roots.map((r) => r.id))
  const q = roots.map((r) => r.id)
  while (q.length) {
    const cur = q.shift()!
    if (cur === id) break
    for (const dep of model.byId.get(cur)?.deps ?? []) {
      if (!seen.has(dep)) {
        seen.add(dep)
        prev.set(dep, cur)
        q.push(dep)
      }
    }
  }
  if (!seen.has(id)) return [id]
  const out = [id]
  let c = id
  while (prev.has(c)) {
    c = prev.get(c)!
    out.unshift(c)
  }
  return out
}

/** Layered graph geometry — columns by depth, rows packed per column. */
export interface GraphLayout {
  width: number
  height: number
  pos: Map<string, { x: number; y: number }>
  depthKeys: number[]
}

export const GRAPH_COL_W = 168
export const GRAPH_ROW_H = 48
export const GRAPH_PAD_T = 44
export const GRAPH_PAD_L = 56

export function layoutGraph(shown: NodeVM[]): GraphLayout {
  const cols = new Map<number, NodeVM[]>()
  for (const n of shown) {
    const list = cols.get(n.depth) ?? []
    list.push(n)
    cols.set(n.depth, list)
  }
  const depthKeys = [...cols.keys()].sort((a, b) => a - b)
  const maxRows = Math.max(1, ...depthKeys.map((d) => cols.get(d)!.length))
  const height = GRAPH_PAD_T * 2 + maxRows * GRAPH_ROW_H
  const width = GRAPH_PAD_L + depthKeys.length * GRAPH_COL_W + 120
  const pos = new Map<string, { x: number; y: number }>()
  depthKeys.forEach((d, di) => {
    const list = cols.get(d)!
    list.forEach((n, i) => {
      pos.set(n.id, {
        x: GRAPH_PAD_L + di * GRAPH_COL_W,
        y: GRAPH_PAD_T + ((maxRows - list.length) * GRAPH_ROW_H) / 2 + i * GRAPH_ROW_H + GRAPH_ROW_H / 2,
      })
    })
  })
  return { width, height, pos, depthKeys }
}

/** Impact ranking — blast radius over the whole graph, sorted by reach. */
export function impactRows(model: ObservatoryModel): { node: NodeVM; reach: number }[] {
  return model.nodes
    .filter((n) => n.kind === 'internal')
    .map((n) => ({ node: n, reach: model.report.graph.reach[n.id] ?? 0 }))
    .sort((a, b) => b.reach - a.reach || a.node.id.localeCompare(b.node.id))
}

/** Strip the workspace scope prefix for display (`@pyreon/loom` → `loom`). */
export function shortName(id: string): string {
  const i = id.indexOf('/')
  return id.startsWith('@') && i > 0 ? id.slice(i + 1) : id
}
