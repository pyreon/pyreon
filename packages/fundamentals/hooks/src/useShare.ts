// useShare — invoke the platform share sheet.
//
// A cross-platform imperative hook (no reactive state): call a method on a
// user tap to present the native share UI. Mirrors the shape the PMTC
// native compiler recognizes — `const share = useShare(); share.text("hi")`
// lowers to `PyreonShare` on iOS (UIActivityViewController presented from
// the key window) and Android (`Intent.createChooser(ACTION_SEND)`), and
// runs the Web Share API (`navigator.share`) on the web.
//
// STRING-METHOD API (not an options object) so the same call lowers to
// native with zero argument transformation — the string args pass straight
// through, exactly like `@pyreon/hooks`' useHaptics. Cover the common
// shares with `text` / `url` / `textUrl`; `canShare` feature-detects (the
// Web Share API is absent on desktop Safari / older browsers — native
// always returns true).

export interface UseShareResult {
  /** Share plain text. */
  text: (text: string) => void
  /** Share a URL. */
  url: (url: string) => void
  /** Share text with an accompanying URL. */
  textUrl: (text: string, url: string) => void
  /** Whether sharing is available (web: Web Share API present; native: always true). */
  canShare: () => boolean
}

function webShare(data: ShareData): void {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return
  // navigator.share returns a Promise that rejects if the user cancels the
  // share sheet — a cancel is not an error, so swallow it.
  void navigator.share(data).catch(() => {})
}

/**
 * Present the platform share sheet imperatively.
 *
 * @example
 * ```tsx
 * const share = useShare()
 *
 * <button onClick={() => share.url("https://pyreon.dev")}>Share</button>
 * ```
 */
export function useShare(): UseShareResult {
  return {
    text: (text) => webShare({ text }),
    url: (url) => webShare({ url }),
    textUrl: (text, url) => webShare({ text, url }),
    canShare: () =>
      typeof navigator !== 'undefined' && typeof navigator.share === 'function',
  }
}
