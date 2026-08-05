/**
 * Row-plan replay hydration — the interpretive-dispatch killer for keyed
 * `<For>` adoption (integration: hydrate.ts ForSymbol branch → nodes.ts
 * `tryAdoptSsrRows`).
 *
 * A `<For>`'s rows are structurally identical: the same renderItem produces
 * the same vnode SHAPE for every row, differing only in leaf values and
 * captured closures. The interpretive walk re-derives the same decisions N
 * times (~240ns/node of dispatch — the measured residual vs the fastest
 * hydrator in the cross-framework bench). Instead:
 *
 *  1. BUILD a plan ONCE from the first row's vnode shape: which positions
 *     need props applied, which are reactive text bindings. Prop-less
 *     elements and static text need NO step at all — that is the win.
 *  2. REPLAY per row: resolve nodes by direct child hops, VERIFY the shape
 *     invariant at every step (tag match, marker shape), apply bindings via
 *     the SAME runtime primitives the interpretive path uses (applyProps,
 *     bindPolymorphicText). Any mismatch returns null → the caller falls
 *     back to the interpretive walk FOR THAT ROW. Correctness is never
 *     traded — the strict-happy-path/bail contract of every Pyreon fast path.
 *
 * Supported row shapes (anything else → buildRowPlan returns null → all rows
 * interpretive, byte-identical to before): a single element root whose
 * subtree contains only element children, static text, and reactive-accessor
 * text children (the `{() => sig()}` shape, SSR-bounded by <!--$-->…<!--/$-->
 * markers). Components, fragments, nested For/Show, innerHTML, <select>,
 * SVG-in-HTML template quirks, and adjacent text children all bail at BUILD
 * time.
 */
import type { VNode, VNodeChild } from '@pyreon/core'
import { bindPolymorphicText } from './mount'
import { applyProps } from './props'

type Cleanup = () => void

interface ElementStep {
  kind: 0 // apply props (+ref) to the element at domPath
  domPath: number[]
  vnodePath: number[]
  /** Tag recorded at build time — replay verifies each row's node matches. */
  tag: string
}

interface ReactiveTextStep {
  kind: 1 // bind accessor to the SSR text inside <!--$-->text<!--/$-->
  /** Path to the PARENT element; markerIndex is the <!--$--> child index. */
  domPath: number[]
  vnodePath: number[]
  markerIndex: number
}

export type PlanStep = ElementStep | ReactiveTextStep

export interface RowPlan {
  rootTag: string
  rootHasWork: boolean
  steps: PlanStep[]
}

const EMPTY_PATH: number[] = []

function hasPropsWork(vnode: VNode): boolean {
  const props = vnode.props as Record<string, unknown>
  for (const key in props) {
    if (key !== 'key' && key !== 'children') return true
  }
  return false
}

function isElementVNode(v: VNodeChild): v is VNode {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as VNode).type === 'string' &&
    (v as { __isNative?: boolean }).__isNative !== true
  )
}

/**
 * Build a replay plan from a row vnode's SHAPE. Returns null when the shape
 * contains anything outside the supported set — the caller then uses the
 * interpretive walk for every row (previous behavior, zero risk).
 */
export function buildRowPlan(root: VNodeChild): RowPlan | null {
  if (!isElementVNode(root)) return null
  const steps: PlanStep[] = []
  const rootHasWork = hasPropsWork(root)
  if (!walkPlan(root, EMPTY_PATH, EMPTY_PATH, steps)) return null
  return { rootTag: root.type as string, rootHasWork, steps }
}

/** Recurse the vnode; append steps; false = unsupported shape. */
function walkPlan(
  vnode: VNode,
  domPath: number[],
  vnodePath: number[],
  steps: PlanStep[],
): boolean {
  if (vnode.type === 'select') return false // PZ-09 deferred-value semantics
  const props = vnode.props as Record<string, unknown>
  if ('dangerouslySetInnerHTML' in props || 'innerHTML' in props) return false
  if (vnodePath.length > 0 && hasPropsWork(vnode)) {
    steps.push({ kind: 0, domPath, vnodePath, tag: vnode.type as string })
  }
  const children = vnode.children ?? []
  let domIdx = 0
  let prevWasText = false
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as VNodeChild
    if (child == null || child === false || (child as unknown) === true) {
      // Nullish/boolean children render nothing on the SSR side only when
      // STATIC — but a static null child emits nothing while replay can't
      // distinguish it from a skipped slot. Conservative: bail.
      return false
    }
    if (typeof child === 'string' || typeof child === 'number' || typeof child === 'bigint') {
      if (prevWasText) return false // parser merges adjacent text — interpretive owns splitText
      if (String(child).length === 0) return false // empty text: no DOM node
      prevWasText = true
      domIdx++
      continue
    }
    if (typeof child === 'function') {
      // Reactive accessor child → SSR emits <!--$-->text<!--/$--> (3 nodes).
      if (prevWasText) return false
      steps.push({
        kind: 1,
        domPath,
        vnodePath: [...vnodePath, i],
        markerIndex: domIdx,
      })
      prevWasText = false
      domIdx += 3
      continue
    }
    if (isElementVNode(child)) {
      prevWasText = false
      if (!walkPlan(child, [...domPath, domIdx], [...vnodePath, i], steps)) return false
      domIdx++
      continue
    }
    return false // components / fragments / For / arrays / NativeItem → interpretive
  }
  return true
}

function resolveDom(root: ChildNode, path: number[]): ChildNode | null {
  let node: ChildNode | null = root
  for (let i = 0; i < path.length && node; i++) {
    node = node.childNodes[path[i] as number] ?? null
  }
  return node
}

function resolveVNode(root: VNode, path: number[]): VNodeChild | undefined {
  let v: VNodeChild | undefined = root
  for (let i = 0; i < path.length; i++) {
    const kids: VNodeChild[] | undefined = (v as VNode | undefined)?.children
    if (!kids) return undefined
    v = kids[path[i] as number]
  }
  return v
}

/**
 * Replay a plan against one row: verify + bind. Returns the row's cleanup, or
 * null on ANY verification failure (caller falls back to the interpretive
 * walk for this row; nothing has been bound when null is returned — all
 * verification happens BEFORE the first binding is applied).
 */
export function replayRowPlan(plan: RowPlan, rowVNode: VNodeChild, first: ChildNode): Cleanup | null {
  if (!isElementVNode(rowVNode)) return null
  if (first.nodeType !== 1) return null
  const rootEl = first as Element
  if (rootEl.tagName.toLowerCase() !== plan.rootTag) return null
  if ((rowVNode.type as string) !== plan.rootTag) return null

  const steps = plan.steps
  const n = steps.length
  // Phase 1 — VERIFY every step + resolve targets (no side effects yet).
  const els = new Array<Element>(n)
  const texts = new Array<Text | null>(n)
  const accessors = new Array<(() => VNodeChild) | null>(n)
  const vnodes = new Array<VNode | null>(n)
  for (let s = 0; s < n; s++) {
    const step = steps[s] as PlanStep
    const node = resolveDom(rootEl, step.domPath)
    if (!node || node.nodeType !== 1) return null
    const el = node as Element
    if (step.kind === 0) {
      if (el.tagName.toLowerCase() !== step.tag) return null
      const v = resolveVNode(rowVNode, step.vnodePath)
      if (!v || !isElementVNode(v) || (v.type as string) !== step.tag) return null
      els[s] = el
      vnodes[s] = v
      texts[s] = null
      accessors[s] = null
    } else {
      const open = el.childNodes[step.markerIndex]
      const text = el.childNodes[step.markerIndex + 1]
      const close = el.childNodes[step.markerIndex + 2]
      if (
        !open ||
        open.nodeType !== 8 ||
        (open as Comment).data !== '$' ||
        !text ||
        text.nodeType !== 3 ||
        !close ||
        close.nodeType !== 8 ||
        (close as Comment).data !== '/$'
      ) {
        return null
      }
      const acc = resolveVNode(rowVNode, step.vnodePath)
      if (typeof acc !== 'function') return null
      els[s] = el
      texts[s] = text as Text
      accessors[s] = acc as () => VNodeChild
      vnodes[s] = null
    }
  }

  // Phase 2 — APPLY (same primitives the interpretive path uses).
  let disposers: Cleanup[] | null = null
  const rootProps = plan.rootHasWork ? applyProps(rootEl, rowVNode.props) : null
  for (let s = 0; s < n; s++) {
    const step = steps[s] as PlanStep
    let c: Cleanup | null
    if (step.kind === 0) {
      c = applyProps(els[s] as Element, (vnodes[s] as VNode).props)
      const ref = (vnodes[s] as VNode).props.ref as
        | ((el: Element | null) => void)
        | { current: Element | null }
        | undefined
      if (ref) {
        if (typeof ref === 'function') ref(els[s] as Element)
        else ref.current = els[s] as Element
        const el = els[s] as Element
        const prev = c
        c = () => {
          if (typeof ref === 'function') ref(null)
          else ref.current = null
          prev?.()
          void el
        }
      }
    } else {
      c = bindPolymorphicText(accessors[s] as () => VNodeChild, texts[s] as Text, els[s] as Element)
    }
    if (c) (disposers ??= []).push(c)
  }

  if (process.env.NODE_ENV !== 'production') {
    ;(globalThis as { __pyreon_count__?: (n: string) => void }).__pyreon_count__?.(
      'runtime.hydrate.rowReplay',
    )
  }

  return () => {
    if (disposers) for (const d of disposers) d()
    if (rootProps) rootProps()
    rootEl.remove()
  }
}
