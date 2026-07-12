// ─── happy-dom spec-parity patch: no `hashchange` from pushState/replaceState ─
//
// Wired via `setupFiles` in vitest.config.ts — runs before every NODE
// (happy-dom) test file in this package. Browser tests (real Chromium via
// vitest.browser.config.ts) do NOT load this file: real browsers already
// behave per spec.
//
// Real browsers do NOT fire `hashchange` for `history.pushState` /
// `history.replaceState` (WHATWG HTML: only fragment NAVIGATIONS fire it).
// happy-dom's `Location[PropertySymbol.setURL]` — which History.pushState/
// replaceState delegate to — queues one on a `setTimeout` whenever the URL
// hash differs. Because that dispatch is DEFERRED, the synthetic event can
// land during the NEXT test, where the router's browser-navigation handler
// (which routes `hashchange` through the full navigation pipeline, exactly
// like a real Back) treats the stale echo as a genuine traversal and
// SUPERSEDES the fresh test's in-flight navigation. That failure shape is
// happy-dom-ONLY — real Chromium never fires these events (the pipeline
// behavior itself is covered by router.browser.test.tsx in real Chromium).
//
// The patch counts hash-CHANGING pushState/replaceState calls and swallows
// that many happy-dom-synthesized `hashchange` events in a capture-phase
// listener registered before any router listener. Synthetic events are
// discriminated from tests' manual `new HashChangeEvent('hashchange')`
// dispatches by the non-empty `oldURL` happy-dom populates (manual test
// events leave it `''`), so `replaceState + dispatchEvent(hashchange)`
// back-button simulations still reach the router. `location.hash = …`
// assignments (a REAL fragment navigation — hashchange IS spec there) do
// not go through the wrapped History methods and are never swallowed.
let _pendingSyntheticHashEvents = 0

function wrapHistoryWrite(
  orig: (data: unknown, unused: string, url?: string | URL | null) => void,
): (data: unknown, unused: string, url?: string | URL | null) => void {
  return function (this: History, data: unknown, unused: string, url?: string | URL | null) {
    const hashBefore = window.location.hash
    orig.call(this, data, unused, url)
    if (window.location.hash !== hashBefore) _pendingSyntheticHashEvents++
  }
}

window.history.pushState = wrapHistoryWrite(window.history.pushState.bind(window.history))
window.history.replaceState = wrapHistoryWrite(window.history.replaceState.bind(window.history))

window.addEventListener(
  'hashchange',
  (e) => {
    if (_pendingSyntheticHashEvents > 0 && (e as HashChangeEvent).oldURL !== '') {
      _pendingSyntheticHashEvents--
      e.stopImmediatePropagation()
    }
  },
  true,
)
