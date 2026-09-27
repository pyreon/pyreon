import { effect, onCleanup, untrack } from '@pyreon/reactivity'

export interface ElementBinding {
  /** Ref callback: registers the element, moves the registration on a swap, disposes on `null`. */
  ref: (el: HTMLElement | null) => void
}

/**
 * Bind a pdnd registration to an element that may mount LATER or be SWAPPED.
 *
 * The hooks used to read `options.element()` exactly once, on a microtask
 * after the hook ran. An element that mounted after that (behind `<Show>`, a
 * lazy branch, a data-dependent render) was never registered, and a swapped
 * element kept the registration on the detached old node — both silently.
 *
 * Two ways in, both re-resolving:
 *  - `ref` — attach it as the element's `ref`; every (el | null) call moves
 *    the registration, so mount order no longer matters.
 *  - the `element` getter — still resolved on a microtask (so a plain
 *    `let el` assigned by a ref is populated), but inside an effect, so a
 *    getter that reads a SIGNAL re-registers when that signal changes. A
 *    getter still `null` at that point (and no ref) gets a dev warning naming
 *    the fix, instead of a drop zone that never works.
 *
 * Cleanup contract: identity-based — one live registration, disposed on
 * re-register, on `ref(null)`, and when the owning scope is cleaned up.
 */
export function bindElement(
  hookName: string,
  getter: (() => HTMLElement | null) | undefined,
  register: (el: HTMLElement) => () => void,
): ElementBinding {
  let current: HTMLElement | null = null
  let cleanup: (() => void) | undefined
  let disposed = false
  let refUsed = false
  let stopGetter: (() => void) | undefined

  const attach = (el: HTMLElement | null): void => {
    if (disposed || el === current) return
    if (cleanup) {
      cleanup()
      cleanup = undefined
    }
    current = el
    if (el) cleanup = register(el)
  }

  const ref = (el: HTMLElement | null): void => {
    if (el) refUsed = true
    attach(el)
  }

  if (getter) {
    // Defer to the next microtask so a ref-assigned `let` is populated.
    queueMicrotask(() => {
      // Unmounted before the deferred setup ran — nothing to register.
      if (disposed || refUsed) return
      let first = true
      const e = effect(() => {
        const el = getter()
        untrack(() => {
          if (first && !el && !refUsed && process.env.NODE_ENV !== 'production') {
            console.warn(
              `[Pyreon] ${hookName}: element() returned null when the deferred setup ran, so nothing was registered. If the element mounts later (behind <Show>, a lazy branch), attach the returned \`ref\` to it instead (<div ref={ref}>), or read the element from a signal so the getter re-resolves.`,
            )
          }
          first = false
          // The ref wins once it has supplied an element.
          if (!refUsed) attach(el)
        })
      })
      stopGetter = () => e.dispose()
    })
  }

  onCleanup(() => {
    disposed = true
    stopGetter?.()
    if (cleanup) cleanup()
    cleanup = undefined
    current = null
  })

  return { ref }
}
