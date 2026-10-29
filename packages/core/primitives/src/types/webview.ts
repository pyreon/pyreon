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
   *
   * HOST GROUPS. A hosted page may post the reserved `__pyreonWebViewGroup`
   * messages (see `connectWebHost().joinGroup` / `relay`) through this same
   * channel. The host consumes them — they never reach `onMessage` — and
   * fans a relayed string into every OTHER hosted page of the same group by
   * calling its `window.__pyreonWebViewGroupMessage(message)`. Identical on
   * web (sibling iframes), iOS (sibling WKWebViews) and Android (sibling
   * WebViews); this is how separate hosted pages mirror shared state (a
   * viewport, a selection) with each other.
   */
  onMessage?: (message: string) => void
  /**
   * Whether the hosted page may use DOM storage (`localStorage` /
   * `sessionStorage`). Default `true` on every target. Android's WebView
   * ships with `WebSettings.domStorageEnabled = false`, which makes
   * `localStorage` throw in the hosted page, so the native host turns it on.
   * `false` opts out: Android leaves it disabled; iOS (where WebKit cannot
   * disable Web Storage) uses a non-persistent data store, so nothing
   * survives the view. Native-only and read ONCE at creation — must be a
   * literal `true`/`false` (a dynamic value warns and keeps the default); on
   * web the `<iframe>` follows the browser and this prop is ignored.
   */
  domStorage?: boolean
  /**
   * Fill the free space of the parent `<Stack>` / `<Inline>` along its main
   * axis, the way `<Spacer>` does — the sizing for a web view that should take
   * the rest of a screen (an embedded checkout, a support form, a map).
   *
   * WITHOUT `grow` a web view is the size of an `<iframe>` with no CSS: as wide
   * as its parent and **150 high** (the CSS replaced-element default), on every
   * target. With it:
   *
   * | parent                  | web                          | iOS                                    | Android                    |
   * | ----------------------- | ---------------------------- | -------------------------------------- | -------------------------- |
   * | `<Stack>` (column)      | `flex: 1 1 150px` (height)   | `.frame(maxHeight: .infinity)`         | `Modifier.weight(1f)`      |
   * | `<Inline>` (row)        | `flex: 1 1 150px` (width)    | `.frame(maxWidth: .infinity)`          | `Modifier.weight(1f)`      |
   * | anything else           | `height: 100%`               | fills both axes                        | `Modifier.fillMaxSize()`   |
   *
   * Siblings keep their own size and several `grow` children share the space
   * equally. Where the parent has no free space to give — inside a `<Scroll>`
   * along its scroll axis, or a web container with no height of its own — a
   * growing view keeps the 150 default instead of collapsing. On native PMTC
   * warns when it can SEE that (`grow` inside a `<Scroll>` in the same
   * component) and drops the prop, since `Modifier.weight` in a scrolling
   * Compose column measures to zero.
   *
   * On web the free space is the flex container's: a root `<Stack>` only has
   * height to share when the page gives it one (`height: 100vh` on the app
   * root), exactly as a native screen always does.
   *
   * Must be a literal `true` / `false` on native (the layout is decided at
   * compile time); a dynamic value warns and is ignored there.
   */
  grow?: boolean
  /** Pass-through `data-*` / `aria-*` / `id` / `class` attrs (web). */
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}
