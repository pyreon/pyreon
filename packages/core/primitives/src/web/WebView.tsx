// Web implementation of `<WebView>` — renders an `<iframe>`.
//
// Compiles to:
// - **Web** (this impl): `<iframe srcdoc={html}>` or `<iframe src={src}>`,
//   filling its container.
// - **iOS** (via PMTC): `PyreonWebView(html:/src:)` → a `WKWebView`.
// - **Android** (via PMTC): `PyreonWebView(html =/src =)` → an Android
//   `WebView`.
//
// Same semantics on every target: host the given web content in a frame.
// The canonical use is hosting web-only-rich viz (charts / flow / tables)
// inside a native shell — on web you'd usually render the viz directly
// (e.g. inside `<Web>`), but `<WebView>` works on web too for parity / when
// an iframe boundary is wanted.

import { h } from '@pyreon/core'
import type { VNode } from '@pyreon/core'
import { collectPassthroughAttrs } from './passthrough'
import type { WebViewProps } from '../types/webview'

export function WebView(props: WebViewProps): VNode {
  const attrs: Record<string, unknown> = {
    ...collectPassthroughAttrs(props as Record<string, unknown>),
    // Fill the container, no chrome — matches the native host's full-bleed
    // embed.
    style: 'border: 0; width: 100%; height: 100%',
  }
  if (props.html !== undefined) attrs.srcdoc = props.html
  else if (props.src !== undefined) attrs.src = props.src
  return h('iframe', attrs)
}
