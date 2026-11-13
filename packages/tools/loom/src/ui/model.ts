/**
 * The observatory's reactive state + pure view-data derivation, split from the
 * views so the real logic (filtering, statuses, layout, ranking, selection
 * metrics) is unit-testable without a DOM — the Atlas `model.ts` discipline.
 */
import { computed, signal, type Signal } from '@pyreon/reactivity'
import type { LoomIssue, LoomReport } from '../core/types'

export type ViewId = 'graph' | 'matrix' | 'cycles' | 'impact' | 'table'
export type NodeStatus = 'circular' | 'drift' | 'issue' | 'current'
export type Severity = 'error' | 'warning' | 'info'
/** The matrix view's two readings: external version usage, or the internal import DSM. */
export type MatrixMode = 'versions' | 'imports'

/** One node of the observatory — internal member or external dependency. */
/** A ranked search hit with WHY it matched (`finding · unused-dep`, `depends on · @pyreon/core`). */
export interface LoomSearchHit {
  id: string
  kind: 'internal' | 'external'
  score: number
  reason?: string
}

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
  /** Info-severity findings — surfaced beside err/warn so a node whose
   * FINDINGS list is non-empty never reads as "0 err · 0 warn". */
  infos: number
  /** `private: true` in the manifest (internal only; externals are never private). */
  private: boolean
  /** The worst severity among this node's findings, or null when it has none. */
  worst: Severity | null
  /** Internal dev/test-only edges out of this package (`devDependencies`). */
  devDeps: string[]
}

export interface ObservatoryModel {
  report: LoomReport
  nodes: NodeVM[]
  byId: Map<string, NodeVM>
  cycleNodes: Set<string>
  view: Signal<ViewId>
  /** The package-list filter (sidebar input; also narrows the manifest table). */
  query: Signal<string>
  /** The ⌘K search dialog (docs-site style; the header input became a trigger). */
  searchOpen: Signal<boolean>
  /** Fulltext hits with the matched-field reason — id, version, kind, findings, deps. */
  searchHits: (q: string) => LoomSearchHit[]
  /** The selected id; `''` = nothing selected (the rail shows the workspace overview). */
  selId: Signal<string>
  hoverId: Signal<string | null>
  showCycles: Signal<boolean>
  /** Graph: draw internal dev edges too (dashed; never part of depth or cycles). */
  showDev: Signal<boolean>
  matrixMode: Signal<MatrixMode>
  /** Version matrix: only the externals with a `version-drift` finding. */
  driftOnly: Signal<boolean>
  dark: Signal<boolean>
  navOpen: Signal<boolean>
  panelOpen: Signal<boolean>
  /** Nodes passing the query filter, in sidebar order: internal by depth
   * then name, then externals by name (the sidebar, ↑↓ and the table). */
  shown: () => NodeVM[]
  /** Every internal node in sidebar order, unfiltered (the graph and matrix). */
  internal: NodeVM[]
  /** Transitive internal dependents of the selection — what the graph lights. */
  blast: () => string[]
  /** Blast-radius size of any node: the report's `reach` for an internal
   * package, the same walk (memoised per node) for an external. */
  reachOf: (id: string) => number
  /** The selected node, or null for the workspace overview (no selection). */
  sel: () => NodeVM | null
  /** Select a node and keep it selected across view jumps. */
  select: (id: string) => void
}

/** Build the node universe from a report — pure. */
export function buildNodes(report: LoomReport): NodeVM[] {
  const cycleMembers = new Set(report.graph.cycles.flat())
  const errorsByTarget = new Map<string, { e: number; w: number; i: number }>()
  for (const issue of report.issues) {
    for (const target of [issue.pkg, issue.dep]) {
      if (!target || target === 'ROOT') continue
      const rec = errorsByTarget.get(target) ?? { e: 0, w: 0, i: 0 }
      if (issue.severity === 'error') rec.e += 1
      else if (issue.severity === 'warning') rec.w += 1
      else rec.i += 1
      errorsByTarget.set(target, rec)
    }
  }

  const internalNames = new Set(report.model.packages.map((p) => p.name))
  const worstOf = (c: { e: number; w: number; i: number }): Severity | null =>
    c.e ? 'error' : c.w ? 'warning' : c.i ? 'info' : null
  const runtimeDeps = new Map<string, string[]>()
  const devDeps = new Map<string, string[]>()
  for (const p of report.model.packages) {
    runtimeDeps.set(
      p.name,
      p.deps.filter((d) => d.field !== 'devDependencies').map((d) => d.name),
    )
    devDeps.set(
      p.name,
      p.deps
        .filter((d) => d.field === 'devDependencies' && internalNames.has(d.name) && d.name !== p.name)
        .map((d) => d.name),
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
    const counts = errorsByTarget.get(p.name) ?? { e: 0, w: 0, i: 0 }
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
      infos: counts.i,
      private: p.private,
      worst: worstOf(counts),
      devDeps: devDeps.get(p.name) ?? [],
    })
  }

  const maxDepth = Math.max(0, ...Object.values(report.graph.depths))
  for (const ext of report.external) {
    const ranges = Object.keys(ext.ranges)
    const users = [...new Set(Object.values(ext.ranges).flat().map((u) => u.user))]
    const counts = errorsByTarget.get(ext.name) ?? { e: 0, w: 0, i: 0 }
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
      infos: counts.i,
      private: false,
      worst: worstOf(counts),
      devDeps: [],
    })
  }
  return nodes
}

/** Host-supplied starting state — the browser-only preferences (theme,
 * viewport, a selection carried in the URL) resolved by the host, so the
 * model itself stays pure and SSR-safe. */
export interface ModelInit {
  dark?: boolean
  selId?: string
  navOpen?: boolean
  panelOpen?: boolean
}

export function createModel(
  report: LoomReport,
  initialView: ViewId = 'graph',
  init: ModelInit = {},
): ObservatoryModel {
  const nodes = buildNodes(report)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const cycleNodes = new Set(report.graph.cycles.flat())

  const view = signal<ViewId>(initialView)
  const query = signal('')
  const searchOpen = signal(false)
  // Opens with NOTHING selected — the rail shows the workspace overview and
  // the graph sits at its start — unless the URL carried a selection.
  const selId = signal(init.selId && byId.has(init.selId) ? init.selId : '')
  const hoverId = signal<string | null>(null)
  const showCycles = signal(true)
  const showDev = signal(false)
  const matrixMode = signal<MatrixMode>('versions')
  const driftOnly = signal(report.issues.some((i) => i.code === 'version-drift'))
  const dark = signal(init.dark ?? true)
  const navOpen = signal(init.navOpen ?? true)
  const panelOpen = signal(init.panelOpen ?? true)

  const internal = sidebarOrder(nodes.filter((n) => n.kind === 'internal'))
  const ordered = [...internal, ...sidebarOrder(nodes.filter((n) => n.kind === 'external'))]
  const shown = computed(() => {
    const q = query().trim().toLowerCase()
    return q ? ordered.filter((n) => n.id.toLowerCase().includes(q)) : ordered
  })

  const sel = computed(() => byId.get(selId()) ?? null)
  const blast = computed(() => (selId() ? blastRadius(byId, selId()) : []))
  // Bounded by the node universe (fixed for the model's lifetime): one entry
  // per external at most, dropped with the model.
  const extReach = new Map<string, number>()
  const reachOf = (id: string): number => {
    const own = report.graph.reach[id]
    if (own !== undefined) return own
    let r = extReach.get(id)
    if (r === undefined) {
      r = blastRadius(byId, id).length
      extReach.set(id, r)
    }
    return r
  }

  // ── fulltext search index (the ⌘K dialog) ─────────────────────────────────
  // Beyond ids: versions, kind, license, FINDINGS (code + message — searching
  // `unused-dep` lists every flagged package), and the dependency edges in
  // both directions. Multi-token AND; keyword hits carry the matched field.
  interface SearchEntry {
    text: string
    weight: number
    reason?: string
  }
  const issuesByPkg = new Map<string, { code: string; severity: string; message: string }[]>()
  for (const issue of report.issues) {
    const list = issuesByPkg.get(issue.pkg) ?? []
    list.push({ code: issue.code, severity: issue.severity, message: issue.message })
    issuesByPkg.set(issue.pkg, list)
  }
  const searchIndex = nodes.map((n) => {
    const entries: SearchEntry[] = [
      { text: n.id.toLowerCase(), weight: 100 },
      { text: n.version.toLowerCase(), weight: 30, reason: `version · ${n.version}` },
      { text: n.kind, weight: 15, reason: `kind · ${n.kind}` },
    ]
    if (n.license)
      entries.push({ text: n.license.toLowerCase(), weight: 20, reason: `license · ${n.license}` })
    for (const d of n.deps)
      entries.push({ text: d.toLowerCase(), weight: 25, reason: `depends on · ${d}` })
    for (const d of n.dependents)
      entries.push({ text: d.toLowerCase(), weight: 25, reason: `needed by · ${d}` })
    for (const iss of issuesByPkg.get(n.id) ?? []) {
      entries.push({ text: iss.code, weight: 45, reason: `finding · ${iss.code}` })
      entries.push({ text: iss.message.toLowerCase(), weight: 15, reason: `finding · ${iss.code}` })
    }
    return { n, entries }
  })
  const searchHits = (q: string): LoomSearchHit[] => {
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return nodes.map((n) => ({ id: n.id, kind: n.kind, score: 0 }))
    const hits: LoomSearchHit[] = []
    for (const { n, entries } of searchIndex) {
      let total = 0
      let reason: string | undefined
      let reasonWeight = 0
      let ok = true
      for (const t of tokens) {
        let best: SearchEntry | undefined
        for (const e of entries) {
          if (!e.text.includes(t)) continue
          if (!best || e.weight > best.weight) best = e
        }
        if (!best) {
          ok = false
          break
        }
        total += best.weight + (best.weight === 100 && n.id.toLowerCase().startsWith(t) ? 20 : 0)
        if (best.reason && best.weight > reasonWeight) {
          reason = best.reason
          reasonWeight = best.weight
        }
      }
      if (ok) hits.push({ id: n.id, kind: n.kind, score: total, ...(reason ? { reason } : {}) })
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  }

  return {
    report,
    nodes,
    byId,
    cycleNodes,
    view,
    query,
    searchOpen,
    searchHits,
    selId,
    hoverId,
    showCycles,
    showDev,
    matrixMode,
    driftOnly,
    dark,
    navOpen,
    panelOpen,
    shown: () => shown(),
    internal,
    blast: () => blast(),
    reachOf,
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

/** Layered graph geometry — one column per depth, boxes top-aligned in it.
 * `pos` is each box's top-left corner. */
export interface GraphLayout {
  width: number
  height: number
  pos: Map<string, { x: number; y: number }>
  depthKeys: number[]
}

export const GRAPH_BOX_W = 208
export const GRAPH_BOX_H = 32
export const GRAPH_COL_W = 256
export const GRAPH_ROW_H = 48
export const GRAPH_PAD_T = 44
export const GRAPH_PAD_L = 8

export function layoutGraph(shown: readonly NodeVM[]): GraphLayout {
  const cols = new Map<number, NodeVM[]>()
  for (const n of shown) {
    const list = cols.get(n.depth) ?? []
    list.push(n)
    cols.set(n.depth, list)
  }
  const depthKeys = [...cols.keys()].sort((a, b) => a - b)
  const maxRows = Math.max(1, ...depthKeys.map((d) => cols.get(d)!.length))
  const height = GRAPH_PAD_T + maxRows * GRAPH_ROW_H
  const width = GRAPH_PAD_L * 2 + Math.max(0, depthKeys.length - 1) * GRAPH_COL_W + GRAPH_BOX_W
  const pos = new Map<string, { x: number; y: number }>()
  depthKeys.forEach((d, di) => {
    cols.get(d)!.forEach((n, i) => {
      pos.set(n.id, { x: GRAPH_PAD_L + di * GRAPH_COL_W, y: GRAPH_PAD_T + i * GRAPH_ROW_H })
    })
  })
  return { width, height, pos, depthKeys }
}

/**
 * Platform packages: an internal package that exists only as an
 * `optionalDependencies` entry of exactly ONE other package and depends on
 * nothing internal itself — the `@pyreon/compiler-<os>-<arch>` binaries. Each
 * reaches exactly its parent plus the parent's reach, so a ranking that lists
 * them repeats the parent's number once per platform. Returns id → parent.
 */
export function platformParents(report: LoomReport): Map<string, string> {
  const internal = new Set(report.model.packages.map((p) => p.name))
  const declaredBy = new Map<string, { user: string; field: string }[]>()
  const hasInternalRuntimeDeps = new Set<string>()
  for (const p of report.model.packages) {
    for (const d of p.deps) {
      if (!internal.has(d.name) || d.name === p.name) continue
      if (d.field !== 'devDependencies') hasInternalRuntimeDeps.add(p.name)
      const list = declaredBy.get(d.name) ?? []
      list.push({ user: p.name, field: d.field })
      declaredBy.set(d.name, list)
    }
  }
  const out = new Map<string, string>()
  for (const [id, decl] of declaredBy) {
    if (hasInternalRuntimeDeps.has(id)) continue
    const users = new Set(decl.map((x) => x.user))
    if (users.size !== 1 || !decl.every((x) => x.field === 'optionalDependencies')) continue
    out.set(id, decl[0]!.user)
  }
  return out
}

export interface ImpactRow {
  node: NodeVM
  reach: number
  /** Platform packages ranked UNDER this one (see `platformParents`). */
  platforms: string[]
}

/**
 * Impact ranking — blast radius over the whole graph, sorted by reach, with
 * platform packages folded under their parent instead of ranked on their own
 * (their reach is the parent's plus one, by construction).
 */
export function impactRows(model: Pick<ObservatoryModel, 'nodes' | 'report'>): ImpactRow[] {
  const parents = platformParents(model.report)
  const under = new Map<string, string[]>()
  for (const [id, parent] of parents) {
    const list = under.get(parent) ?? []
    list.push(id)
    under.set(parent, list)
  }
  return model.nodes
    .filter((n) => n.kind === 'internal' && !parents.has(n.id))
    .map((n) => ({
      node: n,
      reach: model.report.graph.reach[n.id] ?? 0,
      platforms: (under.get(n.id) ?? []).sort(),
    }))
    .sort((a, b) => b.reach - a.reach || a.node.id.localeCompare(b.node.id))
}

/** Truncate at the END with an ellipsis (graph box labels; the full id is the
 * tooltip and the accessible name). */
export function truncateEnd(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

/** Strip the workspace scope prefix for display (`@pyreon/loom` → `loom`). */
export function shortName(id: string): string {
  const i = id.indexOf('/')
  return id.startsWith('@') && i > 0 ? id.slice(i + 1) : id
}

/**
 * Truncate in the MIDDLE, keeping both ends: sibling ids share prefixes
 * (`@atlaskit/pragmatic-drag-and-drop-*`, `example-cpa-pw-app-*`), so an
 * end-ellipsis rendered several nodes with the identical label.
 */
export function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  return `${s.slice(0, head)}…${s.slice(s.length - (keep - head))}`
}

// ── Sidebar, blast radius, version matrix, scan summary ────────────────────

/** Sidebar order: depth ascending, then name. Pure; returns a new array. */
export function sidebarOrder(list: readonly NodeVM[]): NodeVM[] {
  return [...list].sort((a, b) =>
    a.kind === 'internal' && b.kind === 'internal'
      ? a.depth - b.depth || a.id.localeCompare(b.id)
      : a.id.localeCompare(b.id),
  )
}

export interface NodeGroup {
  key: string
  label: string
  items: NodeVM[]
}

/** The sidebar's groups over an already-ordered list: one per internal depth,
 * then one for every external. Empty groups are omitted. */
export function depthGroups(list: readonly NodeVM[]): NodeGroup[] {
  const groups: NodeGroup[] = []
  let cur: NodeGroup | undefined
  for (const n of list) {
    const key = n.kind === 'internal' ? `d${n.depth}` : 'ext'
    if (!cur || cur.key !== key) {
      cur = { key, label: n.kind === 'internal' ? `depth ${n.depth}` : 'external', items: [] }
      groups.push(cur)
    }
    cur.items.push(n)
  }
  return groups
}

/**
 * Everything that rebuilds, retests or republishes if `id` changes: the
 * transitive dependents over runtime edges, excluding `id` itself. For an
 * internal package its length equals `report.graph.reach[id]` (same edges,
 * same walk). Ordered by depth, then name.
 */
export function blastRadius(byId: ReadonlyMap<string, NodeVM>, id: string): string[] {
  const seen = new Set<string>()
  const queue = [id]
  while (queue.length) {
    const cur = queue.shift()!
    for (const dep of byId.get(cur)?.dependents ?? []) {
      if (dep !== id && !seen.has(dep)) {
        seen.add(dep)
        queue.push(dep)
      }
    }
  }
  return [...seen].sort(
    (a, b) => (byId.get(a)?.depth ?? 0) - (byId.get(b)?.depth ?? 0) || a.localeCompare(b),
  )
}

/** One cell of the version matrix: what `user` declares for the row's dep. */
export interface VersionCell {
  /** The declared range, or `phantom` for an undeclared runtime import. */
  text: string
  /** Drift tone: this declaration disagrees with the workspace's usual range. */
  tone: 'error' | 'warning' | null
  /** `unused`: declared, never imported. `phantom`: imported, never declared. */
  note?: 'unused' | 'phantom'
}

export interface VersionRow {
  dep: string
  /** How it is declared: `runtime`, `peer`, `optional` or `dev` (strongest wins). */
  use: 'runtime' | 'peer' | 'optional' | 'dev'
  /** The row's `version-drift` severity, or null when every user agrees. */
  drift: Severity | null
  cells: Map<string, VersionCell>
}

export interface VersionMatrix {
  rows: VersionRow[]
  /** Column users — `ROOT` first when present, then internal by depth and name. */
  cols: string[]
}

const SEV_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 }

/**
 * External version usage as a matrix: rows are external dependencies, columns
 * the packages declaring them, cells the declared range. On a drifting row
 * (`version-drift` error or warning) the declarations that disagree with the
 * most-used range carry the drift tone; when no single range is most used,
 * every declaration does. Phantom imports (`phantom-dep`) appear as cells too,
 * and `unused-dep` declarations are marked. Pure over the report.
 */
export function versionMatrix(
  report: LoomReport,
  depthOf: (id: string) => number,
  driftOnly: boolean,
): VersionMatrix {
  const drift = new Map<string, Severity>()
  const unused = new Set<string>()
  const phantoms: { pkg: string; dep: string; severity: Severity }[] = []
  for (const i of report.issues) {
    if (!i.dep) continue
    if (i.code === 'version-drift') drift.set(i.dep, i.severity)
    else if (i.code === 'unused-dep') unused.add(`${i.pkg}\u0000${i.dep}`)
    else if (i.code === 'phantom-dep') phantoms.push({ pkg: i.pkg, dep: i.dep, severity: i.severity })
  }

  const rows = new Map<string, VersionRow>()
  for (const ext of report.external) {
    const sev = drift.get(ext.name) ?? null
    if (driftOnly && !sev) continue
    const counts = Object.entries(ext.ranges).map(([r, users]) => [r, users.length] as const)
    const top = Math.max(...counts.map(([, c]) => c))
    const modal = counts.filter(([, c]) => c === top)
    const usual = modal.length === 1 ? modal[0]![0] : null
    const tone = sev === 'error' || sev === 'warning' ? sev : null
    const cells = new Map<string, VersionCell>()
    const fields = new Set<string>()
    for (const [range, users] of Object.entries(ext.ranges)) {
      for (const u of users) {
        fields.add(u.field)
        const cellTone = tone && range !== usual ? tone : null
        const prev = cells.get(u.user)
        if (prev) {
          // One package declaring the dep in two fields (a peer range plus
          // the dev pin it tests against): both ranges, never the last one.
          if (prev.text !== range) prev.text = `${prev.text} | ${range}`
          prev.tone ??= cellTone
          continue
        }
        cells.set(u.user, {
          text: range,
          tone: cellTone,
          ...(unused.has(`${u.user}\u0000${ext.name}`) ? { note: 'unused' as const } : {}),
        })
      }
    }
    const use = fields.has('dependencies')
      ? 'runtime'
      : fields.has('peerDependencies')
        ? 'peer'
        : fields.has('optionalDependencies')
          ? 'optional'
          : 'dev'
    rows.set(ext.name, { dep: ext.name, use, drift: sev, cells })
  }
  for (const p of phantoms) {
    let row = rows.get(p.dep)
    if (!row) {
      if (driftOnly) continue
      row = { dep: p.dep, use: 'runtime', drift: null, cells: new Map() }
      rows.set(p.dep, row)
    }
    if (!row.cells.has(p.pkg)) {
      row.cells.set(p.pkg, {
        text: 'phantom',
        tone: p.severity === 'info' ? null : p.severity,
        note: 'phantom',
      })
    }
  }

  const users = new Set<string>()
  for (const r of rows.values()) for (const u of r.cells.keys()) users.add(u)
  const cols = [...users].sort((a, b) =>
    a === 'ROOT' ? -1 : b === 'ROOT' ? 1 : depthOf(a) - depthOf(b) || a.localeCompare(b),
  )
  const sorted = [...rows.values()].sort(
    (a, b) =>
      (a.drift ? SEV_RANK[a.drift] : 3) - (b.drift ? SEV_RANK[b.drift] : 3) ||
      a.dep.localeCompare(b.dep),
  )
  return { rows: sorted, cols }
}

export interface ScanSummary {
  errors: number
  warnings: number
  infos: number
  /** What `loom scan` exits with (see `LoomReport.gate`). */
  exit: 0 | 1
  /** Findings a `loom.ignore` entry downgraded, with their reasons. */
  ignored: LoomIssue[]
}

export function scanSummary(report: LoomReport): ScanSummary {
  const { errors, warnings, infos } = report.stats
  return {
    errors,
    warnings,
    infos,
    // A report from a loom without `gate` predates `strict` in the report:
    // errors alone are what it gated on.
    exit: report.gate?.exit ?? (errors > 0 ? 1 : 0),
    ignored: report.issues.filter((i) => i.ignored !== undefined),
  }
}

/** The findings attributed to a node — as the package, or as the dependency. */
export function issuesFor(report: LoomReport, id: string): LoomIssue[] {
  return report.issues.filter((i) => i.pkg === id || i.dep === id)
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** The `loom.ignore` entry that would suppress exactly this finding. */
export function suppressSnippet(issue: Pick<LoomIssue, 'pkg' | 'dep' | 'code'>): string {
  const keys = [`pkg: ${quote(issue.pkg)}`]
  if (issue.dep) keys.push(`dep: ${quote(issue.dep)}`)
  keys.push(`code: ${quote(issue.code)}`)
  return `loom: { ignore: [{\n  ${keys.join(', ')},\n  reason: '…', // required, shown in the report\n}] }`
}
