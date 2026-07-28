/**
 * "Why did this update?" — the pure half.
 *
 * React DevTools can tell you a COMPONENT re-rendered. It cannot name the piece
 * of state responsible, because in React the unit of update IS the component.
 * Pyreon's unit is a signal, and the framework records the dependency graph and
 * the fires, so the answer is an exact chain: this signal changed → that
 * computed re-derived → this effect ran → the DOM you are looking at changed.
 *
 * Two things make this more than a debugging toy:
 *
 *   - it is the inverse of the question a React developer can ask, so it is the
 *     fastest way to TEACH fine-grained reactivity — you can point at a chain
 *     instead of describing one
 *   - a chain that is longer than expected, or rooted somewhere surprising, is
 *     the over-rendering bug made visible
 *
 * The reconstruction lives in `@pyreon/reactivity` (`getUpdateCause`); this
 * module only decides what an operator needs to READ, and is pure so those
 * decisions are testable without a DOM.
 */
import {
  activateReactiveDevtools,
  formatUpdateCause,
  getReactiveFires,
  getReactiveGraph,
  getUpdateCause,
  type UpdateCause,
} from '@pyreon/reactivity'

/** One rendered step of the chain. */
export interface CauseStep {
  id: number
  kind: 'signal' | 'derived' | 'effect'
  name: string
  /** `file:line` when the creation site is known */
  where: string
  /** How this step relates to the previous one, in words. */
  relation: string
  /** True for the node the question was asked about. */
  isTarget: boolean
}

function where(loc: { file?: string; line?: number } | undefined): string {
  if (!loc?.file) return ''
  const file = loc.file.split('/').slice(-2).join('/')
  return loc.line ? `${file}:${loc.line}` : file
}

const RELATION: Record<CauseStep['kind'], string> = {
  signal: 'changed',
  derived: 're-derived',
  effect: 'ran',
}

/**
 * Render a cause as ROOT-FIRST steps, target last.
 *
 * Root-first matters: the reader wants the origin, and reading a chain
 * backwards from the symptom is the harder direction for the thing this is
 * meant to teach.
 */
export function causeSteps(cause: UpdateCause): CauseStep[] {
  const steps: CauseStep[] = cause.chain.map((link) => ({
    id: link.id,
    kind: link.kind,
    name: link.name || `#${link.id}`,
    where: where(link.loc),
    relation: RELATION[link.kind],
    isTarget: false,
  }))
  steps.push({
    id: cause.target.id,
    kind: cause.target.kind,
    name: cause.target.name || `#${cause.target.id}`,
    where: where(cause.target.loc),
    relation: RELATION[cause.target.kind],
    isTarget: true,
  })
  return steps
}

/**
 * A one-line summary an operator reads before the steps.
 *
 * `rootReached: false` is stated rather than hidden: the fire ring buffer is
 * bounded, so an older origin can age out, and a chain presented as complete
 * when it is truncated would be a small lie in exactly the place someone is
 * trying to reason carefully.
 */
export function causeSummary(cause: UpdateCause): string {
  const target = cause.target.name || `#${cause.target.id}`
  if (cause.chain.length === 0) {
    return `${target} IS the origin — it was set directly, not by another node.`
  }
  const root = cause.chain[0]!
  const rootName = root.name || `#${root.id}`
  const hops = cause.chain.length
  const truncated = cause.rootReached ? '' : ' (chain truncated — older fires aged out)'
  return `${target} updated because ${rootName} changed, ${hops} hop${hops === 1 ? '' : 's'} away${truncated}.`
}

/** The nodes worth offering as "explain this one" — most recently fired first. */
export interface CauseCandidate {
  id: number
  kind: 'signal' | 'derived' | 'effect'
  name: string
  fires: number
}

export function recentCandidates(limit = 12): CauseCandidate[] {
  // The bridge records nothing until a client attaches, and this panel IS the
  // client. Reading the graph alone does NOT activate it — measured: a signal
  // created and written before activation never appears — so a panel that only
  // read would show an empty list forever and look broken rather than idle.
  // The call is idempotent.
  activateReactiveDevtools()
  const graph = getReactiveGraph()
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const seen = new Set<number>()
  const out: CauseCandidate[] = []
  // `getReactiveFires` is oldest-first; walk backwards so the newest activity —
  // which is what the operator just caused — is offered first.
  const fires = getReactiveFires()
  for (let i = fires.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const id = fires[i]!.id
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (!node) continue
    out.push({ id: node.id, kind: node.kind, name: node.name || `#${node.id}`, fires: node.fires })
  }
  return out
}

/** Explain one node, or `null` when there is nothing recorded to explain. */
export function explain(nodeId: number): UpdateCause | null {
  return getUpdateCause(nodeId)
}

/** The framework's own text rendering, kept available for copy-paste into an issue. */
export function explainText(cause: UpdateCause): string {
  return formatUpdateCause(cause)
}
