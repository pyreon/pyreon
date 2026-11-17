import SwiftUI

// The <WebView> origin-scope device probe (#4215). Launched INSTEAD of the tasks
// app when the UITest passes `-PyreonWebViewScope <scenario>`; a normal launch
// never sees it. It hosts the real `PyreonWebView` (the hooks runtime compiled
// into this app) with loads the shared .tsx cannot express — a remote page on
// one loopback origin framing another, a bundled `src` that tries to climb out
// of the bundle — and shows what reached the app in native labels.
//
// Pages come from examples/native-tasks/scripts/webview-scope-pages.ts, served
// by the CI stream server on two origins: http://127.0.0.1:8791 (loaded) and
// http://localhost:8791 (the other origin). The Android twin is
// PyreonWebViewOriginScopeTest.kt, which composes the same host directly.
struct WebViewScopeProbe: View {
    let scenario: String
    /// Per launch, so the server's hit counter never mixes test iterations.
    private let run = UUID().uuidString
    private let data = #"{"secret":"host-data"}"#
    @State private var messages: [String] = []
    @State private var assetResults: [String] = Array(repeating: "none", count: WebViewScopeProbe.assetSources.count)

    static let same = "http://127.0.0.1:8791"

    /// Bundled `src` spellings. Index 0 is the control (it must load and echo
    /// the data); every other one names the same file by a path that leaves
    /// the bundle directory first, and must load nothing.
    static var assetSources: [String] {
        let app = Bundle.main.bundleURL.lastPathComponent
        return [
            "bridge.html",
            "./bridge.html",
            "x/../bridge.html",
            "../\(app)/bridge.html",
            "%2E%2E/\(app)/bridge.html",
            ".\t./\(app)/bridge.html",
            Bundle.main.bundleURL.path + "/bridge.html",
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("scope:\(scenario)").accessibilityIdentifier("scope-title")
            switch scenario {
            case "assets":
                ForEach(Array(Self.assetSources.enumerated()), id: \.offset) { index, src in
                    PyreonWebView(src: src, data: #""asset-ok""#, onMessage: { m in assetResults[index] = m })
                        .frame(height: 24)
                    Text(assetResults[index]).accessibilityIdentifier("asset-\(index)")
                }
            case "frames-inline":
                host(html: #"<!doctype html><html><body>inline<script src="\#(Self.same)/webview/scope.js?scenario=frames&run=\#(run)"></script></body></html>"#)
            case "frames-remote":
                host(src: "\(Self.same)/webview/main?scenario=frames&run=\(run)")
            case "redirect":
                host(src: "\(Self.same)/webview/redirect?scenario=plain&run=\(run)")
            case "nav":
                host(src: "\(Self.same)/webview/main?scenario=nav&run=\(run)")
            default:
                Text("unknown scenario")
            }
            Spacer(minLength: 0)
        }
        .padding(8)
    }

    @ViewBuilder
    private func host(html: String? = nil, src: String? = nil) -> some View {
        PyreonWebView(html: html, src: src, data: data, onMessage: { m in messages.append(m) })
            .frame(height: 280)
        Text(messages.isEmpty ? "none" : messages.joined(separator: "|"))
            .accessibilityIdentifier("scope-messages")
    }
}
