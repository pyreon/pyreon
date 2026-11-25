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

import type { ExprIR, TypeIR } from './types'

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

// ---------------------------------------------------------------------------
// `<WebView onLoad onError reloadKey backNavigation>` (#4827, #4829).

/**
 * The type of `<WebView onError={(e) => …}>`'s parameter on both targets
 * (`PyreonWebViewError` in each runtime): bound around the handler so member
 * reads (`e.code`, `e.kind === 'http'`) lower with known field types.
 */
export const WEBVIEW_ERROR_TYPE: TypeIR = {
  kind: 'object',
  fields: [
    { name: 'kind', type: { kind: 'string' } },
    { name: 'code', type: { kind: 'number' } },
    { name: 'description', type: { kind: 'string' } },
    { name: 'url', type: { kind: 'string' } },
  ],
}

/** The `onError` parameter type to bind: the error type unless annotated with something else. */
export function webViewErrorParamType(annotated: TypeIR | undefined): TypeIR {
  if (annotated === undefined) return WEBVIEW_ERROR_TYPE
  if (annotated.kind === 'typeRef' && annotated.name === 'WebViewError') return WEBVIEW_ERROR_TYPE

  return annotated
}

type JsxElement = Extract<ExprIR, { kind: 'jsx-element' }>

export interface WebViewOptionEmit {
  readStatic: (e: JsxElement, name: string) => string | number | boolean | undefined
  /** The attr's value expression (a zero-param accessor arrow unwrapped), or undefined when absent. */
  dynamicAttr: (e: JsxElement, name: string) => ExprIR | undefined
  emitExpr: (e: ExprIR) => string
  quote: (s: string) => string
  target: 'swift' | 'kotlin'
}

const arg = (target: 'swift' | 'kotlin', name: string, value: string): string =>
  target === 'swift' ? `${name}: ${value}` : `${name} = ${value}`

/**
 * `reloadKey` — any value; a CHANGE loads `html` / `src` again. The runtimes
 * compare it as a string, so a number or a signal read is interpolated.
 */
export function lowerWebViewReloadKey(e: JsxElement, o: WebViewOptionEmit): string | undefined {
  const value = o.readStatic(e, 'reloadKey')
  if (typeof value === 'string' || typeof value === 'number') return arg(o.target, 'reloadKey', o.quote(String(value)))
  const dyn = o.dynamicAttr(e, 'reloadKey')
  if (dyn === undefined) return undefined
  const text = o.emitExpr(dyn)

  return arg(o.target, 'reloadKey', o.target === 'swift' ? `"\\(${text})"` : `"\${${text}}"`)
}

/**
 * `backNavigation` — Android Back goes back in the page's history, and the iOS
 * back / forward swipe is on. Defaults to ON for a view that grows (the
 * full-screen case: a hosted flow the user navigates inside) and OFF
 * otherwise, so a small embedded chart never swallows Back. A literal or a
 * reactive boolean.
 */
export function lowerWebViewBackNavigation(e: JsxElement, o: WebViewOptionEmit, grows: boolean): string | undefined {
  const present = e.attrs.some((a) => a.kind === 'attr' && a.name === 'backNavigation')
  if (!present) return grows ? arg(o.target, 'backNavigation', 'true') : undefined
  const value = o.readStatic(e, 'backNavigation')
  if (value === true) return arg(o.target, 'backNavigation', 'true')
  if (value === false) return undefined
  const dyn = o.dynamicAttr(e, 'backNavigation')

  return dyn === undefined ? undefined : arg(o.target, 'backNavigation', o.emitExpr(dyn))
}
