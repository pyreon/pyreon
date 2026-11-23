import type { VNodeChild } from '@pyreon/core'

/**
 * PARKED server content: an adoption build found server nodes that ONE later
 * bind line will claim, and the verifier could not hand them over by position.
 *
 * - A compiled TEXT slot whose server content is not one text node (#4385). A
 *   text binding (`bindPolymorphicText`, `_bindText`, `_bindProp`) is
 *   polymorphic: `{parts(row)}` can render `['a ', <Code/>, ' b']`, which the
 *   server renders as elements. The compiled bind still resolves its slot to
 *   ONE text node, so that node is a PLACEHOLDER: inserted by the verifier for
 *   a sole slot, by `_textSlot` for a trailing or mid range.
 * - An EMPTY template element that `_setChild` fills (#4599): a sole fixed
 *   child (`<span>{cell}</span>`) or a fused static mix (`a{cell}b`) whose
 *   structural value SSR rendered marker-less. Nothing compiled refers into an
 *   empty element, so the ELEMENT itself carries the mark.
 *
 * ONE mark for both. Its value says where the server content is: the open
 * `<!--$-->` of a range, or the server's child nodes RECORDED at verify time
 * (a sole slot, an empty element). The claimer (`_adoptParkedText`, `_setChild`)
 * takes the mark by identity and hands that value to the slot hydrator, which
 * adopts only recorded nodes that are still attached: bind lines that run
 * earlier (`_ref`, a spread) may have cleared, filled or prepended to the
 * element, and nothing the client inserted is adopted or removed.
 *
 * Carried on the node (leak class C: never a registry). `_parkedPending` counts
 * marks not yet consumed, so every binding outside hydration pays one integer
 * compare and nothing else.
 */
const PARKED: unique symbol = Symbol('pyreon.parked')

/** Where a parked node's server content is: a range's open marker, or the
 *  server child nodes recorded by the verifier. */
export type ParkedServer = Comment | ChildNode[]
type Parked = Node & { [PARKED]?: ParkedServer | undefined }

export let _parkedPending = 0

export function _park(node: Text | Element, server: ParkedServer): void {
  ;(node as Parked)[PARKED] = server
  _parkedPending++
  ;(_batch ??= []).push(node)
}

/** Consume `node`'s mark; `undefined` when it has none (or no longer). */
export function _takeParked(node: Node): ParkedServer | undefined {
  const server = (node as Parked)[PARKED]
  if (server !== undefined) {
    ;(node as Parked)[PARKED] = undefined
    _parkedPending--
  }

  return server
}

/**
 * Remove the recorded nodes still attached to `owner` (the element they were
 * recorded in): an unclaimed record's sweep. Nothing a bind line inserted is
 * in the record, so nothing of the client's is touched. Returns, in dev, the
 * removed text (marker comments are not content) and first element, for the
 * report.
 */
export function _sweepRecord(owner: Node, server: ChildNode[]): [string, Element | null] {
  let text = ''
  let el: Element | null = null
  for (const n of server) {
    if (n.parentNode !== owner) continue
    if (process.env.NODE_ENV !== 'production') {
      if (n.nodeType !== 8) text += n.textContent
      if (el === null && n.nodeType === 1) el = n as Element
    }
    n.remove()
  }

  return [text, el]
}

/**
 * The nodes marked during ONE adoption build. A binding that writes `.data`
 * directly (the selector-ternary and signal-method emits) never consumes a
 * placeholder's mark, and a bind with no `_setChild` never consumes an
 * element's. So the build that marked them sweeps any left unconsumed after its
 * bind (`sweepParked` in `template.ts`): the recorded server content that is
 * still attached goes, and the rewrite is reported. Frames nest (a bind
 * hydrates holes whose components build their own templates): save/restore,
 * never reset.
 */
let _batch: Node[] | null = null

export function _beginParkBatch(): Node[] | null {
  const prev = _batch
  _batch = null

  return prev
}

/** Close the batch opened by `_beginParkBatch`; returns what it marked. */
export function _endParkBatch(prev: Node[] | null): Node[] | null {
  const mine = _batch
  _batch = prev

  return mine
}

/**
 * The slot hydrator, registered by `hydrateRoot` (never at module load, so CSR
 * bundles tree-shake it exactly like the `_tpl` adopt verifier). ONE seam for
 * its consumers: a compiled `_mountSlot` / `_setChild` (`template.ts`) and a
 * parked text placeholder (below). It lives here because `mount.ts`
 * (`bindPolymorphicText`) must reach it without importing `template.ts`.
 *
 * `server`: `null` is a MARKER-LESS range whose extent is the parent's whole
 * child list (a sole slot: SSR elided the `<!--$-->` pair; see `_mountSlot`);
 * a comment is a range's open marker; an array is a parked record (above).
 */
export type SlotHydrator = (
  children: VNodeChild | VNodeChild[],
  parent: Node,
  server: ParkedServer | null,
) => () => void

export let _slotHydrator: SlotHydrator | null = null

export function _setSlotHydrator(h: SlotHydrator): void {
  _slotHydrator = h
}

/**
 * If `text` is a parked slot placeholder, remove it and adopt the server content
 * for `child`; returns the slot's cleanup, or `null` for an ordinary text node.
 */
export function _adoptParkedText(text: Text, child: () => VNodeChild): (() => void) | null {
  const server = _takeParked(text)
  if (server === undefined) return null
  const parent = text.parentNode
  // Detached before its binding ran: a `ref` earlier in the bind replaced the
  // element's children. A fresh render writes into the same detached node, so
  // the binding proceeds as an ordinary text binding.
  if (parent === null) return null
  parent.removeChild(text)

  // The binding's accessor IS a reactive child: the hydrator primes it once.
  // A placeholder is only ever parked by an adoption build, and adoption runs
  // under `hydrateRoot`, which registered the hydrator first.
  return (_slotHydrator as SlotHydrator)(child as unknown as VNodeChild, parent, server)
}
