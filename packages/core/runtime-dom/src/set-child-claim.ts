import type { VNodeChild } from '@pyreon/core'
import { _isStructuralChild } from '@pyreon/core'
import { reportRemovedServerContent } from './hydration-debug'
import { mountChildAsUnit, ownByScope } from './mount'
import { _parkNode, _slotHydrator, _unparkNode, type ServerKidsHandlers, type SlotHydrator } from './parked-text'

/**
 * #4599: an EMPTY template element whose server content is structure.
 *
 * The compiled bind fills such an element with `_setChild` (a sole fixed child,
 * `<span>{cell}</span>`, or a fused static mix, `a{cell}b`), and SSR rendered
 * the value there marker-less. The adopt verifier records the element's server
 * child nodes on it (`_parkElement`, `hydration-plan.ts`); nothing is inserted,
 * because no compiled ref points into an empty element.
 *
 * Bind lines that run BEFORE `_setChild` (the compiler emits attributes first)
 * may already have changed the element: a `ref` that clears, fills or prepends
 * to it, a spread that sets `innerHTML`. So both halves work on the RECORDED
 * nodes only, and only on those still attached: nothing the client inserted is
 * adopted or removed.
 */

/** The recorded server children, carried on the element (leak class C:
 *  never a registry). */
const SERVER_KIDS: unique symbol = Symbol('pyreon.serverKids')
type RecordedEl = Element & { [SERVER_KIDS]?: ChildNode[] | undefined }

/** The verifier's record (`hydration-plan.ts`), counted in `_parkedPending`
 *  and batched with the build's parked texts. */
export function _parkElement(el: Element, kids: ChildNode[]): void {
  ;(el as RecordedEl)[SERVER_KIDS] = kids
  _parkNode(el)
}

/** Consume `el`'s record, or `undefined` when it has none. */
export function _takeParkedElement(el: Element): ChildNode[] | undefined {
  const kids = (el as RecordedEl)[SERVER_KIDS]
  if (kids !== undefined) {
    ;(el as RecordedEl)[SERVER_KIDS] = undefined
    _unparkNode()
  }

  return kids
}

/**
 * `_setChild`'s claim, by element identity. Returns true when it mounted
 * `value` (a structural value or an accessor); false when there was no record,
 * or the value is text, which `_setChild` then writes as usual (rewriting the
 * element, as a fresh render does).
 */
export function _claimServerKids(node: Element, value: unknown): boolean {
  const recorded = _takeParkedElement(node)
  if (recorded === undefined) return false
  if (typeof value !== 'function' && !(typeof value === 'object' && value !== null && _isStructuralChild(value))) {
    return false
  }
  ownByScope(adoptRecorded(node, recorded, value as VNodeChild))

  return true
}

/**
 * A fresh render runs the earlier bind lines on an empty clone and then
 * APPENDS the value, so the server's nodes are adoptable only while they are
 * still attached and form the element's trailing run. Otherwise they are
 * removed and the value is mounted as a fresh render would.
 */
function adoptRecorded(node: Element, recorded: ChildNode[], value: VNodeChild): () => void {
  const kept = recorded.filter((n) => n.parentNode === node)
  const last = kept.length > 0 ? (kept[kept.length - 1] as ChildNode) : null
  let run = last === node.lastChild
  for (let i = 1; run && i < kept.length; i++) run = (kept[i - 1] as ChildNode).nextSibling === kept[i]
  if (last === null || !run) {
    for (const n of kept) n.remove()
    return mountChildAsUnit(value, node, null)
  }
  // Registered by `hydrateRoot`, which is the only path that records.
  const hydrate = _slotHydrator as SlotHydrator
  // The whole child list: the marker-less slot, as SSR elided it.
  if (kept[0] === node.firstChild) return hydrate(value, node, null)
  // Client nodes precede the server's run: delimit the run as a range.
  const open = document.createComment('$')
  node.insertBefore(open, kept[0] as ChildNode)
  node.appendChild(document.createComment('/$'))

  return hydrate(value, node, open)
}

/** Nothing claimed `el`'s recorded server children: remove the ones still
 *  attached, and report them in dev. */
export function _sweepServerKids(el: Element, recorded: ChildNode[]): void {
  let server = ''
  let serverEl: Element | null = null
  for (const n of recorded) {
    if (n.parentNode !== el) continue
    if (process.env.NODE_ENV !== 'production') {
      if (n.nodeType !== 8) server += n.textContent
      if (serverEl === null && n.nodeType === 1) serverEl = n as Element
    }
    n.remove()
  }
  if (process.env.NODE_ENV !== 'production') reportRemovedServerContent(el, server, serverEl)
}

/** Registered by `hydrateRoot` (`_setServerKidsHandlers`). */
export const SERVER_KIDS_HANDLERS: ServerKidsHandlers = {
  claim: _claimServerKids,
  take: _takeParkedElement,
  sweep: _sweepServerKids,
}
