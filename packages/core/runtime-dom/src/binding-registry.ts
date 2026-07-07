/**
 * DOM ↔ reactive-node correlation registry (dev/test only).
 *
 * Fine-grained reactivity binds a *text node* to the signal / computed whose
 * value it displays (`_bindText`). This registry records that link so devtools
 * can answer the inverse question a user actually asks — "I see a wrong value
 * on screen; which signal is behind it?" — by mapping a clicked element back to
 * the reactive nodes driving its text.
 *
 * **Exact, not heuristic.** The tag is captured at bind time in `_bindText`'s
 * fast path, where both the text node AND the source signal (with its graph
 * node id) are in scope — so the correlation is precise, never guessed.
 *
 * **Dev-only.** `_tagTextBinding` is only ever called behind `_bindText`'s
 * `process.env.NODE_ENV !== 'production'` gate, so the whole registry
 * tree-shakes out of production builds — nothing is tagged, and
 * `nodesForElement` returns `[]`.
 *
 * **Scope (v1):** text bindings only — the dominant "displayed value" case.
 * Attribute / class / style bindings (`_bindDirect` / `renderEffect`) don't see
 * their owner element (it's captured inside an updater closure), so they're not
 * correlated here; that would need a compiler-emitted owner-element arg (a
 * larger, separate change). Multi-signal text expressions that lower to a
 * `renderEffect` fallback (no single source) are likewise not tagged.
 */
import { activateReactiveDevtools, getReactiveGraph, type ReactiveNodeKind } from '@pyreon/reactivity'

// Text node → the reactive node id (signal/computed) whose value it displays.
// WeakMap keys are never retained, so an unmounted node's tag is GC-collectable.
const _textBindings = new WeakMap<Node, number>()

/**
 * Record that `node`'s text is driven by the reactive node `sourceId`. Called
 * by `_bindText` in dev only.
 *
 * @internal
 */
export function _tagTextBinding(node: Node, sourceId: number): void {
  _textBindings.set(node, sourceId)
}

export interface BoundReactiveNode {
  /** Reactive graph node id (correlate with `getReactiveGraph()` / `getUpdateCause`). */
  id: number
  /** The signal `.label` or a synthetic name (`derived#12`). */
  name: string
  kind: ReactiveNodeKind
  /** The text node whose `.data` this reactive value drives. */
  node: Text
}

/**
 * The signals / computeds whose values are displayed as text inside `el` (walks
 * `el`'s descendant text nodes tagged by `_bindText` and resolves each to its
 * live graph node). Deduped by node id, in document order.
 *
 * Reading the graph auto-activates reactive tracking, so this works even if the
 * app never called `activateReactiveDevtools()`. Dev/test only — returns `[]`
 * in production (nothing is ever tagged) and when `el` has no DOM document.
 */
export function nodesForElement(el: Element): BoundReactiveNode[] {
  const doc = el.ownerDocument
  if (!doc || typeof doc.createTreeWalker !== 'function') return []
  activateReactiveDevtools()
  const byId = new Map(getReactiveGraph().nodes.map((n) => [n.id, n]))
  const out: BoundReactiveNode[] = []
  const seen = new Set<number>()
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    const id = _textBindings.get(cur)
    if (id === undefined || seen.has(id)) continue
    const graphNode = byId.get(id)
    if (!graphNode) continue
    seen.add(id)
    out.push({ id, name: graphNode.name, kind: graphNode.kind, node: cur as Text })
  }
  return out
}
