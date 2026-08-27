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

/** Model names each model references, directly, in a deterministic order. */
export function modelDependencies(doc: IrDocument): Map<string, Set<string>> {
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
  const deps = modelDependencies(doc)
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
