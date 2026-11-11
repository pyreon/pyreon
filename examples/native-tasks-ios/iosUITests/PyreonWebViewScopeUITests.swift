// PyreonWebViewScopeUITests — the native <WebView> origin scope (#4215) on a
// REAL simulator: host `data` and the reverse bridge belong to the MAIN frame
// of the origin the app loaded; that origin is pinned after the first load;
// a bundled `src` cannot climb out of the bundle.
//
// The app shows WebViewScopeProbe (ios/WebViewScopeProbe.swift) instead of the
// tasks app when launched with `-PyreonWebViewScope <scenario>`. Its pages come
// from the CI stream server (examples/native-tasks/scripts/
// webview-scope-pages.ts) on two origins: http://127.0.0.1:8791 is the one the
// app loads, http://localhost:8791 is "another origin". Every outcome is a
// string the page posts over the bridge, joined into the native label
// `scope-messages`, so the assertions read native UI, never the inside of the
// WKWebView. The Android twin is PyreonWebViewOriginScopeTest.kt.
//
// Each frames/nav assertion is on the WHOLE label, so any `leak:…` message
// (a frame or an off-origin page that got through) fails it.

import XCTest

final class PyreonWebViewScopeUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func launch(_ scenario: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-PyreonWebViewScope", scenario]
        app.launch()
        XCTAssertTrue(app.staticTexts["scope-title"].firstMatch.waitForExistence(timeout: 30), "probe did not render")
        return app
    }

    private func waitForLabel(_ el: XCUIElement, timeout: TimeInterval, _ done: (String) -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if el.exists && done(el.label) { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.25))
        }
        return el.exists && done(el.label)
    }

    /// What a cross-origin iframe reports: it HOLDS the script-message handler
    /// (`native=webkit`) and called it, yet nothing it sent arrived; it has no
    /// shim, no data, and cannot reach the parent's shim.
    private let frameReport = "frame:native=webkit,shim=undefined,data=undefined,parent=blocked"

    /// (a) + (b) with a REMOTE main page: the main frame gets the data and its
    /// message arrives; the cross-origin iframe's messages do not.
    func test_webViewScope_remotePage_crossOriginFrameGetsNothing() {
        let app = launch("frames-remote")
        let label = app.staticTexts["scope-messages"].firstMatch
        XCTAssertTrue(waitForLabel(label, timeout: 30) { $0.contains("main:done") }, "frames scenario never finished (label: \(label.label))")
        XCTAssertEqual(label.label, "main:data=host-data|\(frameReport)|main:done")
    }

    /// The same with INLINE `html` (the `file://` origin of `loadHTMLString`
    /// with the bundle as base URL — the shape the editor packages use).
    func test_webViewScope_inlineHtml_crossOriginFrameGetsNothing() {
        let app = launch("frames-inline")
        let label = app.staticTexts["scope-messages"].firstMatch
        XCTAssertTrue(waitForLabel(label, timeout: 30) { $0.contains("main:done") }, "frames scenario never finished (label: \(label.label))")
        XCTAssertEqual(label.label, "main:data=host-data|\(frameReport)|main:done")
    }

    /// The pin is the origin the host's load LANDS on: a server redirect from
    /// 127.0.0.1 to localhost is part of that load, and the landed page gets
    /// the data and the bridge.
    func test_webViewScope_serverRedirectPinsTheLandedOrigin() {
        let app = launch("redirect")
        let label = app.staticTexts["scope-messages"].firstMatch
        XCTAssertTrue(waitForLabel(label, timeout: 30) { $0 == "main:data=host-data" }, "redirected page got no data / bridge (label: \(label.label))")
    }

    /// (c) After the first load the main frame stays on its origin: a script
    /// navigation, a form POST, and a same-origin GET / POST that the server
    /// redirects to the other origin are all cancelled (the server never serves
    /// the off-origin page and this page is still there), and a TAPPED link off
    /// the origin is handed to Safari instead of loading in place.
    func test_webViewScope_offOriginNavigationIsBlockedOrHandedToSafari() {
        let app = launch("nav")
        let label = app.staticTexts["scope-messages"].firstMatch
        XCTAssertTrue(waitForLabel(label, timeout: 30) { $0.contains("nav:") }, "nav scenario never reported (label: \(label.label))")
        XCTAssertEqual(label.label, "main:data=host-data|nav:still-here origin=http://127.0.0.1:8791 hits=0")

        let link = app.webViews.links["Leave this origin"].firstMatch
        XCTAssertTrue(link.waitForExistence(timeout: 15), "link missing: \(app.debugDescription.prefix(1500))")
        link.tap()
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 20), "a tapped off-origin link was not handed to Safari")
        safari.terminate()
        app.activate()
        XCTAssertTrue(link.waitForExistence(timeout: 15), "the hosted page was replaced by the off-origin link")
        XCTAssertEqual(label.label, "main:data=host-data|nav:still-here origin=http://127.0.0.1:8791 hits=0")
    }

    /// (e) A bundled `src` that leaves the bundle directory first — `.`/`..`
    /// segments, percent-encoded dots, a tab inside a dot segment, an absolute
    /// path — loads nothing, while the plain name (the control) loads and
    /// echoes the data. Every spelling names the SAME file, so only the host's
    /// check can tell them apart.
    func test_webViewScope_bundledSrcCannotLeaveTheBundle() {
        let app = launch("assets")
        let control = app.staticTexts["asset-0"].firstMatch
        XCTAssertTrue(waitForLabel(control, timeout: 30) { $0 == "asset-ok" }, "the control bundled page never echoed (label: \(control.label))")
        // The control proves pages on this screen load and talk; give every
        // other one the same time again before reading them.
        RunLoop.current.run(until: Date().addingTimeInterval(3))
        for index in 1..<7 {
            XCTAssertEqual(app.staticTexts["asset-\(index)"].firstMatch.label, "none", "asset src #\(index) loaded a page")
        }
    }
}
