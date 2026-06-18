// Prop type for the `<WebView>` primitive — the native host that embeds
// web content (a URL or an inline HTML page) on iOS/Android, and an
// `<iframe>` on web. The canonical way to render web-only-rich viz
// (`@pyreon/charts` / `@pyreon/flow` / heavy tables) inside a native shell.

export interface WebViewProps {
  /**
   * Inline HTML to render (e.g. an ECharts page). Takes precedence over
   * `src` if both are set. On native this becomes `loadHTMLString` /
   * `loadDataWithBaseURL`; on web an `<iframe srcdoc>`.
   */
  html?: string
  /**
   * A LOCAL bundled asset name (preferred — policy-safe) or a remote
   * `http(s)` URL. On native: a bundled file (iOS `Bundle.main` /
   * Android `assets/`) or a remote `URLRequest`; on web an `<iframe src>`.
   */
  src?: string
  /**
   * Live data pushed into the hosted page as `window.__pyreonData` — the
   * reactive bridge for driving a chart from signals. On change it's
   * PUSHED into the already-loaded page (a `pyreondata` event fires)
   * WITHOUT reloading, so the chart updates in place. On native, PMTC
   * JSON-encodes the value (`PyreonJSON.encode` / `PyreonJson.encode`) and
   * pushes via `evaluateJavaScript`; on web the iframe's
   * `contentWindow.__pyreonData` is set directly (same-origin / `srcdoc`).
   * The hosted page reads `window.__pyreonData` + re-reads on `pyreondata`.
   * Pass a `signal()` value (or an accessor) for reactivity.
   */
  data?: unknown
  /**
   * Reverse bridge — invoked with a string the hosted page sends back via
   * the unified `window.pyreonPostMessage("…")` API (e.g. a chart bar
   * tapped, a selection made), so webview-hosted viz can drive native
   * signals. On iOS this is a `WKScriptMessageHandler`; on Android a
   * main-thread-marshalled `@JavascriptInterface`; on web the parent
   * defines `window.pyreonPostMessage` on the iframe (same-origin /
   * `srcdoc`). The payload is a plain string — JSON-stringify structured
   * data in the page and parse it here.
   */
  onMessage?: (message: string) => void
  /** Pass-through `data-*` / `aria-*` / `id` / `class` attrs (web). */
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}
