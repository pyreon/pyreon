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

    /// A file on disk larger than one write chunk, so the streamed copy is exercised past its first read.
    private func bigFile() throws -> (URL, Data) {
        var bytes = Data(count: 200_003)
        for i in 0..<bytes.count { bytes[i] = UInt8((i * 31 + 7) & 0xff) }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("pyreon-wire-\(UUID().uuidString).jpg")
        try bytes.write(to: url)
        return (url, bytes)
    }

    /// What the emit for `await upload({ multipart: { avatar: await fileFromUri(uri), caption: caption() } })` sends:
    /// one request, a boundary in the content type, and each part — the file's bytes UNCHANGED — parseable from it.
    func testMultipartUploadStreamsTheFileAndTheTextParts() async throws {
        let server = try LoopbackServer()
        let port = try await server.start()
        defer { server.stop() }
        let (fileURL, bytes) = try bigFile()
        defer { try? FileManager.default.removeItem(at: fileURL) }

        let file = try await PyreonUploadFile.from(fileURL.absoluteString)
        XCTAssertEqual(file.name, fileURL.lastPathComponent)
        XCTAssertEqual(file.type, "image/jpeg")
        try await PyreonHttp.call(PyreonHttpRequest(
            method: .post,
            url: "http://127.0.0.1:\(port)/avatar",
            upload: .multipart(PyreonMultipartBody("avatar", file, "caption", "line1\nline2", "n", 2, "tag", ["a", nil, "b"] as [Any?]))
        ))

        XCTAssertEqual(server.received.count, 1, "the body is sent once")
        let wire = WireRequest(try XCTUnwrap(server.received.first))
        XCTAssertEqual(wire.requestLine, "POST /avatar HTTP/1.1")
        let type = try XCTUnwrap(wire.headers["content-type"])
        XCTAssertTrue(type.hasPrefix("multipart/form-data; boundary=----PyreonFormBoundary"), type)
        let boundary = String(type.dropFirst("multipart/form-data; boundary=".count))
        XCTAssertEqual(wire.headers["content-length"], String(wire.body.count))

        let parts = Self.parts(of: wire.body, boundary: boundary)
        XCTAssertEqual(parts.map(\.head), [
            "Content-Disposition: form-data; name=\"avatar\"; filename=\"\(fileURL.lastPathComponent)\"\r\nContent-Type: image/jpeg",
            "Content-Disposition: form-data; name=\"caption\"",
            "Content-Disposition: form-data; name=\"n\"",
            "Content-Disposition: form-data; name=\"tag\"",
            "Content-Disposition: form-data; name=\"tag\"",
        ])
        XCTAssertEqual(parts[0].body, bytes, "the file arrives byte for byte")
        XCTAssertEqual(String(decoding: parts[1].body, as: UTF8.self), "line1\r\nline2")
        XCTAssertEqual(parts.dropFirst(2).map { String(decoding: $0.body, as: UTF8.self) }, ["2", "a", "b"])
        XCTAssertTrue(wire.body.suffix(boundary.count + 6) == Data("--\(boundary)--\r\n".utf8))
    }

    /// `await put({ body: await fileFromUri(uri) })` — the raw file is the body, typed by its extension.
    func testRawFileBodyIsTheFileBytes() async throws {
        let server = try LoopbackServer()
        let port = try await server.start()
        defer { server.stop() }
        let (fileURL, bytes) = try bigFile()
        defer { try? FileManager.default.removeItem(at: fileURL) }

        let file = try await PyreonUploadFile.from(fileURL.absoluteString)
        try await PyreonHttp.call(PyreonHttpRequest(method: .put, url: "http://127.0.0.1:\(port)/blob", upload: .file(file)))
        let wire = WireRequest(try XCTUnwrap(server.received.first))
        XCTAssertEqual(wire.requestLine, "PUT /blob HTTP/1.1")
        XCTAssertEqual(wire.headers["content-type"], "image/jpeg")
        XCTAssertEqual(wire.body, bytes)
    }

    /// A URI that names no readable file rejects, as `fileFromUri` does on the web — nothing is sent.
    func testUnreadableUriRejects() async {
        do {
            _ = try await PyreonUploadFile.from("file:///definitely/not/here.png")
            XCTFail("an unreadable file must throw")
        } catch let error as PyreonHttpError {
            XCTAssertEqual(error, .unreadableFile("file:///definitely/not/here.png"))
        } catch {
            XCTFail("unexpected \(error)")
        }
    }

    /// Split a multipart body into (head, body) per part.
    static func parts(of body: Data, boundary: String) -> [(head: String, body: Data)] {
        let delimiter = Data("\r\n--\(boundary)".utf8)
        var rest = Data("\r\n".utf8) + body
        var out: [(String, Data)] = []
        while let range = rest.range(of: delimiter) {
            let after = rest[range.upperBound...]
            if after.starts(with: Data("--".utf8)) { break }
            let partStart = after.index(after.startIndex, offsetBy: 2)
            let remainder = Data(rest[partStart...])
            guard let next = remainder.range(of: delimiter),
                  let headEnd = remainder.range(of: Data("\r\n\r\n".utf8)) else { break }
            out.append((
                String(decoding: remainder[..<headEnd.lowerBound], as: UTF8.self),
                Data(remainder[headEnd.upperBound..<next.lowerBound])
            ))
            rest = Data(remainder[next.lowerBound...])
        }
        return out
    }

    /// `PyreonURL.query` returns NOTHING (no `?`) when every pair drops, and joins with `&` when asked.
    func testQueryJoinerAndEmpty() {
        XCTAssertEqual(PyreonURL.query("?", "a", nil as String?, "b", nil as Int?), "")
        XCTAssertEqual(PyreonURL.query("&", "tag", ["x", nil, "y z"] as [String?]), "&tag=x&tag=y+z")
        XCTAssertEqual(PyreonURL.query("?", "flag", false, "ninf", -Double.infinity), "?flag=false&ninf=-Infinity")
    }
}
