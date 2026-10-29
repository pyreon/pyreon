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
    private let onMessage: ((String) -> Void)?
    private let domStorage: Bool
    private let grow: PyreonWebViewGrow?

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
    /// stack's free space along it (see the file header).
    public init(
        html: String? = nil,
        src: String? = nil,
        data: String? = nil,
        onMessage: ((String) -> Void)? = nil,
        domStorage: Bool = true,
        grow: PyreonWebViewGrow? = nil
    ) {
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
            content: _PyreonWebViewBridge(html: html, src: src, data: data, onMessage: onMessage, domStorage: domStorage),
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
final class _PyreonWebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
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
        guard loaded, let json = latestData, !json.isEmpty else { return }
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
            member.webView?.evaluateJavaScript(js, completionHandler: nil)
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
#endif

#if canImport(UIKit)
private struct _PyreonWebViewBridge: UIViewRepresentable {
    let html: String?
    let src: String?
    let data: String?
    let onMessage: ((String) -> Void)?
    let domStorage: Bool
    func makeCoordinator() -> _PyreonWebViewCoordinator { _PyreonWebViewCoordinator() }
    func makeUIView(context: Context) -> WKWebView {
        _makePyreonWebView(coordinator: context.coordinator, domStorage: domStorage)
    }
    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onMessage = onMessage
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
    func makeCoordinator() -> _PyreonWebViewCoordinator { _PyreonWebViewCoordinator() }
    func makeNSView(context: Context) -> WKWebView {
        _makePyreonWebView(coordinator: context.coordinator, domStorage: domStorage)
    }
    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.onMessage = onMessage
        _syncPyreonWebView(webView, coordinator: context.coordinator, html: html, src: src, data: data)
    }
    static func dismantleNSView(_ webView: WKWebView, coordinator: _PyreonWebViewCoordinator) {
        _PyreonWebViewGroups.shared.leave(coordinator)
    }
}
#endif

/// Shared load logic. `html` → `loadHTMLString`; `src` → a bundled local
/// file (resolved against `Bundle.main`, the policy-safe path) falling
/// back to a remote `URL`.
@MainActor
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
        grow: PyreonWebViewGrow? = nil
    ) {}
    public var body: some View { EmptyView() }
}
#endif
