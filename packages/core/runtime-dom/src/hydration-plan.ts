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
import { renderEffect } from '@pyreon/reactivity'
import { bindPolymorphicText } from './mount'
import { _markAdoptedHtmlEl, applyClassProp, applyProp, applyProps, applyStyleProp, makeEventBinder } from './props'
import { _isTplHoleEl, _isTplHtmlEl, _setTplHoleCursors } from './template'

type Cleanup = () => void

const _planCountSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

// Prop-op kinds — precompiled per-key dispatch, classified ONCE at plan build
// so per-row replay does zero key classification (no EVENT_RE test, no
// applyStaticProp key-dispatch chain). Every op body routes through the SAME
// runtime primitives applyProp dispatches to, so semantics are identical by
// construction; the per-row work is only the value-shape branch (function vs
// value) each op still needs, because a value's KIND can differ per row even
// when the key set is fixed.
const OP_EVENT = 0
const OP_CLASS = 1
const OP_STYLE = 2
const OP_GENERIC = 3

interface PropOp {
  key: string
  kind: number
  /** OP_EVENT only — monomorphic binder from `makeEventBinder` (event name +
   * delegation branch resolved at build time, not per row). */
  bind: ((el: Element, value: unknown) => Cleanup | null) | null
}

interface ElementStep {
  kind: 0 // apply props (+ref) to the element at domPath
  domPath: number[]
  /** Tag recorded at build time — replay verifies each row's node matches. */
  tag: string
  /**
   * Specialized per-prop ops recorded from row 0 (key/children/ref excluded),
   * or null when row 0 carried getter-shaped props (compiler `_rp`
   * descriptors) — then the full `applyProps` (which handles getters) runs
   * instead. The per-row KEY SET is verified against the plan's shape
   * signature before anything is bound, so a row whose props diverge from row
   * 0 bails to the interpretive walk rather than silently dropping its extra
   * bindings.
   */
  ops: PropOp[] | null
}

interface ReactiveTextStep {
  kind: 1 // bind accessor to the SSR text (inside <!--$-->…<!--/$-->, or bare)
  /** Path to the PARENT element. */
  domPath: number[]
  /** Marked form: child index of `<!--$-->`. ELIDED form: index of the text. */
  markerIndex: number
  /**
   * 1 when SSR elided this accessor's range markers because it is the
   * element's SOLE child (see `soleAccessorChild` in @pyreon/runtime-server):
   * the slot is ONE bare text node, not a 3-node range.
   */
  elided: number
}

type PlanStep = ElementStep | ReactiveTextStep

// Row-shape signature node kinds (the per-row vnode verify walk).
const K_ELEM = 0
const K_TEXT = 1
const K_FN = 2

export interface RowPlan {
  rootTag: string
  rootHasWork: boolean
  /** Root element's specialized ops (same contract as ElementStep.ops). */
  rootOps: PropOp[] | null
  steps: PlanStep[]
  // ── Row-shape SIGNATURE, recorded from row 0 in the same DFS order the
  // build walk visits nodes. Every row is verified against it BEFORE any
  // binding: rows from the same renderItem are structurally identical in the
  // dominant case, but a renderItem CAN diverge per item (a conditional
  // handler, an extra child, a per-item ref) — and a plan recorded from row 0
  // would then silently DROP the divergent row's bindings (dead click
  // handlers, unfired refs) while every DOM-side check still passes, because
  // the SSR DOM came from that row's OWN vnode. The signature makes shape
  // divergence a BAIL (interpretive walk for that row) instead of a silent
  // wrong page. Verified cheaply: vnode-only property reads, no DOM access.
  /** Per element (DFS order, root first): tag. */
  sigTags: string[]
  /** Per element: children.length. */
  sigChildCounts: number[]
  /** Per element: index of its first key in sigKeys; length = elements + 1
   * (sentinel), so element e's keys are sigKeys[sigKeyStart[e]..sigKeyStart[e+1]). */
  sigKeyStart: number[]
  /** Flattened for-in key sequences (ALL keys verbatim, insertion order) —
   * ref/key/children included, so ANY key-set divergence bails. */
  sigKeys: string[]
  /** Per child slot in DFS visit order: K_ELEM / K_TEXT / K_FN. */
  sigKinds: number[]
  /** Per element: 1 when an ElementStep was recorded for it (root: 0). */
  sigHasStep: number[]
}

const EMPTY_PATH: number[] = []

/**
 * Record the specialized prop ops from row 0, or null when any prop is
 * getter-shaped (descriptor.get) — the getter-aware `applyProps` must own
 * that case. `key`/`children`/`ref` are excluded (ref is handled separately
 * by the replay; key/children are never DOM props).
 */
function collectPropOps(props: Record<string, unknown>): PropOp[] | null {
  const ops: PropOp[] = []
  for (const key in props) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    const d = Object.getOwnPropertyDescriptor(props, key)
    if (d?.get) return null
    const bind = makeEventBinder(key)
    if (bind) {
      ops.push({ key, kind: OP_EVENT, bind })
    } else if (key === 'class' || key === 'className') {
      ops.push({ key, kind: OP_CLASS, bind: null })
    } else if (key === 'style') {
      ops.push({ key, kind: OP_STYLE, bind: null })
    } else {
      // Full applyProp dispatch (URL guards, DOM-property routing, aria
      // normalization…) — correctness over the last nanosecond for the
      // uncommon keys.
      ops.push({ key, kind: OP_GENERIC, bind: null })
    }
  }
  return ops
}

/** Record this element's full for-in key sequence into the signature. */
function recordKeys(props: Record<string, unknown>, sigKeys: string[]): void {
  for (const key in props) sigKeys.push(key)
}

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
  const rootHasWork = hasPropsWork(root)
  const plan: RowPlan = {
    rootTag: root.type as string,
    rootHasWork,
    rootOps: rootHasWork ? collectPropOps(root.props as Record<string, unknown>) : null,
    steps: [],
    sigTags: [],
    sigChildCounts: [],
    sigKeyStart: [],
    sigKeys: [],
    sigKinds: [],
    sigHasStep: [],
  }
  if (!walkPlan(root, EMPTY_PATH, plan)) return null
  plan.sigKeyStart.push(plan.sigKeys.length) // sentinel
  return plan
}

/** Recurse the vnode; append steps + signature; false = unsupported shape. */
function walkPlan(vnode: VNode, domPath: number[], plan: RowPlan): boolean {
  if (vnode.type === 'select') return false // PZ-09 deferred-value semantics
  const props = vnode.props as Record<string, unknown>
  if ('dangerouslySetInnerHTML' in props || 'innerHTML' in props) return false
  const isRoot = domPath === EMPTY_PATH
  const withStep = !isRoot && hasPropsWork(vnode)
  plan.sigTags.push(vnode.type as string)
  plan.sigKeyStart.push(plan.sigKeys.length)
  recordKeys(props, plan.sigKeys)
  plan.sigHasStep.push(withStep ? 1 : 0)
  if (withStep) {
    plan.steps.push({
      kind: 0,
      domPath,
      tag: vnode.type as string,
      ops: collectPropOps(props),
    })
  }
  const children = vnode.children ?? []
  plan.sigChildCounts.push(children.length)
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
      plan.sigKinds.push(K_TEXT)
      prevWasText = true
      domIdx++
      continue
    }
    if (typeof child === 'function') {
      // Reactive accessor child → SSR emits <!--$-->text<!--/$--> (3 nodes),
      // EXCEPT as an element's sole child, where the tag boundary supplies the
      // extent and SSR emits the bare text alone (1 node).
      if (prevWasText) return false
      plan.sigKinds.push(K_FN)
      const elided = children.length === 1 ? 1 : 0
      plan.steps.push({
        kind: 1,
        domPath,
        markerIndex: domIdx,
        elided,
      })
      prevWasText = false
      domIdx += elided ? 1 : 3
      continue
    }
    if (isElementVNode(child)) {
      prevWasText = false
      plan.sigKinds.push(K_ELEM)
      if (!walkPlan(child, [...domPath, domIdx], plan)) return false
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

// ── Per-row shape verify (phase 0) ──────────────────────────────────────────
// Walks the ROW's vnode in the exact DFS order walkPlan recorded, comparing
// against the signature and collecting each step's target (element vnode /
// accessor) in step order — replacing the per-step vnodePath resolution AND
// closing the shape-divergence hole (see RowPlan signature docs). Pure vnode
// property reads, no DOM access; ~tens of ns per row for typical rows.
interface VerifyState {
  elemIdx: number
  kindIdx: number
  stepIdx: number
}

function verifyRowShape(
  vnode: VNode,
  plan: RowPlan,
  st: VerifyState,
  stepTargets: unknown[],
): boolean {
  const e = st.elemIdx++
  if ((vnode.type as string) !== plan.sigTags[e]) return false
  // Full ordered key-sequence compare (same code path → same insertion
  // order; a differently-ordered-but-equal set bails conservatively).
  const props = vnode.props as Record<string, unknown>
  let k = plan.sigKeyStart[e] as number
  const kEnd = plan.sigKeyStart[e + 1] as number
  for (const key in props) {
    if (k >= kEnd || plan.sigKeys[k] !== key) return false
    k++
  }
  if (k !== kEnd) return false
  if (plan.sigHasStep[e] === 1) stepTargets[st.stepIdx++] = vnode
  const children = vnode.children ?? []
  if (children.length !== plan.sigChildCounts[e]) return false
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as VNodeChild
    const want = plan.sigKinds[st.kindIdx++]
    if (typeof child === 'string') {
      // An empty string renders NO DOM node — this row's SSR shape would
      // diverge from the plan's child indices (numbers/bigints never render
      // empty, so only the string case needs the check).
      if (want !== K_TEXT || child.length === 0) return false
    } else if (typeof child === 'number' || typeof child === 'bigint') {
      if (want !== K_TEXT) return false
    } else if (typeof child === 'function') {
      if (want !== K_FN) return false
      stepTargets[st.stepIdx++] = child
    } else if (isElementVNode(child)) {
      if (want !== K_ELEM) return false
      if (!verifyRowShape(child, plan, st, stepTargets)) return false
    } else {
      return false
    }
  }
  return true
}

/** Apply a specialized op list. Each op's body is the same primitive
 * `applyProp` dispatches to for that key kind (event binder ≡
 * applyEventProp's tail; class → applyClassProp; style → applyStyleProp;
 * function values → the same renderEffect wrap applyProp performs; generic →
 * applyProp itself), so semantics are unchanged by construction. */
function applyOpList(
  el: Element,
  props: Record<string, unknown> | object,
  ops: PropOp[],
): Cleanup | null {
  let first: Cleanup | null = null
  let rest: Cleanup[] | null = null
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as PropOp
    const value = (props as Record<string, unknown>)[op.key]
    let c: Cleanup | null
    if (op.kind === OP_EVENT) {
      c = (op.bind as (el: Element, value: unknown) => Cleanup | null)(el, value)
    } else if (op.kind === OP_CLASS) {
      if (typeof value === 'function') {
        c = renderEffect(() => applyClassProp(el, (value as () => unknown)()))
      } else {
        applyClassProp(el, value)
        c = null
      }
    } else if (op.kind === OP_STYLE) {
      if (typeof value === 'function') {
        c = renderEffect(() => applyStyleProp(el as HTMLElement, (value as () => unknown)()))
      } else {
        applyStyleProp(el as HTMLElement, value)
        c = null
      }
    } else {
      c = applyProp(el, op.key, value)
    }
    if (c) {
      if (!first) first = c
      else (rest ??= []).push(c)
    }
  }
  if (!rest) return first
  const f = first as Cleanup
  const r = rest
  return () => {
    f()
    for (const c of r) c()
  }
}

type RefProp = ((el: Element | null) => void) | { current: Element | null } | undefined

/** Wire a ref + compose its release into the cleanup (mirrors hydrateElement). */
function wireRef(ref: RefProp, el: Element, c: Cleanup | null): Cleanup | null {
  if (!ref) return c
  if (typeof ref === 'function') ref(el)
  else ref.current = el
  const prev = c
  return () => {
    if (typeof ref === 'function') ref(null)
    else ref.current = null
    prev?.()
  }
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

  // Phase 0 — verify the row's VNODE shape against the signature (tag, key
  // sequences, child kinds/counts) and collect step targets in step order.
  const steps = plan.steps
  const n = steps.length
  const stepTargets = new Array<unknown>(n)
  const st: VerifyState = { elemIdx: 0, kindIdx: 0, stepIdx: 0 }
  if (!verifyRowShape(rowVNode, plan, st, stepTargets)) return null
  // Completeness: the walk must have consumed the WHOLE signature — a
  // truncated row (fewer elements/children than row 0) would otherwise pass
  // the per-node compares and leave later stepTargets unfilled.
  if (
    st.elemIdx !== plan.sigTags.length ||
    st.kindIdx !== plan.sigKinds.length ||
    st.stepIdx !== n
  ) {
    return null
  }

  // Phase 1 — VERIFY every step's DOM + resolve nodes (no side effects yet).
  const els = new Array<Element>(n)
  const texts = new Array<Text | null>(n)
  for (let s = 0; s < n; s++) {
    const step = steps[s] as PlanStep
    const node = resolveDom(rootEl, step.domPath)
    if (!node || node.nodeType !== 1) return null
    const el = node as Element
    if (step.kind === 0) {
      if (el.tagName.toLowerCase() !== step.tag) return null
      els[s] = el
      texts[s] = null
    } else if (step.elided) {
      // Elided sole-child slot: the markers that used to prove this position
      // holds a TEXT node are gone, so state the invariant directly. A row
      // whose accessor rendered empty (no node) or a VNode (an element)
      // diverges from the recorded shape and bails to the interpretive walk —
      // the same outcome the triplet check produced for those rows.
      const text = el.childNodes[step.markerIndex]
      if (!text || text.nodeType !== 3 || text.nextSibling !== null) return null
      els[s] = el
      texts[s] = text as Text
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
      els[s] = el
      texts[s] = text as Text
    }
  }

  // Phase 2 — APPLY (same primitives the interpretive path uses).
  let disposers: Cleanup[] | null = null
  const rootProps = wireRef(
    (rowVNode.props as Record<string, unknown>).ref as RefProp,
    rootEl,
    plan.rootHasWork
      ? plan.rootOps
        ? applyOpList(rootEl, rowVNode.props, plan.rootOps)
        : applyProps(rootEl, rowVNode.props)
      : null,
  )
  for (let s = 0; s < n; s++) {
    const step = steps[s] as PlanStep
    let c: Cleanup | null
    if (step.kind === 0) {
      const v = stepTargets[s] as VNode
      c = step.ops
        ? applyOpList(els[s] as Element, v.props, step.ops)
        : applyProps(els[s] as Element, v.props)
      c = wireRef(v.props.ref as RefProp, els[s] as Element, c)
    } else {
      c = bindPolymorphicText(
        stepTargets[s] as () => VNodeChild,
        texts[s] as Text,
        els[s] as Element,
      )
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

// ─── Compiled-template adoption VERIFIER (registered into _tpl by hydrateRoot) ─
// One-shot handoff: the <For> hydration-adoption path sets the SSR row root
// immediately before invoking renderItem; the _tpl call inside consumes it and
// — when the SSR DOM verifiably matches the template's structure — runs its
// bind against the EXISTING nodes instead of cloning. This is what makes
// compiled apps ADOPT server DOM (previously every compiled row was rebuilt
// and swapped in). Verification is all-or-nothing BEFORE any mutation, so a
// bail leaves the SSR row untouched for the interpretive fallback.
/** Per-template parsed signature (tag + text-count per element, tree order),
 * cached on first adoption attempt — replay compares with zero string allocs. */
interface TplSig {
  tags: string[]
  counts: number[]
  /**
   * Per element (tree order), whether its `<!>` mount-slot placeholder is the
   * element's SOLE child. That is the one shape whose SSR counterpart carries
   * NO `<!--$-->` range, because runtime-server elides the markers for a sole
   * accessor child (`soleAccessorChild` there) — the element's own tag boundary
   * already delimits the extent. Distinct from `slots`, which only says the
   * placeholder is LAST.
   */
  soleSlots: boolean[]
  /**
   * Per element (tree order), the template's STATIC attributes — the ones
   * baked into the template HTML. Dynamic props are bound by the compiled
   * `bind` and are absent here, so this is a SUBSET check against the SSR
   * element, never an equality one.
   */
  attrs: [string, string][][]
  /**
   * Per element (tree order), the contents of its BARE text children. A
   * compiled dynamic text slot is baked as a single space, which is recorded
   * as `null` (== "do not compare"); genuine static text is recorded verbatim.
   */
  texts: (string | null)[][]
  /**
   * Per element (tree order), whether the template ends that element with a
   * `<!>` MOUNT-SLOT placeholder. Its SSR counterpart is a `<!--$-->…<!--/$-->`
   * range holding the rendered slot content, which is adopted rather than
   * cloned-over. Only a LAST-child slot is ever recorded (see the alignment
   * gate in templateSignature).
   *
   * DISJOINT from `holes`, but by an EXPLICIT conjunct rather than by shape.
   * The original argument was "a hole is emitted EMPTY, and an empty element
   * has no `<!>` child" — the mixed shape retired that, since a hole may now
   * carry baked element children. `templateSignature` therefore excludes a
   * slot-bearing element from being a hole outright (`!slotAtEnd`), which is
   * what keeps the two relaxations from claiming the same range.
   */
  slots: boolean[]
  /**
   * Per element (tree order), `-1` when this element is not a mount hole, else
   * the number of BAKED children the template gives it before the hole starts.
   *
   * A mount hole is an element the compiler DECLARED as ending short: its
   * trailing children are absorbed COMPONENT children, appended by
   * `_mountChild` calls (`templatizeComponentChildren`). Its SSR counterpart
   * holds those components' real output, so the match must skip that range
   * instead of reading it as extra elements.
   *
   * The count is read off the TEMPLATE element (`el.children.length`), not sent
   * by the compiler — there is no number crossing the boundary and therefore
   * none to keep in sync. `0` is the all-components case; `k > 0` is the mixed
   * one, where `k` real elements are matched first and the hole is what remains
   * up to the closing tag.
   *
   * Declared, not inferred: `_setChild` and a spread `innerHTML` also fill an
   * empty template element and do NOT hydrate, so a blanket "an empty element
   * may have extra children" rule would duplicate or discard their content.
   */
  holes: Int32Array | null
  /** Number of declared holes — 0 lets every hole-aware branch short-circuit. */
  holeCount: number
  /**
   * Per element (tree order), whether the compiler declared a
   * `dangerouslySetInnerHTML` binding on it (`data-pyreon-html`). Such an
   * element accepts ANY server children — they are the parse of the binding's
   * `__html`, owned wholly by the bind's `_setHtml` line, which skips its
   * first (adopting) write. Recorded only for an element the template leaves
   * COMPLETELY empty (no child nodes at all — re-checked here rather than
   * trusted, like the hole re-checks), so it is structurally disjoint from
   * both relaxations above: a hole has absorbed component children, a slot has
   * a `<!>` child, and both would give the element a child.
   */
  htmlEls: boolean[] | null
  /** Number of declared innerHTML elements — 0 short-circuits the branch. */
  htmlCount: number
}
const _tplSignature = new WeakMap<HTMLTemplateElement, TplSig | null>()

function templateSignature(tpl: HTMLTemplateElement): TplSig | null {
  let sig = _tplSignature.get(tpl)
  if (sig !== undefined) return sig
  const root = tpl.content.firstElementChild
  if (!root || root.nextElementSibling) {
    _tplSignature.set(tpl, null)
    return null
  }
  const tags: string[] = []
  const counts: number[] = []
  const attrList: [string, string][][] = []
  const textList: (string | null)[][] = []
  const holeFlags: number[] = []
  let holeCount = 0
  const htmlFlags: boolean[] = []
  let htmlCount = 0
  const slotList: boolean[] = []
  const soleSlotList: boolean[] = []
  // MOUNT-SLOT ALIGNMENT GATE. A `<!>` placeholder is one node in the clone but
  // an arbitrary run of nodes in the SSR DOM, so every compiled ref walk that
  // would have to step PAST it (`__p1 = __root.firstChild.nextSibling` for a
  // second slot; a ref for a static sibling that follows one) lands on slot
  // CONTENT instead of the node it names — silent misbinding of exactly the
  // ref-hoist class. A slot that is its parent's LAST child cannot be crossed:
  // nothing static follows it, and its content is confined inside that parent,
  // so walks outside are untouched. Anything else bails to the clone, which is
  // the pre-existing behaviour for every slot-bearing template.
  let bail = false
  const walk = (el: Element) => {
    // tag + textChildCount — the count gates BIND-SLOT alignment: a template
    // text slot (dynamic or static) must have a counterpart text node in the
    // SSR DOM, else a compiled `.firstChild` text ref would land on
    // null/wrong-node (e.g. an UNMARKED empty dynamic slot in compiled-SSR
    // output). Element-only walks keep it marker-comment-immune.
    let texts = 0
    let slotAtEnd = false
    let soleSlot = false
    const ownTexts: (string | null)[] = []
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        texts++
        // A compiled dynamic text slot is baked as a single space; its SSR
        // counterpart carries the rendered value, so it must NOT be compared.
        const d = (n as Text).data
        ownTexts.push(d === ' ' ? null : d)
      } else if (n.nodeType === 8) {
        // `<!>` mount-slot placeholder. Adoptable only as the last child (see
        // the alignment gate above); any other comment in a compiled template
        // is not a shape this verifier models.
        if (n.nextSibling !== null || (n as Comment).data !== '') {
          bail = true
          return
        }
        slotAtEnd = true
        // SOLE child — no static siblings at all. This is what tells the verify
        // walk to expect an SSR element whose markers were elided.
        soleSlot = n === el.firstChild
      }
    }
    tags.push(el.tagName)
    counts.push(texts)
    slotList.push(slotAtEnd)
    soleSlotList.push(soleSlot)
    const ownAttrs: [string, string][] = []
    const a = el.attributes
    for (let i = 0; i < a.length; i++) {
      const at = a[i] as Attr
      ownAttrs.push([at.name, at.value])
    }
    attrList.push(ownAttrs)
    textList.push(ownTexts)
    // A declared hole must carry NO text children of its own: the 1:1 text
    // alignment with the SSR side is what the text half of the skeleton gate
    // relies on, and a hole's server range has texts the template has no
    // counterpart for. Element children ARE allowed and are the mixed shape —
    // they are matched normally and the hole is what follows them. Re-checked
    // here rather than trusted, so a compiler that ever marks the wrong element
    // costs an adoption instead of correctness.
    //
    // The `!slotAtEnd` conjunct is DEFENSIVE and not currently reachable: the
    // compiler never marks a slot-bearing element as a hole, so removing it
    // leaves every spec green. It is kept because it converts the disjointness
    // below from an assumption about the compiler into a structural property of
    // this function — the same reason the `texts === 0` / `firstElementChild`
    // re-checks exist beside it rather than trusting the marker. Anything that
    // makes the shape reachable then costs an adoption, not correctness.
    //
    // It keeps the TWO relaxations disjoint. A
    // hole skips its element's server range so trailing `_mountChild` calls can
    // hydrate it; a sole slot skips the same range so `_mountSlot` can. Both
    // firing on one element would hand the same nodes to two different claimers
    // — the duplicate-DOM failure this whole area exists to prevent. A `<!>` is
    // a COMMENT, so the text/element checks do NOT exclude it: without this
    // conjunct the disjointness would rest on the compiler never marking a
    // slot-bearing element, which is an assumption, not a guarantee.
    //
    // NOTE the earlier form of this also required `el.firstElementChild === null`,
    // and the slot half justified disjointness by "a hole is emitted EMPTY". The
    // mixed shape retired that: a hole may now carry baked element children, so
    // emptiness no longer separates the two and `!slotAtEnd` is doing the work
    // ALONE. A slot-bearing element simply loses the hole relaxation and takes
    // the slot path, which is the correctness-over-adoption trade already made
    // above.
    const isHole = _isTplHoleEl(el) && texts === 0 && !slotAtEnd
    holeFlags.push(isHole ? el.children.length : -1)
    if (isHole) holeCount++
    // A declared innerHTML element must be COMPLETELY empty in the template
    // (the compiler emits it that way — the payload arrives via the bind's
    // `_setHtml`). `firstChild === null` covers texts, elements, AND the `<!>`
    // slot comment in one check, which is what keeps this disjoint from the
    // hole/slot relaxations by structure rather than by trusting the marker.
    const isHtml = _isTplHtmlEl(el) && el.firstChild === null && !isHole
    htmlFlags.push(isHtml)
    if (isHtml) htmlCount++
    for (let c = el.firstElementChild; c && !bail; c = c.nextElementSibling) walk(c)
  }
  walk(root)
  if (bail) {
    _tplSignature.set(tpl, null)
    return null
  }
  sig = {
    tags,
    counts,
    attrs: attrList,
    texts: textList,
    slots: slotList,
    soleSlots: soleSlotList,
    holes: holeCount > 0 ? Int32Array.from(holeFlags) : null,
    holeCount,
    htmlEls: htmlCount > 0 ? htmlFlags : null,
    htmlCount,
  }
  _tplSignature.set(tpl, sig)
  return sig
}

/**
 * Walk the SSR target in the SAME element order as templateSignature,
 * comparing TAG:textCount per element against the template's signature parts.
 * Where the template expects ZERO texts but the SSR element has bare text
 * children (the compiled `_setChild`-managed static slot: the bind rewrites
 * the element's content wholesale, so pre-existing SSR text must simply go —
 * exactly what a clone-and-swap would produce), those texts are collected for
 * pre-bind REMOVAL instead of bailing. Any NONZERO-count mismatch still bails
 * (`.firstChild` text refs would misalign). Returns the removal list, or null
 * on mismatch.
 */
interface AdoptMatch {
  removals: Text[] | null
  triplets: { open: Comment; text: Text | null; close: Comment }[] | null
  /**
   * Elements whose ONLY child is the text of an ELIDED sole-child accessor
   * slot (the template baked a ' ' placeholder there, recorded as `null`).
   * The marker triplet used to prove per row that such a slot holds a TEXT
   * node; with the markers gone that guard must be stated explicitly, or a row
   * whose accessor rendered empty / a VNode would replay unverified and the
   * compiled bind's `.firstChild` ref would land on null or an element.
   */
  soles: Element[] | null
  /**
   * Elements whose ELIDED sole-child slot rendered EMPTY, so SSR emitted no
   * node at all where the template baked its ' ' placeholder. The compiled
   * bind's `.firstChild` ref needs a text node to exist, so one is inserted —
   * exactly what the marker path did for an empty `<!--$--><!--/$-->` range.
   * Without this an often-empty column would drop every such row out of
   * adoption and onto the interpretive walk.
   */
  emptySlots: Element[] | null
  /**
   * Declared mount holes that verified, each mapped to the START of its server
   * range. Handed to `_tpl`, which threads them through the compiled bind's
   * `_mountChild` calls so the components HYDRATE that range instead of
   * appending a second copy beside it, then sweeps whatever the bind did not
   * claim.
   */
  holes: Map<Element, ChildNode | null> | null
  /**
   * Declared innerHTML elements that verified. After the whole match passes,
   * each is marked in the `_setHtml` adoption registry so the compiled bind's
   * FIRST write to it is skipped — the server children are already the parse
   * of the payload. Collected during the (side-effect-free) walk, marked only
   * by `tplAdoptVerify` once every check has passed.
   */
  htmlEls: Element[] | null
}

/**
 * Positional replay plan, built from the FIRST fully-verified row: element
 * child-hop paths to each `$` triplet's parent + its child index, and to each
 * kept/removed bare-text position. Rows of a non-`<!` compiled template are
 * structurally IDENTICAL by construction (same template, no conditional
 * slots), so subsequent rows verify at the recorded SPOTS (is the `$` comment
 * where the plan says?) instead of re-walking every node — any spot mismatch
 * bails that row to the full verify.
 */
interface TripletSpot {
  /** Element-index hops from the row root to the triplet's parent element. */
  path: number[]
  /** Child index of the `$` open comment within that parent. */
  childIndex: number
}
interface AdoptPlan {
  sig: TplSig
  tripletSpots: TripletSpot[]
  /** Element paths whose sole child must still be a lone text node (see
   *  `AdoptMatch.soles`). */
  soleTextSpots: number[][]
  /** domPaths of elements whose EXTRA bare texts get removed (template 0, >1 texts). */
  removalSpots: number[][]
}
const _tplAdoptPlan = new WeakMap<HTMLTemplateElement, AdoptPlan | null>()

function elByPath(root: Element, path: number[], upto: number): Element | null {
  let el: Element | null = root
  for (let i = 0; i < upto && el; i++) {
    let c: Element | null = el.firstElementChild
    for (let k = 0; k < (path[i] as number) && c; k++) c = c.nextElementSibling
    el = c
  }
  return el
}

/** Record element paths (element-index hops) alongside a full verify. */
function buildAdoptPlan(root: Element, sig: TplSig, match: AdoptMatch): AdoptPlan {
  const tripletSpots: TripletSpot[] = []
  const removalSpots: number[][] = []
  const pathOf = (el: Element): number[] => {
    const path: number[] = []
    let cur: Element = el
    while (cur !== root) {
      const parent = cur.parentElement as Element
      let idx = 0
      for (let c = parent.firstElementChild; c && c !== cur; c = c.nextElementSibling) idx++
      path.unshift(idx)
      cur = parent
    }
    return path
  }
  if (match.triplets) {
    for (const t of match.triplets) {
      const parent = t.open.parentElement as Element
      let ci = 0
      for (let n = parent.firstChild; n && n !== t.open; n = n.nextSibling) ci++
      tripletSpots.push({ path: pathOf(parent), childIndex: ci })
    }
  }
  if (match.removals) {
    for (const r of match.removals) removalSpots.push(pathOf(r.parentElement as Element))
  }
  const soleTextSpots: number[][] = []
  if (match.soles) for (const el of match.soles) soleTextSpots.push(pathOf(el))
  return { sig, tripletSpots, soleTextSpots, removalSpots }
}

/**
 * Spot-verify + normalize a subsequent row against the recorded plan.
 * Returns false on any spot mismatch (caller re-runs the full verify).
 * Indexed loops throughout — this runs once per row (1000+ times per
 * hydrated table), and a `for…of` over an array allocates an iterator per
 * loop per row.
 */
function replayAdoptPlan(root: Element, plan: AdoptPlan): boolean {
  const spots = plan.tripletSpots
  for (let s = 0; s < spots.length; s++) {
    const spot = spots[s] as TripletSpot
    const parent = elByPath(root, spot.path, spot.path.length)
    if (!parent) return false
    let n: ChildNode | null = parent.firstChild
    for (let k = 0; k < spot.childIndex && n; k++) n = n.nextSibling
    if (!n || n.nodeType !== 8 || (n as Comment).data !== '$') return false
    const a = n.nextSibling
    if (a && a.nodeType === 3) {
      const b = a.nextSibling
      if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') return false
      // Remove ONLY the open marker — the text shifts into the slot position
      // naturally (compiled refs need the text FIRST); the close marker stays
      // as an inert trailing comment that travels with the row. One cheap
      // removeChild beats moving the text (an implicit remove+insert).
      ;(n as Comment).remove()
    } else if (a && a.nodeType === 8 && (a as Comment).data === '/$') {
      parent.insertBefore(document.createTextNode(''), a)
      ;(n as Comment).remove()
    } else return false
  }
  // Elided sole-child slots: the cheapest statement of the invariant the
  // triplet check used to carry — this element's only child is a text node.
  const soles = plan.soleTextSpots
  for (let s = 0; s < soles.length; s++) {
    const spot = soles[s] as number[]
    const parent = elByPath(root, spot, spot.length)
    if (!parent) return false
    // An EMPTY slot on this row returns false like any other spot miss: the
    // caller falls through to the full verify, which MATERIALIZES the text
    // node and adopts (see `AdoptMatch.emptySlots`). Handling it inline here
    // would be faster but is not correctness-bearing — the full verify is —
    // and a branch no test can distinguish is a branch that should not ship.
    const t = parent.firstChild
    if (t === null || t.nodeType !== 3 || t.nextSibling !== null) return false
  }
  const removals = plan.removalSpots
  for (let s = 0; s < removals.length; s++) {
    const spot = removals[s] as number[]
    const parent = elByPath(root, spot, spot.length)
    if (!parent) return false
    let n: ChildNode | null = parent.firstChild
    while (n) {
      const nx: ChildNode | null = n.nextSibling
      if (n.nodeType === 3 && !(nx === null && parent.firstChild === n)) {
        // remove extras; sole-text keeps are template-0 single-text cases which
        // never land in removalSpots (removals recorded only for >1 bare texts)
        ;(n as Text).remove()
      }
      n = nx
    }
  }
  return true
}

/**
 * Depth-aware scan from a `<!--$-->` open marker to its matching `<!--/$-->`,
 * answering only "is that close this element's LAST child?" — the structural
 * test that identifies a MOUNT-SLOT range. Accessor ranges nest, so the depth
 * counter is required; a nested range's close must not be mistaken for ours.
 */
function matchingCloseIsLastChild(open: Comment, el: Element): boolean {
  let depth = 0
  for (let n: ChildNode | null = open.nextSibling; n; n = n.nextSibling) {
    if (n.nodeType !== 8) continue
    const d = (n as Comment).data
    if (d === '$') depth++
    else if (d === '/$') {
      if (depth === 0) return n === el.lastChild
      depth--
    }
  }
  return false
}

function matchDomAgainstTemplate(root: Element, expected: TplSig): AdoptMatch | null {
  let removals: Text[] | null = null
  let triplets: { open: Comment; text: Text | null; close: Comment }[] | null = null
  let soles: Element[] | null = null
  let emptySlots: Element[] | null = null
  let holes: Map<Element, ChildNode | null> | null = null
  let htmlEls: Element[] | null = null
  const htmlFlags = expected.htmlEls
  const tags = expected.tags
  const wantCounts = expected.counts
  const holeFlags = expected.holes
  const total = tags.length
  let idx = 0
  const walk = (el: Element): boolean => {
    const at = idx++
    if (at >= total || tags[at] !== el.tagName) return false
    // STATIC-SKELETON GATE. Adoption is only sound when the template's static
    // skeleton is byte-equal to the target's, because the one-shot slot is
    // consumed by whichever `_tpl` runs FIRST inside the armed window — which
    // for an h()-rooted component is an inner template, not the root. Under
    // this gate a "wrong" consumer can only ever adopt a node byte-identical
    // to the one it would have cloned, so mis-consumption is harmless: it
    // costs an adoption, never correctness. Dynamic props are bound by the
    // compiled `bind` and are absent from the template, hence SUBSET.
    const wantAttrs = expected.attrs[at] as [string, string][]
    for (let i = 0; i < wantAttrs.length; i++) {
      const pair = wantAttrs[i] as [string, string]
      if (el.getAttribute(pair[0]) !== pair[1]) return false
    }
    // DECLARED innerHTML ELEMENT. The template leaves it empty and the bind's
    // `_setHtml` owns its content wholly, so its server children — the parse
    // of the SSR-rendered `__html` — are accepted AS-IS: nothing to count,
    // nothing to descend into, nothing to sweep. No string comparison against
    // the client payload either (innerHTML serialization round-trips differ —
    // entity encoding, attribute quoting — so equality would false-negative;
    // React trusts the server DOM wholesale during hydration, and so do we).
    // Disjoint from the hole/slot relaxations by construction: signature
    // records `htmlEls` only for a template element with NO children at all.
    if (htmlFlags !== null && htmlFlags[at] === true) {
      ;(htmlEls ??= []).push(el)
      return true
    }
    // TWO RELAXATIONS, DISJOINT BY AN EXPLICIT CONJUNCT. Both say "this
    // element's remaining server child range belongs to a later claimer, so stop
    // verifying here": a HOLE hands its range to trailing `_mountChild` calls, a
    // SOLE SLOT hands its range to `_mountSlot`. Firing both on one element would
    // hand the same nodes to two claimers — duplicate DOM.
    //
    // They cannot, but the reason CHANGED with the mixed shape. It used to be
    // structural: a hole was recorded only for an element with no text, no
    // element child and no `<!>`, so a slot-bearing element could not be one. A
    // hole may now carry `k` baked element children, so emptiness no longer
    // separates them — `templateSignature` instead excludes a slot-bearing
    // element from being a hole outright (`!slotAtEnd`). Order below is
    // presentational, not semantic.

    // MOUNT HOLE. The template ends short here: after `k` baked children, the
    // rest of this element's server range is the hole's content — not extra
    // elements to reject, not texts to align, and not a subtree to descend into
    // (the template has no counterpart for any of it). Match the `k`, then
    // record where the hole starts and stop.
    //
    // No SSR range marker is involved, and none is needed: the element's own
    // tag boundary supplies the extent, exactly as it does for a sole-child
    // accessor. That holds only because a hole is always TRAILING — the
    // compiler bails every shape with baked content AFTER a component to `h()`
    // rather than emitting one (`absorbsComponentChildren`).
    //
    // The prefix must be exactly those `k` ELEMENTS and nothing else: a stray
    // text or comment before the hole means the server and the template
    // disagree about where the hole begins, and guessing is how a cursor walks
    // into content it does not own. `k === 0` is the all-components case and
    // reduces to `el.firstChild`, the shape this started as.
    if (holeFlags !== null) {
      const k = holeFlags[at] as number
      if (k >= 0) {
        let n: ChildNode | null = el.firstChild
        for (let i = 0; i < k; i++) {
          if (n === null || n.nodeType !== 1) return false
          if (!walk(n as Element)) return false
          n = n.nextSibling
        }
        ;(holes ??= new Map()).set(el, n)
        return true
      }
    }
    // MARKER-LESS SOLE MOUNT-SLOT. runtime-server elides the `<!--$-->` pair when
    // an element's SOLE child is a reactive accessor (`soleAccessorChild` there),
    // because the tag boundary already delimits the extent. That elision was
    // designed against the `h()` pair — SSR render and `hydrateSoleAccessorChild`
    // — and this compiled-template path is a further consumer of the same shape
    // that never joined the agreement, so a sole `.map()` child reached the gate
    // below looking for a range SSR never emitted and bailed the whole container.
    //
    // When the template says the slot is SOLE, the element's ENTIRE child list is
    // slot content: there is no static skeleton left to compare and nothing to
    // descend into. The one thing still worth distinguishing is whether SSR
    // actually elided — a sole slot whose vnode child was an ARRAY rather than an
    // accessor still gets its markers — so fall through to the marked path when
    // the range really is there.
    if (expected.soleSlots[at] === true) {
      const f = el.firstChild
      const marked =
        f !== null &&
        f.nodeType === 8 &&
        (f as Comment).data === '$' &&
        matchingCloseIsLastChild(f as Comment, el)
      if (!marked) return true
    }
    let texts = 0
    let bare: Text[] | null = null
    // `$`-marked slots interleave with bare texts, so their presence breaks the
    // 1:1 alignment the static-text comparison below relies on.
    let sawTriplet = false
    // The MOUNT-SLOT region's open marker, once identified (see below). Element
    // descent stops here: everything after it is slot CONTENT, which belongs to
    // the slot's own hydration, not to this template's skeleton.
    let slotOpen: Comment | null = null
    const wantSlot = expected.slots[at] === true
    // Single pass over children: count texts, validate + collect `$` triplets
    // inline (adjacency rules from collectDollarTriplets), gather bare texts.
    let n: ChildNode | null = el.firstChild
    while (n) {
      if (n.nodeType === 8) {
        const d = (n as Comment).data
        if (d === '$') {
          // MOUNT SLOT. The template ends this element with a `<!>` placeholder,
          // and its SSR counterpart is the range whose close marker is this
          // element's LAST child. Matching on that — rather than on "the range
          // holds elements" — keeps it distinct from a reactive-TEXT triplet
          // that merely happens to sit last, and makes the whole thing a
          // structural equality check rather than a heuristic. The markers stay
          // in the DOM: the open one IS the placeholder the compiled bind
          // resolves to, and `_mountSlot` consumes both.
          if (wantSlot && slotOpen === null && matchingCloseIsLastChild(n as Comment, el)) {
            slotOpen = n as Comment
            break
          }
          texts++
          const prev = n.previousSibling
          if (prev && prev.nodeType === 3) return false // adjacent-text seam
          const a = n.nextSibling
          if (!a) return false
          if (a.nodeType === 8 && (a as Comment).data === '/$') {
            const after = a.nextSibling
            if (after && after.nodeType === 3) return false
            sawTriplet = true
            ;(triplets ??= []).push({ open: n as Comment, text: null, close: a as Comment })
            n = a.nextSibling
            continue
          }
          if (a.nodeType !== 3) return false
          const b = a.nextSibling
          if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') return false
          const after = b.nextSibling
          if (after && after.nodeType === 3) return false
          sawTriplet = true
          ;(triplets ??= []).push({ open: n as Comment, text: a as Text, close: b as Comment })
          n = b.nextSibling
          continue
        }
        if (d === '/$') return false // orphan close
        // Foreign marker (k:, pyreon-for, async) inside a row — bail.
        return false
      }
      if (n.nodeType === 3) {
        texts++
        ;(bare ??= []).push(n as Text)
      }
      n = n.nextSibling
    }
    // The template ends this element with a slot but the target has no matching
    // range — a structural divergence, not something to paper over: the bind
    // would resolve its placeholder ref to a real SSR node and `_mountSlot`
    // would delete it.
    if (wantSlot && slotOpen === null) return false
    const wantTexts = wantCounts[at] as number
    if (texts !== wantTexts) {
      // Template expects NO texts here → the bind manages this element's
      // content (`_setChild`). A SOLE bare text is KEPT — `_setChild`'s
      // sole-text fast path writes `.data` in place, reusing the SSR node
      // (and the value matches by construction, making the write ~free).
      // Multiple bare texts are removed pre-bind (parser-merge shapes the
      // sole-text path can't reuse). Any other mismatch is a structural
      // divergence: bail.
      if (wantTexts === 0 && bare) {
        if (bare.length > 1) (removals ??= []).push(...bare)
      } else if (
        // An elided sole-child slot whose accessor rendered EMPTY: the template
        // wants one DYNAMIC text here and the element has no children at all.
        // Materialize the node the compiled bind will write into (deferred to
        // the caller — this walk stays side-effect-free until every check has
        // passed) instead of bailing the row.
        wantTexts === 1 &&
        texts === 0 &&
        el.firstChild === null &&
        (expected.texts[at] as (string | null)[])[0] === null
      ) {
        ;(emptySlots ??= []).push(el)
        ;(soles ??= []).push(el)
      } else return false
    } else if (!sawTriplet && bare !== null) {
      // An elided sole-child accessor slot: the template baked a ' ' here
      // (recorded `null` = dynamic) and the SSR element carries exactly that
      // one text node. Record it so every REPLAYED row re-proves it — the
      // static-text case below needs no such guard, since nothing binds it.
      if (
        wantTexts === 1 &&
        bare.length === 1 &&
        (expected.texts[at] as (string | null)[])[0] === null &&
        el.firstChild === bare[0] &&
        (bare[0] as Text).nextSibling === null
      ) {
        ;(soles ??= []).push(el)
      }
      // Static-text half of the skeleton gate (see the attribute gate above).
      // Only meaningful with no triplets, where bare texts align 1:1 with the
      // template's; `null` entries are baked dynamic slots and are skipped.
      const wantText = expected.texts[at] as (string | null)[]
      if (bare.length === wantText.length) {
        for (let i = 0; i < bare.length; i++) {
          const w = wantText[i]
          if (w !== null && (bare[i] as Text).data !== w) return false
        }
      }
    }
    // Descend into STATIC element children only. With a slot present, those are
    // exactly the elements before its open marker — anything after is rendered
    // slot content, which this template's signature says nothing about.
    if (slotOpen !== null) {
      for (let c: ChildNode | null = el.firstChild; c && c !== slotOpen; c = c.nextSibling) {
        if (c.nodeType === 1 && !walk(c as Element)) return false
      }
    } else {
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (!walk(c)) return false
      }
    }
    return true
  }
  if (!walk(root)) return null
  if (idx !== total) return null
  return { removals, triplets, soles, emptySlots, holes, htmlEls }
}

/** All checks passed — strip markers, ensuring one text node per slot. */
function normalizeDollarTriplets(
  triplets: { open: Comment; text: Text | null; close: Comment }[],
): void {
  for (const t of triplets) {
    // Remove only the OPEN marker (see replayAdoptPlan) — the text shifts to
    // the slot position; the close marker trails inertly with the row.
    if (!t.text) t.open.parentNode?.insertBefore(document.createTextNode(''), t.close)
    t.open.remove()
  }
}


// One-slot "last template" cache: a hydrating `<For>` calls the verifier with
// the SAME template for every row, so rows 2..N skip the `tpl.content` /
// `firstElementChild` DOM getters and the WeakMap probe entirely. Holds ONE
// extra strong reference to a template that `_tplCache` already retains
// (bounded by construction — a single slot, overwritten on every template
// change), so it introduces no new retention class.
let _lastVerifyTpl: HTMLTemplateElement | null = null
let _lastVerifyPlan: AdoptPlan | null = null

/**
 * The verifier `_tpl` dispatches to (registered by hydrateRoot at call time):
 * tag gate → positional plan replay (rows 2..N) → full signature/triplet
 * verify + plan build (row 1). True = target normalized, bind may run.
 */
export function tplAdoptVerify(
  tpl: HTMLTemplateElement,
  html: string,
  target: Element,
  // Defaults to the SAFE path on purpose: a caller that forgets the flag gets
  // the full skeleton verify, never the unverified replay.
  allowPlanReplay = false,
): boolean {
  // The plan fast path is OPT-IN, and the opt-in means "successive targets are
  // structurally identical" — which only `<For>` rows can promise. The plan is
  // cached per TEMPLATE and `_tplCache` is keyed by HTML string and is
  // process-global, so two unrelated components that compile to the same
  // template share one plan. When replay ran unconditionally, the second one
  // skipped `matchDomAgainstTemplate` entirely — and for a static template
  // `replayAdoptPlan` has no spots to check, so it returned true for ANY
  // same-tag target, silently handing a local template a byte-different server
  // node. That is precisely the theft the static-skeleton gate exists to stop.
  let plan: AdoptPlan | null | undefined
  // A template with declared mount HOLES never takes the plan fast path. The
  // plan records triplet + removal spots, not hole cursors, so a replayed row
  // would hand the compiled bind no cursor and `_mountChild` would append a
  // second copy beside the server's. Refusing costs `<For>` rows whose
  // renderItem absorbs a component the dispatch-free replay; a silent
  // duplication would cost the page.
  if (allowPlanReplay && templateSignature(tpl)?.holeCount) allowPlanReplay = false
  // Nor does a template with declared innerHTML elements: the replay records
  // triplet/removal spots, not innerHTML marks, so a replayed row's bind would
  // find no mark and re-assign `innerHTML` — re-parsing the very children the
  // adoption kept. Refusing costs such rows the dispatch-free replay (the full
  // verify still adopts them); a silent re-parse would cost the retention.
  if (allowPlanReplay && templateSignature(tpl)?.htmlCount) allowPlanReplay = false
  if (allowPlanReplay) {
    if (tpl === _lastVerifyTpl) {
      plan = _lastVerifyPlan
    } else {
      plan = _tplAdoptPlan.get(tpl)
      if (plan !== undefined) {
        _lastVerifyTpl = tpl
        _lastVerifyPlan = plan
      }
    }
    // Rows 2..N: spot-replay against the recorded plan. `sig.tags[0]` IS the
    // template root's tagName (templateSignature records the root first), so
    // this gate is the same tag gate the full path runs below.
    if (plan && target.tagName === (plan.sig.tags[0] as string) && replayAdoptPlan(target, plan)) {
      if (process.env.NODE_ENV !== 'production')
        _planCountSink.__pyreon_count__?.('runtime.tpl.adoptPlanReplay')
      return true
    }
  }
  const troot = tpl.content.firstElementChild
  if (!troot || target.tagName !== troot.tagName) return false
  const sig = templateSignature(tpl)
  const match = sig !== null ? matchDomAgainstTemplate(target, sig) : null
  if (match === null) return false
  if (allowPlanReplay && plan === undefined) {
    // TWO restrictions compose here. #2925 gates replay behind
    // `allowPlanReplay`; separately, a slot-bearing template is a CONTAINER —
    // one per hydration, not one per row — so the replay plan buys nothing,
    // and its positional spot-checks are recorded against child indices that
    // rendered slot content shifts. Cache a null plan so every such target
    // takes the full verify.
    const built = (sig as TplSig).slots.includes(true)
      ? null
      : buildAdoptPlan(target, sig as TplSig, match)
    _tplAdoptPlan.set(tpl, built)
    _lastVerifyTpl = tpl
    _lastVerifyPlan = built
  }
  if (match.removals) for (const t of match.removals) t.remove()
  if (match.emptySlots) {
    for (const el of match.emptySlots) el.appendChild(document.createTextNode(''))
  }
  if (match.triplets) normalizeDollarTriplets(match.triplets)
  // Declared innerHTML elements: mark each so the bind's first `_setHtml`
  // write — which runs synchronously inside the adoption's `bind(target)` —
  // trusts the server children instead of re-parsing `__html`. Marked only
  // here, after EVERY check passed: a bail leaves no mark behind.
  if (match.htmlEls !== null) {
    for (const el of match.htmlEls) _markAdoptedHtmlEl(el)
  }
  // Hand the verified holes to `_tpl` (one-shot; it clears the slot before
  // every verify, so a bail can never leave a stale map behind).
  if (match.holes !== null) _setTplHoleCursors(match.holes)
  return true
}
