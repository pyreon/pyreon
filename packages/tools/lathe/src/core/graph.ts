/**
 * The model dependency graph.
 *
 * Generated schemas are `const` declarations, and `const` is NOT hoisted -- so
 * `export const Alpha = s.object({ z: Zulu })` emitted before `Zulu` throws
 * `ReferenceError: Cannot access 'Zulu' before initialization` the moment the
 * module is imported. Declaration ORDER is therefore a correctness property,
 * not a formatting one, and alphabetical order gets it right only by luck.
 *
 * A genuine `$ref` cycle (a comment with replies, a tree node with children)
 * cannot be ordered at all. Those edges are reported so an emitter can break
 * them deliberately: `s.lazy(() => X)` on the web, and a NOTE on the native
 * path, where `s.lazy` does not lower.
 */

import type { IrDocument, IrType } from './ir'

/**
 * Per-document memo for the two whole-graph passes below.
 *
 * `topoSortModels` and `modelDependencies` were computed three to four times
 * per generation -- once per emitter that needs an order (schemas, types,
 * faker, native modules) and again per tag in `reachableModels`. Keyed WEAKLY
 * on the document, so a cached graph dies with the document it describes.
 *
 * A cached entry is only served while the document still has the SAME model
 * array and every model the SAME type object. The IR is built once and never
 * mutated by the pipeline, but it is plain data and a caller (a test, a
 * plugin) may reassign a model's type; comparing identities is O(models) and
 * turns that into a recompute rather than a stale answer.
 */
interface GraphMemo {
  models: IrDocument['models']
  types: IrType[]
  deps?: Map<string, Set<string>>
  order?: ModelOrder
}
const memo = new WeakMap<IrDocument, GraphMemo>()

function memoFor(doc: IrDocument): GraphMemo {
  const hit = memo.get(doc)
  if (
    hit &&
    hit.models === doc.models &&
    hit.types.length === doc.models.length &&
    doc.models.every((m, i) => m.type === hit.types[i])
  ) {
    return hit
  }
  const fresh: GraphMemo = { models: doc.models, types: doc.models.map((m) => m.type) }
  memo.set(doc, fresh)
  return fresh
}

/**
 * Model names each model references, directly, in a deterministic order.
 *
 * Memoized per document (see {@link memoFor}); callers must treat the result
 * as read-only.
 */
export function modelDependencies(doc: IrDocument): Map<string, Set<string>> {
  const m = memoFor(doc)
  m.deps ??= computeDependencies(doc)
  return m.deps
}

function computeDependencies(doc: IrDocument): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const known = new Set(doc.models.map((m) => m.name))
  for (const model of doc.models) {
    const deps = new Set<string>()
    collect(model.type, deps, known)
    // A SELF-reference is kept. It is a cycle like any other -- a tree node
    // with children, a comment with replies -- and must be reported as a back
    // edge so the emitter defers it. Dropping it here (to keep the sort tidy)
    // made the single most common cyclic shape in real specs invisible.
    // The DFS handles it naturally: the target is already ON_PATH.
    out.set(model.name, deps)
  }
  return out
}

function collect(type: IrType | undefined, into: Set<string>, known: Set<string>): void {
  if (!type) return
  switch (type.kind) {
    case 'ref':
      if (known.has(type.name)) into.add(type.name)
      return
    case 'array':
      collect(type.items, into, known)
      return
    case 'union':
      for (const o of type.options) collect(o, into, known)
      return
    case 'object':
      for (const f of type.fields) collect(f.type, into, known)
      collect(type.additional, into, known)
      return
    default:
  }
}

export interface ModelOrder {
  /** Model names, dependencies first. Safe to emit as `const` in this order. */
  order: string[]
  /**
   * Edges that had to be broken to produce an order, keyed `from|to`.
   *
   * An emitter must render these lazily, or decline the model. The field whose
   * target is listed for its owner is the one to defer; deferring the whole
   * model would be correct too but needlessly pessimistic.
   */
  backEdges: Set<string>
  /** Whether the graph contained any cycle at all. */
  hasCycle: boolean
}

/** Key for {@link ModelOrder.backEdges}. */
export function edgeKey(from: string, to: string): string {
  return `${from}|${to}`
}

/**
 * Topologically order models, dependencies first.
 *
 * An iterative DFS rather than a recursive one: a spec is user input and a deep
 * chain must not blow the JS stack. Ties break by NAME so the emitted order is
 * stable across runs; an unstable order makes every regeneration an
 * unreviewable diff.
 */
export function topoSortModels(doc: IrDocument): ModelOrder {
  const m = memoFor(doc)
  m.order ??= computeOrder(modelDependencies(doc))
  return m.order
}

function computeOrder(deps: Map<string, Set<string>>): ModelOrder {
  const names = [...deps.keys()].sort()
  const order: string[] = []
  const backEdges = new Set<string>()
  const UNVISITED = 0
  const ON_PATH = 1
  const DONE = 2
  const state = new Map<string, number>(names.map((n) => [n, UNVISITED]))

  for (const root of names) {
    if (state.get(root) !== UNVISITED) continue
    const stack: { name: string; deps: string[]; i: number }[] = [
      { name: root, deps: [...(deps.get(root) ?? [])].sort(), i: 0 },
    ]
    state.set(root, ON_PATH)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { name: string; deps: string[]; i: number }
      if (frame.i >= frame.deps.length) {
        state.set(frame.name, DONE)
        order.push(frame.name)
        stack.pop()
        continue
      }
      const next = frame.deps[frame.i++] as string
      const st = state.get(next)
      if (st === DONE) continue
      if (st === ON_PATH) {
        backEdges.add(edgeKey(frame.name, next))
        continue
      }
      state.set(next, ON_PATH)
      stack.push({ name: next, deps: [...(deps.get(next) ?? [])].sort(), i: 0 })
    }
  }
  return { order, backEdges, hasCycle: backEdges.size > 0 }
}

/**
 * Every model reachable from `roots`, including `roots`.
 *
 * A native module INLINES its schemas rather than importing them, so it must
 * carry the transitive closure: inlining `Order` while leaving out the
 * `Customer` it references emits a module that does not even typecheck.
 */
export function reachableModels(doc: IrDocument, roots: Iterable<string>): Set<string> {
  const deps = modelDependencies(doc)
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.pop() as string
    if (seen.has(name)) continue
    seen.add(name)
    for (const d of deps.get(name) ?? []) if (!seen.has(d)) queue.push(d)
  }
  return seen
}

/**
 * The refs a back edge set DEFERS for one model -- the targets it must render
 * lazily. Keyed off {@link edgeKey}, so no caller re-derives the key format.
 *
 * Re-deriving it is how the faker plugin shipped a recursion notice that never
 * fired: it split keys on `'->'` while {@link edgeKey} joined them with `'|'`,
 * so every "back edge" parsed as one unknown name.
 */
export function deferredTargets(backEdges: ReadonlySet<string>, from: string): Set<string> {
  const prefix = edgeKey(from, '')
  const out = new Set<string>()
  for (const e of backEdges) if (e.startsWith(prefix)) out.add(e.slice(prefix.length))
  return out
}

/**
 * Strongly-connected components of a dependency graph, as `name -> component`.
 *
 * Two models share a component exactly when each can reach the other, which is
 * the question every "does expanding this recurse?" check is really asking: a
 * field of `self` that references `R` recurses iff `R` is `self` or `R` can
 * reach `self` -- and since `self -> R` is an edge, that is `R` sharing
 * `self`'s component. One linear pass (Tarjan's algorithm) answers it for every
 * field of every model, where a walk per field is quadratic-to-cubic on a
 * spec with a large cycle (Stripe's `expandable` graph is one).
 *
 * Iterative for the same reason as {@link topoSortModels}: a spec is user
 * input and a deep chain must not exhaust the JS stack. Edges to names absent
 * from `deps` are ignored. Component ids are arbitrary; compare them, never
 * persist or print them.
 */
export function stronglyConnected(deps: ReadonlyMap<string, ReadonlySet<string>>): Map<string, number> {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const out = new Map<string, number>()
  let next = 0
  let component = 0
  for (const root of deps.keys()) {
    if (index.has(root)) continue
    const work: { name: string; it: Iterator<string> }[] = []
    const enter = (name: string): void => {
      index.set(name, next)
      low.set(name, next)
      next++
      stack.push(name)
      onStack.add(name)
      work.push({ name, it: (deps.get(name) ?? new Set<string>()).values() })
    }
    enter(root)
    while (work.length > 0) {
      const frame = work[work.length - 1] as { name: string; it: Iterator<string> }
      const step = frame.it.next()
      if (!step.done) {
        const w = step.value
        if (!deps.has(w)) continue
        if (!index.has(w)) enter(w)
        else if (onStack.has(w)) low.set(frame.name, Math.min(low.get(frame.name) as number, index.get(w) as number))
        continue
      }
      work.pop()
      const parent = work[work.length - 1]
      if (parent) low.set(parent.name, Math.min(low.get(parent.name) as number, low.get(frame.name) as number))
      if (low.get(frame.name) === index.get(frame.name)) {
        let w: string
        do {
          w = stack.pop() as string
          onStack.delete(w)
          out.set(w, component)
        } while (w !== frame.name)
        component++
      }
    }
  }
  return out
}

/**
 * Models that can reach THEMSELVES -- a member of a multi-model component, or a
 * model with a self-edge. Exactly the set whose expansion recurses.
 */
export function cyclicModels(deps: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const scc = stronglyConnected(deps)
  const size = new Map<number, number>()
  for (const c of scc.values()) size.set(c, (size.get(c) ?? 0) + 1)
  const out = new Set<string>()
  for (const [name, c] of scc) {
    if ((size.get(c) ?? 0) > 1 || deps.get(name)?.has(name) === true) out.add(name)
  }
  return out
}
