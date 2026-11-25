// Prop type for the `<WebView>` primitive — the native host that embeds
// web content (a URL or an inline HTML page) on iOS/Android, and an
// `<iframe>` on web. The canonical way to render web-only-rich viz
// (`@pyreon/charts` / `@pyreon/flow` / heavy tables) inside a native shell.

/**
 * What `<WebView onError>` receives. Branch on `kind`, the cross-platform part:
 *
 * - `'load'`: the page could not be loaded (offline, DNS failure, connection
 *   refused, TLS). `code` is the platform's error code (an `NSURLError` code on
 *   iOS, a `WebViewClient.ERROR_*` code on Android).
 * - `'http'`: the server answered with a status of 400 or more; `code` is the
 *   status.
 * - `'crash'`: the web content process kept dying and the native host stopped
 *   reloading the page (it reloads by itself after the first losses); `code` is
 *   0. A new `reloadKey` tries again.
 *
 * `description` is the platform's message (for logs, not for users), `url` the
 * address that failed.
 */
export interface WebViewError {
  kind: 'load' | 'http' | 'crash'
  code: number
  description: string
  url: string
}

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
   * A bundled name may not contain a `..` segment, a scheme or a backslash,
   * and a non-bundled `src` loads only when it is `http(s)`.
   *
   * ORIGIN SCOPE (native). The host pins the origin its own load lands on
   * (after server redirects): `file://` for `html` and bundled files, the
   * remote page's origin otherwise. Afterwards the main frame stays on it — a
   * tapped link elsewhere opens in the system browser, any other off-origin
   * main-frame navigation is cancelled — and `data` / `onMessage` reach only
   * the MAIN frame of that origin, never an iframe inside the page. This is
   * the web host's reach too (a cross-origin frame is unreachable).
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
  /**
   * Called each time the MAIN frame finishes loading a document: the first page
   * and every page the user follows inside the view. Not called for a load that
   * failed (`onError` is). Native: `didFinish` (iOS) / `onPageFinished`
   * (Android). Web: the `<iframe>`'s `load` event.
   */
  onLoad?: () => void
  /**
   * Called when the MAIN frame's load fails (see {@link WebViewError}), so the
   * app can put its own "can't be reached" screen over the view and retry with
   * `reloadKey`. A failed image or XHR inside the page is the page's business
   * and is not reported, and neither is a cancelled navigation (a newer load,
   * or a link handed to the system browser). On Android the system error page
   * stays visible under the app's own screen; on iOS the view is blank.
   *
   * Web: never called. A browser does not tell the parent document that an
   * `<iframe>` failed to load (a cross-origin frame fires `load` on the error
   * page too).
   */
  onError?: (error: WebViewError) => void
  /**
   * Load `html` / `src` again whenever this value CHANGES (any string or
   * number: a retry counter is typical). Setting the same `src` again is not a
   * change, so this is how a failed page is retried:
   * `reloadKey={attempt()}` with a "Try again" button that bumps `attempt`.
   * Every target, the web included (the `<iframe>` navigates again).
   */
  reloadKey?: string | number
  /**
   * Native: let the user go back (and forward) in the PAGE's history. Android
   * system Back goes back while the page has history (at the first page Back
   * leaves the screen as before: the route pops or the activity finishes); iOS
   * turns on the edge swipe (`allowsBackForwardNavigationGestures`).
   *
   * Defaults to `true` for a `grow` view (a full-screen hosted flow the user
   * navigates inside) and `false` otherwise, so a small embedded chart never
   * swallows Back. A literal or a reactive boolean. Web: ignored (the browser's
   * own Back already walks an `<iframe>`'s history).
   */
  backNavigation?: boolean
  /** Pass-through `data-*` / `aria-*` / `id` / `class` attrs (web). */
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}
