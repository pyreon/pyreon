// ─── happy-dom spec-parity patch: no `hashchange` from pushState/replaceState ─
//
// Real browsers do NOT fire `hashchange` for `history.pushState` /
// `history.replaceState` (WHATWG HTML: only fragment NAVIGATIONS fire it).
// happy-dom's `Location[PropertySymbol.setURL]` — which History.pushState/
// replaceState delegate to — queues one on a `setTimeout` whenever the URL
// hash differs. Because that dispatch is DEFERRED, the synthetic event can
// land during the NEXT test, where any listener that treats `hashchange` as a
// genuine traversal (e.g. `@pyreon/router`'s browser-navigation handler, which
// routes it through the full navigation pipeline exactly like a real Back)
// sees the stale echo as a fresh navigation — superseding the new test's
// in-flight navigation, or (the `@pyreon/a11y` shape) firing the route
// announcer for a traversal the test never made. The failure is happy-dom-ONLY
// and LOAD-DEPENDENT in the wild (the echo needs event-loop pressure to cross
// a spec boundary), which is why it presents as CI flake.
//
// The guard counts hash-CHANGING pushState/replaceState calls and swallows
// that many happy-dom-synthesized `hashchange` events in a capture-phase
// listener registered before any consumer listener. Synthetic events are
// discriminated from tests' manual `new HashChangeEvent('hashchange')`
// dispatches by the non-empty `oldURL` happy-dom populates (manual test
// events leave it `''`), so `replaceState + dispatchEvent(hashchange)`
// back-button simulations still reach the router. `location.hash = …`
// assignments (a REAL fragment navigation — hashchange IS spec there) do
// not go through the wrapped History methods and are never swallowed.
//
// Install it from a package's vitest `setupFiles` entry (see
// `packages/core/router/src/tests/setup.ts` and
// `packages/fundamentals/a11y/src/tests/setup.ts`). ANY package that drives a
// real `@pyreon/router` instance in happy-dom node tests MUST install this —
// the router's default mode is `hash`, so every `router.push` is a
// hash-changing `pushState` that queues an echo for the next spec.

/**
 * Idempotency marker on the WINDOW (not module scope): vitest re-evaluates
 * setup modules per test file, but environments and module registries reset
 * on different boundaries — keying on the window guarantees exactly one
 * install per DOM instance (leak-class D: no listener pile-up, no
 * double-wrapped History methods over-counting).
 */
const INSTALLED = Symbol.for('pyreon:happy-dom-hashchange-echo-guard')

/**
 * Suppress happy-dom's non-spec deferred `hashchange` echoes for
 * `history.pushState` / `history.replaceState`.
 *
 * Call once from a vitest `setupFiles` module in any package whose happy-dom
 * tests drive a real router (or otherwise listen for `hashchange`). No-ops
 * outside a DOM environment and on repeat calls against the same window.
 */
export function installHappyDomHashchangeEchoGuard(): void {
  if (typeof window === 'undefined') return
  const marker = window as unknown as Record<symbol, boolean | undefined>
  if (marker[INSTALLED]) return
  marker[INSTALLED] = true

  let pendingSyntheticHashEvents = 0

  function wrapHistoryWrite(
    orig: (data: unknown, unused: string, url?: string | URL | null) => void,
  ): (data: unknown, unused: string, url?: string | URL | null) => void {
    return function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      const hashBefore = window.location.hash
      orig.call(this, data, unused, url)
      if (window.location.hash !== hashBefore) pendingSyntheticHashEvents++
    }
  }

  window.history.pushState = wrapHistoryWrite(window.history.pushState.bind(window.history))
  window.history.replaceState = wrapHistoryWrite(window.history.replaceState.bind(window.history))

  window.addEventListener(
    'hashchange',
    (e) => {
      if (pendingSyntheticHashEvents > 0 && (e as HashChangeEvent).oldURL !== '') {
        pendingSyntheticHashEvents--
        e.stopImmediatePropagation()
      }
    },
    true,
  )
}
