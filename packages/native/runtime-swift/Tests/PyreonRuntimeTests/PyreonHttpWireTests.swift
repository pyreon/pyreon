// The REQUEST BYTES the runtime puts on the wire, asserted against a loopback
// server rather than against the `URLRequest` the runtime builds.
//
// `buildURLRequest` tests prove the request object is right; they cannot see
// what URLSession then sends — a header it adds, a body it re-encodes, a query
// it re-escapes. A server that records the raw request is the only check that
// sees the same thing the backend does, and it is what "byte-equivalent to the
// web" has to be measured against.

import Foundation
import Network
import XCTest
@testable import PyreonRuntime

/// A one-request-at-a-time HTTP/1.1 server on 127.0.0.1 that records every
/// request it receives and answers with a fixed status and body.
final class LoopbackServer: @unchecked Sendable {
    private let listener: NWListener
    private let queue = DispatchQueue(label: "pyreon.loopback")
    private let status: Int
    private let reply: String
    private var requests: [Data] = []
    private let lock = NSLock()

    init(status: Int = 200, reply: String = "{}") throws {
        self.status = status
        self.reply = reply
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = NWEndpoint.hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: params)
    }

    /// Start listening; resolves with the bound port.
    func start() async throws -> UInt16 {
        listener.newConnectionHandler = { [weak self] connection in self?.serve(connection) }
        return try await withCheckedThrowingContinuation { continuation in
            var resumed = false
            listener.stateUpdateHandler = { [weak self] state in
                guard !resumed else { return }
                switch state {
                case .ready:
                    resumed = true
                    continuation.resume(returning: self?.listener.port?.rawValue ?? 0)
                case .failed(let error):
                    resumed = true
                    continuation.resume(throwing: error)
                default:
                    break
                }
            }
            listener.start(queue: queue)
        }
    }

    func stop() { listener.cancel() }

    /// Every request received so far, raw.
    var received: [Data] {
        lock.lock()
        defer { lock.unlock() }
        return requests
    }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, buffer: Data())
    }

    private func read(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1 << 20) { [weak self] chunk, _, done, error in
            guard let self else { return }
            var all = buffer
            if let chunk { all.append(chunk) }
            if let complete = Self.completeRequest(all) {
                self.lock.lock()
                self.requests.append(complete)
                self.lock.unlock()
                let body = Data(self.reply.utf8)
                let head = "HTTP/1.1 \(self.status) X\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
                connection.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
                return
            }
            if done || error != nil {
                connection.cancel()
                return
            }
            self.read(connection, buffer: all)
        }
    }

    /// The request in `data` once its head and its `Content-Length` body have both arrived.
    static func completeRequest(_ data: Data) -> Data? {
        guard let end = data.range(of: Data("\r\n\r\n".utf8)) else { return nil }
        let head = String(decoding: data[..<end.lowerBound], as: UTF8.self)
        var length = 0
        for line in head.split(separator: "\r\n") {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2, parts[0].lowercased() == "content-length" {
                length = Int(parts[1].trimmingCharacters(in: .whitespaces)) ?? 0
            }
        }
        let have = data.count - end.upperBound
        return have >= length ? data.prefix(end.upperBound + length) : nil
    }
}

/// A recorded request, split into the parts a test asserts on.
struct WireRequest {
    let requestLine: String
    let headers: [String: String]
    let body: Data

    init(_ raw: Data) {
        let end = raw.range(of: Data("\r\n\r\n".utf8))!
        let lines = String(decoding: raw[..<end.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
        requestLine = lines[0]
        var h: [String: String] = [:]
        for line in lines.dropFirst() {
            let parts = line.split(separator: ":", maxSplits: 1)
            if parts.count == 2 { h[parts[0].lowercased()] = parts[1].trimmingCharacters(in: .whitespaces) }
        }
        headers = h
        body = raw[end.upperBound...]
    }
}

final class PyreonHttpWireTests: XCTestCase {
    private struct Credentials: Codable {
        var email: String
        var password: String
        var remember: Bool
        var attempts: Int
        var score: Double
    }

    /// What the emit for `await signIn({ json: { … }, query: { … }, headers: { … } })` sends.
    func testCallSendsTheWebBytes() async throws {
        let server = try LoopbackServer()
        let port = try await server.start()
        defer { server.stop() }

        let body = Credentials(email: "a b@ex.com", password: "p/ss\"w", remember: true, attempts: 3, score: 1.0)
        let url = "http://127.0.0.1:\(port)/session" + PyreonURL.query("?", "tag", "a b", "page", 2, "n", 1.5, "skip", nil as String?)
        try await PyreonHttp.call(PyreonHttpRequest(
            method: .post,
            url: url,
            headers: ["content-type": "application/json", "x-req": "token 42"],
            body: Data(PyreonJSON.stringify(body).utf8)
        ))

        let wire = WireRequest(try XCTUnwrap(server.received.first))
        // The query exactly as the web's `buildQuery` writes it: form-encoded, a
        // whole number without `.0`, the nil pair dropped.
        XCTAssertEqual(wire.requestLine, "POST /session?tag=a+b&page=2&n=1.5 HTTP/1.1")
        XCTAssertEqual(wire.headers["content-type"], "application/json")
        XCTAssertEqual(wire.headers["x-req"], "token 42")
        // `JSON.stringify` of the same literal: declaration order, `1` not `1.0`, `/` unescaped.
        XCTAssertEqual(
            String(decoding: wire.body, as: UTF8.self),
            #"{"email":"a b@ex.com","password":"p/ss\"w","remember":true,"attempts":3,"score":1}"#
        )
    }

    /// A non-2xx REJECTS — the web's `throwHttpErrors` default — instead of resolving.
    func testCallRejectsANon2xx() async throws {
        let server = try LoopbackServer(status: 500, reply: #"{"error":"boom"}"#)
        let port = try await server.start()
        defer { server.stop() }
        do {
            try await PyreonHttp.call(PyreonHttpRequest(method: .post, url: "http://127.0.0.1:\(port)/x"))
            XCTFail("a 500 must throw")
        } catch let error as PyreonHttpError {
            XCTAssertEqual(error, .badStatus(500))
        }
        XCTAssertEqual(server.received.count, 1)
    }

    /// `PyreonURL.query` returns NOTHING (no `?`) when every pair drops, and joins with `&` when asked.
    func testQueryJoinerAndEmpty() {
        XCTAssertEqual(PyreonURL.query("?", "a", nil as String?, "b", nil as Int?), "")
        XCTAssertEqual(PyreonURL.query("&", "tag", ["x", nil, "y z"] as [String?]), "&tag=x&tag=y+z")
        XCTAssertEqual(PyreonURL.query("?", "flag", false, "ninf", -Double.infinity), "?flag=false&ninf=-Infinity")
    }
}
