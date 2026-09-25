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

/**
 * Schemes `openUrl` will hand to the platform. `javascript:` and `data:` are
 * refused: `window.open('javascript:…')` runs script (in the opener's origin
 * on some engines), and `data:` URLs are the classic phishing vehicle — and
 * `openUrl` is exactly the call that receives URLs from content, CMS fields
 * and API responses.
 */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function isAllowedUrl(url: string): boolean {
  /* v8 ignore next — only reached from openUrl, which already returned on the
     server; the guard states the SSR contract at the `window` access site. */
  if (!isClient) return false
  try {
    // Resolved against the page so a relative path ('/docs') counts as the
    // page's own http(s) scheme. The URL parser also normalises case and
    // strips the leading whitespace/control chars browsers ignore, which a
    // string prefix check would miss (`'  JaVaScRiPt:…'`).
    return ALLOWED_SCHEMES.has(new URL(url, window.location.href).protocol)
  } catch {
    return false
  }
}

export interface UseLinkingResult {
  /**
   * Open a URL in the platform browser (or the app registered for its scheme).
   * Only `http:`, `https:`, `mailto:` and `tel:` URLs (and relative paths) are
   * opened; anything else is refused with a dev warning.
   */
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
      if (!isAllowedUrl(url)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon] useLinking: refused to open "${url.slice(0, 80)}" — only http(s), mailto and tel URLs are allowed.`,
          )
        }
        return
      }
      // `noopener,noreferrer` so the opened page can't reach back through
      // `window.opener` — the standard security posture for external links.
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  }
}
