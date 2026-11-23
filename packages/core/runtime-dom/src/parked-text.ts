import type { VNodeChild } from '@pyreon/core'

/**
 * PARKED server content: an adoption build found server nodes that ONE later
 * bind line will claim, and the verifier cannot hand them over by position.
 *
 * - A compiled TEXT slot whose server content is not one text node (#4385). A
 *   text binding (`bindPolymorphicText`, `_bindText`, `_bindProp`) is
 *   polymorphic: `{parts(row)}` can render `['a ', <Code/>, ' b']`, which the
 *   server renders as elements. The compiled bind still resolves its slot to
 *   ONE text node, so that node is a PLACEHOLDER: inserted by the verifier for
 *   a sole slot (`null`: the element's other children are the content), by
 *   `_textSlot` for a trailing or mid range (its open `<!--$-->`).
 * - An EMPTY template element that `_setChild` fills (#4599) whose server
 *   content is structure: the ELEMENT is parked (`null`), so the build can
 *   sweep that content when no bind line claims it.
 *
 * Kept in the build's BATCH, never on the node: flat `[node, server, …]`, found
 * by identity (a build parks a few nodes). `_parkedPending` counts marks not
 * yet consumed, so every binding outside hydration pays one integer compare.
 */
export let _parkedPending = 0

/** `null`: the node's element's whole child list; a comment: that range. */
export type ParkedServer = Comment | null

export function _park(node: Text | Element, server: ParkedServer): void {
  _parkedPending++
  ;(_batch ??= []).push(node, server)
}

/** Consume `node`'s mark; `undefined` when it has none (or no longer). */
export function _takeParked(node: Node): ParkedServer | undefined {
  const b = _batch
  if (b !== null) {
    for (let i = 0; i < b.length; i += 2) {
      if (b[i] === node) {
        b[i] = null
        _parkedPending--
        return b[i + 1] as ParkedServer
      }
    }
  }

  return undefined
}

/**
 * The marks of ONE adoption build, as `[node, server, …]` (a consumed one has
 * `null` in place of its node). A binding that writes `.data` directly (the
 * selector-ternary and signal-method emits) never consumes a placeholder's
 * mark, and a bind with no `_setChild` never consumes an element's, so the
 * build sweeps what is left after its bind (`finishTplAdopt`). Frames nest (a
 * bind hydrates holes whose components build their own templates):
 * save/restore, never reset.
 */
let _batch: (Node | ParkedServer)[] | null = null

export function _beginParkBatch(): (Node | ParkedServer)[] | null {
  const prev = _batch
  _batch = null

  return prev
}

/** Close the batch opened by `_beginParkBatch`: every mark still in it is
 *  released (`_parkedPending`); returns the batch for the build's sweep. */
export function _endParkBatch(prev: (Node | ParkedServer)[] | null): (Node | ParkedServer)[] | null {
  const mine = _batch
  _batch = prev
  if (mine !== null) for (let i = 0; i < mine.length; i += 2) if (mine[i] !== null) _parkedPending--

  return mine
}

/**
 * USER CODE inside an adopting bind. A compiled bind runs its attribute lines
 * before its content lines, and two of those can run user code that reaches
 * the element: a `ref` (`_ref`) and a spread (`applyPropsWithRef`, which also
 * applies `innerHTML`). Before the first of them in a build, hydration HIDES
 * the server content of the build's claimable regions (an empty `_setChild`
 * element, a sole `<!>` slot, a #4385 sole text slot): it moves into a
 * fragment, so the user code sees the element exactly as a fresh render's
 * clone would (empty, or holding only its placeholder). The region's claimer
 * puts the content back where a fresh render mounts the value and hydrates
 * it; content nobody claims is dropped, or restored when the bind throws.
 * Nothing the user code did is ever adopted or removed. A build where no user
 * code ran hides nothing (`_userCodeHook`, registered by `hydrateRoot`; `null`
 * in a client-only app).
 */
export let _userCodeHook: (() => void) | null = null

export function _setUserCodeHook(h: () => void): void {
  _userCodeHook = h
}

/**
 * The current build's hidden content, `[element, fragment, anchor, …]`, or
 * `null` when no user code ran. `anchor` is where the content goes back: `null`
 * the end, a placeholder TEXT right after it, a stand-in COMMENT (a sole
 * slot's `<!>`) right before it.
 */
let _hidden: (Node | null)[] | null = null

export function _setHidden(h: (Node | null)[] | null): void {
  _hidden = h
}

/** The node after the content `_claimHidden` put back. */
export let _hiddenAfter: Node | null = null

/**
 * Claim `el`'s hidden server content: `undefined` when none was hidden (no
 * user code ran in this build; the element is as the verifier saw it).
 * Otherwise it goes back where a fresh render mounts the value (`reinsert`),
 * or is dropped (a text write replaces it), and its first node is returned
 * (`null`: the server rendered nothing there), with `_hiddenAfter` set.
 */
export function _claimHidden(el: Node, reinsert: boolean): ChildNode | null | undefined {
  const h = _hidden
  if (h === null) return undefined
  for (let i = 0; i < h.length; i += 3) {
    if (h[i] !== el) continue
    h[i] = null
    const frag = h[i + 1] as DocumentFragment
    const anchor = h[i + 2] as Node | null
    const first = frag.firstChild
    if (!reinsert) return first
    let before: Node | null = anchor === null ? null : anchor.nodeType === 3 ? anchor.nextSibling : anchor
    el.insertBefore(frag, before)
    if (anchor !== null && anchor.nodeType === 8) {
      before = anchor.nextSibling
      ;(anchor as ChildNode).remove()
    }
    _hiddenAfter = before

    return first
  }

  return undefined
}

/**
 * The slot hydrator, registered by `hydrateRoot` (never at module load, so CSR
 * bundles tree-shake it exactly like the `_tpl` adopt verifier). ONE seam for
 * its consumers: a compiled `_mountSlot` / `_setChild` (`template.ts`) and a
 * parked text placeholder (below). It lives here because `mount.ts`
 * (`bindPolymorphicText`) must reach it without importing `template.ts`.
 *
 * `server` is a range's open marker, or `null`: `parent`'s whole child list
 * (after `at` when that is a placeholder). `at` says where a fresh render puts
 * the value: `null` at the end of `parent` (`_setChild` appends), a #4385
 * placeholder, or `undefined` wherever the server's run is (a sole slot).
 */
export type SlotHydrator = (
  children: VNodeChild | VNodeChild[],
  parent: Node,
  server: ParkedServer | null,
  at?: Node | null,
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
  // The binding's accessor IS a reactive child: the hydrator primes it once.
  // A placeholder is only ever parked by an adoption build, and adoption runs
  // under `hydrateRoot`, which registered the hydrator first. A sole slot's
  // content is the placeholder's element's other children, hydrated AT the
  // placeholder (a fresh render mounts there); a range stands where the
  // placeholder's `<!>` was.
  const hydrate = _slotHydrator as SlotHydrator
  if (server === null) {
    const cleanup = hydrate(child as unknown as VNodeChild, parent, null, text)
    text.remove()

    return cleanup
  }
  parent.removeChild(text)

  return hydrate(child as unknown as VNodeChild, parent, server)
}
