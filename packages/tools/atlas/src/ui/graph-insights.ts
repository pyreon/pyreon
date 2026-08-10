/**
 * Reactive-graph health — the smells in a component's graph SHAPE.
 *
 * `describeReactiveGraph` already derives three behavioural smells from the
 * live graph. This shapes them for the panel and says plainly what each one
 * means, because the kind alone (`high-fanout`) is a label, not a diagnosis.
 *
 * ── Why rows and not a diagram ────────────────────────────────────────────
 *
 * The roadmap (#2517 §3) asked for the graph rendered as a diagram via
 * `@pyreon/flow`. The diagnostic value is in the INSIGHTS — one signal driving
 * forty effects, a chain deep enough to cost a frame, state nothing reads —
 * and those are three rows. A diagram of a healthy graph is a picture of
 * nothing wrong, at several times the cost, and on a real component the node
 * count makes it unreadable exactly when it matters. Rows first; the diagram
 * remains a separate, honest question rather than a hidden prerequisite.
 *
 * Kept DOM-free and pure so the shaping is testable without mounting anything.
 */
import {
  describeReactiveGraph,
  getReactiveGraph,
  type GraphInsight,
  type GraphInsightKind,
} from '@pyreon/reactivity'

/** One insight as the panel renders it. */
export interface InsightRow {
  kind: GraphInsightKind
  /** The node's name, or a stable placeholder — never an empty cell. */
  name: string
  /** The library's own detail line. */
  detail: string
  /** What this smell COSTS, in the reader's terms. */
  meaning: string
  /** Ordering weight; lower sorts first. */
  weight: number
}

/**
 * What each smell actually costs.
 *
 * Written as consequences rather than definitions. "high-fanout: many
 * subscribers" restates the label; "one write repaints 40 places" is the thing
 * a reader can act on.
 */
const MEANING: Record<GraphInsightKind, string> = {
  'orphan-signal':
    'state nothing reads — either dead, or a read that was severed and now silently never updates',
  'high-fanout': 'one write drives many subscribers — the accidental-repaint shape',
  'deep-chain':
    'a long derived chain — every write walks all of it, and a glitch anywhere shows up at the end',
}

/**
 * Severity order.
 *
 * `orphan-signal` first because it is the only one that is usually a BUG
 * rather than a cost: a severed read looks identical to dead state from the
 * graph, and the severed case is the "UI silently never updates" class. The
 * other two are shapes worth knowing about, which a healthy component can
 * legitimately have.
 */
const WEIGHT: Record<GraphInsightKind, number> = {
  'orphan-signal': 0,
  'high-fanout': 1,
  'deep-chain': 2,
}

/** Shape the library's insights into rows, most actionable first. */
export function insightRows(insights: readonly GraphInsight[]): InsightRow[] {
  return insights
    .map((i) => ({
      kind: i.kind,
      // A node with no name is normal (an anonymous computed), and an empty
      // cell reads as a rendering bug rather than as an unnamed node.
      name: i.name && i.name.length > 0 ? i.name : `#${i.nodeId}`,
      detail: i.detail,
      meaning: MEANING[i.kind] ?? '',
      weight: WEIGHT[i.kind] ?? 9,
    }))
    .sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name))
}

/**
 * A one-line verdict for the panel header.
 *
 * Leads with the count that should be acted on. A bare total invites ignoring
 * the panel — the same reasoning as the Lens summary.
 */
export function insightSummary(rows: readonly InsightRow[]): string {
  if (rows.length === 0) return 'No shape smells — no orphan state, no accidental fan-out, no deep chains.'
  const orphans = rows.filter((r) => r.kind === 'orphan-signal').length
  const rest = rows.length - orphans
  if (orphans === 0) return `${rest} shape note${rest === 1 ? '' : 's'} — costs, not bugs.`
  return (
    `${orphans} orphan signal${orphans === 1 ? '' : 's'}` +
    (rest > 0 ? ` · ${rest} shape note${rest === 1 ? '' : 's'}` : '') +
    ' — an orphan is either dead state or a severed read.'
  )
}

/**
 * A scoped reading of the graph — the COMPONENT's nodes, not the page's.
 *
 * This is the whole correctness of the panel. The workbench and the preview
 * share ONE reactivity instance (which is why this can be a client-side panel
 * at all), so `describeReactiveGraph()` describes Atlas's own chrome as
 * readily as the component under inspection — every signal in the sidebar,
 * the theme, the search box. Reporting those as the component's smells would
 * be worse than reporting nothing: confidently wrong, about someone else's
 * code, with no way for the reader to tell.
 *
 * Scoped by the same means coverage uses — a baseline taken before the
 * component mounts, and only nodes that appeared after it counted. Edges are
 * filtered to those with BOTH ends in scope, so a chrome signal feeding a
 * component effect does not import the chrome half of the pair.
 */
export interface InsightSession {
  /** Snapshot the current node ids as "not ours". */
  baseline(): void
  /** Insights for nodes that appeared since the baseline. */
  sample(): InsightRow[]
}

export function createInsightSession(): InsightSession {
  let before = new Set<number>()
  return {
    baseline() {
      before = new Set(getReactiveGraph().nodes.map((n) => n.id))
    },
    sample() {
      const graph = getReactiveGraph()
      const nodes = graph.nodes.filter((n) => !before.has(n.id))
      const ours = new Set(nodes.map((n) => n.id))
      const edges = graph.edges.filter((e) => ours.has(e.from) && ours.has(e.to))
      return insightRows(describeReactiveGraph({ nodes, edges }).insights)
    },
  }
}

/**
 * Unscoped read — the WHOLE page graph.
 *
 * Exported for a host that owns the page outright (a standalone embed with no
 * workbench chrome). Inside Atlas, use `createInsightSession`: see above for
 * why an unscoped read attributes Atlas's own graph to the component.
 */
export function readInsights(): InsightRow[] {
  return insightRows(describeReactiveGraph().insights)
}

/**
 * Whether a graph exists to describe.
 *
 * The dev gate itself, not a node count: nodes register only once tracking is
 * active, so a count of 0 is normal in a healthy dev build before anything has
 * run — reporting "unavailable" then would be wrong for every user who has not
 * interacted yet. Same predicate, and same reasoning, as coverage.
 */
export function areInsightsAvailable(): boolean {
  return process.env.NODE_ENV !== 'production'
}
