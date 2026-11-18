import './styles/tokens.css'
import { startClientLazy } from '@pyreon/zero/client-lazy'
import * as islands from 'virtual:pyreon/islands-registry'
import { followSystemMode } from './site/color-mode'
import { prefetchStylesheetsOnIntent } from './styles/sheets'

/**
 * The browser entry. Every page on the site is islands-only (`hydrate` in
 * `routes/_layout.tsx`): zero hydrates the `<pyreon-island>` elements on the
 * page (the nav, copy buttons, demos; on docs pages also search, the drawer,
 * the TOCs, live examples), each with its own strategy, and never loads the
 * routes, so neither the router nor the UI system's styling runtime is
 * downloaded.
 */
startClientLazy({ routes: () => import('virtual:zero/routes'), islands })

// No root layout runs in the browser: keep the colour mode following the OS
// while the visitor has not chosen one.
followSystemMode()

// Each layout links its own stylesheets (`styles/sheets.ts`); the other side's
// are prefetched when the visitor reaches for a link into it (and this is what
// makes the build emit them).
prefetchStylesheetsOnIntent(document)

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
