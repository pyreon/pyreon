// Executable checks for PyreonWebView's browser-chrome policy (#3982).
//
// NOT @main: PyreonBluetoothTests owns this directory's single entry point and
// calls `runAll()`. What is under test is the part of the WKUIDelegate that is
// a DECISION rather than UIKit plumbing — which URLs a page may hand to the
// system, and what a JS dialog is titled — so it runs with no simulator.

import Foundation

enum PyreonWebViewTests {
    static func check(_ c: Bool, _ m: String) { if !c { fatalError("PyreonWebViewTests: \(m)") } }

    static func runAll() {
        #if canImport(WebKit)
        // The hand-off allow-list: the schemes a browser would open itself.
        for ok in ["https://example.com/terms", "http://x.test", "mailto:a@b.c", "tel:+1555", "sms:+1555", "HTTPS://EXAMPLE.COM"] {
            check(pyreonWebViewMayOpenExternally(URL(string: ok)), "\(ok) is handed to the system")
        }
        // Everything else stays in — a hosted page must not launch arbitrary
        // apps, run script in a new context, or open local files.
        for no in ["javascript:alert(1)", "file:///etc/hosts", "about:blank", "myapp://pay", "data:text/html,x", "intent://x#Intent;end"] {
            check(!pyreonWebViewMayOpenExternally(URL(string: no)), "\(no) is refused")
        }
        check(!pyreonWebViewMayOpenExternally(nil), "a nil URL is refused")

        // Dialog titles follow Safari: the frame's host, or none.
        check(pyreonWebViewDialogTitle(host: "example.com") == "example.com", "host becomes the title")
        check(pyreonWebViewDialogTitle(host: "") == nil, "an empty host (file:/inline html) has no title")
        check(pyreonWebViewDialogTitle(host: nil) == nil, "no host has no title")

        originScope()
        print("[PyreonWebViewTests] all assertions passed")
        #endif
    }

    #if canImport(WebKit)
    /// Origin scope: data and the bridge belong to the page the app loaded.
    static func originScope() {
        // Origins: scheme://host[:port], default ports dropped, file is one origin,
        // everything host-less is opaque (never allowed).
        check(pyreonWebViewOrigin(URL(string: "HTTPS://App.Example.com/x?y")) == "https://app.example.com", "https origin")
        check(pyreonWebViewOrigin(URL(string: "https://a.test:443/")) == "https://a.test", "default https port dropped")
        check(pyreonWebViewOrigin(URL(string: "http://a.test:8080/")) == "http://a.test:8080", "explicit port kept")
        check(pyreonWebViewOrigin(scheme: "https", host: "a.test", port: 0) == "https://a.test", "WKSecurityOrigin port 0 = default")
        check(pyreonWebViewOrigin(URL(string: "file:///var/App.app/index.html")) == "file://", "file is one origin")
        for opaque in ["about:blank", "data:text/html,x", "javascript:alert(1)", "blob:https://a.test/1", "myapp://x"] {
            check(pyreonWebViewOrigin(URL(string: opaque)) == nil, "\(opaque) is opaque")
        }

        // Bridge delivery: main frame AND allowed origin, nothing else.
        let app = "https://app.test"
        check(pyreonWebViewMayDeliver(isMainFrame: true, origin: app, allowedOrigin: app), "main frame of the app origin")
        check(!pyreonWebViewMayDeliver(isMainFrame: false, origin: app, allowedOrigin: app), "a sub-frame never delivers")
        check(!pyreonWebViewMayDeliver(isMainFrame: true, origin: "https://evil.test", allowedOrigin: app), "another origin never delivers")
        check(!pyreonWebViewMayDeliver(isMainFrame: true, origin: nil, allowedOrigin: app), "an opaque origin never delivers")
        check(!pyreonWebViewMayDeliver(isMainFrame: true, origin: app, allowedOrigin: nil), "nothing is allowed before a load commits")

        // Navigation: sub-frames free; the host's own load (and its redirects) free;
        // afterwards the main frame stays on its origin.
        let evil = URL(string: "https://evil.test/phish")
        check(pyreonWebViewNavigationDecision(isMainFrame: false, initialLoadPending: false, url: evil, allowedOrigin: app, userActivated: false) == .allow, "sub-frame navigates")
        check(pyreonWebViewNavigationDecision(isMainFrame: nil, initialLoadPending: false, url: evil, allowedOrigin: app, userActivated: true) == .allow, "new-window request goes to createWebViewWith")
        check(pyreonWebViewNavigationDecision(isMainFrame: true, initialLoadPending: true, url: URL(string: "https://www.app.test/"), allowedOrigin: nil, userActivated: false) == .allow, "the host's load follows its redirects")
        check(pyreonWebViewNavigationDecision(isMainFrame: true, initialLoadPending: false, url: URL(string: "https://app.test/next"), allowedOrigin: app, userActivated: false) == .allow, "same-origin navigation")
        check(pyreonWebViewNavigationDecision(isMainFrame: true, initialLoadPending: false, url: evil, allowedOrigin: app, userActivated: true) == .openExternally, "a tapped off-origin link goes to the system")
        check(pyreonWebViewNavigationDecision(isMainFrame: true, initialLoadPending: false, url: evil, allowedOrigin: app, userActivated: false) == .cancel, "a scripted off-origin navigation is cancelled")
        check(pyreonWebViewNavigationDecision(isMainFrame: true, initialLoadPending: false, url: URL(string: "data:text/html,x"), allowedOrigin: app, userActivated: true) == .cancel, "a data: main frame is cancelled")
        check(pyreonWebViewNavigationDecision(isMainFrame: true, initialLoadPending: false, url: URL(string: "file:///etc/hosts"), allowedOrigin: app, userActivated: true) == .cancel, "a remote page cannot navigate to file:")

        // Bundled asset names never escape the bundle; remote src is http(s) only.
        for ok in ["chart.html", "webhost/bridge.html", "a/b/c.html"] {
            check(pyreonWebViewAssetName(ok) == ok, "\(ok) is a bundled name")
        }
        check(pyreonWebViewAssetName("my chart.html") == "my chart.html", "an inner space is an ordinary bundled name")
        // #52: characters a URL parser deletes or trims (tab/CR/LF, trailing
        // controls and spaces) are refused, the same rule as the Android host.
        for bad in ["../secret.plist", "a/../../x", "a/%2e%2e/x", "/etc/hosts", "a\\..\\x", "file:///etc/hosts", "", "a//b", "./x",
                    ".\t./x", ".\r./x", ".\n./x", "\t../x", "x/..\u{0001}", "x/.. ", "..%09/x", "a\u{007F}b"] {
            check(pyreonWebViewAssetName(bad) == nil, "\(bad) is refused as a bundled name")
        }
        check(pyreonWebViewRemoteURL("https://a.test/x") != nil, "https src loads")
        check(pyreonWebViewRemoteURL("http://a.test") != nil, "http src loads")
        for bad in ["file:///etc/hosts", "javascript:alert(1)", "data:text/html,x", "myapp://x", "https://"] {
            check(pyreonWebViewRemoteURL(bad) == nil, "\(bad) is not a remote src")
        }
    }
    #endif
}
