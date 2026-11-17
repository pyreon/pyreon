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

export function _parkText(text: Text, open: Comment | null): void {
  ;(text as ParkedText)[PARKED_TEXT] = open
  _parkedPending++
  ;(_batch ??= []).push(text)
}

/**
 * The placeholders branded during ONE adoption build. A binding that writes
 * `.data` directly (the selector-ternary and signal-method emits) never consumes
 * a brand. In agreement it never meets one (its server content is one text
 * node), but on a divergence the server's nodes would stay beside the text it
 * writes. So the build that branded them sweeps any left unconsumed after its
 * bind: the server content goes (what the slot did before) and the rewrite is
 * reported. Frames nest (a bind hydrates holes whose components build their own
 * templates): save/restore, never reset.
 */
let _batch: Text[] | null = null

export function _beginParkBatch(): Text[] | null {
  const prev = _batch
  _batch = null
  return prev
}

export function _endParkBatch(
  prev: Text[] | null,
  clearRange: (open: Comment) => string,
  report: (text: Text, serverText: string) => void,
): void {
  const mine = _batch
  _batch = prev
  if (mine === null) return
  for (const text of mine) {
    const open = (text as ParkedText)[PARKED_TEXT]
    if (open === undefined) continue
    ;(text as ParkedText)[PARKED_TEXT] = undefined
    _parkedPending--
    const parent = text.parentNode
    if (parent === null) continue
    let server = ''
    if (open === null) {
      // Sole slot: every other child of the element is server content.
      for (let n = parent.firstChild; n !== null; ) {
        const nx = n.nextSibling
        if (n !== text) {
          server += n.textContent ?? ''
          parent.removeChild(n)
        }
        n = nx
      }
    } else {
      server = clearRange(open)
    }
    report(text, server)
  }
}

export type ParkedTextHydrator = (
  child: VNodeChild | VNodeChild[],
  parent: Node,
  open: Comment | null,
) => () => void

let _hydrator: ParkedTextHydrator | null = null

/** Registered by `hydrateRoot` (never at module load, so CSR bundles tree-shake it). */
export function _setParkedTextHydrator(h: ParkedTextHydrator): void {
  _hydrator = h
}

/**
 * If `text` is a parked slot placeholder, remove it and adopt the server content
 * for `child`; returns the slot's cleanup, or `null` for an ordinary text node.
 */
export function _adoptParkedText(text: Text, child: () => VNodeChild): (() => void) | null {
  const open = (text as ParkedText)[PARKED_TEXT]
  if (open === undefined || _hydrator === null) return null
  ;(text as ParkedText)[PARKED_TEXT] = undefined
  _parkedPending--
  const parent = text.parentNode as Node
  parent.removeChild(text)
  // The binding's accessor IS a reactive child: the hydrator primes it once.
  return _hydrator(child as unknown as VNodeChild, parent, open)
}
