// PyreonWebView — the native host for the multiplatform `<WebView>`
// primitive. PMTC emits `PyreonWebView(html:)` / `PyreonWebView(src:)`
// (+ optional `data:`) for the iOS target; this wraps a `WKWebView` in a
// SwiftUI view so the heavy web-only-rich viz (charts / flow / tables —
// `@pyreon/charts`, `@pyreon/flow`, …) renders inside a native shell. The
// web target renders the same content directly (an `<iframe>`); see
// `@pyreon/primitives`' web `WebView` impl.
//
// ## The live-data bridge (`data:`)
//
// `data:` is a JSON string (PMTC emits `PyreonJSON.encode(signal)` for
// `<WebView data={signal}>`). On page load AND whenever `data` changes,
// the runtime PUSHES it into the running page via `evaluateJavaScript`:
//
//     window.__pyreonData = <json>;
//     window.dispatchEvent(new Event("pyreondata"));
//
// The hosted page reads `window.__pyreonData` (and re-reads on the
// `pyreondata` event) to drive the chart. Crucially this is a PUSH into
// the ALREADY-LOADED page — a `data`-only change does NOT reload the
// webview, so the chart updates in place (no flicker, animation/zoom
// preserved). The page is reloaded ONLY when `html`/`src` itself changes.
//
// ## Policy posture (App Store / Play Store)
//
// The intended use is a HYBRID: a substantial native shell (the canonical
// primitives) with this webview hosting specific heavy-viz screens, NOT a
// thin web wrapper. For the safest review posture, load LOCAL bundled
// assets (`src` resolved against `Bundle.main`) rather than a remote URL —
// that keeps the viz as app content (no remote-code concern), satisfying
// Apple 4.2 / 2.5.2 and Google's webview policy. A remote `src` URL is
// still supported for development / explicitly-online viz.
//
// ## Platform guards
//
// `WKWebView` is in WebKit on both iOS and macOS, but the SwiftUI bridge
// differs: `UIViewRepresentable` (UIKit / iOS) vs `NSViewRepresentable`
// (AppKit / macOS). Both are provided so the package's macOS `swift build`
// AND the iOS app build compile. Same conditional-import pattern as
// PyreonClipboard.

import SwiftUI

#if canImport(WebKit)
import WebKit

public struct PyreonWebView: View {
    private let html: String?
    private let src: String?
    private let data: String?

    /// `html` — inline HTML to render (e.g. an ECharts page). `src` — a
    /// LOCAL bundled asset name (preferred, policy-safe) or a remote URL.
    /// Supply one; `html` wins if both are set. `data` — an optional JSON
    /// string pushed into the page as `window.__pyreonData` (live-updates
    /// without reloading; see the file header).
    public init(html: String? = nil, src: String? = nil, data: String? = nil) {
        self.html = html
        self.src = src
        self.data = data
    }

    public var body: some View {
        _PyreonWebViewBridge(html: html, src: src, data: data)
    }
}

/// Shared navigation delegate — tracks page-load completion so `data` is
/// pushed once the DOM exists, and re-pushed on later `data` changes.
/// One per hosted webview (created via `makeCoordinator`).
final class _PyreonWebViewCoordinator: NSObject, WKNavigationDelegate {
    var latestData: String?
    var loaded = false
    /// The html/src the page was last loaded with — a `data`-only change
    /// must NOT reload (that would defeat the live push).
    var loadedKey: String?

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        pushData(into: webView)
    }

    /// Push the latest JSON into `window.__pyreonData` + fire `pyreondata`.
    /// No-op until the page has finished loading or when there's no data.
    func pushData(into webView: WKWebView) {
        guard loaded, let json = latestData, !json.isEmpty else { return }
        let js = "window.__pyreonData = \(json); window.dispatchEvent(new Event(\"pyreondata\"));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

/// Sync html/src/data onto the webview: (re)load only when html/src
/// changed; always refresh the coordinator's latest data + push it (the
/// push is a no-op until loaded, and the coordinator re-pushes on
/// `didFinish`). Shared by the UIKit + AppKit representables.
private func _syncPyreonWebView(
    _ webView: WKWebView,
    coordinator: _PyreonWebViewCoordinator,
    html: String?,
    src: String?,
    data: String?
) {
    coordinator.latestData = data
    let key = (html ?? "") + "\u{0001}" + (src ?? "")
    if coordinator.loadedKey != key {
        coordinator.loadedKey = key
        coordinator.loaded = false
        _loadPyreonWebView(webView, html: html, src: src)
        // `didFinish` pushes the data once the page is ready.
    } else {
        // html/src unchanged → a data-only update: push without reloading.
        coordinator.pushData(into: webView)
    }
}

#if canImport(UIKit)
private struct _PyreonWebViewBridge: UIViewRepresentable {
    let html: String?
    let src: String?
    let data: String?
    func makeCoordinator() -> _PyreonWebViewCoordinator { _PyreonWebViewCoordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        return webView
    }
    func updateUIView(_ webView: WKWebView, context: Context) {
        _syncPyreonWebView(webView, coordinator: context.coordinator, html: html, src: src, data: data)
    }
}
#elseif canImport(AppKit)
private struct _PyreonWebViewBridge: NSViewRepresentable {
    let html: String?
    let src: String?
    let data: String?
    func makeCoordinator() -> _PyreonWebViewCoordinator { _PyreonWebViewCoordinator() }
    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.navigationDelegate = context.coordinator
        return webView
    }
    func updateNSView(_ webView: WKWebView, context: Context) {
        _syncPyreonWebView(webView, coordinator: context.coordinator, html: html, src: src, data: data)
    }
}
#endif

/// Shared load logic. `html` → `loadHTMLString`; `src` → a bundled local
/// file (resolved against `Bundle.main`, the policy-safe path) falling
/// back to a remote `URL`.
private func _loadPyreonWebView(_ webView: WKWebView, html: String?, src: String?) {
    if let html {
        webView.loadHTMLString(html, baseURL: Bundle.main.bundleURL)
        return
    }
    guard let src else { return }
    if let fileURL = Bundle.main.url(forResource: src, withExtension: nil) {
        webView.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
    } else if let url = URL(string: src) {
        webView.load(URLRequest(url: url))
    }
}

#else
// WebKit unavailable (e.g. a headless Linux toolchain) — render nothing
// so the package still compiles. Real targets (iOS / macOS) always have
// WebKit.
public struct PyreonWebView: View {
    public init(html: String? = nil, src: String? = nil, data: String? = nil) {}
    public var body: some View { EmptyView() }
}
#endif
