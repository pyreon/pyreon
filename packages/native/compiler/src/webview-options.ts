// `<WebView domStorage>` lowering, shared by both emitters.
//
// `domStorage` defaults to TRUE on every target (Android's
// `WebSettings.domStorageEnabled` defaults to false, which makes
// `localStorage` throw in a hosted page; the native hosts therefore turn it on
// and expose the opt-out). Only an explicit static `false` is emitted, so
// every existing `<WebView>` emit stays byte-identical. The value is read once
// when the host view is created, so it must be statically resolvable — a
// dynamic value warns and keeps the default instead of silently pretending to
// be reactive.

import type { ExprIR } from './types'

export interface WebViewDomStorageLowering {
  /** The named-argument text to append (`domStorage = false` / `domStorage: false`), or undefined. */
  readonly arg: string | undefined
  readonly warning: string | undefined
}

export function lowerWebViewDomStorage(
  e: Extract<ExprIR, { kind: 'jsx-element' }>,
  readStatic: (e: Extract<ExprIR, { kind: 'jsx-element' }>, name: string) => string | number | boolean | undefined,
  target: 'swift' | 'kotlin',
): WebViewDomStorageLowering {
  const present = e.attrs.some((a) => a.kind === 'attr' && a.name === 'domStorage')
  if (!present) return { arg: undefined, warning: undefined }
  const value = readStatic(e, 'domStorage')
  if (value === false) return { arg: target === 'swift' ? 'domStorage: false' : 'domStorage = false', warning: undefined }
  if (value === true) return { arg: undefined, warning: undefined }
  return {
    arg: undefined,
    warning:
      '<WebView domStorage={…}>: `domStorage` is read once when the host is created, so it must be a literal `true`/`false` (or a module-level const); using the default (true).',
  }
}
