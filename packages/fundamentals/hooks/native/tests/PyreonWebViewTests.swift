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
        rendererGone()
        downloads()
        print("[PyreonWebViewTests] all assertions passed")
        #endif
    }

    #if canImport(WebKit)
    /// Downloads (#4828): which responses become downloads, and the name a
    /// download is saved under. Mirrored by `PyreonWebChromePolicyTest.kt`.
    static func downloads() {
        // Attachment wins over a displayable type; inline / absent follow the type.
        check(pyreonWebViewResponseIsDownload(canShowMIMEType: true, contentDisposition: "attachment; filename=\"a.csv\""), "attachment is a download")
        check(pyreonWebViewResponseIsDownload(canShowMIMEType: true, contentDisposition: " ATTACHMENT "), "bare attachment, any case")
        check(!pyreonWebViewResponseIsDownload(canShowMIMEType: true, contentDisposition: "inline; filename=a.pdf"), "inline is shown")
        check(!pyreonWebViewResponseIsDownload(canShowMIMEType: true, contentDisposition: nil), "a displayable type is shown")
        check(!pyreonWebViewResponseIsDownload(canShowMIMEType: true, contentDisposition: "attachmentfoo"), "not a disposition token")
        check(pyreonWebViewResponseIsDownload(canShowMIMEType: false, contentDisposition: nil), "an undisplayable type is a download")

        // The first usable candidate wins; nothing usable is "download".
        check(pyreonWebViewDownloadFilename("report.csv", "ignored") == "report.csv", "suggested name")
        check(pyreonWebViewDownloadFilename(nil, "file.zip") == "file.zip", "URL name when none suggested")
        check(pyreonWebViewDownloadFilename("", "  ", nil) == "download", "fallback")
        // One path component, never hidden, never escaping the directory.
        check(pyreonWebViewDownloadFilename("../../etc/passwd") == "_.._etc_passwd", "separators replaced: \(pyreonWebViewDownloadFilename("../../etc/passwd"))")
        check(pyreonWebViewDownloadFilename("a\\b:c") == "a_b_c", "backslash and colon replaced")
        check(pyreonWebViewDownloadFilename("..hidden") == "hidden", "leading dots dropped")
        check(pyreonWebViewDownloadFilename("a\u{0}b\nc") == "a_b_c", "control characters replaced")
        check(pyreonWebViewDownloadFilename("///", "x.txt") == "x.txt", "an all-separator name is no name")
        check(pyreonWebViewDownloadFilename("Résumé 2026.pdf") == "Résumé 2026.pdf", "unicode and spaces kept")
        // Bidi controls are removed (no "photo<RLO>gpj.apk" posing as a JPEG); C1 controls become "_".
        check(pyreonWebViewDownloadFilename("photo\u{202E}gpj.apk") == "photogpj.apk", "RLO removed")
        check(pyreonWebViewDownloadFilename("a\u{200E}\u{2066}b\u{2069}\u{200F}.txt") == "ab.txt", "marks and isolates removed")
        check(pyreonWebViewDownloadFilename("a\u{85}b\u{9F}c") == "a_b_c", "C1 controls replaced")
        // One trim rule: the listed spaces (NBSP, ideographic, BOM, …) at both ends.
        check(pyreonWebViewDownloadFilename("\u{3000}\u{A0} .x.txt\u{FEFF} ") == "x.txt", "trim set, then leading dots")
        // At most 255 UTF-8 BYTES, extension kept, cut on a grapheme boundary.
        let long = pyreonWebViewDownloadFilename(String(repeating: "a", count: 300) + ".pdf")
        check(long.utf8.count == 255 && long.hasSuffix(".pdf"), "ASCII capped at 255 bytes: \(long.utf8.count)")
        let cjk = pyreonWebViewDownloadFilename(String(repeating: "報", count: 120) + ".csv")
        check(cjk.utf8.count <= 255 && cjk.hasSuffix(".csv") && cjk.utf8.count > 240, "CJK capped by bytes: \(cjk.utf8.count)")
        check(cjk.dropLast(4).allSatisfy { $0 == "報" }, "no character split")
        let family = "👨‍👩‍👧‍👦"
        let emoji = pyreonWebViewDownloadFilename(String(repeating: family, count: 20) + ".png")
        check(emoji.utf8.count <= 255 && emoji.hasSuffix(".png"), "emoji capped by bytes: \(emoji.utf8.count)")
        check(emoji.dropLast(4).allSatisfy { String($0) == family }, "ZWJ sequences kept whole")
        check(pyreonWebViewDownloadFilename("short.csv") == "short.csv", "a short name is untouched")

        // The download rule: main frame on the allowed origin, a fresh unused gesture, one at a time.
        check(pyreonWebViewDownloadVerdict(fromMainFrame: true, onAllowedOrigin: true, activationAgeMs: 100, busy: false) == .allow, "allowed")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: false, onAllowedOrigin: true, activationAgeMs: 100, busy: false) == .notMainFrame, "sub-frame refused")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: true, onAllowedOrigin: false, activationAgeMs: 100, busy: false) == .notMainFrame, "other origin refused")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: true, onAllowedOrigin: true, activationAgeMs: nil, busy: false) == .noActivation, "no gesture refused")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: true, onAllowedOrigin: true, activationAgeMs: 5_001, busy: false) == .noActivation, "stale gesture refused")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: true, onAllowedOrigin: true, activationAgeMs: -1, busy: false) == .noActivation, "future gesture refused")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: true, onAllowedOrigin: true, activationAgeMs: 5_000, busy: true) == .busy, "busy refused")
        check(pyreonWebViewDownloadVerdict(fromMainFrame: false, onAllowedOrigin: false, activationAgeMs: nil, busy: true) == .notMainFrame, "frame is checked first")
        check(!pyreonWebViewDownloadBusy(since: nil, nowMs: 0), "idle")
        check(pyreonWebViewDownloadBusy(since: 1_000, nowMs: 60_000), "in flight")
        check(!pyreonWebViewDownloadBusy(since: 1_000, nowMs: 1_000 + pyreonWebViewDownloadBusyStaleMs), "a lost callback stops blocking")

        // URL names: only for a URL with a real path.
        check(pyreonWebViewDownloadURLName("https://x.test/files/q3.csv?x=1") == "q3.csv", "http path segment")
        check(pyreonWebViewDownloadURLName("https://x.test/") == nil, "no segment")
        check(pyreonWebViewDownloadURLName("blob:https://x.test/8c1d-uuid") == nil, "blob has no name")
        check(pyreonWebViewDownloadURLName("data:text/csv,a,b") == nil, "data has no name")

        let d = PyreonWebViewDownload(url: "blob:x", filename: "a.csv", mimeType: "text/csv")
        check(d == PyreonWebViewDownload(url: "blob:x", filename: "a.csv", mimeType: "text/csv"), "value type")
    }

    /// Content-process loss: the same backoff and cap as the Android host.
    static func rendererGone() {
        let page = "bridge.html"
        var kills = PyreonRendererLossHistory()
        let killDelays = (0..<8).map { pyreonWebViewRendererGone(&kills, key: page, didCrash: false, nowMs: Double($0) * 1000) }
        check(killDelays == [0, 1000, 2000, 4000, 8000, 16000, 30000, 30000], "kill backoff: \(killDelays)")
        var crashes = PyreonRendererLossHistory()
        check(pyreonWebViewRendererGone(&crashes, key: page, didCrash: true, nowMs: 0) == 0, "first crash reloads at once")
        check(pyreonWebViewRendererGone(&crashes, key: page, didCrash: true, nowMs: 5000) == 1000, "second crash reloads after 1 s")
        check(pyreonWebViewRendererGone(&crashes, key: page, didCrash: true, nowMs: 10000) == nil, "third crash in a row stays empty")
        var spaced = PyreonRendererLossHistory()
        for i in 0..<5 {
            check(pyreonWebViewRendererGone(&spaced, key: page, didCrash: true, nowMs: Double(i) * pyreonWebViewRendererLossWindowMs) == 0, "crash \(i), a window apart, reloads at once")
        }
        // Just inside the window still counts as in a row.
        var tight = PyreonRendererLossHistory()
        _ = pyreonWebViewRendererGone(&tight, key: page, didCrash: true, nowMs: 0)
        _ = pyreonWebViewRendererGone(&tight, key: page, didCrash: true, nowMs: pyreonWebViewRendererLossWindowMs - 1)
        check(pyreonWebViewRendererGone(&tight, key: page, didCrash: true, nowMs: 2 * pyreonWebViewRendererLossWindowMs - 2) == nil, "a chain of gaps under the window is one run")
        // Kills in between do not spend the crash budget, but do lengthen the delay.
        var mixed = PyreonRendererLossHistory()
        _ = pyreonWebViewRendererGone(&mixed, key: page, didCrash: true, nowMs: 0)
        _ = pyreonWebViewRendererGone(&mixed, key: page, didCrash: false, nowMs: 1)
        check(pyreonWebViewRendererGone(&mixed, key: page, didCrash: true, nowMs: 2) == 2000, "crash, kill, crash: reload after 2 s")

        // A newer loss supersedes a pending reload (same as the Kotlin test).
        var pending = PyreonRendererLossHistory()
        _ = pyreonWebViewRendererGone(&pending, key: page, didCrash: true, nowMs: 0)
        check(pyreonWebViewRendererGone(&pending, key: page, didCrash: true, nowMs: 100) == 1000, "crash 2 schedules a reload")
        let scheduled = pending.generation
        check(pyreonWebViewReloadStillDue(pending, generation: scheduled), "a reload with no newer loss runs")
        check(pyreonWebViewRendererGone(&pending, key: page, didCrash: true, nowMs: 500) == nil, "crash 3 stays empty")
        check(!pyreonWebViewReloadStillDue(pending, generation: scheduled), "crash 2's reload is superseded")
        // A different html / src is a new page: a fresh count, even after the cap.
        check(pyreonWebViewRendererGone(&pending, key: "other.html", didCrash: true, nowMs: 600) == 0, "a new page's first crash reloads")
        // A loss with no page key (the frame in which a reload is pending) is not a new page.
        var frame = PyreonRendererLossHistory()
        _ = pyreonWebViewRendererGone(&frame, key: page, didCrash: true, nowMs: 0)
        _ = pyreonWebViewRendererGone(&frame, key: nil, didCrash: true, nowMs: 10)
        check(pyreonWebViewRendererGone(&frame, key: page, didCrash: true, nowMs: 20) == nil, "a loss in the reload frame does not reset the count")
    }

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
