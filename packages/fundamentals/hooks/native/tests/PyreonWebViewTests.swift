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
        print("[PyreonWebViewTests] all assertions passed")
        #endif
    }
}
