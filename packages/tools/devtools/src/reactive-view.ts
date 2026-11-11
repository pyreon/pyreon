// Pure data shaping for the reactive tabs (Graph, Signals, Effects,
// Profiler) and the inspector's "Why did this update?". No DOM, no chrome
// APIs: panel code renders what these return, and they are unit-tested.
//
// Every timestamp here is the PAGE's `performance.now()` (fire `ts`,
// `lastFire`, snapshot `now`). The panel has its own clock with a different
// origin, so "how long ago" is always `snapshot.now - ts`, never the
// panel's `performance.now()`.

import type {
  ReactiveEdge,
  ReactiveFire,
  ReactiveGraph,
  ReactiveNode,
  ReactiveNodeKind,
  SourceLocation,
  UpdateCause,
} from './types'

export type { ReactiveEdge, ReactiveFire, ReactiveGraph, ReactiveNode } from './types'

/** Size of `@pyreon/reactivity`'s fire ring buffer (`FIRE_CAP`). */
export const FIRE_RING = 512

// ── Names ─────────────────────────────────────────────────────────────

function baseName(file: string): string {
  const clean = file.replace(/[?#].*$/, '')
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}

/**
 * What the panel calls a node. Signals carry the name the compiler
 * injects (`const draft = signal('')` → `draft`); computeds and effects
 * only get a synthetic `derived#12` / `effect#7`, so when the runtime
 * captured where one was created, `Composer.tsx:31` names it far better.
 */
export function displayName(name: string, loc: SourceLocation | undefined): string {
  if (loc && /^(?:signal|derived|effect)#\d+$/.test(name)) return `${baseName(loc.file)}:${loc.line}`
  return name
}

/** The graph with every node renamed by {@link displayName}. */
export function withDisplayNames(graph: ReactiveGraph): ReactiveGraph {
  return {
    nodes: graph.nodes.map((n) => {
      const name = displayName(n.name, n.loc)
      return name === n.name ? n : { ...n, name }
    }),
    edges: graph.edges,
  }
}

// ── Graph ──────────────────────────────────────────────────────────────

export interface PositionedNode extends ReactiveNode {
  /** Left edge. */
  x: number
  /** Top edge. */
  y: number
}

export interface LaidOutGraph {
  nodes: PositionedNode[]
  edges: ReactiveEdge[]
  width: number
  height: number
}

export const NODE_W = 150
export const NODE_H = 30
const COL_X: Record<ReactiveNodeKind, number> = { signal: 40, derived: 300, effect: 560 }
const ROW_H = 46
const PAD_Y = 24

/**
 * Deterministic layered layout: signals in the left column, deriveds in
 * the middle, effects on the right; each column stacked top-down in stable
 * id order, so dependency edges read left → right (source → subscriber).
 */
export function layoutGraph(graph: ReactiveGraph): LaidOutGraph {
  const cols: Record<ReactiveNodeKind, ReactiveNode[]> = { signal: [], derived: [], effect: [] }
  for (const n of graph.nodes) cols[n.kind].push(n)
  const positioned: PositionedNode[] = []
  let maxRows = 0
  for (const k of Object.keys(cols) as ReactiveNodeKind[]) {
    const list = cols[k].sort((a, b) => a.id - b.id)
    maxRows = Math.max(maxRows, list.length)
    list.forEach((n, i) => {
      positioned.push({ ...n, x: COL_X[k], y: PAD_Y + i * ROW_H })
    })
  }
  // Keep only edges whose endpoints are present (a node may have been
  // GC-pruned between the graph walk and now, or capped out of the view).
  const ids = new Set(positioned.map((n) => n.id))
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
  return {
    nodes: positioned,
    edges,
    width: COL_X.effect + NODE_W + 40,
    height: Math.max(PAD_Y * 2 + NODE_H, PAD_Y * 2 + (maxRows - 1) * ROW_H + NODE_H),
  }
}

export interface ScopedGraph {
  graph: ReactiveGraph
  /** Nodes in the scope before the cap was applied. */
  total: number
}

function capGraph(graph: ReactiveGraph, ids: Set<number>): ReactiveGraph {
  return {
    nodes: graph.nodes.filter((n) => ids.has(n.id)),
    edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  }
}

/**
 * The "Everything" scope: every node, capped at `cap` by most fires (ties
 * by id), so a page with 10,000 signals draws a readable graph and says
 * how many it left out.
 */
export function everythingScope(graph: ReactiveGraph, cap: number): ScopedGraph {
  if (graph.nodes.length <= cap) return { graph, total: graph.nodes.length }
  const top = graph.nodes
    .slice()
    .sort((a, b) => b.fires - a.fires || a.id - b.id)
    .slice(0, cap)
  return { graph: capGraph(graph, new Set(top.map((n) => n.id))), total: graph.nodes.length }
}

/**
 * The "Selected" scope: the focus nodes plus everything upstream and
 * downstream of them (breadth-first, so the nearest neighbours survive the
 * cap).
 */
export function selectedScope(
  graph: ReactiveGraph,
  focus: readonly number[],
  cap: number,
): ScopedGraph {
  const present = new Set(graph.nodes.map((n) => n.id))
  const ups = new Map<number, number[]>()
  const downs = new Map<number, number[]>()
  for (const e of graph.edges) {
    const d = downs.get(e.from)
    if (d) d.push(e.to)
    else downs.set(e.from, [e.to])
    const u = ups.get(e.to)
    if (u) u.push(e.from)
    else ups.set(e.to, [e.from])
  }
  const seen = new Set<number>()
  const queue: number[] = []
  for (const id of focus) {
    if (present.has(id) && !seen.has(id)) {
      seen.add(id)
      queue.push(id)
    }
  }
  // Two walks share `seen`: one follows dependencies, one subscribers.
  // Walking both directions from every node would pull in siblings of
  // siblings — the whole connected component — instead of the chain.
  const walk = (start: number[], next: Map<number, number[]>): number[] => {
    const out: number[] = []
    const q = start.slice()
    const local = new Set<number>(start)
    while (q.length > 0) {
      const id = q.shift() as number
      for (const n of next.get(id) ?? []) {
        if (local.has(n) || !present.has(n)) continue
        local.add(n)
        out.push(n)
        q.push(n)
      }
    }
    return out
  }
  const up = walk(queue, ups)
  const down = walk(queue, downs)
  // Interleave so a cap keeps both sides near the focus.
  const ordered: number[] = [...queue]
  for (let i = 0; i < Math.max(up.length, down.length); i++) {
    if (i < up.length) ordered.push(up[i] as number)
    if (i < down.length) ordered.push(down[i] as number)
  }
  const unique = Array.from(new Set(ordered))
  const keep = new Set(unique.slice(0, cap))
  return { graph: capGraph(graph, keep), total: unique.length }
}

/** Ids that fired in the most recent cascade ("fired in the last write"). */
export function lastCascadeIds(fires: readonly ReactiveFire[]): Set<number> {
  const out = new Set<number>()
  if (fires.length === 0) return out
  let latest = -Infinity
  for (const f of fires) if (f.cascade > latest) latest = f.cascade
  for (const f of fires) if (f.cascade === latest) out.add(f.id)
  return out
}

// ── Signals ───────────────────────────────────────────────────────────

/**
 * Rows of the Signals tab: signals and computeds (effects have their own
 * tab), filtered by name, most recently written first, then most written.
 */
export function signalRows(graph: ReactiveGraph, filter = ''): ReactiveNode[] {
  const q = filter.trim().toLowerCase()
  return graph.nodes
    .filter((n) => n.kind !== 'effect' && (!q || n.name.toLowerCase().includes(q)))
    .sort(
      (a, b) =>
        (b.lastFire ?? -Infinity) - (a.lastFire ?? -Infinity) || b.fires - a.fires || a.id - b.id,
    )
}

/** "0.4s ago", "12s ago", "4m ago", "2h ago"; "never" when it never fired. */
export function formatAgo(ts: number | null, now: number): string {
  if (ts === null) return 'never'
  const ms = Math.max(0, now - ts)
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s ago`
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  return `${Math.floor(ms / 3_600_000)}h ago`
}

export interface KindCounts {
  signal: number
  derived: number
  effect: number
}

export function countKinds(graph: ReactiveGraph): KindCounts {
  const c: KindCounts = { signal: 0, derived: 0, effect: 0 }
  for (const n of graph.nodes) c[n.kind]++
  return c
}

// ── Effects ───────────────────────────────────────────────────────────

export interface EffectLane {
  id: number
  name: string
  /** Names of the nodes this effect reads (its dependencies). */
  reads: string[]
  /** Fires since devtools activated. */
  fires: number
  /** Fires inside the window. */
  windowFires: number
  /** Tick positions in [0, 1] across the window, oldest → newest. */
  ticks: number[]
}

export interface EffectLanes {
  lanes: EffectLane[]
  /** Effects that fired inside the window before the cap. */
  total: number
  /** The fire ring was full, so the window may start later than `windowMs`. */
  ringFull: boolean
}

/** One lane per effect that fired in the last `windowMs`, busiest first. */
export function effectLanes(
  graph: ReactiveGraph,
  fires: readonly ReactiveFire[],
  now: number,
  windowMs = 10_000,
  cap = 150,
): EffectLanes {
  const effects = new Map<number, ReactiveNode>()
  const names = new Map<number, string>()
  for (const n of graph.nodes) {
    names.set(n.id, n.name)
    if (n.kind === 'effect') effects.set(n.id, n)
  }
  const start = now - windowMs
  const ticksById = new Map<number, number[]>()
  for (const f of fires) {
    if (f.ts < start || f.ts > now || !effects.has(f.id)) continue
    const pos = (f.ts - start) / windowMs
    const t = ticksById.get(f.id)
    if (t) t.push(pos)
    else ticksById.set(f.id, [pos])
  }
  const reads = new Map<number, string[]>()
  for (const e of graph.edges) {
    if (!ticksById.has(e.to)) continue
    const name = names.get(e.from)
    if (name === undefined) continue
    const r = reads.get(e.to)
    if (r) r.push(name)
    else reads.set(e.to, [name])
  }
  const lanes: EffectLane[] = []
  for (const [id, ticks] of ticksById) {
    const node = effects.get(id) as ReactiveNode
    lanes.push({
      id,
      name: node.name,
      reads: reads.get(id) ?? [],
      fires: node.fires,
      windowFires: ticks.length,
      ticks,
    })
  }
  lanes.sort((a, b) => b.windowFires - a.windowFires || a.id - b.id)
  return { lanes: lanes.slice(0, cap), total: lanes.length, ringFull: fires.length >= FIRE_RING }
}

// ── Profiler ──────────────────────────────────────────────────────────

export interface Batch {
  cascade: number
  /** The node that started the cascade (a signal write, or the first fire). */
  rootId: number
  rootName: string
  rootKind: ReactiveNodeKind
  fires: number
  effectRuns: number
  start: number
  end: number
}

export interface Recorder {
  batches: Batch[]
  /** `ts` of the newest fire already ingested. */
  lastTs: number | null
  /** Times a poll found the ring had wrapped past fires we never saw. */
  gaps: number
}

/** Batches the profiler keeps; the oldest are dropped first. */
export const BATCH_CAP = 1000

export function createRecorder(): Recorder {
  return { batches: [], lastTs: null, gaps: 0 }
}

export interface NodeInfo {
  name: string
  kind: ReactiveNodeKind
}

/**
 * Fold a fresh fire snapshot into the recording (mutates and returns
 * `rec`). Fires already seen (`ts <= lastTs`) are skipped, so overlapping
 * polls never double-count. A full ring whose oldest fire is newer than
 * `lastTs` means fires were evicted before a poll read them; that is
 * counted in `gaps` and shown, never papered over.
 */
export function ingestFires(
  rec: Recorder,
  fires: readonly ReactiveFire[],
  info: (id: number) => NodeInfo | undefined,
): Recorder {
  const since = rec.lastTs
  const fresh = since === null ? fires : fires.filter((f) => f.ts > since)
  if (fresh.length === 0) return rec
  if (since !== null && fires.length >= FIRE_RING && (fires[0] as ReactiveFire).ts > since) {
    rec.gaps++
  }
  // Only the newest batches can still grow (an effect in a later task
  // inherits the open cascade stamp), so only those are indexed.
  const open = new Map<number, Batch>()
  for (let i = Math.max(0, rec.batches.length - 8); i < rec.batches.length; i++) {
    const b = rec.batches[i] as Batch
    open.set(b.cascade, b)
  }
  for (const f of fresh) {
    const meta = info(f.id)
    const kind = meta?.kind ?? 'effect'
    let b = open.get(f.cascade)
    if (!b) {
      b = {
        cascade: f.cascade,
        rootId: f.id,
        rootName: meta?.name ?? `#${f.id}`,
        rootKind: kind,
        fires: 0,
        effectRuns: 0,
        start: f.ts,
        end: f.ts,
      }
      open.set(f.cascade, b)
      rec.batches.push(b)
    }
    b.fires++
    if (kind === 'effect') b.effectRuns++
    if (f.ts > b.end) b.end = f.ts
    if (rec.lastTs === null || f.ts > rec.lastTs) rec.lastTs = f.ts
  }
  if (rec.batches.length > BATCH_CAP) rec.batches.splice(0, rec.batches.length - BATCH_CAP)
  return rec
}

export interface ProfilerSummary {
  updates: number
  fires: number
  effectRuns: number
  /** Longest first-to-last-fire span of one batch, in ms. */
  longest: number
}

export function summarize(batches: readonly Batch[]): ProfilerSummary {
  let fires = 0
  let effectRuns = 0
  let longest = 0
  for (const b of batches) {
    fires += b.fires
    effectRuns += b.effectRuns
    longest = Math.max(longest, b.end - b.start)
  }
  return { updates: batches.length, fires, effectRuns, longest }
}

/** A batch span; below the page clock's usual 0.1 ms resolution it reads "< 0.1 ms". */
export function formatSpan(ms: number): string {
  return ms < 0.1 ? '< 0.1 ms' : `${ms.toFixed(2)} ms`
}

/** "draft changed · 3 fires" — what a profiler row says about its batch. */
export function batchLabel(b: Batch): string {
  const verb = b.rootKind === 'signal' ? 'changed' : b.rootKind === 'derived' ? 'recomputed' : 'ran'
  return `${b.rootName} ${verb} · ${b.fires} fire${b.fires === 1 ? '' : 's'}`
}

// ── Why did this update? ─────────────────────────────────────────────

export const CAUSE_VERB: Record<ReactiveNodeKind, string> = {
  signal: 'changed',
  derived: 'recomputed',
  effect: 'ran',
}

export interface CauseStep {
  name: string
  kind: ReactiveNodeKind
  verb: string
  /** `file.tsx:18` — the file's base name, without a query string. */
  where: string | null
}

export interface CauseView {
  steps: CauseStep[]
  /** The target itself was written directly (no upstream fire). */
  direct: boolean
  /** Older fires left the ring buffer, so the chain may start later than the real root. */
  truncated: boolean
}

/** Root-first steps of an update cause, ending with the target. */
export function causeView(cause: UpdateCause): CauseView {
  const steps: CauseStep[] = [...cause.chain, cause.target].map((l) => {
    const name = displayName(l.name, l.loc)
    return {
      name,
      kind: l.kind,
      verb: CAUSE_VERB[l.kind],
      // A node already named by its location does not repeat it.
      where: l.loc && name === l.name ? `${baseName(l.loc.file)}:${l.loc.line}` : null,
    }
  })
  return { steps, direct: cause.chain.length === 0, truncated: !cause.rootReached }
}

/** Plain-text form, e.g. `draft changed → isValid recomputed → submit ran`. */
export function causeText(cause: UpdateCause): string {
  const v = causeView(cause)
  const line = v.steps.map((s) => `${s.name} ${s.verb}`).join(' → ')
  return v.truncated ? `… → ${line}` : line
}
