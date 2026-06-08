import { routes } from 'virtual:zero/routes'
import { startClient } from '@pyreon/zero/client'
import { registerExamples } from '@pyreon/zero-content'
import 'virtual:zero-content/collections'
import './styles/tokens.css'
import './styles/docs.css'

// Register the consumer's example files for `<Example file="./..." />`.
// `import.meta.glob` is compile-time resolved relative to THIS file —
// the registry has no other way to reach the consumer's source tree.
// Each entry maps a relative path to a lazy `() => Promise<module>`.
registerExamples(
  import.meta.glob('./examples/**/*.tsx') as Record<
    string,
    () => Promise<unknown>
  >,
)

// Stale-chunk recovery — every new deploy invalidates the previous
// deploy's chunk hashes. Users with cached HTML referencing old
// chunks hit `Failed to fetch dynamically imported module` errors
// on the first dynamic import (route navigation, lazy island, etc.)
// and the app freezes. Vite fires a `vite:preloadError` event on
// every preload failure — the canonical handler reloads the page
// so the browser fetches fresh HTML (which references the current
// chunk hashes).
//
// Reload-loop guard: if a fresh reload ALSO hits a preload error
// within 5 seconds (genuine deploy bug, not stale-cache symptom),
// give up and let the error surface to the console.
if (typeof window !== 'undefined') {
  const RELOAD_KEY = 'pyreon:preload-reloaded-at'
  const RELOAD_GUARD_MS = 5000
  window.addEventListener('vite:preloadError', (e) => {
    const last = sessionStorage.getItem(RELOAD_KEY)
    if (last && Date.now() - Number(last) < RELOAD_GUARD_MS) return
    e.preventDefault?.()
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    window.location.reload()
  })
}

startClient({ routes })
