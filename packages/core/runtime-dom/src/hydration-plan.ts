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
import { applyProp, applyProps } from './props'

type Cleanup = () => void

interface ElementStep {
  kind: 0 // apply props (+ref) to the element at domPath
  domPath: number[]
  vnodePath: number[]
  /** Tag recorded at build time — replay verifies each row's node matches. */
  tag: string
  /**
   * Prop keys recorded from row 0 (key/children/ref excluded), or null when
   * row 0 carried getter-shaped props (compiler `_rp` descriptors) — then the
   * full `applyProps` (which handles getters) runs instead. With a key list,
   * replay loops `applyProp` directly per key — the SAME per-key primitive
   * `applyProps` dispatches to — skipping the per-row for-in enumeration and
   * per-key getOwnPropertyDescriptor scan. Semantics identical by
   * construction.
   */
  propKeys: string[] | null
}

interface ReactiveTextStep {
  kind: 1 // bind accessor to the SSR text inside <!--$-->text<!--/$-->
  /** Path to the PARENT element; markerIndex is the <!--$--> child index. */
  domPath: number[]
  vnodePath: number[]
  markerIndex: number
}

type PlanStep = ElementStep | ReactiveTextStep

export interface RowPlan {
  rootTag: string
  rootHasWork: boolean
  /** Root element's recorded prop keys (same contract as ElementStep.propKeys). */
  rootPropKeys: string[] | null
  steps: PlanStep[]
}

const EMPTY_PATH: number[] = []

/**
 * Record the applicable prop keys from row 0, or null when any prop is
 * getter-shaped (descriptor.get) — the getter-aware `applyProps` must own
 * that case. `key`/`children`/`ref` are excluded (ref is handled separately
 * by the replay; key/children are never DOM props).
 */
function collectPropKeys(props: Record<string, unknown>): string[] | null {
  const keys: string[] = []
  for (const key in props) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    const d = Object.getOwnPropertyDescriptor(props, key)
    if (d?.get) return null
    keys.push(key)
  }
  return keys
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
  const steps: PlanStep[] = []
  const rootHasWork = hasPropsWork(root)
  if (!walkPlan(root, EMPTY_PATH, EMPTY_PATH, steps)) return null
  return {
    rootTag: root.type as string,
    rootHasWork,
    rootPropKeys: rootHasWork ? collectPropKeys(root.props as Record<string, unknown>) : null,
    steps,
  }
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
    steps.push({
      kind: 0,
      domPath,
      vnodePath,
      tag: vnode.type as string,
      propKeys: collectPropKeys(vnode.props as Record<string, unknown>),
    })
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
/** Apply a recorded key list via the canonical per-key primitive. */
function applyPropList(
  el: Element,
  props: Record<string, unknown> | object,
  keys: string[],
): Cleanup | null {
  let first: Cleanup | null = null
  let rest: Cleanup[] | null = null
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i] as string
    const c = applyProp(el, key, (props as Record<string, unknown>)[key])
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
  const rootProps = plan.rootHasWork
    ? plan.rootPropKeys
      ? applyPropList(rootEl, rowVNode.props, plan.rootPropKeys)
      : applyProps(rootEl, rowVNode.props)
    : null
  for (let s = 0; s < n; s++) {
    const step = steps[s] as PlanStep
    let c: Cleanup | null
    if (step.kind === 0) {
      c = step.propKeys
        ? applyPropList(els[s] as Element, (vnodes[s] as VNode).props, step.propKeys)
        : applyProps(els[s] as Element, (vnodes[s] as VNode).props)
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
}
const _tplSignature = new WeakMap<HTMLTemplateElement, TplSig | null>()

function templateSignature(tpl: HTMLTemplateElement, html: string): TplSig | null {
  let sig = _tplSignature.get(tpl)
  if (sig !== undefined) return sig
  // Templates with comment placeholders (`<!>` dynamic slots / mountSlot
  // machinery) have clone-time structure the SSR DOM does not — never adopt.
  if (html.includes('<!')) {
    _tplSignature.set(tpl, null)
    return null
  }
  const root = tpl.content.firstElementChild
  if (!root || root.nextElementSibling) {
    _tplSignature.set(tpl, null)
    return null
  }
  const tags: string[] = []
  const counts: number[] = []
  const walk = (el: Element) => {
    // tag + textChildCount — the count gates BIND-SLOT alignment: a template
    // text slot (dynamic or static) must have a counterpart text node in the
    // SSR DOM, else a compiled `.firstChild` text ref would land on
    // null/wrong-node (e.g. an UNMARKED empty dynamic slot in compiled-SSR
    // output). Element-only walks keep it marker-comment-immune.
    let texts = 0
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) texts++
    }
    tags.push(el.tagName)
    counts.push(texts)
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) walk(c)
  }
  walk(root)
  sig = { tags, counts }
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
  return { sig, tripletSpots, removalSpots }
}

/**
 * Spot-verify + normalize a subsequent row against the recorded plan.
 * Returns false on any spot mismatch (caller re-runs the full verify).
 */
function replayAdoptPlan(root: Element, plan: AdoptPlan): boolean {
  for (const spot of plan.tripletSpots) {
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
  for (const spot of plan.removalSpots) {
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

function matchDomAgainstTemplate(root: Element, expected: TplSig): AdoptMatch | null {
  let removals: Text[] | null = null
  let triplets: { open: Comment; text: Text | null; close: Comment }[] | null = null
  const tags = expected.tags
  const wantCounts = expected.counts
  const total = tags.length
  let idx = 0
  const walk = (el: Element): boolean => {
    const at = idx++
    if (at >= total || tags[at] !== el.tagName) return false
    let texts = 0
    let bare: Text[] | null = null
    // Single pass over children: count texts, validate + collect `$` triplets
    // inline (adjacency rules from collectDollarTriplets), gather bare texts.
    let n: ChildNode | null = el.firstChild
    while (n) {
      if (n.nodeType === 8) {
        const d = (n as Comment).data
        if (d === '$') {
          texts++
          const prev = n.previousSibling
          if (prev && prev.nodeType === 3) return false // adjacent-text seam
          const a = n.nextSibling
          if (!a) return false
          if (a.nodeType === 8 && (a as Comment).data === '/$') {
            const after = a.nextSibling
            if (after && after.nodeType === 3) return false
            ;(triplets ??= []).push({ open: n as Comment, text: null, close: a as Comment })
            n = a.nextSibling
            continue
          }
          if (a.nodeType !== 3) return false
          const b = a.nextSibling
          if (!b || b.nodeType !== 8 || (b as Comment).data !== '/$') return false
          const after = b.nextSibling
          if (after && after.nodeType === 3) return false
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
      } else return false
    }
    for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!walk(c)) return false
    }
    return true
  }
  if (!walk(root)) return null
  if (idx !== total) return null
  return { removals, triplets }
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


/**
 * The verifier `_tpl` dispatches to (registered by hydrateRoot at call time):
 * tag gate → positional plan replay (rows 2..N) → full signature/triplet
 * verify + plan build (row 1). True = target normalized, bind may run.
 */
export function tplAdoptVerify(
  tpl: HTMLTemplateElement,
  html: string,
  target: Element,
): boolean {
  const troot = tpl.content.firstElementChild
  if (!troot || target.tagName !== troot.tagName) return false
  const plan = _tplAdoptPlan.get(tpl)
  if (plan && replayAdoptPlan(target, plan)) return true
  const sig = templateSignature(tpl, html)
  const match = sig !== null ? matchDomAgainstTemplate(target, sig) : null
  if (match === null) return false
  if (plan === undefined) _tplAdoptPlan.set(tpl, buildAdoptPlan(target, sig as TplSig, match))
  if (match.removals) for (const t of match.removals) t.remove()
  if (match.triplets) normalizeDollarTriplets(match.triplets)
  return true
}
