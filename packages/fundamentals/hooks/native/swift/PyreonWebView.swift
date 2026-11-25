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
// ## The reverse bridge (`onMessage:`)
//
// The hosted page sends events BACK to native (a chart bar tapped, a
// selection made) by calling the unified JS API the runtime injects at
// document-start:
//
//     window.pyreonPostMessage("the-payload-string");
//
// On iOS that shim forwards to a `WKScriptMessageHandler` named
// `pyreonNative`; the coordinator receives the string and invokes the
// native `onMessage` closure (e.g. `onMessage={(m) => selected.set(m)}`),
// so a webview-hosted chart can drive native signals. The payload is a
// plain string — the page JSON-stringifies structured data itself. Same
// unified `window.pyreonPostMessage(...)` API on web + Android.
//
// ## DOM storage (`domStorage:`)
//
// `WKWebView` has `localStorage` on by default (persistent default data
// store), matching Android's `PyreonWebView` which now enables
// `domStorageEnabled` by default. `domStorage: false` is the opt-out: iOS
// cannot switch the Web Storage API off, so the closest equivalent is a
// NON-persistent data store — storage still exists but nothing survives the
// view. Read once at creation (changing it later has no effect).
//
// ## Sizing (`grow:`)
//
// Unsized, the view is what an `<iframe>` with no CSS is on the web: as wide as
// its parent and EXACTLY 150 points high, on every target (see
// `WebViewProps.grow`). `grow:` takes the free space of the parent stack along
// the axis PMTC passes — `.vertical` in a VStack, `.horizontal` in an HStack,
// `.both` anywhere else — and keeps the 150 ideal where the parent proposes no
// size (a ScrollView), which is what the web and Android hosts do too.
//
// The 150 is applied INSIDE this view on purpose: an outer
// `.frame(maxHeight: .infinity)` cannot enlarge a fixed inner frame, so the
// sizing has to be an argument rather than a modifier the caller adds.
//
// ## Browser chrome (`WKUIDelegate`)
//
// A `WKWebView` with no `uiDelegate` drops `alert()`, answers `confirm()` with
// false and `prompt()` with null, and ignores `window.open` / `target="_blank"`.
// The coordinator is the delegate:
//
// - `alert` / `confirm` / `prompt` present a `UIAlertController` (an `NSAlert`
//   on macOS) titled with the calling frame's host, as Safari does. Every
//   completion handler is answered exactly once — with the platform default
//   when there is nothing to present on (a view not in a window) — because
//   WebKit raises if one is dropped.
// - `window.open` / `target="_blank"` hand the URL to the SYSTEM (the browser,
//   Mail, the dialler) instead of replacing the hosted page — an embedded
//   checkout must not be navigated away from by its own "terms" link. Only
//   `http(s)`, `mailto`, `tel` and `sms` are handed over; anything else
//   (`javascript:`, `file:`, a custom scheme) is refused, so a hosted page cannot
//   launch arbitrary apps. WebKit only calls this for a user gesture.
// - File input needs no delegate on iOS (the system picker is built in); on
//   macOS `runOpenPanelWith` presents an `NSOpenPanel`.
// - Geolocation / camera / microphone go through WebKit's own permission
//   prompts once the APP is allowed to ask: declare
//   `NSLocationWhenInUseUsageDescription` (and `NSCameraUsageDescription` /
//   `NSMicrophoneUsageDescription` for `getUserMedia`) in Info.plist. Without
//   the key iOS never asks, and the page's request fails.
//
// ## Origin scope
//
// `data` and the reverse bridge belong to the page the APP loaded, as on the
// web, where the host can reach only a same-origin / `srcdoc` frame:
//
// - The allowed origin is the one the host's own load commits to (after its
//   server redirects): `file://` for inline `html` and bundled `src`, the
//   remote page's `scheme://host[:port]` otherwise.
// - After that commit the MAIN frame stays on that origin. A user-tapped link
//   off it is handed to the system (`http(s)` / `mailto` / `tel` / `sms`, as
//   for `window.open`); any other off-origin main-frame navigation (a script
//   redirect, a form post, a `data:` / `javascript:` URL) is cancelled.
//   Sub-frames navigate freely but never get the bridge or the data.
// - A script message is delivered only from the main frame of the allowed
//   origin (`WKScriptMessage.frameInfo`); the shim is main-frame-only too.
// - `data` is pushed, and a host-group relay evaluated, only while the main
//   frame shows the allowed origin.
// - A bundled `src` with a `..` segment, a scheme or a backslash is refused,
//   and a non-bundled `src` loads only when it is an `http(s)` URL.
//
// ## Downloads (`onDownload:` / `saveDownloads:`)
//
// A `WKWebView` with no download handling does NOTHING for `<a download>`
// (including the `blob:` / `data:` URLs a page builds for an export), for a
// `Content-Disposition: attachment` response, or for a MIME type it cannot
// display: WebKit fails the navigation and the user sees no reaction. The
// coordinator therefore turns each of those into a `WKDownload`:
//
// - `decidePolicyFor navigationAction` answers `.download` when the action
//   `shouldPerformDownload` (the `download` attribute), BEFORE the origin
//   policy: a download does not move the main frame, so it is not a navigation
//   the origin scope has to stop.
// - `decidePolicyFor navigationResponse` answers `.download` for an attachment
//   or a MIME type WebKit cannot show (`pyreonWebViewResponseIsDownload`).
// - `decideDestinationUsing` reports the download to `onDownload` (URL, a
//   sanitised file name, MIME type) and then, unless `saveDownloads` is false,
//   writes it to a fresh temporary directory; `downloadDidFinish` presents the
//   SHARE SHEET with the file (Save to Files, AirDrop, Mail, …) and deletes the
//   temporary copy once the sheet closes. With `saveDownloads: false` the
//   destination is nil, which cancels the download: the app has been told and
//   handles it itself. On macOS the file goes to the user's Downloads folder
//   under a free name instead.
// - A download is never written without the user acting on the sheet, so a
//   hosted page cannot place files anywhere on its own.
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

/// A download the hosted page started (see "Downloads" in the file header).
/// Mirrors `WebViewDownload` in `@pyreon/primitives` and the Kotlin
/// `PyreonWebViewDownload`.
public struct PyreonWebViewDownload: Sendable, Equatable {
    /// The URL being downloaded: `http(s)`, or a `blob:` / `data:` URL the page created.
    public let url: String
    /// A file name safe to write: see `pyreonWebViewDownloadFilename`.
    public let filename: String
    /// The MIME type, or "" when it is not known.
    public let mimeType: String

    public init(url: String, filename: String, mimeType: String) {
        self.url = url
        self.filename = filename
        self.mimeType = mimeType
    }
}

/// The name a download is saved under. The first usable candidate wins (the
/// name WebKit suggests — the `download` attribute or `Content-Disposition` —
/// then the URL's last path segment); each is reduced to a single path
/// component: `/`, `\`, `:` and control characters become `_`, and leading
/// dots and surrounding spaces are dropped, so the name can neither leave the
/// target directory nor hide itself. Capped at 200 characters (keeping the
/// extension). "download" when nothing usable is left. Same rule as the Kotlin
/// `pyreonWebViewDownloadFilename`.
func pyreonWebViewDownloadFilename(_ candidates: String?...) -> String {
    for candidate in candidates {
        guard let candidate else { continue }
        let cleaned = _pyreonCleanFilename(candidate)
        if !cleaned.isEmpty { return cleaned }
    }
    return "download"
}

private func _pyreonCleanFilename(_ raw: String) -> String {
    var out = String.UnicodeScalarView()
    for scalar in raw.unicodeScalars {
        if scalar.value < 0x20 || scalar.value == 0x7F || scalar == "/" || scalar == "\\" || scalar == ":" {
            out.append("_")
        } else {
            out.append(scalar)
        }
    }
    var name = String(out).trimmingCharacters(in: .whitespaces)
    while name.hasPrefix(".") { name.removeFirst() }
    name = name.trimmingCharacters(in: .whitespaces)
    // A name made only of separators is no name.
    if name.allSatisfy({ $0 == "_" }) { return "" }
    if name.count > 200 {
        let ext = (name as NSString).pathExtension
        let keep = ext.isEmpty || ext.count > 16 ? "" : "." + ext
        name = String(name.prefix(200 - keep.count)) + keep
    }
    return name
}

/// The last path segment of a URL string, for a name when nothing better is
/// suggested (nil for an opaque `blob:` / `data:` URL, whose "path" is no name).
func pyreonWebViewDownloadURLName(_ url: String) -> String? {
    guard let parsed = URL(string: url), let scheme = parsed.scheme?.lowercased(),
          scheme == "http" || scheme == "https" || scheme == "file"
    else { return nil }
    let last = parsed.lastPathComponent
    return last.isEmpty || last == "/" ? nil : last
}

/// Whether a navigation RESPONSE is a download: `Content-Disposition:
/// attachment` (any case, with or without parameters), or a MIME type the
/// engine cannot display. `inline` and an absent header follow the MIME type.
func pyreonWebViewResponseIsDownload(canShowMIMEType: Bool, contentDisposition: String?) -> Bool {
    if let disposition = contentDisposition?.trimmingCharacters(in: .whitespaces).lowercased(),
       disposition == "attachment" || disposition.hasPrefix("attachment;") || disposition.hasPrefix("attachment ") {
        return true
    }
    return !canShowMIMEType
}

/// `name`, or `name (2)`, `name (3)`, … before the extension: the first that
/// `exists` says is free. Used for the macOS Downloads folder.
func pyreonWebViewFreeFilename(_ name: String, exists: (String) -> Bool) -> String {
    if !exists(name) { return name }
    let ns = name as NSString
    let ext = ns.pathExtension
    let stem = ext.isEmpty ? name : ns.deletingPathExtension
    var n = 2
    while true {
        let candidate = ext.isEmpty ? "\(stem) (\(n))" : "\(stem) (\(n)).\(ext)"
        if !exists(candidate) { return candidate }
        n += 1
    }
}

#if canImport(WebKit)
import WebKit

public struct PyreonWebView: View {
    private let html: String?
    private let src: String?
    private let data: String?
    private let onMessage: ((String) -> Void)?
    private let domStorage: Bool
    private let grow: PyreonWebViewGrow?
    private let onDownload: ((PyreonWebViewDownload) -> Void)?
    private let saveDownloads: Bool

    /// `html` — inline HTML to render (e.g. an ECharts page). `src` — a
    /// LOCAL bundled asset name (preferred, policy-safe) or a remote URL.
    /// Supply one; `html` wins if both are set. `data` — an optional JSON
    /// string pushed into the page as `window.__pyreonData` (live-updates
    /// without reloading; see the file header). `onMessage` — an optional
    /// callback invoked with the string the page sends via
    /// `window.pyreonPostMessage(...)` (the reverse bridge). `domStorage` —
    /// `true` (default) keeps WebKit's persistent `localStorage`; `false` uses
    /// a non-persistent data store (see the file header). `grow` — `nil`
    /// (default) is the 150-high iframe default; an axis takes the parent
    /// stack's free space along it (see the file header). `onDownload` — called
    /// for each download the page starts; `saveDownloads` — `true` (default)
    /// then saves it through the share sheet, `false` leaves it to the app (see
    /// "Downloads" in the file header).
    public init(
        html: String? = nil,
        src: String? = nil,
        data: String? = nil,
        onMessage: ((String) -> Void)? = nil,
        domStorage: Bool = true,
        grow: PyreonWebViewGrow? = nil,
        onDownload: ((PyreonWebViewDownload) -> Void)? = nil,
        saveDownloads: Bool = true
    ) {
        self.onDownload = onDownload
        self.saveDownloads = saveDownloads
        self.domStorage = domStorage
        self.grow = grow
        self.html = html
        self.src = src
        self.data = data
        self.onMessage = onMessage
    }

    public var body: some View {
        // A WKWebView is GREEDY in SwiftUI: unsized, it takes whatever a VStack
        // offers, so the same source filled the screen on iOS while it was 150
        // high on Android and the web. The unsized default is therefore an
        // exact frame, and filling is the explicit `grow` the caller opts into.
        _PyreonWebViewFrame(
            content: _PyreonWebViewBridge(
                html: html, src: src, data: data, onMessage: onMessage, domStorage: domStorage,
                onDownload: onDownload, saveDownloads: saveDownloads
            ),
            grow: grow
        )
    }
}

/// The axis a `PyreonWebView` grows along — the parent stack's main axis, or
/// `.both` when the parent is not a stack. PMTC picks it from the emitted tree.
public enum PyreonWebViewGrow: Sendable {
    case vertical
    case horizontal
    case both
}

/// The CSS replaced-element default height the web `<iframe>` falls back to.
let pyreonWebViewDefaultHeight: CGFloat = 150

/// The frame the sizing contract maps to. Pure layout, kept apart from the
/// representable so the policy is one switch. `idealHeight` is what a
/// ScrollView (which proposes no height) resolves a growing view to.
private struct _PyreonWebViewFrame<Content: View>: View {
    let content: Content
    let grow: PyreonWebViewGrow?

    @ViewBuilder var body: some View {
        switch grow {
        case nil:
            content.frame(height: pyreonWebViewDefaultHeight)
        case .vertical:
            content.frame(minHeight: 0, idealHeight: pyreonWebViewDefaultHeight, maxHeight: .infinity)
        case .horizontal:
            content.frame(minWidth: 0, maxWidth: .infinity).frame(height: pyreonWebViewDefaultHeight)
        case .both:
            content.frame(
                minWidth: 0, maxWidth: .infinity,
                minHeight: 0, idealHeight: pyreonWebViewDefaultHeight, maxHeight: .infinity
            )
        }
    }
}

/// Schemes a page may hand to the SYSTEM through `window.open` /
/// `target="_blank"`. Everything else is refused: `javascript:` and `file:` have
/// no business leaving the view, and a custom scheme would let any hosted page
/// launch any installed app.
let pyreonWebViewExternalSchemes: Set<String> = ["http", "https", "mailto", "tel", "sms"]

/// Whether `url` may be opened outside the view (see `pyreonWebViewExternalSchemes`).
func pyreonWebViewMayOpenExternally(_ url: URL?) -> Bool {
    guard let scheme = url?.scheme?.lowercased() else { return false }
    return pyreonWebViewExternalSchemes.contains(scheme)
}

/// The title of a JS dialog: the calling frame's host, as Safari shows it
/// ("example.com"), or none for a page with no host (inline `html`, a file).
func pyreonWebViewDialogTitle(host: String?) -> String? {
    guard let host, !host.isEmpty else { return nil }
    return host
}

// MARK: Origin scope — see "Origin scope" in the file header.

/// An origin as `scheme://host[:port]`, lower-cased, default ports dropped
/// (`port` 0 / nil is the default, which is what `WKSecurityOrigin` reports).
/// `file` is one origin ("file://", the bundled app content). Anything without
/// a host that is not `file` (`about:`, `data:`, `blob:`, `javascript:`) is
/// OPAQUE and returns nil, so it is never an allowed origin.
func pyreonWebViewOrigin(scheme: String?, host: String?, port: Int?) -> String? {
    guard let scheme = scheme?.lowercased(), !scheme.isEmpty else { return nil }
    if scheme == "file" { return "file://" }
    guard scheme == "http" || scheme == "https", let host = host?.lowercased(), !host.isEmpty else { return nil }
    let defaultPort = scheme == "https" ? 443 : 80
    if let port, port != 0, port != defaultPort { return "\(scheme)://\(host):\(port)" }
    return "\(scheme)://\(host)"
}

/// The origin of a URL (nil for an opaque one).
func pyreonWebViewOrigin(_ url: URL?) -> String? {
    guard let url else { return nil }
    return pyreonWebViewOrigin(scheme: url.scheme, host: url.host, port: url.port)
}

/// What to do with a navigation (see "Origin scope" in the file header).
enum PyreonWebViewNavigation: Equatable {
    case allow
    case cancel
    /// Cancel it here and hand the URL to the system instead.
    case openExternally
}

/// The navigation policy. A sub-frame navigates freely (it never gets the
/// bridge or the data). The main frame may go anywhere while the load the HOST
/// started is still pending (its server redirects), and afterwards only within
/// the origin that load committed to. A user-activated main-frame link off that
/// origin is handed to the system (as `window.open` is); anything else is
/// cancelled. `isMainFrame == nil` is a new-window request, which
/// `createWebViewWith` hands over.
func pyreonWebViewNavigationDecision(
    isMainFrame: Bool?,
    initialLoadPending: Bool,
    url: URL?,
    allowedOrigin: String?,
    userActivated: Bool
) -> PyreonWebViewNavigation {
    guard isMainFrame == true else { return .allow }
    if initialLoadPending { return .allow }
    if let allowedOrigin, pyreonWebViewOrigin(url) == allowedOrigin { return .allow }
    if userActivated, pyreonWebViewMayOpenExternally(url) { return .openExternally }
    return .cancel
}

/// Whether bridge traffic may cross: only the MAIN frame, only while it shows
/// the allowed origin. The web host reaches nothing else either (a cross-origin
/// iframe is unreachable from its parent).
func pyreonWebViewMayDeliver(isMainFrame: Bool, origin: String?, allowedOrigin: String?) -> Bool {
    guard isMainFrame, let origin, let allowedOrigin else { return false }
    return origin == allowedOrigin
}

/// A `src` that names a BUNDLED file: a relative path with no `..` segment,
/// no scheme and no backslash. nil when it would escape the bundle directory.
/// A C0 control or DEL anywhere, or a space at either end, is refused too: the
/// Android host loads the name as a URL, whose parser deletes tab/CR/LF and
/// trims trailing controls and spaces (`.\t./x` → `../x`, #52). This host
/// resolves a file path and was not affected (device-checked), but both hosts
/// apply one rule.
func pyreonWebViewAssetName(_ src: String) -> String? {
    guard !src.isEmpty, !src.hasPrefix("/"), !src.contains("\\"), !src.contains(":") else { return nil }
    let decoded = src.removingPercentEncoding ?? src
    if _pyreonWebViewParserRewrites(src) || _pyreonWebViewParserRewrites(decoded) { return nil }
    let segments = decoded.split(separator: "/", omittingEmptySubsequences: false)
    if segments.contains(where: { $0 == ".." || $0 == "." || $0.isEmpty }) { return nil }
    if decoded.contains("\\") || decoded.contains(":") { return nil }
    return src
}

/// Whether a URL parser would delete or trim part of `s` (see `pyreonWebViewAssetName`).
private func _pyreonWebViewParserRewrites(_ s: String) -> Bool {
    s.unicodeScalars.contains { $0.value < 0x20 || $0.value == 0x7F } || s.hasPrefix(" ") || s.hasSuffix(" ")
}

/// A `src` that names a remote page: `http(s)` only, with a host.
func pyreonWebViewRemoteURL(_ src: String) -> URL? {
    guard let url = URL(string: src), let scheme = url.scheme?.lowercased(),
          scheme == "http" || scheme == "https", let host = url.host, !host.isEmpty
    else { return nil }
    return url
}

/// Content-process losses in a row after which a host stops reloading and
/// stays empty. Same rule as the Android host (`pyreonWebViewRendererGone` in
/// PyreonWebChromePolicy.kt); WebKit does not say whether the process crashed
/// or was reclaimed, so every termination counts as a crash here.
let pyreonWebViewMaxRendererCrashReloads = 2
/// Two losses less than this apart are "in a row"; a longer gap starts a new count.
let pyreonWebViewRendererLossWindowMs: Double = 60_000
let pyreonWebViewRendererBackoffBaseMs: Double = 1_000
let pyreonWebViewRendererBackoffMaxMs: Double = 30_000

/// One host's content-process losses in the current window.
struct PyreonRendererLossHistory {
    /// The html / src the count belongs to; another one is a new page with a fresh count.
    var key: String?
    /// Bumped per loss: a delayed reload whose generation is no longer current must not run.
    var generation = 0
    var lastAtMs: Double?
    var crashes = 0
    var losses = 0
}

/// The reload delay in milliseconds after the content process is gone, or nil
/// to stay empty. The first loss reloads at once, each further one in a row
/// waits twice as long (1 s up to 30 s), and a crash beyond
/// `pyreonWebViewMaxRendererCrashReloads` in a row stays empty. A finished load
/// does not restart the count: a page that crashes right after loading would
/// otherwise reload forever; a gap of the window does. A different `key` (another
/// html / src) is a new page with a fresh count. Each loss bumps `generation`, and a
/// reload an earlier loss scheduled must check `pyreonWebViewReloadStillDue`.
func pyreonWebViewRendererGone(_ history: inout PyreonRendererLossHistory, key: String?, didCrash: Bool, nowMs: Double) -> Double? {
    history.generation += 1
    if key == nil || key == history.key, let last = history.lastAtMs, nowMs - last < pyreonWebViewRendererLossWindowMs {
        // in a row (a nil key, no page known, is never a new page)
    } else {
        if let key { history.key = key }
        history.crashes = 0
        history.losses = 0
    }
    history.lastAtMs = nowMs
    history.losses += 1
    if didCrash {
        history.crashes += 1
        if history.crashes > pyreonWebViewMaxRendererCrashReloads { return nil }
    }
    if history.losses <= 1 { return 0 }
    let doublings = min(history.losses - 2, 15)
    return min(pyreonWebViewRendererBackoffBaseMs * Double(1 << doublings), pyreonWebViewRendererBackoffMaxMs)
}

/// Whether a reload scheduled at loss `generation` may still run (no newer loss since).
func pyreonWebViewReloadStillDue(_ history: PyreonRendererLossHistory, generation: Int) -> Bool {
    history.generation == generation
}

/// The script-message handler name the injected `window.pyreonPostMessage`
/// shim forwards to (`window.webkit.messageHandlers.pyreonNative`).
private let _pyreonMessageHandlerName = "pyreonNative"

/// The document-start shim defining the unified reverse-bridge API. Same
/// `window.pyreonPostMessage(...)` contract on web + Android.
private let _pyreonReverseBridgeShim =
    "window.pyreonPostMessage = function(m) {"
    + " window.webkit.messageHandlers.\(_pyreonMessageHandlerName).postMessage(String(m)); };"

/// Shared navigation delegate — tracks page-load completion so `data` is
/// pushed once the DOM exists, and re-pushed on later `data` changes. Also
/// the `WKScriptMessageHandler` for the reverse bridge: a page calling
/// `window.pyreonPostMessage(s)` lands in `userContentController(_:didReceive:)`.
/// One per hosted webview (created via `makeCoordinator`).
final class _PyreonWebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate {
    var latestData: String?
    var loaded = false
    /// The hosted WKWebView — a sibling relay evaluates into it.
    weak var webView: WKWebView?
    /// The host group this page joined (nil = none).
    var group: String?
    /// The html/src the page was last loaded with — a `data`-only change
    /// must NOT reload (that would defeat the live push).
    var loadedKey: String?
    /// Reverse-bridge callback — invoked with the page's posted string.
    var onMessage: ((String) -> Void)?
    /// The origin the host's own load committed to — the only origin that gets
    /// the data push and the bridge (see "Origin scope" in the file header).
    var allowedOrigin: String?
    /// True from the host starting a load until that load commits: its server
    /// redirects are part of the load, so they are followed wherever they go.
    var initialLoadPending = false
    /// The html / src last asked for, to load again after the content process is gone.
    var html: String?
    var src: String?
    /// Content-process losses in a row (see `pyreonWebViewRendererGone`).
    var lossHistory = PyreonRendererLossHistory()
    /// Download callback and whether the host saves downloads (see "Downloads").
    var onDownload: ((PyreonWebViewDownload) -> Void)?
    var saveDownloads = true
    /// Where each in-flight download is being written. An entry is removed when
    /// its download finishes or fails, so the table holds only live downloads.
    var downloadDestinations: [ObjectIdentifier: URL] = [:]

    /// Whether the main frame currently shows the allowed origin.
    func mainFrameAllowed(_ webView: WKWebView) -> Bool {
        !initialLoadPending
            && pyreonWebViewMayDeliver(isMainFrame: true, origin: pyreonWebViewOrigin(webView.url), allowedOrigin: allowedOrigin)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        // `<a download>`: a download leaves the main frame where it is, so it is
        // decided before (and outside) the origin policy.
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        let decision = pyreonWebViewNavigationDecision(
            isMainFrame: navigationAction.targetFrame?.isMainFrame,
            initialLoadPending: initialLoadPending,
            url: navigationAction.request.url,
            allowedOrigin: allowedOrigin,
            userActivated: navigationAction.navigationType == .linkActivated
        )
        switch decision {
        case .allow:
            decisionHandler(.allow)
        case .cancel:
            decisionHandler(.cancel)
        case .openExternally:
            decisionHandler(.cancel)
            if let url = navigationAction.request.url { _pyreonOpenExternally(url) }
        }
    }

    /// An attachment, or a type WebKit cannot display, becomes a download
    /// instead of a failed navigation.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
    ) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition")
        let download = pyreonWebViewResponseIsDownload(
            canShowMIMEType: navigationResponse.canShowMIMEType,
            contentDisposition: disposition
        )
        decisionHandler(download ? .download : .allow)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    // MARK: WKDownloadDelegate — see "Downloads" in the file header.

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping @MainActor @Sendable (URL?) -> Void
    ) {
        let url = (download.originalRequest?.url ?? response.url)?.absoluteString ?? ""
        let info = PyreonWebViewDownload(
            url: url,
            filename: pyreonWebViewDownloadFilename(suggestedFilename, pyreonWebViewDownloadURLName(url)),
            mimeType: response.mimeType ?? ""
        )
        onDownload?(info)
        // nil cancels the download: the app was told and handles it itself.
        guard saveDownloads, let destination = _pyreonDownloadDestination(filename: info.filename) else {
            completionHandler(nil)
            return
        }
        downloadDestinations[ObjectIdentifier(download)] = destination
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        _pyreonDeliverDownload(file, from: webView)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        guard let file = downloadDestinations.removeValue(forKey: ObjectIdentifier(download)) else { return }
        _pyreonDiscardDownload(file)
        print("[Pyreon] <WebView>: the download of \"\(file.lastPathComponent)\" failed: \(error.localizedDescription)")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        // Pin the origin the host's own load landed on (after its redirects).
        if initialLoadPending {
            initialLoadPending = false
            allowedOrigin = pyreonWebViewOrigin(webView.url)
        }
    }

    /// The host's load failed before committing: whatever document is still
    /// shown is not the one the host asked for, so nothing is allowed.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        initialLoadPending = false
    }

    /// The web content process is gone (WebKit reclaimed it, or the page
    /// crashed it). The WKWebView stays usable but blank, so load the page
    /// again, with the same backoff and cap as the Android host.
    @MainActor
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        let key = loadedKey
        let delay = pyreonWebViewRendererGone(&lossHistory, key: key, didCrash: true, nowMs: ProcessInfo.processInfo.systemUptime * 1000)
        loaded = false
        allowedOrigin = nil
        initialLoadPending = false
        let generation = lossHistory.generation
        guard let delay else {
            print("[Pyreon] <WebView>: the web content process ended \(lossHistory.crashes) times in a row, so this view stays empty until its html / src changes. The process may serve other WebViews in the app, so the page that ended it may be another one.")
            return
        }
        print("[Pyreon] <WebView>: the web content process ended; loading the page again\(delay > 0 ? " in \(Int(delay)) ms (losses in a row back off)" : "").")
        _Concurrency.Task { @MainActor [weak self, weak webView] in
            if delay > 0 { try? await _Concurrency.Task.sleep(nanoseconds: UInt64(delay * 1_000_000)) }
            // Unless the host was released, loaded something else, or lost the process again meanwhile.
            guard let self, let webView, pyreonWebViewReloadStillDue(self.lossHistory, generation: generation), self.loadedKey == key else { return }
            self.initialLoadPending = _loadPyreonWebView(webView, html: self.html, src: self.src)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        pushData(into: webView)
    }

    /// Reverse bridge — the page called `window.pyreonPostMessage(s)`.
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == _pyreonMessageHandlerName else { return }
        // Only the main frame of the allowed origin may talk to the app: an
        // ad iframe or a page the user navigated to gets nothing through.
        let frame = message.frameInfo
        let origin = pyreonWebViewOrigin(
            scheme: frame.securityOrigin.protocol,
            host: frame.securityOrigin.host,
            port: frame.securityOrigin.port
        )
        guard !initialLoadPending,
              pyreonWebViewMayDeliver(isMainFrame: frame.isMainFrame, origin: origin, allowedOrigin: allowedOrigin)
        else { return }
        let body = String(describing: message.body)
        // Reserved host-group traffic is consumed here and never forwarded.
        if _PyreonWebViewGroups.shared.handle(body, from: self) { return }
        onMessage?(body)
    }

    // No `deinit` leave: the registry holds members WEAKLY, so a coordinator
    // that dies without `dismantleUIView` simply drops out of its table, and the
    // registry prunes tables whose members are all gone. A `deinit` cannot
    // touch the main-actor registry anyway (deinit is nonisolated — an error in
    // the Swift 6 language mode).

    // MARK: WKUIDelegate — see "Browser chrome" in the file header.

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable () -> Void
    ) {
        _pyreonPresentDialog(
            on: webView,
            title: pyreonWebViewDialogTitle(host: frame.securityOrigin.host),
            message: message,
            kind: .alert,
            completion: { _ in completionHandler() }
        )
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
        _pyreonPresentDialog(
            on: webView,
            title: pyreonWebViewDialogTitle(host: frame.securityOrigin.host),
            message: message,
            kind: .confirm,
            completion: { result in completionHandler(result != nil) }
        )
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (String?) -> Void
    ) {
        _pyreonPresentDialog(
            on: webView,
            title: pyreonWebViewDialogTitle(host: frame.securityOrigin.host),
            message: prompt,
            kind: .prompt(defaultText: defaultText),
            completion: completionHandler
        )
    }

    /// `window.open` / `target="_blank"`: hand the URL to the system and create
    /// NO second web view (returning nil tells WebKit the window was handled).
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let url = navigationAction.request.url
        if pyreonWebViewMayOpenExternally(url), let url {
            _pyreonOpenExternally(url)
        }
        return nil
    }

    #if canImport(AppKit) && !canImport(UIKit)
    /// macOS: `<input type="file">` needs a panel (iOS has its own picker).
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.canChooseFiles = true
        if let window = webView.window {
            panel.beginSheetModal(for: window) { response in
                completionHandler(response == .OK ? panel.urls : nil)
            }
        } else {
            completionHandler(panel.runModal() == .OK ? panel.urls : nil)
        }
    }
    #endif

    /// Push the latest JSON into `window.__pyreonData` + fire `pyreondata`.
    /// No-op until the page has finished loading or when there's no data.
    func pushData(into webView: WKWebView) {
        guard loaded, mainFrameAllowed(webView), let json = latestData, !json.isEmpty else { return }
        let js = "window.__pyreonData = \(json); window.dispatchEvent(new Event(\"pyreondata\"));"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

/// Host-group registry — group name → the hosts currently in it. Every
/// hosted page is its own realm, so two guests can never reach each other;
/// a page that posted `{"__pyreonWebViewGroup":1,"join":"g"}` receives what
/// its group siblings relay, through `window.__pyreonWebViewGroupMessage(s)`.
/// Mirrors the web `<WebView>` host and the Android runtime byte-for-byte
/// in protocol. Members are held weakly and removed by IDENTITY on leave and
/// dismantle; an emptied group (no LIVE member left) is dropped. Main-actor
/// isolated: every caller is a WebKit / SwiftUI callback on the main thread,
/// and the Swift 6 language mode requires a shared mutable singleton to say so.
@MainActor
final class _PyreonWebViewGroups {
    static let shared = _PyreonWebViewGroups()
    private var members: [String: NSHashTable<_PyreonWebViewCoordinator>] = [:]

    /// Consume a reserved host-group message. Returns false for ordinary traffic.
    func handle(_ message: String, from coordinator: _PyreonWebViewCoordinator) -> Bool {
        guard message.hasPrefix("{\"__pyreonWebViewGroup\""),
              let data = message.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              (object["__pyreonWebViewGroup"] as? NSNumber)?.intValue == 1
        else { return false }
        if let join = object["join"] as? String, !join.isEmpty {
            self.join(coordinator, group: join)
        } else if object["leave"] as? Bool == true {
            leave(coordinator)
        } else if let group = object["group"] as? String, let relayed = object["message"] as? String,
                  coordinator.group == group {
            relay(relayed, in: group, from: coordinator)
        }
        return true
    }

    func join(_ coordinator: _PyreonWebViewCoordinator, group: String) {
        if coordinator.group == group { return }
        leave(coordinator)
        // Drop groups whose members all died without a dismantle (weak refs
        // only), so the map stays bounded by the LIVE grouped hosts.
        members = members.filter { !$0.value.allObjects.isEmpty }
        let table = members[group] ?? NSHashTable<_PyreonWebViewCoordinator>.weakObjects()
        table.add(coordinator)
        members[group] = table
        coordinator.group = group
    }

    func leave(_ coordinator: _PyreonWebViewCoordinator) {
        guard let group = coordinator.group else { return }
        coordinator.group = nil
        guard let table = members[group] else { return }
        table.remove(coordinator)
        if table.allObjects.isEmpty { members[group] = nil }
    }

    private func relay(_ message: String, in group: String, from coordinator: _PyreonWebViewCoordinator) {
        guard let table = members[group] else { return }
        // A JS string literal for the payload — JSON-encode it as a one-element
        // array and strip the brackets (fragment encoding needs no options).
        guard let data = try? JSONSerialization.data(withJSONObject: [message]),
              let array = String(data: data, encoding: .utf8), array.count >= 2
        else { return }
        let literal = String(array.dropFirst().dropLast())
        let js = "if (typeof window.__pyreonWebViewGroupMessage === 'function') window.__pyreonWebViewGroupMessage(\(literal));"
        for member in table.allObjects where member !== coordinator {
            // A sibling whose main frame left its origin gets nothing relayed.
            guard let webView = member.webView, member.mainFrameAllowed(webView) else { continue }
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }
}

/// Sync html/src/data onto the webview: (re)load only when html/src
/// changed; always refresh the coordinator's latest data + push it (the
/// push is a no-op until loaded, and the coordinator re-pushes on
/// `didFinish`). Shared by the UIKit + AppKit representables.
@MainActor
private func _syncPyreonWebView(
    _ webView: WKWebView,
    coordinator: _PyreonWebViewCoordinator,
    html: String?,
    src: String?,
    data: String?
) {
    coordinator.latestData = data
    coordinator.html = html
    coordinator.src = src
    let key = (html ?? "") + "\u{0001}" + (src ?? "")
    if coordinator.loadedKey != key {
        coordinator.loadedKey = key
        coordinator.loaded = false
        // The new load decides the origin; until it commits nothing is allowed.
        coordinator.allowedOrigin = nil
        coordinator.initialLoadPending = _loadPyreonWebView(webView, html: html, src: src)
        // `didFinish` pushes the data once the page is ready.
    } else {
        // html/src unchanged → a data-only update: push without reloading.
        coordinator.pushData(into: webView)
    }
}

/// Build a `WKWebView` wired for BOTH bridges: the coordinator is the
/// navigation delegate (data push) AND the reverse-bridge script-message
/// handler, and a document-start user script defines
/// `window.pyreonPostMessage`. Shared by the UIKit + AppKit representables.
@MainActor
private func _makePyreonWebView(coordinator: _PyreonWebViewCoordinator, domStorage: Bool) -> WKWebView {
    let contentController = WKUserContentController()
    contentController.add(coordinator, name: _pyreonMessageHandlerName)
    contentController.addUserScript(
        WKUserScript(
            source: _pyreonReverseBridgeShim,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
    )
    let config = WKWebViewConfiguration()
    config.userContentController = contentController
    if !domStorage { config.websiteDataStore = .nonPersistent() }
    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = coordinator
    // Without a UI delegate WebKit drops alert/confirm/prompt and window.open.
    webView.uiDelegate = coordinator
    coordinator.webView = webView
    return webView
}

/// The three JS dialog shapes. `completion` receives nil for a cancelled
/// confirm / prompt, a value (the text, or "" for a confirmed confirm / alert)
/// otherwise.
enum _PyreonDialogKind {
    case alert
    case confirm
    case prompt(defaultText: String?)
}

#if canImport(UIKit)
/// The view controller to present on: the window's root, walked up through
/// whatever it is already presenting.
@MainActor
private func _pyreonTopViewController(for view: UIView) -> UIViewController? {
    var top = view.window?.rootViewController
    while let presented = top?.presentedViewController { top = presented }
    return top
}

@MainActor
private func _pyreonPresentDialog(
    on webView: WKWebView,
    title: String?,
    message: String,
    kind: _PyreonDialogKind,
    completion: @escaping (String?) -> Void
) {
    // No window means nothing can present it. Answer with what dismissing the
    // dialog would have produced, rather than leaving WebKit's handler pending.
    guard let presenter = _pyreonTopViewController(for: webView) else {
        if case .alert = kind { completion("") } else { completion(nil) }
        return
    }
    let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
    switch kind {
    case .alert:
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion("") })
    case .confirm:
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completion("") })
    case .prompt(let defaultText):
        alert.addTextField { field in field.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completion(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completion(alert?.textFields?.first?.text ?? "")
        })
    }
    presenter.present(alert, animated: true)
}

@MainActor
private func _pyreonOpenExternally(_ url: URL) {
    UIApplication.shared.open(url)
}

/// iOS saves a download through the share sheet, so it is written to a
/// directory of its own under the temporary directory first (WebKit refuses a
/// destination that exists).
private func _pyreonDownloadDestination(filename: String) -> URL? {
    let dir = FileManager.default.temporaryDirectory
        .appendingPathComponent("pyreon-downloads", isDirectory: true)
        .appendingPathComponent(UUID().uuidString, isDirectory: true)
    do {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    } catch {
        print("[Pyreon] <WebView>: cannot save the download \"\(filename)\": \(error.localizedDescription)")
        return nil
    }
    return dir.appendingPathComponent(filename, isDirectory: false)
}

/// Remove a download's temporary directory.
private func _pyreonDiscardDownload(_ file: URL) {
    try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
}

/// Hand a finished download to the user: the share sheet, anchored to the web
/// view (an iPad presents it as a popover). The temporary copy is removed once
/// the sheet closes, whatever the user chose.
@MainActor
private func _pyreonDeliverDownload(_ file: URL, from webView: WKWebView?) {
    guard let webView, let presenter = _pyreonTopViewController(for: webView) else {
        print("[Pyreon] <WebView>: the download \"\(file.lastPathComponent)\" finished, but the view is not in a window to present the share sheet on; discarded.")
        _pyreonDiscardDownload(file)
        return
    }
    let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
    sheet.completionWithItemsHandler = { _, _, _, _ in _pyreonDiscardDownload(file) }
    if let popover = sheet.popoverPresentationController {
        popover.sourceView = webView
        popover.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 0, height: 0)
    }
    presenter.present(sheet, animated: true)
}
#elseif canImport(AppKit)
@MainActor
private func _pyreonPresentDialog(
    on webView: WKWebView,
    title: String?,
    message: String,
    kind: _PyreonDialogKind,
    completion: @escaping (String?) -> Void
) {
    let alert = NSAlert()
    alert.messageText = title ?? ""
    alert.informativeText = message
    alert.addButton(withTitle: "OK")
    var field: NSTextField?
    switch kind {
    case .alert:
        break
    case .confirm:
        alert.addButton(withTitle: "Cancel")
    case .prompt(let defaultText):
        alert.addButton(withTitle: "Cancel")
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 240, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input
        field = input
    }
    let finish: (NSApplication.ModalResponse) -> Void = { response in
        let ok = response == .alertFirstButtonReturn
        if case .alert = kind { completion("") } else { completion(ok ? (field?.stringValue ?? "") : nil) }
    }
    if let window = webView.window {
        alert.beginSheetModal(for: window, completionHandler: finish)
    } else {
        finish(alert.runModal())
    }
}

@MainActor
private func _pyreonOpenExternally(_ url: URL) {
    NSWorkspace.shared.open(url)
}

/// macOS saves a download straight into the user's Downloads folder, under a
/// name no file there has yet.
private func _pyreonDownloadDestination(filename: String) -> URL? {
    guard let dir = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first else { return nil }
    let name = pyreonWebViewFreeFilename(filename) { candidate in
        FileManager.default.fileExists(atPath: dir.appendingPathComponent(candidate).path)
    }
    return dir.appendingPathComponent(name, isDirectory: false)
}

private func _pyreonDiscardDownload(_ file: URL) {
    try? FileManager.default.removeItem(at: file)
}

@MainActor
private func _pyreonDeliverDownload(_ file: URL, from webView: WKWebView?) {
    // Already in Downloads; the Dock's Downloads stack shows it.
}
#endif

#if canImport(UIKit)
private struct _PyreonWebViewBridge: UIViewRepresentable {
    let html: String?
    let src: String?
    let data: String?
    let onMessage: ((String) -> Void)?
    let domStorage: Bool
    let onDownload: ((PyreonWebViewDownload) -> Void)?
    let saveDownloads: Bool
    func makeCoordinator() -> _PyreonWebViewCoordinator { _PyreonWebViewCoordinator() }
    func makeUIView(context: Context) -> WKWebView {
        // Read once at creation, like `domStorage`.
        context.coordinator.saveDownloads = saveDownloads
        return _makePyreonWebView(coordinator: context.coordinator, domStorage: domStorage)
    }
    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onMessage = onMessage
        context.coordinator.onDownload = onDownload
        _syncPyreonWebView(webView, coordinator: context.coordinator, html: html, src: src, data: data)
    }
    static func dismantleUIView(_ webView: WKWebView, coordinator: _PyreonWebViewCoordinator) {
        _PyreonWebViewGroups.shared.leave(coordinator)
    }
}
#elseif canImport(AppKit)
private struct _PyreonWebViewBridge: NSViewRepresentable {
    let html: String?
    let src: String?
    let data: String?
    let onMessage: ((String) -> Void)?
    let domStorage: Bool
    let onDownload: ((PyreonWebViewDownload) -> Void)?
    let saveDownloads: Bool
    func makeCoordinator() -> _PyreonWebViewCoordinator { _PyreonWebViewCoordinator() }
    func makeNSView(context: Context) -> WKWebView {
        // Read once at creation, like `domStorage`.
        context.coordinator.saveDownloads = saveDownloads
        return _makePyreonWebView(coordinator: context.coordinator, domStorage: domStorage)
    }
    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.onMessage = onMessage
        context.coordinator.onDownload = onDownload
        _syncPyreonWebView(webView, coordinator: context.coordinator, html: html, src: src, data: data)
    }
    static func dismantleNSView(_ webView: WKWebView, coordinator: _PyreonWebViewCoordinator) {
        _PyreonWebViewGroups.shared.leave(coordinator)
    }
}
#endif

/// Shared load logic. `html` → `loadHTMLString`; `src` → a bundled local
/// file (resolved against `Bundle.main`, the policy-safe path; a name with a
/// `..` segment is refused) falling back to a remote `http(s)` URL. Any other
/// `src` loads nothing. Returns whether a load was started.
@MainActor
private func _loadPyreonWebView(_ webView: WKWebView, html: String?, src: String?) -> Bool {
    if let html {
        webView.loadHTMLString(html, baseURL: Bundle.main.bundleURL)
        return true
    }
    guard let src else { return false }
    if let name = pyreonWebViewAssetName(src), let fileURL = Bundle.main.url(forResource: name, withExtension: nil),
       fileURL.standardizedFileURL.path.hasPrefix(Bundle.main.bundleURL.standardizedFileURL.path + "/") {
        webView.loadFileURL(fileURL, allowingReadAccessTo: Bundle.main.bundleURL)
        return true
    }
    if let url = pyreonWebViewRemoteURL(src) {
        webView.load(URLRequest(url: url))
        return true
    }
    return false
}

#else
// WebKit unavailable (e.g. a headless Linux toolchain) — render nothing
// so the package still compiles. Real targets (iOS / macOS) always have
// WebKit.
public enum PyreonWebViewGrow: Sendable {
    case vertical
    case horizontal
    case both
}

public struct PyreonWebView: View {
    public init(
        html: String? = nil,
        src: String? = nil,
        data: String? = nil,
        onMessage: ((String) -> Void)? = nil,
        domStorage: Bool = true,
        grow: PyreonWebViewGrow? = nil,
        onDownload: ((PyreonWebViewDownload) -> Void)? = nil,
        saveDownloads: Bool = true
    ) {}
    public var body: some View { EmptyView() }
}
#endif
