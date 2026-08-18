/**
 * Pyreon's deep-tree component — own `.tsx` so the Pyreon compiler processes it
 * (same reason as `scenario-dbmon-pyreon.tsx`).
 *
 * `createReactiveContext` is the documented Pyreon API for a context value that
 * CHANGES (`createContext`'s JSDoc points at it explicitly — "use
 * `createReactiveContext` when the value is meant to change"), so it is the
 * idiomatic path, not a bench-only construction.
 *
 * `props.depth` is a plain constant, not a signal — the structural branch that
 * decides leaf-vs-branch runs ONCE at setup, which is correct in a
 * components-run-once framework. (The documented anti-pattern is an early
 * return on a SIGNAL condition; this is not that.)
 */
import { createReactiveContext, provide, useContext } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

export const PyreonDeepCtx = createReactiveContext<string>('')

export function PyreonNode(props: { depth: number }): VNodeChild {
  if (props.depth <= 1) {
    // Only leaves consume the context. The accessor is read inside a binding,
    // so the update path is a single text write per leaf.
    const get = useContext(PyreonDeepCtx)
    return <span class="leaf">{() => get()}</span>
  }
  return (
    <div class="branch">
      <PyreonNode depth={props.depth - 1} />
      <PyreonNode depth={props.depth - 1} />
    </div>
  )
}

export function PyreonDeepTree(props: { depth: number; value: () => string }) {
  provide(PyreonDeepCtx, props.value)
  return (
    <div class="tree-root">
      <PyreonNode depth={props.depth} />
    </div>
  )
}
