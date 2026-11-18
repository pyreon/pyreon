/**
 * Brands the adoption verifier leaves on slot nodes for the compiled bind that
 * receives them. Each is carried ON the node, never in a registry (leak class
 * C): the node's own lifetime is exactly the mark's.
 */

/**
 * Brand on a text node the adoption verifier COLLAPSED a mid text slot into
 * (see `TplSig.midSlots`). Carried ON the node — a registry keyed by DOM node
 * is leak class C, and the node's own lifetime is exactly the mark's.
 *
 * Two consumers read it. `_textSlot` adopts the node outright. `_mountSlot`
 * must NOT take its marker-less adoption branch for it: that branch is gated on
 * `placeholder === parent.firstChild`, which used to prove the slot was SOLE
 * because the signature refused every non-trailing `<!>`. A collapsed mid slot
 * at clone index 0 is now a firstChild placeholder too, and without the brand
 * `_mountSlot` would hydrate the element's whole child list as slot content —
 * swallowing the static siblings that follow (measured: `<p>{off && <i/>}!</p>`
 * hydrated to `<p></p>`). With the brand it falls to the clone path, which is
 * correct for both the empty range and the single-text range.
 */
/**
 * A mid slot whose server range holds ELEMENTS (`{cond && <i/>}!`,
 * `{xs.map(…)} tail`) cannot be collapsed to one node without losing them —
 * but the compiled refs after it still need the clone's single-node shape. So
 * the verifier PARKS the range: everything from the open marker's next sibling
 * through the close marker is moved into a fragment hung off the OPEN marker,
 * which stays in the DOM as the one placeholder the refs expect. The consumer
 * that receives that marker decides: `_mountSlot` hands it to the hydrator,
 * which puts the range BACK before adopting it (`hydrateMountSlot`); a text
 * bind (`_textSlot`) has no use for element content and discards it. Carried on
 * the node, never in a registry (leak class C).
 */
const PARKED_RANGE: unique symbol = Symbol('pyreon.parkedRange')
type ParkedOpen = Comment & { [PARKED_RANGE]?: DocumentFragment | undefined }

export function _parkSlotRange(open: Comment, frag: DocumentFragment): void {
  ;(open as ParkedOpen)[PARKED_RANGE] = frag
}

/** The parked range hung off `open`, left in place. */
export const peekParkedRange = (n: Node): DocumentFragment | undefined => (n as ParkedOpen)[PARKED_RANGE]

/** Is a parked range hung off `open`? Non-consuming — see `_mountSlot`. */
export const hasParkedRange = (n: Node): boolean => (n as ParkedOpen)[PARKED_RANGE] !== undefined

/** Take (and clear) the parked range hung off `open`, or `null`. */
export function _takeParkedRange(open: Comment): DocumentFragment | null {
  const f = (open as ParkedOpen)[PARKED_RANGE]
  if (f === undefined) return null
  ;(open as ParkedOpen)[PARKED_RANGE] = undefined

  return f
}

const MID_SLOT_TEXT: unique symbol = Symbol('pyreon.midSlotText')
type MidSlotText = Text & { [MID_SLOT_TEXT]?: true }

export function _markMidSlotText(t: Text): void {
  ;(t as MidSlotText)[MID_SLOT_TEXT] = true
}

// Null-safe: `_mountSlot` hands a `null` placeholder for an EMPTY marker-less
// sole slot (the slot rendered nothing on the server, so both the compiled ref
// and the parent's firstChild are null — a designed case, see `_mountSlot`).
// An unguarded `.nodeType` there threw inside the adopt bind; the throw was
// swallowed by the adoption fallback and every binding of that element was
// orphaned: a sole `{() => cond ? null : <X/>}` child AND its sibling
// `class={…}` both stayed dead after hydration. Found by the compiled-path
// parity fuzz (seeds 76 + 112) the day after #3307 shipped it.
export const isMidSlotText = (n: Node | null): boolean =>
  n !== null && n.nodeType === 3 && (n as MidSlotText)[MID_SLOT_TEXT] === true
