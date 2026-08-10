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
 * Watch `event` dispatches on `window` and report what the delegation layer
 * tagged onto them. Install BEFORE the dispatch under test.
 *
 * Round 2 of the CI-only double-fire investigation. Round 1 (tag-symbol
 * count) ruled OUT the duplicate-runtime theory: ONE symbol, invoked=1 —
 * a single instance whose delegation walk invoked the handler once per
 * event. That leaves exactly two mechanisms for a doubled counter, and
 * round 1 could not tell them apart because it captured only the LAST
 * event:
 *
 *   (a) TWO click events were dispatched (something re-dispatches/replays);
 *   (b) one event, with a SECOND, non-delegated listener also invoking the
 *       handler (a stray addEventListener somewhere).
 *
 * So this version counts EVERY dispatch (with per-event tag state),
 * counts `HTMLElement.prototype.click` calls, and records click-listener
 * registrations while armed. Those three numbers fully determine the
 * mechanism: events=2 → (a), and clickCalls tells whether the second came
 * through el.click(); events=1 + a registration on button/container →
 * (b) with the culprit's constructor named.
 */
export function watchDispatch(eventName = 'click'): DispatchDiagnostics {
  interface Seen {
    targetDesc: string
    tags: TagInfo[]
    isTrusted: boolean
  }
  const seen: Seen[] = []
  let clickCalls = 0
  const registrations: string[] = []

  const describeTarget = (t: EventTarget | null): string => {
    if (t === null) return '<none>'
    if (t instanceof Element) return `${t.nodeName.toLowerCase()}.${t.className || '·'}`
    if (t === window) return 'window'
    if (t === document) return 'document'
    return Object.prototype.toString.call(t)
  }

  const onEvent = (e: Event): void => {
    const ev = e as Event & Record<symbol, unknown>
    const tags: TagInfo[] = []
    for (const sym of Object.getOwnPropertySymbols(ev)) {
      const desc = sym.description ?? '<anonymous>'
      if (!desc.toLowerCase().includes('delegated')) continue
      const value = ev[sym]
      tags.push({ description: desc, size: value instanceof Set ? value.size : -1 })
    }
    seen.push({ targetDesc: describeTarget(e.target), tags, isTrusted: e.isTrusted })
  }
  // Bubble phase: runs after the delegation roots between target and window.
  window.addEventListener(eventName, onEvent)

  // Spy el.click() — a second DISPATCH via .click() shows up here.
  const origClick = HTMLElement.prototype.click
  HTMLElement.prototype.click = function patchedClick(this: HTMLElement) {
    clickCalls++
    return origClick.call(this)
  }
  // Record click-listener REGISTRATIONS made while armed — mechanism (b)
  // requires one, and the stack's top frame names the culprit.
  const origAdd = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function patchedAdd(
    this: EventTarget,
    type: string,
    ...rest: unknown[]
  ) {
    if (type === eventName) {
      const site = (new Error().stack ?? '').split('\n')[2]?.trim() ?? '<no stack>'
      registrations.push(`${describeTarget(this)} @ ${site}`)
    }
    return (origAdd as (this: EventTarget, t: string, ...r: unknown[]) => void).call(
      this,
      type,
      ...rest,
    )
  }

  const describe = (): string => {
    try {
      if (seen.length === 0) {
        return `no ${eventName} reached window — the dispatch never propagated`
      }
      const events = seen
        .map((s, i) => {
          const tagStr =
            s.tags.length === 0
              ? 'NO delegation tag (bypassed the delegated path)'
              : s.tags.map((t) => `${t.description}(invoked=${t.size})`).join('+')
          return `#${i + 1} target=${s.targetDesc} trusted=${s.isTrusted} ${tagStr}`
        })
        .join(' | ')
      const regStr =
        registrations.length === 0 ? 'none' : registrations.join(' ; ')
      const verdict =
        seen.length > 1
          ? `${seen.length} SEPARATE ${eventName} events dispatched (clickCalls=${clickCalls}) — something re-dispatches`
          : `ONE event (clickCalls=${clickCalls}) — a second invocation must come from an extra listener`
      return `events=[${events}]; listenersAddedWhileArmed=[${regStr}]; ${verdict}`
    } catch (err) {
      // A diagnostic that throws while building its message replaces a
      // diagnosable failure with an opaque one — the exact thing this exists
      // to prevent.
      return `<diagnostics unavailable: ${(err as Error).message}>`
    }
  }

  return {
    describe,
    stop: () => {
      window.removeEventListener(eventName, onEvent)
      HTMLElement.prototype.click = origClick
      EventTarget.prototype.addEventListener = origAdd
    },
  }
}
