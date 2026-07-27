/**
 * Event delegation — single listener per event type on the mount container.
 *
 * Instead of calling addEventListener on every element, the compiler emits
 * `el.__click = handler` (expando property). A single delegated listener on the
 * container walks event.target up the DOM tree, checking for expandos.
 *
 * Benefits:
 * - Saves ~2000 addEventListener calls for 1000 rows with 2 handlers each
 * - Reduces memory per row (no per-element listener closure)
 * - Faster initial mount (~0.4-0.8ms savings on 1000-row benchmarks)
 */

import { batch } from '@pyreon/reactivity'

/**
 * Events that are delegated (common bubbling events).
 * Non-bubbling events (focus, blur, mouseenter, mouseleave, load, error, scroll)
 * are NOT delegated — they must use addEventListener.
 */
export const DELEGATED_EVENTS = new Set([
  'click',
  'dblclick',
  'contextmenu',
  'focusin',
  'focusout',
  'input',
  'change',
  'keydown',
  'keyup',
  'mousedown',
  'mouseup',
  'mousemove',
  'mouseover',
  'mouseout',
  'pointerdown',
  'pointerup',
  'pointermove',
  'pointerover',
  'pointerout',
  'touchstart',
  'touchend',
  'touchmove',
  'submit',
])

/**
 * Property name used on DOM elements to store delegated event handlers.
 * Format: `__ev_{eventName}` e.g. `__ev_click`, `__ev_input`
 */
export function delegatedPropName(eventName: string): string {
  return `__ev_${eventName}`
}

// Track which containers already have delegation installed
const _delegated = new WeakSet<Element>()

// Per-dispatch tag for cross-root dedup (see the listener below). Keyed on the
// (single, shared) event object so every delegation root on the propagation
// path reads the same set.
const DELEGATED_ELEMENTS = Symbol('pyreonDelegatedElements')

/**
 * Install delegation listeners on a container element.
 * Called once from mount(). Idempotent — safe to call multiple times.
 */
export function setupDelegation(container: Element): void {
  if (_delegated.has(container)) return
  _delegated.add(container)

  for (const eventName of DELEGATED_EVENTS) {
    const prop = delegatedPropName(eventName)
    container.addEventListener(eventName, (e: Event) => {
      // Dedup across NESTED delegation roots. A single mount has ONE root, but an
      // island hydrates via `hydrateRoot(islandMarker)`, installing a SECOND root
      // INSIDE the app's. A click then bubbles through BOTH listeners, each
      // walking `target -> its container`, firing every handler twice. Since
      // `dispatchEvent` reuses one Event object for the whole propagation path, we
      // tag it with the elements already invoked for THIS dispatch so an outer
      // root skips what an inner root handled. Allocated lazily, so the common
      // no-handler walk stays zero-alloc.
      const ev = e as Event & { [DELEGATED_ELEMENTS]?: Set<Element> }
      let el = e.target as (HTMLElement & Record<string, unknown>) | null
      while (el && el !== container) {
        const handler = el[prop]
        if (typeof handler === 'function') {
          let invoked = ev[DELEGATED_ELEMENTS]
          if (invoked === undefined) {
            invoked = new Set<Element>()
            Object.defineProperty(e, DELEGATED_ELEMENTS, {
              value: invoked,
              configurable: true,
            })
          }
          if (!invoked.has(el)) {
            invoked.add(el)
            // Per-handler `currentTarget` patch: native delegation leaves
            // `e.currentTarget` as the container, so `ev.currentTarget.value` in
            // user code would read from the container — silently undefined for
            // inputs. Pyreon's `TargetedEvent<E>` type PROMISES the matched
            // element, and React/Vue/Solid all do the same override.
            // `currentTarget` is a read-only accessor, so `defineProperty` with
            // `configurable: true` is the only portable way to set it.
            Object.defineProperty(e, 'currentTarget', {
              value: el,
              configurable: true,
            })
            batch(() => handler(e))
            // Don't break — allow ancestor handlers too (consistent with addEventListener)
            // But if stopPropagation was called, stop walking
            if (e.cancelBubble) break
          }
        }
        el = el.parentElement as (HTMLElement & Record<string, unknown>) | null
      }
    })
  }
}
