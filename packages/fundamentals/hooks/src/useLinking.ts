// useLinking — open an external URL in the platform browser / handler.
//
// A cross-platform imperative hook (no reactive state): call `openUrl` on a
// user tap to hand a URL off to the OS. Mirrors the shape the PMTC native
// compiler recognizes — `const linking = useLinking(); linking.openUrl(url)`
// lowers to `PyreonLinking` on iOS (`UIApplication.shared.open`) and Android
// (`Intent.ACTION_VIEW`), and runs `window.open` on the web.
//
// STRING-METHOD API (like useShare / useHaptics) so the call lowers to
// native with zero argument transformation. No permission, no async result —
// the OS takes over once the URL is handed off.

import { isClient } from '@pyreon/reactivity'

export interface UseLinkingResult {
  /** Open a URL in the platform browser (or the app registered for its scheme). */
  openUrl: (url: string) => void
}

/**
 * Open external URLs from a Pyreon app.
 *
 * @example
 * ```tsx
 * const linking = useLinking()
 *
 * <button onClick={() => linking.openUrl("https://pyreon.dev")}>Open docs</button>
 * ```
 */
export function useLinking(): UseLinkingResult {
  return {
    openUrl: (url) => {
      if (!isClient || typeof window.open !== 'function') return
      // `noopener,noreferrer` so the opened page can't reach back through
      // `window.opener` — the standard security posture for external links.
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}
