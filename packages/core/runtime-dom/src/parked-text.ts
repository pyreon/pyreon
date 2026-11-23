import type { VNodeChild } from '@pyreon/core'

/**
 * A compiled TEXT slot whose server content is not one text node (#4385).
 *
 * A text binding (`bindPolymorphicText`, `_bindText`, `_bindProp`) is
 * polymorphic: `{parts(row)}` can render `['a ', <Code/>, ' b']`, and the
 * server renders that as elements. The compiled bind still resolves its slot to
 * ONE text node, so hydration used to discard the server's nodes: the adoption
 * verifier refused the whole element (sole slot), or `_textSlot` cleared the
 * range (trailing or mid slot), and the binding mounted the content fresh.
 *
 * Now the slot's resolved text node is a PLACEHOLDER branded with where the
 * server content is: `null` for the element's whole child list (a sole slot,
 * markers elided by SSR), or the range's open `<!--$-->` comment. The binding
 * that receives it hands its accessor to the slot hydrator (`hydrateMountSlot`),
 * which adopts the content as a live reactive slot exactly as a compiled
 * `_mountSlot` does, reporting any real divergence through the walk.
 *
 * Carried on the node (leak class C: never a registry). `_parkedPending` counts
 * branded nodes not yet consumed, so every binding outside hydration pays one
 * integer compare and nothing else.
 */
const PARKED_TEXT: unique symbol = Symbol('pyreon.parkedText')
type ParkedText = Text & { [PARKED_TEXT]?: Comment | null | undefined }

export let _parkedPending = 0

/**
 * Count and batch one more parked node: an empty `_setChild` element whose
 * server children `set-child-claim.ts` recorded on it (#4599). Kept here so the
 * counter and the batch stay this module's own.
 */
export function _parkNode(el: Element): void {
  _parkedPending++
  ;(_batch ??= []).push(el)
}

/** One parked element was claimed or swept. */
export function _unparkNode(): void {
  _parkedPending--
}

/**
 * Claim and sweep for the recorded elements (`set-child-claim.ts`), registered
 * by `hydrateRoot` like the slot hydrator, so CSR bundles carry neither: only
 * an adoption build records, and adoption runs under `hydrateRoot`.
 */
export interface ServerKidsHandlers {
  claim: (node: Element, value: unknown) => boolean
  /** Release `el`'s record (the build's first pass); `undefined` if none. */
  take: (el: Element) => ChildNode[] | undefined
  sweep: (el: Element, recorded: ChildNode[]) => void
}

export let _serverKids: ServerKidsHandlers | null = null

export function _setServerKidsHandlers(h: ServerKidsHandlers): void {
  _serverKids = h
}

export function _parkText(text: Text, open: Comment | null): void {
  ;(text as ParkedText)[PARKED_TEXT] = open
  _parkedPending++
  ;(_batch ??= []).push(text)
}

/**
 * Consume `text`'s brand: the open marker of its range, `null` for a sole
 * slot, or `undefined` when the node is not (or no longer) a parked placeholder.
 */
export function _takeParkedText(text: Text): Comment | null | undefined {
  const open = (text as ParkedText)[PARKED_TEXT]
  if (open !== undefined) {
    ;(text as ParkedText)[PARKED_TEXT] = undefined
    _parkedPending--
  }

  return open
}

/**
 * The placeholders branded during ONE adoption build. A binding that writes
 * `.data` directly (the selector-ternary and signal-method emits) never consumes
 * a brand. In agreement it never meets one (its server content is one text
 * node), but on a divergence the server's nodes would stay beside the text it
 * writes. So the build that branded them sweeps any left unconsumed after its
 * bind (`sweepParkedTexts` in `template.ts`): the server content goes (what the
 * slot did before) and the rewrite is reported. Frames nest (a bind hydrates
 * holes whose components build their own templates): save/restore, never reset.
 */
let _batch: (Text | Element)[] | null = null

export function _beginParkBatch(): (Text | Element)[] | null {
  const prev = _batch
  _batch = null

  return prev
}

/** Close the batch opened by `_beginParkBatch`; returns what it branded. */
export function _endParkBatch(prev: (Text | Element)[] | null): (Text | Element)[] | null {
  const mine = _batch
  _batch = prev

  return mine
}

/**
 * The slot hydrator, registered by `hydrateRoot` (never at module load, so CSR
 * bundles tree-shake it exactly like the `_tpl` adopt verifier). ONE seam for
 * both of its consumers: a compiled `_mountSlot` / `_setChild` (`template.ts`)
 * and a parked text placeholder (below). It lives here because `mount.ts`
 * (`bindPolymorphicText`) must reach it without importing `template.ts`.
 *
 * `open === null` means a MARKER-LESS range: the slot was its element's SOLE
 * child, so SSR elided the `<!--$-->` pair and the extent is the parent's whole
 * child list. See `_mountSlot`.
 */
export type SlotHydrator = (
  children: VNodeChild | VNodeChild[],
  parent: Node,
  open: Comment | null,
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
  const open = _takeParkedText(text)
  if (open === undefined) return null
  const parent = text.parentNode
  // Detached before its binding ran: a `ref` earlier in the bind replaced the
  // element's children. A fresh render writes into the same detached node, so
  // the binding proceeds as an ordinary text binding.
  if (parent === null) return null
  parent.removeChild(text)

  // The binding's accessor IS a reactive child: the hydrator primes it once.
  // A placeholder is only ever parked by an adoption build, and adoption runs
  // under `hydrateRoot`, which registered the hydrator first.
  return (_slotHydrator as SlotHydrator)(child as unknown as VNodeChild, parent, open)
}
