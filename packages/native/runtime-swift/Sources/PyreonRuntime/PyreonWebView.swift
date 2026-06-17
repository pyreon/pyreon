// PyreonWebView — the native host for the multiplatform `<WebView>`
// primitive. PMTC emits `PyreonWebView(html:)` / `PyreonWebView(src:)`
// for the iOS target; this wraps a `WKWebView` in a SwiftUI view so the
// heavy web-only-rich viz (charts / flow / tables — `@pyreon/charts`,
// `@pyreon/flow`, …) renders inside a native shell. The web target
// renders the same content directly (an `<iframe>`); see
// `@pyreon/primitives`' web `WebView` impl.
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

    /// `html` — inline HTML to render (e.g. an ECharts page). `src` — a
    /// LOCAL bundled asset name (preferred, policy-safe) or a remote URL.
    /// Supply one; `html` wins if both are set.
    public init(html: String? = nil, src: String? = nil) {
        self.html = html
        self.src = src
    }

    public var body: some View {
        _PyreonWebViewBridge(html: html, src: src)
    }
}

#if canImport(UIKit)
private struct _PyreonWebViewBridge: UIViewRepresentable {
    let html: String?
    let src: String?
    func makeUIView(context: Context) -> WKWebView { WKWebView() }
    func updateUIView(_ webView: WKWebView, context: Context) {
        _loadPyreonWebView(webView, html: html, src: src)
    }
}
#elseif canImport(AppKit)
private struct _PyreonWebViewBridge: NSViewRepresentable {
    let html: String?
    let src: String?
    func makeNSView(context: Context) -> WKWebView { WKWebView() }
    func updateNSView(_ webView: WKWebView, context: Context) {
        _loadPyreonWebView(webView, html: html, src: src)
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
    public init(html: String? = nil, src: String? = nil) {}
    public var body: some View { EmptyView() }
}
#endif
