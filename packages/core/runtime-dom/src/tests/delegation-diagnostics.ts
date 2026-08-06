/**
 * Diagnostics for a delegated-dispatch assertion that can only fail remotely.
 *
 * `rs-collapse-h` / `rs-collapse-dyn-h` began reporting a handler firing twice
 * for a single `btn.click()` — on CI only, four runs in a row, while the same
 * files passed 25/25 locally and on `main`. A bare `expected 2 to be 1` cannot
 * distinguish the two mechanisms that can produce it, so every diagnosis is a
 * guess and the guesses turn into speculative fixes.
 *
 * There are exactly two ways one click reaches a delegated handler twice:
 *
 *   1. TWO delegation roots on the propagation path failed to dedupe. They
 *      dedupe by tagging the shared Event object with a module-local
 *      `Symbol('pyreonDelegatedElements')` (see `delegate.ts`). Two COPIES of
 *      `@pyreon/runtime-dom` in one bundle hold two different symbols, so
 *      neither sees the other's tag and both invoke.
 *   2. Two listeners for the same event on the same container — again only
 *      possible across two module copies, since `setupDelegation` guards with a
 *      module-local `WeakSet`.
 *
 * Both reduce to "is the runtime duplicated?", and that is *observable*: the
 * tag symbols are own properties of the event, so counting DISTINCT symbols
 * named `pyreonDelegatedElements` after a dispatch answers it outright. One
 * symbol means a single runtime and the cause is elsewhere; two means a
 * duplicate-instance bundle and the fix belongs in resolution, not in the
 * delegation code.
 *
 * The listener is bubble-phase on `window` so it runs AFTER every delegation
 * root has had its turn and the tag is fully populated.
 */

interface TagInfo {
  description: string
  size: number
}

export interface DispatchDiagnostics {
  /** Human-readable observed state. Safe to call even if nothing was captured. */
  describe: () => string
  /** Remove the listener. Call from the test's cleanup. */
  stop: () => void
}

/**
 * Watch the next `event` dispatch on `window` and report what the delegation
 * layer tagged onto it. Install BEFORE the dispatch under test.
 */
export function watchDispatch(eventName = 'click'): DispatchDiagnostics {
  let captured: Event | null = null
  const onEvent = (e: Event): void => {
    captured = e
  }
  // Bubble phase: runs after the delegation roots between target and window.
  window.addEventListener(eventName, onEvent)

  const describe = (): string => {
    try {
      if (captured === null) {
        return `no ${eventName} reached window — the dispatch never propagated`
      }
      const ev = captured as Event & Record<symbol, unknown>
      const tags: TagInfo[] = []
      for (const sym of Object.getOwnPropertySymbols(ev)) {
        const desc = sym.description ?? '<anonymous>'
        if (!desc.toLowerCase().includes('delegated')) continue
        const value = ev[sym]
        tags.push({
          description: desc,
          size: value instanceof Set ? value.size : -1,
        })
      }
      const target = captured.target as Element | null
      const targetDesc =
        target === null ? '<none>' : `${target.nodeName.toLowerCase()}.${target.className || '·'}`

      if (tags.length === 0) {
        return `target=${targetDesc}; NO delegation tag on the event — the handler ran outside the delegated path (a direct addEventListener?)`
      }
      const rendered = tags.map((t, i) => `#${i + 1} ${t.description} (invoked=${t.size})`).join(', ')
      const verdict =
        tags.length > 1
          ? 'TWO+ DISTINCT tag symbols ⇒ @pyreon/runtime-dom is DUPLICATED in this bundle; the roots cannot dedupe across copies'
          : 'ONE tag symbol ⇒ a single runtime instance; the double fire is NOT a duplicate-module problem'
      return `target=${targetDesc}; tags=[${rendered}]; ${verdict}`
    } catch (err) {
      // A diagnostic that throws while building its message replaces a
      // diagnosable failure with an opaque one — the exact thing this exists
      // to prevent.
      return `<diagnostics unavailable: ${(err as Error).message}>`
    }
  }

  return { describe, stop: () => window.removeEventListener(eventName, onEvent) }
}
