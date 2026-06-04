import { useHead } from '@pyreon/head'

/**
 * Runtime font-preload primitive.
 *
 * For declared fonts (passed to `zero({ font: { google, local } })`),
 * `fontPlugin` emits `<link rel="preload" as="font">` tags at build
 * time — they're in the HTML for every page. `usePreloadFont` covers
 * the OTHER case: a route that uses a font NOT in the global config,
 * a hero with a custom display face that should preload BEFORE the
 * paint, or a font loaded conditionally per-route.
 *
 * Emitted tag (per HTML spec — see https://web.dev/preload-critical-assets):
 *   <link rel="preload" as="font" href="..." type="font/woff2" crossorigin="anonymous">
 *
 * Subtleties this helper handles correctly:
 *
 *   1. `crossorigin="anonymous"` is REQUIRED on every font preload —
 *      even for same-origin fonts — because the CSS Fonts spec requires
 *      CORS for font fetches. Without it, the browser preloads the file
 *      then refuses to use it for `@font-face` and refetches under CORS
 *      (the dreaded double-fetch trap).
 *
 *   2. `type` is REQUIRED — preload-scanner only honors `as=font`
 *      preloads that carry the matching MIME type, otherwise it warns
 *      and ignores. The helper auto-infers from the file extension
 *      (.woff2 → font/woff2, .woff → font/woff, .ttf → font/ttf).
 *      Pass `type` explicitly to override.
 *
 *   3. Dedup is handled by `@pyreon/head`'s LinkTag href-keying —
 *      two `usePreloadFont(href)` calls with the same href emit ONE
 *      preload.
 *
 * Per `@pyreon/head`, the link is emitted into the document `<head>`
 * during render (SSR-visible to the preload scanner, NOT
 * client-side-only).
 *
 * @example
 * // Per-route hero font:
 * export default function HeroRoute() {
 *   usePreloadFont('/fonts/display-bold.woff2')
 *   return <h1 style="font-family: 'Display Bold'">…</h1>
 * }
 *
 * @example
 * // Variable font with explicit type + same-origin:
 * usePreloadFont('/fonts/inter-var.woff2', { type: 'font/woff2' })
 *
 * @example
 * // CDN-hosted font (cross-origin still uses crossorigin=anonymous):
 * usePreloadFont('https://cdn.example.com/brand.woff2')
 */
export function usePreloadFont(href: string, opts?: PreloadFontOptions): void {
  useHead({
    link: [
      {
        rel: 'preload',
        as: 'font',
        href,
        type: opts?.type ?? inferFontMimeType(href),
        crossorigin: opts?.crossorigin ?? 'anonymous',
      },
    ],
  })
}

export interface PreloadFontOptions {
  /**
   * MIME type. Auto-inferred from the file extension when omitted.
   * Pre-loading without `type` is silently ignored by the preload
   * scanner, so this MUST be present — the auto-infer covers .woff2
   * (the dominant format), .woff, .ttf, .otf, and .eot.
   */
  type?: string
  /**
   * `crossorigin` value. Defaults to `'anonymous'` — required for all
   * font preloads per the CSS Fonts CORS spec. Use `'use-credentials'`
   * only for credential-bearing same-origin fonts (rare).
   */
  crossorigin?: 'anonymous' | 'use-credentials'
}

/**
 * Infer the MIME type from the file extension. Returns the canonical
 * MIME type per the IANA font registry — preload-scanner matches against
 * these exact strings.
 *
 * @internal exported for testing
 */
export function inferFontMimeType(href: string): string {
  // Strip query string + fragment before extension match.
  const path = href.split('?')[0]!.split('#')[0]!
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  switch (ext) {
    case 'woff2':
      return 'font/woff2'
    case 'woff':
      return 'font/woff'
    case 'ttf':
      return 'font/ttf'
    case 'otf':
      return 'font/otf'
    case 'eot':
      return 'application/vnd.ms-fontobject'
    default:
      // Unknown extension — fall back to woff2 (the dominant modern
      // format). If this is wrong the preload-scanner will warn at
      // load time, but emitting `as=font` without a type would be
      // SILENTLY ignored, which is worse.
      return 'font/woff2'
  }
}
