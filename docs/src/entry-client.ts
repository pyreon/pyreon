import './styles/tokens.css'
import { isStaticSitePage } from './site/render-mode'

/**
 * The browser entry decides, per page, how much JavaScript the page needs:
 *
 *   - Marketing pages (everything in the `(site)` shell, and the 404) are
 *     static HTML with islands. They load `site/static-client.ts`, which
 *     hydrates only the `<pyreon-island>` elements on the page (the nav, copy
 *     buttons, demos); the page itself never hydrates, so neither the router
 *     nor the UI system's styling runtime is downloaded.
 *   - Docs pages load `app-client.ts`: the router app with client navigation,
 *     search and the live examples.
 *
 * Both branches are dynamic imports, so a page downloads only its own. The
 * stylesheet for docs pages (`docs.css`) is linked by the docs layout, never
 * here, so marketing pages do not load it.
 *
 * Zero has no per-route "islands only" mode yet; this is the app-side version
 * of it (see `site/render-mode.ts` for the issue).
 */
if (isStaticSitePage(document)) void import('./site/static-client')
else void import('./app-client')

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
const RELOAD_KEY = 'pyreon:preload-reloaded-at'
const RELOAD_GUARD_MS = 5000
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = sessionStorage.getItem(RELOAD_KEY)
    if (last && Date.now() - Number(last) < RELOAD_GUARD_MS) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Storage blocked: reload once anyway.
  }
  e.preventDefault?.()
  window.location.reload()
})
