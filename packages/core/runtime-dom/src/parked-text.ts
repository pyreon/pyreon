import type { VNodeChild } from '@pyreon/core'

/**
 * PARKED server content: what an adoption build has not yet handed to the bind
 * line that claims it. Two kinds share one mark and one per-build list.
 *
 * A compiled TEXT slot whose server content is not one text node (#4385). A
 * text binding (`bindPolymorphicText`, `_bindText`, `_bindProp`) is
 * polymorphic: `{parts(row)}` can render `['a ', <Code/>, ' b']`, and the
 * server renders that as elements. The compiled bind still resolves its slot to
 * ONE text node, so the slot's resolved text node is a PLACEHOLDER marked with
 * where the server content is: `null` for the element's whole child list (a
 * sole slot, markers elided by SSR), or the range's open `<!--$-->` comment.
 * The binding that receives it hands its accessor to the slot hydrator
 * (`hydrateMountSlot`), which adopts the content as a live reactive slot exactly
 * as a compiled `_mountSlot` does, reporting any real divergence.
 *
 * A `_setChild` REGION (#4599): an element the template leaves empty, holding
 * the server's marker-less rendering of a structural value. The element itself
 * is marked, with the server's FIRST child as recorded by the verifier, or with
 * a fragment once user code ran (`_hideRegions` in `regions.ts`). `_setChild`
 * claims it by identity through the slot hydrator.
 *
 * Carried on the node (leak class C: never a registry), and never on a plain
 * text cell. `_parkedPending` counts marked nodes not yet consumed, so every
 * binding outside hydration pays one integer compare and nothing else.
 */
export const PARKED: unique symbol = Symbol('pyreon.parked')
export type Parked = Node & { [PARKED]?: Node | null | undefined }

export let _parkedPending = 0

export function _park(node: Node, server: Node | null): void {
  ;(node as Parked)[PARKED] = server
  _parkedPending++
  ;(_batch ??= []).push(node)
}

/**
 * Consume `node`'s mark: what it records (see above), or `undefined` when the
 * node is not (or no longer) parked.
 */
export function _takeParked(node: Node): Node | null | undefined {
  const server = (node as Parked)[PARKED]
  if (server !== undefined) {
    ;(node as Parked)[PARKED] = undefined
    _parkedPending--
  }

  return server
}

/**
 * The nodes parked during ONE adoption build. A binding that writes `.data`
 * directly (the selector-ternary and signal-method emits) never consumes a text
 * mark, and a region the client renders empty is never claimed. The build that
 * parked them settles what is left after its bind (`sweepParkedTexts` in
 * `template.ts`, and `_parkCloser` for regions, registered by `hydrateRoot`):
 * after a completed bind the unclaimed server content goes (what a clone
 * renders) and the change is reported; after a bind that THREW every mark is
 * released and nothing is removed. Frames nest (a bind hydrates holes and
 * regions whose components build their own templates): save/restore, never
 * reset.
 */
export let _batch: Node[] | null = null

export function _beginParkBatch(): Node[] | null {
  const prev = _batch
  _batch = null

  return prev
}

/** Close the batch opened by `_beginParkBatch`; returns what it parked. */
export function _endParkBatch(prev: Node[] | null): Node[] | null {
  const mine = _batch
  _batch = prev

  return mine
}

/** Settles a closed batch's regions (`_settleRegions` in `regions.ts`). */
export let _parkCloser: ((parked: Node[], done: boolean) => void) | null = null

/**
 * Called before a compiled bind hands an element to USER code (`_ref`, a spread
 * through `applyPropsWithRef`): `_hideRegions` in `regions.ts` hides the server
 * content of the running build's regions, so that code sees each element as a
 * fresh render's clone has it, empty.
 */
export let _userCodeHook: ((el: Element) => void) | null = null

/** Both registered by `hydrateRoot`, so a client-only bundle carries neither. */
export function _setParkHooks(hide: (el: Element) => void, settle: (parked: Node[], done: boolean) => void): void {
  _userCodeHook = hide
  _parkCloser = settle
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
  const open = _takeParked(text) as Comment | null | undefined
  if (open === undefined) return null
  const parent = text.parentNode as Node
  parent.removeChild(text)

  // The binding's accessor IS a reactive child: the hydrator primes it once.
  // A placeholder is only ever parked by an adoption build, and adoption runs
  // under `hydrateRoot`, which registered the hydrator first.
  return (_slotHydrator as SlotHydrator)(child as unknown as VNodeChild, parent, open)
}
