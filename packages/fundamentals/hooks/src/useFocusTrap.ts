import { onMount } from '@pyreon/core'
import { isServer, watch } from '@pyreon/reactivity'

/**
 * Where focus should land when the trap ACTIVATES.
 *
 * - `false` / omitted — leave focus where it is (the pre-0.x default; the
 *   caller or a native `<dialog>` owns initial focus).
 * - `true` — focus the `[data-autofocus]` descendant when present, else the
 *   first tabbable descendant of the container.
 * - a CSS selector string — focus the first matching descendant.
 * - an element or `() => element` — focus that node.
 */
export type InitialFocusTarget =
  | boolean
  | string
  | HTMLElement
  | (() => HTMLElement | null)

export interface UseFocusTrapOptions {
  /**
   * Whether the trap is armed. Pass a getter (`() => isOpen()`) to arm/disarm
   * it reactively — while inactive the keydown listener is removed and no
   * cycling happens. Defaults to `true` (armed for the hook's whole lifetime).
   */
  active?: boolean | (() => boolean)
  /**
   * Move focus INTO the container when the trap activates. Defaults to `false`
   * (no focus move — byte-identical to the pre-0.x single-arg behavior). Set
   * `true` for the first tabbable, or a selector / element / getter to target a
   * specific node. Skipped when focus is already inside the container.
   */
  initialFocus?: InitialFocusTarget
}

// Superset of the WHATWG "focusable area" set, mirroring focus-trap /
// react-aria. `[tabindex]` (any value) is collected then filtered by effective
// tabindex so `tabindex="-1"` on ANY element is excluded — not just the generic
// `[tabindex]` case the old selector special-cased.
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  'details > summary:first-of-type',
  '[tabindex]',
].join(',')

/**
 * The element's effective tabindex for ORDERING. An explicit numeric
 * `tabindex` attribute wins; otherwise the element (matched by the focusable
 * selector) is natural-order tabindex 0. We read the ATTRIBUTE rather than the
 * `el.tabIndex` IDL property because DOM implementations disagree on the
 * default IDL value for intrinsically-focusable elements (a bare `<button>` is
 * `0` in Chromium but has been observed as `-1` in some polyfills) — the
 * attribute is portable.
 */
function orderTabIndex(el: HTMLElement): number {
  const attr = el.getAttribute('tabindex')
  if (attr !== null) {
    const n = Number.parseInt(attr, 10)
    if (!Number.isNaN(n)) return n
  }
  return 0
}

/** Tabbable = not explicitly removed from the tab order (`tabindex < 0`). */
function isTabbable(el: HTMLElement): boolean {
  const attr = el.getAttribute('tabindex')
  if (attr !== null) {
    const n = Number.parseInt(attr, 10)
    if (!Number.isNaN(n) && n < 0) return false
  }
  return true
}

/**
 * A form control disabled directly OR by an ancestor `<fieldset disabled>`
 * (except within that fieldset's first `<legend>`, which stays interactive).
 */
function isDisabled(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement | HTMLInputElement).disabled) return true
  const fieldset = el.closest('fieldset[disabled]')
  if (fieldset) {
    const legend = fieldset.querySelector(':scope > legend')
    if (!legend || !legend.contains(el)) return true
  }
  return false
}

/**
 * Whether the element is invisible / inert and therefore un-tabbable. Uses the
 * element's own `checkVisibility()` in real browsers (authoritative for
 * `display:none` up the ancestor chain, `visibility:hidden/collapse`, and
 * `content-visibility`, paired with a client-rect zero-size check). Falls back
 * to computed CSS via the element's OWN view in layout-less environments
 * (happy-dom / jsdom) — always through `el.ownerDocument.defaultView`, never a
 * bare `getComputedStyle`/`window` global, so this stays SSR-safe + iframe-correct.
 */
function isHidden(el: HTMLElement): boolean {
  if (el.closest('[inert]')) return true
  if (el.hasAttribute('hidden')) return true

  const withCheck = el as HTMLElement & {
    checkVisibility?: (opts?: {
      visibilityProperty?: boolean
      contentVisibilityAuto?: boolean
    }) => boolean
  }
  /* v8 ignore start — real-browser-only branch (happy-dom has no
     checkVisibility); exercised by useFocusTrap.browser.test.ts's
     "skips display:none / [hidden] / inert nodes" + "video[controls]" specs. */
  if (typeof withCheck.checkVisibility === 'function') {
    if (
      !withCheck.checkVisibility({
        visibilityProperty: true,
        contentVisibilityAuto: true,
      })
    ) {
      return true
    }
    // Real layout available — a zero-size box has no client rects.
    return el.getClientRects().length === 0
  }
  /* v8 ignore stop */

  const view = el.ownerDocument.defaultView
  /* v8 ignore next — a detached element with no defaultView is unreachable in
     the node/happy-dom suite (ownerDocument.defaultView is always set); the
     guard exists purely for SSR/robustness. */
  if (!view) return false
  const style = view.getComputedStyle(el)
  return (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse'
  )
}

/**
 * Tabbable descendants of `container`, in TAB order: positive-`tabindex`
 * elements first (ascending, document order as tiebreak), then the natural /
 * `tabindex="0"` group in document order. Hidden, inert, disabled, and
 * `tabindex="-1"` nodes are filtered out.
 *
 * Exported for the sibling browser test + potential internal reuse; NOT
 * re-exported from the package entry (it stays an implementation detail).
 */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => isTabbable(el) && !isDisabled(el) && !isHidden(el))

  const positive: HTMLElement[] = []
  const natural: HTMLElement[] = []
  for (const el of nodes) {
    if (orderTabIndex(el) > 0) positive.push(el)
    else natural.push(el)
  }
  // V8's sort is stable, and `nodes` is already in document order, so equal
  // tabindex values keep their document order.
  positive.sort((a, b) => orderTabIndex(a) - orderTabIndex(b))
  return [...positive, ...natural]
}

/** Resolve an {@link InitialFocusTarget} against the container. */
function resolveInitialFocus(
  container: HTMLElement,
  target: InitialFocusTarget | undefined,
): HTMLElement | null {
  if (target === undefined || target === false) return null
  if (target === true) {
    // `[data-autofocus]` is the author's declarative "focus me on open" marker
    // (the safe Cancel button in a destructive-action dialog, the search field
    // in a command palette). It wins over document-order-first when present.
    return (
      container.querySelector<HTMLElement>('[data-autofocus]') ??
      getFocusable(container)[0] ??
      null
    )
  }
  if (typeof target === 'string') {
    return container.querySelector<HTMLElement>(target)
  }
  if (typeof target === 'function') return target()
  return target
}

// ---------------------------------------------------------------------------
// Trap scope stack — ONE shared pair of document listeners, only the TOP
// active trap handles events.
//
// Pre-stack, every trap registered its own document keydown listener; two
// stacked modals (both armed) then both reacted to the same Tab event and a
// background trap could keep cycling focus BEHIND the top-most dialog. The
// stack makes "who owns focus" explicit: traps push a frame on activation
// (activation order = stacking order — arm traps with `active` tied to their
// open state) and only the topmost frame whose `getEl()` is non-null acts.
//
// Cleanup contract (Memory-Leak-Class A): frames are removed by IDENTITY
// (`lastIndexOf` + `splice`), never a position-based `pop()` — traps can
// deactivate in any order (a `<For>`-keyed removal, an outer route unmounting
// before an inner overlay). The shared listeners are refcounted by stack
// length (Class D): installed on 0→1, removed on →0.
// ---------------------------------------------------------------------------

interface TrapFrame {
  getEl: () => HTMLElement | null
  /**
   * Live re-check at event time. The reactive `watch` already pushes /
   * removes the frame on tracked `active` flips; this covers a NON-reactive
   * getter (a plain `let` the watch can't observe) flipping false while the
   * frame is still pushed — the pre-stack listener had the same guard.
   */
  isActive: () => boolean
}

const trapStack: TrapFrame[] = []

/**
 * The topmost frame that is live: `isActive()` true AND `getEl()` non-null.
 * Null-element frames are skipped (a trap whose element is conditionally
 * unmounted is inert), so a lifetime-armed trap over a closed dialog never
 * blocks a live trap beneath it.
 */
function topTrap(): { frame: TrapFrame; el: HTMLElement } | null {
  for (let i = trapStack.length - 1; i >= 0; i--) {
    const frame = trapStack[i] as TrapFrame
    if (!frame.isActive()) continue
    const el = frame.getEl()
    if (el) return { frame, el }
  }
  return null
}

function onSharedKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Tab') return
  const top = topTrap()
  if (!top) return
  const { el } = top
  // Focus outside the owning container: don't wrap against a container the
  // user isn't in — the focusin containment below is responsible for bringing
  // focus back.
  if (!el.contains(document.activeElement)) return

  const focusable = getFocusable(el)
  if (focusable.length === 0) return

  const first = focusable[0] as HTMLElement
  const last = focusable[focusable.length - 1] as HTMLElement

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault()
      last.focus()
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

// Dedupe queued recaptures — a burst of focus events schedules ONE re-check.
let recapturePending = false

/**
 * Focusin containment: Tab-only trapping misses programmatic `.focus()` and
 * mouse clicks on focusable elements outside the container. Whenever focus
 * lands OUTSIDE the top trap's container, recapture it to `[data-autofocus]`,
 * else the first tabbable, else the container itself (focusable when it
 * carries `tabindex="-1"`, the standard dialog shape).
 *
 * The recapture is deferred one microtask and re-checked against the LIVE
 * stack + DOM: a close flow that restores focus to the trigger and unmounts
 * the dialog in the same synchronous flush must NOT have the dying trap yank
 * focus back (effects flush synchronously, so by microtask time the stack /
 * `getEl()` reflect the post-close state). Loop-safe by construction: the
 * recapture target is INSIDE the container, so the focusin it fires
 * early-returns on the containment check.
 */
function onSharedFocusIn(e: FocusEvent): void {
  const top = topTrap()
  if (!top) return
  const target = e.target
  if (target instanceof Node && top.el.contains(target)) return
  if (recapturePending) return
  recapturePending = true
  queueMicrotask(() => {
    recapturePending = false
    const now = topTrap()
    if (!now) return
    const el = now.el
    /* v8 ignore next 3 — disconnected-container race (trap unmounting in the
       same flush); exercised implicitly by the modal close flow, not
       deterministically reachable in the unit suite. */
    if (!el.isConnected) return
    const active = document.activeElement
    if (active && el.contains(active)) return
    const dest =
      el.querySelector<HTMLElement>('[data-autofocus]') ??
      getFocusable(el)[0] ??
      el
    dest.focus?.()
  })
}

function pushFrame(frame: TrapFrame): void {
  trapStack.push(frame)
  if (trapStack.length === 1) {
    document.addEventListener('keydown', onSharedKeydown)
    document.addEventListener('focusin', onSharedFocusIn)
  }
}

function removeFrame(frame: TrapFrame): void {
  const i = trapStack.lastIndexOf(frame)
  /* v8 ignore next — double-removal guard (detach is idempotent upstream). */
  if (i === -1) return
  trapStack.splice(i, 1)
  if (trapStack.length === 0) {
    document.removeEventListener('keydown', onSharedKeydown)
    document.removeEventListener('focusin', onSharedFocusIn)
  }
}

/**
 * Trap focus within a container element — Tab / Shift+Tab edge wrapping PLUS
 * focusin containment (a programmatic `.focus()` or mouse click that lands
 * focus outside the container is recaptured back in), with optional reactive
 * arming + initial-focus placement.
 *
 * Concurrent traps form a STACK: activation order is stacking order, only the
 * topmost trap whose container exists handles events, and deactivating /
 * unmounting the top trap reactivates the one beneath (two stacked modals no
 * longer fight over the same Tab event). Arm each trap with `active` tied to
 * its open state so the stack tracks OPEN order, not mount order.
 *
 * The second argument accepts either a plain `active` getter/boolean (the
 * shorthand documented on this hook) or a full options object:
 *
 * @example
 * ```tsx
 * const isOpen = signal(false)
 * const modalRef = signal<HTMLElement | null>(null)
 *
 * // Shorthand: arm/disarm reactively.
 * useFocusTrap(() => modalRef(), () => isOpen())
 *
 * // Options object: also move focus to the first field on open.
 * useFocusTrap(() => modalRef(), {
 *   active: () => isOpen(),
 *   initialFocus: true, // or '[name=email]', or an element, or a getter
 * })
 * ```
 *
 * Backward-compatible: the original single-argument call
 * (`useFocusTrap(() => el)`) is unchanged — armed for the hook's lifetime, no
 * focus move. SSR-safe (no-op on the server) and self-cleaning (the listener +
 * reactive watcher are removed on unmount).
 */
export function useFocusTrap(
  getEl: () => HTMLElement | null,
  options?: UseFocusTrapOptions | boolean | (() => boolean),
): void {
  /* v8 ignore next — SSR/isServer guard; tests run with happy-dom */
  if (isServer) return

  // Normalize the overloaded 2nd arg. A boolean / function is the `active`
  // shorthand (the form the README + manifest already document positionally);
  // an object is the full options bag; undefined is the single-arg call.
  let opts: UseFocusTrapOptions
  if (typeof options === 'object' && options !== null) {
    opts = options
  } else if (options === undefined) {
    opts = {}
  } else {
    opts = { active: options }
  }

  const rawActive = opts.active
  const isActive: () => boolean =
    rawActive === undefined
      ? () => true
      : typeof rawActive === 'function'
        ? rawActive
        : () => rawActive

  // Frame push/removal + DOM access live inside `onMount` so their
  // browser-only references are co-located with their browser-only
  // registration.
  onMount(() => {
    const frame: TrapFrame = { getEl, isActive }
    let pushed = false

    const attach = () => {
      if (pushed) return
      pushFrame(frame)
      pushed = true
    }
    const detach = () => {
      if (!pushed) return
      removeFrame(frame)
      pushed = false
    }

    const applyInitialFocus = () => {
      const el = getEl()
      if (!el) return
      // Don't steal focus that's already inside the container.
      if (el.contains(document.activeElement)) return
      resolveInitialFocus(el, opts.initialFocus)?.focus?.()
    }

    // Arm / disarm on the reactive `active` state. `immediate` runs the current
    // state at mount, so a trap that mounts already-active is armed straight
    // away (matching the pre-0.x always-on behavior for the default case).
    const stop = watch(
      isActive,
      (active) => {
        if (active) {
          attach()
          applyInitialFocus()
        } else {
          detach()
        }
      },
      { immediate: true },
    )

    return () => {
      stop()
      detach()
    }
  })
}

export default useFocusTrap
