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
import { effect } from '@pyreon/reactivity'
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

  const hasData = 'data' in props
  const hasOnMessage = 'onMessage' in props

  // Both bridges share ONE frame ref + onLoad. Same-origin / `srcdoc`
  // only — a cross-origin remote `src` can't be reached from the parent
  // (the native targets cover remote content via evaluateJavaScript / the
  // script-message handler; on web you host same-origin / srcdoc content).
  if (hasData || hasOnMessage) {
    let frame: HTMLIFrameElement | null = null
    let loaded = false

    // Live-data bridge — push `data` into the hosted page's
    // `window.__pyreonData` + fire a `pyreondata` event, on load AND
    // reactively on change, WITHOUT reloading the iframe.
    const push = (): void => {
      const win = frame?.contentWindow as (Window & { __pyreonData?: unknown }) | null | undefined
      if (!loaded || !win) return
      try {
        win.__pyreonData = (props as { data?: unknown }).data
        win.dispatchEvent(new Event('pyreondata'))
      } catch {
        // Cross-origin iframe — injection is blocked by the browser.
      }
    }

    // Reverse bridge — define the unified `window.pyreonPostMessage(m)`
    // API on the hosted page so it can send strings back to the host's
    // `onMessage` callback (mirror of the iOS WKScriptMessageHandler /
    // Android @JavascriptInterface).
    const injectReverseBridge = (): void => {
      const win = frame?.contentWindow as
        | (Window & { pyreonPostMessage?: (m: unknown) => void })
        | null
        | undefined
      if (!win) return
      try {
        win.pyreonPostMessage = (m: unknown): void => {
          ;(props as { onMessage?: (message: string) => void }).onMessage?.(String(m))
        }
      } catch {
        // Cross-origin iframe — can't define on the page's window.
      }
    }

    attrs.ref = (el: HTMLIFrameElement | null): void => {
      frame = el
    }
    // `onLoad` is wired by the runtime (no raw addEventListener) — run the
    // bridges once the iframe's document exists.
    attrs.onLoad = (): void => {
      loaded = true
      if (hasData) push()
      if (hasOnMessage) injectReverseBridge()
    }
    // Re-push whenever `data` changes (the read tracks it). On the first
    // run the iframe usually isn't loaded yet → push no-ops, and `onLoad`
    // pushes once it is.
    if (hasData) {
      effect(() => {
        void (props as { data?: unknown }).data
        push()
      })
    }
  }
  return h('iframe', attrs)
}
