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

  // Live-data bridge — mirror of the native runtime: push `data` into the
  // hosted page's `window.__pyreonData` + fire a `pyreondata` event, on
  // load AND reactively on change, WITHOUT reloading the iframe. Reading
  // `props.data` inside the effect tracks the signal, so a change re-pushes
  // in place. Same-origin / `srcdoc` only — a cross-origin remote `src`
  // can't be injected (the native targets reach remote via
  // evaluateJavaScript; on web you'd host same-origin/srcdoc content).
  if ('data' in props) {
    let frame: HTMLIFrameElement | null = null
    let loaded = false
    const push = (): void => {
      const win = frame?.contentWindow as (Window & { __pyreonData?: unknown }) | null | undefined
      if (!loaded || !win) return
      try {
        win.__pyreonData = (props as { data?: unknown }).data
        win.dispatchEvent(new Event('pyreondata'))
      } catch {
        // Cross-origin iframe — injection is blocked by the browser; the
        // native targets cover remote content via evaluateJavaScript.
      }
    }
    attrs.ref = (el: HTMLIFrameElement | null): void => {
      frame = el
    }
    // `onLoad` is wired by the runtime (no raw addEventListener) — push
    // once the iframe's document exists.
    attrs.onLoad = (): void => {
      loaded = true
      push()
    }
    // Re-push whenever `data` changes (the read tracks it). On the first
    // run the iframe usually isn't loaded yet → push no-ops, and the
    // `onLoad` handler pushes once it is.
    effect(() => {
      void (props as { data?: unknown }).data
      push()
    })
  }
  return h('iframe', attrs)
}
