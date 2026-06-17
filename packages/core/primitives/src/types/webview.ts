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
  /** Pass-through `data-*` / `aria-*` / `id` / `class` attrs (web). */
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}
