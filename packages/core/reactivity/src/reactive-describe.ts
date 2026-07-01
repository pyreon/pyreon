/**
 * Auto-generated behavioral description of a reactive graph.
 *
 * `getReactiveGraph()` gives nodes + dependency edges; `describeReactiveGraph`
 * turns that into an English behavioral summary — what a change to each signal
 * actually DOES ("changing `qty` re-derives 1 value and runs 1 effect") — plus
 * health insights that only the graph can surface: orphan signals nothing
 * reacts to, hot signals with large effect fan-out, and deep dependency chains.
 * No framework auto-generates behavioral (not API) docs from the reactive graph;
 * Pyreon can because it holds the precise graph.
 *
 * Pure + deterministic over the graph snapshot. Dev/test only (the registry is
 * tree-shaken in production, so an unactivated graph yields an empty summary).
 */

import {
  getReactiveGraph,
  type ReactiveGraph,
  type ReactiveNodeKind,
  type SourceLocation,
} from './reactive-devtools'

export type GraphInsightKind = 'orphan-signal' | 'high-fanout' | 'deep-chain'

/** A behavioral smell surfaced from the graph shape. */
export interface GraphInsight {
  kind: GraphInsightKind
  nodeId: number
  name: string
  detail: string
}

/** One node's English behavioral one-liner. */
export interface NodeDescription {
  id: number
  kind: ReactiveNodeKind
  name: string
  loc?: SourceLocation
  behavior: string
}

export interface GraphDescription {
  summary: { signals: number; derived: number; effects: number; edges: number }
  nodes: NodeDescription[]
  insights: GraphInsight[]
}

/** Fan-out (reached effects) at/above which a signal is called "hot". */
const HOT_FANOUT = 8
/** Dependency-chain depth at/above which a node is flagged "deep". */
const DEEP_CHAIN = 5

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function namesOrCount(names: string[], max = 3): string {
  if (names.length === 0) return 'nothing'
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} +${names.length - max} more`
}

/**
 * Describe the behaviour of a reactive graph. Pass a snapshot or let it read
 * the live `getReactiveGraph()`.
 */
export function describeReactiveGraph(graph: ReactiveGraph = getReactiveGraph()): GraphDescription {
  const { nodes, edges } = graph
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // Adjacency: down[id] = subscribers (edge from→to), up[id] = dependencies.
  const down = new Map<number, number[]>()
  const up = new Map<number, number[]>()
  const pushInto = (m: Map<number, number[]>, key: number, val: number): void => {
    const arr = m.get(key)
    if (arr) arr.push(val)
    else m.set(key, [val])
  }
  for (const e of edges) {
    pushInto(down, e.from, e.to)
    pushInto(up, e.to, e.from)
  }

  // Downstream closure from a node → the derived + effect ids it can reach.
  const closure = (id: number): { derived: number[]; effects: number[] } => {
    const derived: number[] = []
    const effects: number[] = []
    const seen = new Set<number>([id])
    const stack = [...(down.get(id) ?? [])]
    while (stack.length > 0) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      const n = nodeById.get(cur)
      if (n?.kind === 'derived') derived.push(cur)
      else if (n?.kind === 'effect') effects.push(cur)
      for (const nxt of down.get(cur) ?? []) if (!seen.has(nxt)) stack.push(nxt)
    }
    return { derived, effects }
  }

  // Longest upstream depth (dependency-chain length ending at this node).
  const depthCache = new Map<number, number>()
  const depth = (id: number, path = new Set<number>()): number => {
    if (depthCache.has(id)) return depthCache.get(id)!
    if (path.has(id)) return 0 // cycle guard
    path.add(id)
    let best = 0
    for (const dep of up.get(id) ?? []) best = Math.max(best, depth(dep, path) + 1)
    path.delete(id)
    depthCache.set(id, best)
    return best
  }

  const nodeDescs: NodeDescription[] = []
  const insights: GraphInsight[] = []
  const counts = { signals: 0, derived: 0, effects: 0 }

  for (const n of nodes) {
    if (n.kind === 'signal') counts.signals++
    else if (n.kind === 'derived') counts.derived++
    else counts.effects++

    let behavior: string
    if (n.kind === 'signal') {
      const { derived, effects } = closure(n.id)
      if (derived.length === 0 && effects.length === 0) {
        behavior = 'nothing reacts to it (no dependents)'
        insights.push({
          kind: 'orphan-signal',
          nodeId: n.id,
          name: n.name,
          detail: `nothing depends on \`${n.name}\` — dead reactivity or an unused signal`,
        })
      } else {
        const parts: string[] = []
        if (derived.length > 0) parts.push(`re-derives ${pluralize(derived.length, 'value')}`)
        if (effects.length > 0) parts.push(`runs ${pluralize(effects.length, 'effect')}`)
        behavior = `changing it ${parts.join(' and ')}`
        if (effects.length >= HOT_FANOUT) {
          insights.push({
            kind: 'high-fanout',
            nodeId: n.id,
            name: n.name,
            detail: `changing \`${n.name}\` re-runs ${effects.length} effects — a hot signal; verify each is necessary`,
          })
        }
      }
    } else {
      // derived / effect — describe what it reacts to
      const depNames = (up.get(n.id) ?? [])
        .map((d) => nodeById.get(d)?.name)
        .filter((x): x is string => !!x)
      const verb = n.kind === 'derived' ? 'recomputes' : 'runs'
      behavior =
        depNames.length > 0
          ? `${verb} when ${namesOrCount(depNames)} change${depNames.length === 1 ? 's' : ''}`
          : `${verb} once (no reactive dependencies)`
      const d = depth(n.id)
      if (d >= DEEP_CHAIN) {
        insights.push({
          kind: 'deep-chain',
          nodeId: n.id,
          name: n.name,
          detail: `\`${n.name}\` sits at the end of a ${d}-deep dependency chain`,
        })
      }
    }

    nodeDescs.push({
      id: n.id,
      kind: n.kind,
      name: n.name,
      ...(n.loc ? { loc: n.loc } : {}),
      behavior,
    })
  }

  return {
    summary: {
      signals: counts.signals,
      derived: counts.derived,
      effects: counts.effects,
      edges: edges.length,
    },
    nodes: nodeDescs,
    insights,
  }
}

function locText(loc: SourceLocation | undefined): string {
  return loc ? `  ${loc.file}:${loc.line}:${loc.col}` : ''
}

/** Render a {@link GraphDescription} as a human-readable text block. */
export function formatGraphDescription(desc: GraphDescription): string {
  const { summary } = desc
  const lines: string[] = [
    `Reactive graph — ${pluralize(summary.signals, 'signal')} · ${pluralize(
      summary.derived,
      'derived',
    )} · ${pluralize(summary.effects, 'effect')} · ${pluralize(summary.edges, 'edge')}`,
  ]

  const byKind = (k: ReactiveNodeKind) => desc.nodes.filter((n) => n.kind === k)
  const section = (label: string, k: ReactiveNodeKind) => {
    const ns = byKind(k)
    if (ns.length === 0) return
    lines.push('', `${label}:`)
    for (const n of ns) lines.push(`  ${n.name.padEnd(14)} ${n.behavior}${locText(n.loc)}`)
  }
  section('Signals', 'signal')
  section('Derived', 'derived')
  section('Effects', 'effect')

  if (desc.insights.length > 0) {
    lines.push('', `Insights (${desc.insights.length}):`)
    for (const i of desc.insights) lines.push(`  ⚠ ${i.kind.padEnd(12)} ${i.detail}`)
  }

  return lines.join('\n')
}
