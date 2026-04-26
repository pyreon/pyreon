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
      let el = e.target as (HTMLElement & Record<string, unknown>) | null
      while (el && el !== container) {
        const handler = el[prop]
        if (typeof handler === 'function') {
          // Per-handler `currentTarget` patch: native event delegation leaves
          // `e.currentTarget` as the container (the listener root). Without
          // this override, `ev.currentTarget.value` in user code reads from
          // the container — silently `undefined` for inputs, the wrong tag
          // type, etc. Pyreon's `TargetedEvent<E>` type *promises* the
          // matched element; this override makes the runtime keep that
          // promise, matching what React, Vue, and Solid all do for
          // delegated events.
          //
          // `currentTarget` is a read-only accessor on native Event types,
          // so direct assignment is silently ignored — `Object.defineProperty`
          // with `configurable: true` is the only portable override.
          Object.defineProperty(e, 'currentTarget', {
            value: el,
            configurable: true,
          })
          batch(() => handler(e))
          // Don't break — allow ancestor handlers too (consistent with addEventListener)
          // But if stopPropagation was called, stop walking
          if (e.cancelBubble) break
        }
        el = el.parentElement as (HTMLElement & Record<string, unknown>) | null
      }
    })
  }
}
