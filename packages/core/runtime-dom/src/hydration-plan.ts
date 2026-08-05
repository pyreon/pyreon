/**
 * Row-plan replay hydration — the interpretive-dispatch killer for keyed
 * `<For>` adoption (see hydrate.ts `tryAdoptSsrRows`).
 *
 * A `<For>`'s rows are structurally identical: the same renderItem produces
 * the same vnode SHAPE for every row, differing only in leaf values and the
 * closures they capture. The interpretive walk (hydrateChild → hydrateVNode →
 * hydrateElement per node) therefore re-derives the same decisions N times —
 * measured at ~240ns/node of pure dispatch on a 1,000-row table, the entire
 * residual gap to the fastest hydrator in the cross-framework bench.
 *
 * Strategy (the tryContiguousRemoval philosophy — strict happy path, bail to
 * the general machinery on ANY doubt):
 *
 *  1. RECORD: hydrate row 0 through the normal interpretive walk, with a
 *     recorder capturing each action as a STEP: the DOM location (child-hop
 *     path from the row root), the vnode location (child-index path + prop
 *     key), and the action kind (apply props / bind reactive text / static
 *     text check / nested element descend).
 *  2. VERIFY + REPLAY: for each subsequent row, walk the recorded steps —
 *     resolve the DOM node by direct hops (no scanning), read the row's OWN
 *     vnode at the recorded path, verify the shape invariant (same type at
 *     every recorded position), and apply the binding directly. Zero
 *     hydrateChild dispatch, zero tuple returns, zero cursor scans.
 *  3. BAIL: any shape mismatch (conditional row content, differing children
 *     counts, non-element roots) falls back to the interpretive walk FOR THAT
 *     ROW — correctness is never traded.
 *
 * This module is pure bookkeeping; the integration lives in hydrate.ts's
 * ForSymbol adoption branch.
 */
import type { VNode, VNodeChild } from '@pyreon/core'

export type Cleanup = () => void

/** One recorded action at a fixed structural position within a row. */
export interface PlanStep {
  /** Child-index hops from the row's root DOM node to this step's node. */
  domPath: number[]
  /** Child-index hops from the row's root VNODE to this step's vnode. */
  vnodePath: number[]
  /**
   * 'element' — apply props (events/reactive effects) + ref for the element at
   *   this position; recorded only when the element HAS props work (prop-less
   *   elements need no step at all — that is the whole win).
   * 'reactive-text' — the vnode child at this position is an accessor bound to
   *   a text node (the `{() => r.label()}` shape).
   */
  kind: 'element' | 'reactive-text'
}

export interface RowPlan {
  steps: PlanStep[]
  /** Root vnode type recorded from row 0 — replay verifies each row matches. */
  rootType: string
}

/** Resolve a DOM node by direct child hops (recorded positions — no scans). */
export function resolveDomPath(root: ChildNode, path: number[]): ChildNode | null {
  let node: ChildNode | null = root
  for (let i = 0; i < path.length && node; i++) {
    node = node.childNodes[path[i] as number] ?? null
  }
  return node
}

/** Resolve a vnode by recorded child indices. */
export function resolveVNodePath(root: VNode, path: number[]): VNodeChild | undefined {
  let v: VNodeChild | undefined = root
  for (let i = 0; i < path.length; i++) {
    const children = (v as VNode | undefined)?.children
    if (!children) return undefined
    v = children[path[i] as number]
  }
  return v
}
