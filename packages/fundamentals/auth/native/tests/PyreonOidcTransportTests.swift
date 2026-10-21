// The default iOS transport against a REAL local HTTP server (Network framework): a round trip,
// and a redirect REFUSED rather than followed — the web sends every auth request with
// `redirect: 'error'`, because a followed redirect would carry the code and verifier to
// wherever it points.

import Foundation
import Network

final class TinyHTTPServer: @unchecked Sendable {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "tiny-http")
    var port: UInt16 { listener.port?.rawValue ?? 0 }

    init() throws {
        listener = try NWListener(using: .tcp, on: .any)
        listener.newConnectionHandler = { [queue] conn in
            conn.start(queue: queue)
            conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { data, _, _, _ in
                let text = String(decoding: data ?? Data(), as: UTF8.self)
                let firstLine = text.split(separator: "\r\n").first ?? ""
                let parts = firstLine.split(separator: " ")
                let method = parts.first.map(String.init) ?? ""
                let path = parts.count > 1 ? String(parts[1]) : ""
                // The body may arrive in a later read; the declared length proves it was sent.
                let length = text.split(separator: "\r\n")
                    .first { $0.lowercased().hasPrefix("content-length:") }
                    .map { $0.split(separator: ":")[1].trimmingCharacters(in: .whitespaces) } ?? "0"
                let response: String
                if path == "/moved" {
                    response = "HTTP/1.1 302 Found\r\nLocation: /ok\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                } else {
                    let reply = "\(method) \(length)"
                    response = "HTTP/1.1 200 OK\r\nContent-Length: \(reply.utf8.count)\r\nConnection: close\r\n\r\n\(reply)"
                }
                conn.send(content: Data(response.utf8), completion: .contentProcessed { _ in conn.cancel() })
            }
        }
    }

    func start() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            let once = Once()
            listener.stateUpdateHandler = { state in
                if case .ready = state, !once.done { once.done = true; cont.resume() }
            }
            listener.start(queue: queue)
        }
    }

    func stop() { listener.cancel() }
}

enum PyreonOidcTransportTests {
    static func run(_ expect: (Bool, String) -> Void) async throws {
        let server = try TinyHTTPServer()
        await server.start()
        defer { server.stop() }
        let base = "http://127.0.0.1:\(server.port)"
        let t = PyreonAuthURLSessionTransport()
        let ok = try await t.send(PyreonAuthRequest(method: .post, url: "\(base)/ok", body: Data("a=1".utf8)))
        expect(ok.status == 200 && String(decoding: ok.body, as: UTF8.self) == "POST 3",
               "round trip: \(ok.status) \(String(decoding: ok.body, as: UTF8.self))")
        let moved = try await t.send(PyreonAuthRequest(method: .post, url: "\(base)/moved", body: Data("a=1".utf8)))
        expect(moved.status == 302, "redirect refused, not followed (got \(moved.status))")
    }
}

final class Once: @unchecked Sendable {
    var done = false
}
