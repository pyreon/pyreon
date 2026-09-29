// PyreonStream — the SwiftUI side of `@pyreon/http/stream` + `useStream`.
//
// Server-Sent Events and NDJSON over URLSession, with the web's reconnect
// and `Last-Event-ID` semantics, cancelled when the view goes away.
//
// ## Two halves
//
// The WIRE PARSERS (`PyreonStreamLineSplitter`, `PyreonSseParser`,
// `PyreonNdjsonLines`) are pure, dependency-free, and the half that has to
// agree with the web byte-for-byte: the same bytes must produce the same
// events on every platform, or one shared source renders different data per
// target. They are delimited by the BEGIN/END markers below because
// `@pyreon/native-compiler`'s `native-stream-parser-parity.test.ts` extracts
// that region VERBATIM, compiles it, and diffs its output against the web
// parser over a corpus of byte streams and chunkings. Keep the region free of
// Observation / URLSession so it compiles in a plain `swiftc` harness.
//
// The CONTAINER (`PyreonStream`) is the `useStream` result — `events`,
// `latest`, `status`, `error` as `@Observable` properties — plus the
// connection loop, a port of `createStream` in `@pyreon/http/stream`:
// exponential backoff on a retryable failure, a server `retry:` replacing the
// base delay, `Last-Event-ID` on every reconnect, and a non-2xx / decode /
// parse failure classified the way `isRetryableStreamError` classifies it.
//
// ## Byte-level, not `bytes.lines`
//
// `URLSession.AsyncBytes.lines` DROPS empty lines, and an empty line is what
// dispatches an SSE event — so the splitter works on raw bytes. That is also
// what makes a chunk boundary anywhere (inside a CRLF, inside a multi-byte
// character) a non-event: CR and LF are single bytes that never occur inside
// a UTF-8 sequence, so splitting before decoding is exact.

import Foundation
import Observation

// MARK: - Wire parsing (pure) — BEGIN

/// Split a byte stream into lines exactly as the SSE grammar defines them —
/// `\r\n`, `\n` or a lone `\r` ends a line — stripping ONE leading UTF-8 BOM.
/// Feed bytes one at a time; a completed line comes back as its raw bytes.
public struct PyreonStreamLineSplitter {
    private var line: [UInt8] = []
    private var pendingCr = false
    /// Bytes of a possible leading BOM seen so far; `nil` once decided.
    private var bomHeld: [UInt8]? = []

    public init() {}

    /// Push one byte; returns a completed line when this byte ended one.
    public mutating func push(_ byte: UInt8) -> [UInt8]? {
        if var held = bomHeld {
            let bom: [UInt8] = [0xEF, 0xBB, 0xBF]
            if byte == bom[held.count] {
                held.append(byte)
                bomHeld = held.count == bom.count ? nil : held
                return nil
            }
            // Not a BOM after all: the held bytes are content (never CR/LF).
            bomHeld = nil
            line.append(contentsOf: held)
        }
        if pendingCr {
            pendingCr = false
            if byte == 10 { return nil }
        }
        if byte == 10 || byte == 13 {
            if byte == 13 { pendingCr = true }
            let done = line
            line = []
            return done
        }
        line.append(byte)
        return nil
    }

    /// End of stream: the unterminated tail, if there is one. Each format
    /// decides what it means — SSE discards it, NDJSON parses it.
    public mutating func finish() -> [UInt8]? {
        if let held = bomHeld {
            bomHeld = nil
            line.append(contentsOf: held)
        }
        guard !line.isEmpty else { return nil }
        let done = line
        line = []
        return done
    }
}

/// Decode bytes as UTF-8, replacing each maximal invalid subpart with U+FFFD —
/// the same substitution the web's `TextDecoder` performs.
@inline(__always)
public func pyreonStreamDecode(_ bytes: [UInt8]) -> String {
    String(decoding: bytes, as: UTF8.self)
}

/// One dispatched Server-Sent Event, before its `data` is decoded.
public struct PyreonSseMessage: Equatable, Sendable {
    /// The `event:` field, or `"message"` when the event did not name one.
    public var type: String
    /// Every `data:` line of the event, joined with `\n`.
    public var data: String
    /// The last event id seen on this stream (`""` until one arrives).
    public var id: String
    /// The reconnection time the server last set with `retry:`, in ms.
    public var retry: Int?

    public init(type: String, data: String, id: String, retry: Int?) {
        self.type = type
        self.data = data
        self.id = id
        self.retry = retry
    }
}

/// The WHATWG `text/event-stream` grammar over lines.
///
/// Comments are skipped, a field without a colon has an empty value, one
/// leading space after the colon is dropped, an `id` containing NUL is
/// ignored, `retry` is honoured only when it is all ASCII digits, and an
/// event with no `data` is not dispatched. Fields are compared as BYTES, not
/// as Swift `String`s, whose grapheme equality is not the spec's.
public struct PyreonSseParser {
    private var data: [String] = []
    private var type = ""
    private var id: String
    private var retry: Int?

    public init(lastEventId: String = "") {
        self.id = lastEventId
    }

    /// An event has `data` but has not been dispatched yet.
    public var hasPendingEvent: Bool { !data.isEmpty }

    /// Feed one line; returns the event it dispatched, if any.
    public mutating func line(_ bytes: [UInt8]) -> PyreonSseMessage? {
        if bytes.isEmpty {
            defer {
                data = []
                type = ""
            }
            guard !data.isEmpty else { return nil }
            return PyreonSseMessage(
                type: type.isEmpty ? "message" : type,
                data: data.joined(separator: "\n"),
                id: id,
                retry: retry
            )
        }
        if bytes[0] == 58 /* ':' */ { return nil }
        let colon = bytes.firstIndex(of: 58)
        let field = colon.map { Array(bytes[..<$0]) } ?? bytes
        var value = colon.map { Array(bytes[($0 + 1)...]) } ?? []
        if value.first == 32 /* ' ' */ { value.removeFirst() }
        switch field {
        case [100, 97, 116, 97]: // data
            data.append(pyreonStreamDecode(value))
        case [101, 118, 101, 110, 116]: // event
            type = pyreonStreamDecode(value)
        case [105, 100]: // id
            if !value.contains(0) { id = pyreonStreamDecode(value) }
        case [114, 101, 116, 114, 121]: // retry
            if !value.isEmpty, value.allSatisfy({ $0 >= 48 && $0 <= 57 }) {
                retry = Int(pyreonStreamDecode(value)) ?? Int.max
            }
        default:
            break // unknown fields are ignored, per spec
        }
        return nil
    }
}

/// NDJSON / JSON Lines: which lines carry a value, and their 1-based numbers.
///
/// A line is blank when it is empty after JavaScript's `String.prototype.trim`
/// — whose whitespace set (it includes U+FEFF and the Unicode space
/// separators) is spelled out here rather than taken from Foundation, whose
/// `.whitespacesAndNewlines` differs.
public struct PyreonNdjsonLines {
    private var n = 0

    public init() {}

    /// Feed one line; returns `(lineNumber, text)` when it carries a value.
    public mutating func line(_ bytes: [UInt8]) -> (Int, String)? {
        n += 1
        let text = pyreonStreamDecode(bytes)
        return text.unicodeScalars.allSatisfy(PyreonNdjsonLines.isJsWhitespace) ? nil : (n, text)
    }

    public static func isJsWhitespace(_ s: Unicode.Scalar) -> Bool {
        switch s.value {
        case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029,
             0x202F, 0x205F, 0x3000, 0xFEFF:
            return true
        case 0x2000...0x200A:
            return true
        default:
            return false
        }
    }
}

// MARK: - Wire parsing (pure) — END

// MARK: - Policy

/// When and how an SSE stream reconnects — `ReconnectPolicy` on the web.
public struct PyreonStreamReconnect: Equatable, Sendable {
    /// Reconnection attempts before giving up; resets once an event arrives.
    public var attempts: Int
    /// First delay in ms; doubles per attempt. A server `retry:` replaces it.
    public var delay: Int
    /// Ceiling for the doubled delay, in ms.
    public var maxDelay: Int
    /// Also reconnect when the server ENDS the stream cleanly.
    public var onEnd: Bool

    public init(attempts: Int = 5, delay: Int = 1000, maxDelay: Int = 30_000, onEnd: Bool = false) {
        self.attempts = attempts
        self.delay = delay
        self.maxDelay = maxDelay
        self.onEnd = onEnd
    }
}

/// Options for an SSE stream — the lowered subset of `EventStreamOptions`.
public struct PyreonSseOptions: Sendable {
    /// Only yield these event types; `nil` = every event.
    public var events: [String]?
    /// Resume from this id — sent as `Last-Event-ID` on the FIRST request too.
    public var lastEventId: String?
    /// `nil` disables reconnection (`reconnect: false`).
    public var reconnect: PyreonStreamReconnect?

    public init(
        events: [String]? = nil,
        lastEventId: String? = nil,
        reconnect: PyreonStreamReconnect? = PyreonStreamReconnect()
    ) {
        self.events = events
        self.lastEventId = lastEventId
        self.reconnect = reconnect
    }
}

/// The request a stream opens. Self-contained rather than `PyreonHttpRequest`
/// so the stream runtime verifies on its own.
public struct PyreonStreamRequest: Sendable {
    public var method: String
    public var url: String
    public var headers: [String: String]
    public var body: Data?

    public init(method: String = "GET", url: String, headers: [String: String] = [:], body: Data? = nil) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
    }
}

/// Why a stream ended in `error`.
public enum PyreonStreamError: Error, Equatable {
    /// The server answered with a non-2xx status.
    case badStatus(Int)
    /// A streamed SSE event's `data` did not decode into its declared type.
    case decode(String)
    /// NDJSON line `line` did not decode (`StreamParseError` on the web).
    case parse(line: Int, text: String)
    /// The request URL could not be parsed.
    case invalidURL(String)
    /// The body ended in the middle of an event — see `drive` for why this is
    /// read as a dropped connection rather than a clean end.
    case truncated
}

public enum PyreonStreamPolicy {
    /// `isRetryableStreamError`: network failures, 408, 429 and 5xx retry; any
    /// other 4xx, and every decode / parse failure, does not.
    public static func isRetryable(_ error: Error) -> Bool {
        guard let e = error as? PyreonStreamError else { return true }
        switch e {
        case .badStatus(let s): return s == 408 || s == 429 || s >= 500
        case .decode, .parse, .invalidURL: return false
        case .truncated: return true
        }
    }

    /// The wait before the next attempt, in ms. A clean end (`onEnd`) waits the
    /// base delay; the n-th consecutive failure waits `base * 2^(n-1)`, capped.
    public static func wait(failed: Bool, base: Int, failures: Int, maxDelay: Int) -> Int {
        guard failed else { return base }
        var d = base
        var i = 1
        while i < failures, d < maxDelay {
            d = d > Int.max / 2 ? Int.max : d * 2
            i += 1
        }
        return min(d, maxDelay)
    }
}

// MARK: - Decoders

/// A decoded Server-Sent Event — `SseEvent<T>` on the web.
public struct PyreonSseEvent<T> {
    public var type: String
    public var data: T
    public var id: String

    public init(type: String, data: T, id: String) {
        self.type = type
        self.data = data
        self.id = id
    }
}

extension PyreonSseEvent: Equatable where T: Equatable {}

/// Payload decoders the compiler passes to `PyreonStream.runSse` / `runNdjson`.
public enum PyreonStreamDecode {
    /// SSE with JSON `data` (the web's default `data: 'json'`).
    public static func sseJSON<T: Decodable>(_ type: T.Type) -> (PyreonSseMessage) throws -> PyreonSseEvent<T> {
        { msg in
            do {
                return PyreonSseEvent(
                    type: msg.type,
                    data: try JSONDecoder().decode(T.self, from: Data(msg.data.utf8)),
                    id: msg.id
                )
            } catch {
                throw PyreonStreamError.decode(msg.data)
            }
        }
    }

    /// SSE read with `data: 'text'` — the raw `data` string.
    public static func sseText() -> (PyreonSseMessage) throws -> PyreonSseEvent<String> {
        { msg in PyreonSseEvent(type: msg.type, data: msg.data, id: msg.id) }
    }

    /// One NDJSON line into `T`.
    public static func ndjson<T: Decodable>(_ type: T.Type) -> (String) throws -> T {
        { line in try JSONDecoder().decode(T.self, from: Data(line.utf8)) }
    }
}

// MARK: - Container

/// The `useStream` result: `events()`, `latest()`, `status()`, `error()` as
/// observable properties, plus the connection loop the emitted `.task` runs.
///
/// `status` uses the web's vocabulary exactly — `idle`, `connecting`, `open`,
/// `reconnecting`, `closed`, `error` — so a shared `status() === 'open'`
/// comparison means the same thing on every target.
@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonStream<E> {
    /// Events received since the stream (re)started, oldest first, bounded by `maxEvents`.
    public private(set) var events: [E] = []
    /// The most recent event, or `nil` before the first.
    public private(set) var latest: E?
    /// Lifecycle state.
    public private(set) var status: String = "idle"
    /// The error that ended the stream, or `nil`.
    public private(set) var error: Error?
    /// Bumped by `restart()`. The emitted `.task(id:)` keys on it, so a restart
    /// re-runs the stream exactly as an input change does.
    public private(set) var restartTick: Int = 0

    @ObservationIgnored public let maxEvents: Int
    @ObservationIgnored private var aborted = false
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var current: _Concurrency.Task<Void, Never>?

    public init(maxEvents: Int = 1000) {
        self.maxEvents = maxEvents
    }

    // MARK: Pure transitions — unit-testable without a network

    /// A fresh run: everything cleared, `connecting`.
    public func begin() {
        events = []
        latest = nil
        error = nil
        status = "connecting"
    }

    /// Record one event, dropping the oldest past `maxEvents`.
    public func push(_ event: E) {
        if maxEvents <= 0 {
            events = []
        } else {
            var next = events
            if next.count >= maxEvents { next.removeFirst(next.count - maxEvents + 1) }
            next.append(event)
            events = next
        }
        latest = event
        if status != "open" { status = "open" }
    }

    /// The stream ended in failure.
    public func fail(_ failure: Error) {
        error = failure
        status = "error"
    }

    /// Stop the stream. A later input change does NOT restart it — `restart()` does.
    public func abort() {
        aborted = true
        generation += 1
        current?.cancel()
        current = nil
        status = "closed"
    }

    /// Start a fresh stream (events cleared), undoing an `abort()`.
    public func restart() {
        aborted = false
        restartTick += 1
    }

    // MARK: Connection loop

    /// Run an SSE stream until it closes, fails, or the calling task is cancelled.
    @MainActor
    public func runSse(
        _ request: PyreonStreamRequest,
        options: PyreonSseOptions = PyreonSseOptions(),
        accept: String = "text/event-stream",
        session: URLSession = .shared,
        decode: @escaping (PyreonSseMessage) throws -> E
    ) async {
        let allowed = options.events.map(Set.init)
        await supervise { [self] in
            await self.drive(
                request,
                accept: accept,
                sse: true,
                policy: options.reconnect,
                lastEventId: options.lastEventId,
                session: session,
                onSse: { msg in
                    if let allowed, !allowed.contains(msg.type) { return nil }
                    return try decode(msg)
                },
                onLine: nil
            )
        }
    }

    /// Run an NDJSON stream. NDJSON has no resume id, so a failure ends it.
    @MainActor
    public func runNdjson(
        _ request: PyreonStreamRequest,
        accept: String = "application/x-ndjson",
        session: URLSession = .shared,
        decode: @escaping (String) throws -> E
    ) async {
        await supervise { [self] in
            await self.drive(
                request,
                accept: accept,
                sse: false,
                policy: nil,
                lastEventId: nil,
                session: session,
                onSse: nil,
                onLine: { line, text in
                    do { return try decode(text) } catch {
                        throw PyreonStreamError.parse(line: line, text: text)
                    }
                }
            )
        }
    }

    /// Run `body` in a task `abort()` can cancel, cancelled too when the CALLER
    /// is (the view disappearing, or its `.task(id:)` key changing).
    @MainActor
    private func supervise(_ body: @escaping @MainActor () async -> Void) async {
        if aborted { return }
        let task = _Concurrency.Task { @MainActor in await body() }
        current = task
        await withTaskCancellationHandler {
            await task.value
        } onCancel: {
            task.cancel()
        }
    }

    @MainActor
    private func drive(
        _ request: PyreonStreamRequest,
        accept: String,
        sse: Bool,
        policy: PyreonStreamReconnect?,
        lastEventId initialId: String?,
        session: URLSession,
        onSse: ((PyreonSseMessage) throws -> E?)?,
        onLine: ((Int, String) throws -> E)?
    ) async {
        generation += 1
        let gen = generation
        let live = { gen == self.generation && !_Concurrency.Task.isCancelled }
        begin()
        var lastId = initialId
        var delay = policy?.delay ?? 0
        var attempt = 0
        var failures = 0
        while true {
            if !live() { return }
            if attempt > 0 { status = "reconnecting" }
            var failure: Error?
            var ended = false
            do {
                guard let url = URL(string: request.url) else {
                    throw PyreonStreamError.invalidURL(request.url)
                }
                var req = URLRequest(url: url)
                req.httpMethod = request.method
                req.httpBody = request.body
                // The stream's own headers win: resuming with the right id is
                // not optional (`streamHeaders` on the web).
                for (k, v) in request.headers where !["accept", "last-event-id"].contains(k.lowercased()) {
                    req.setValue(v, forHTTPHeaderField: k)
                }
                req.setValue(accept, forHTTPHeaderField: "Accept")
                if sse, let id = lastId, !id.isEmpty { req.setValue(id, forHTTPHeaderField: "Last-Event-ID") }
                let (bytes, response) = try await session.bytes(for: req)
                let code = (response as? HTTPURLResponse)?.statusCode ?? 200
                guard (200..<300).contains(code) else { throw PyreonStreamError.badStatus(code) }
                if code == 204 {
                    ended = true
                } else {
                    if !live() { return }
                    status = "open"
                    var splitter = PyreonStreamLineSplitter()
                    var parser = PyreonSseParser(lastEventId: lastId ?? "")
                    var lines = PyreonNdjsonLines()
                    let handle = { (line: [UInt8]) throws in
                        if let onSse {
                            guard let msg = parser.line(line) else { return }
                            if !msg.id.isEmpty { lastId = msg.id }
                            if let r = msg.retry, policy != nil { delay = r }
                            guard let event = try onSse(msg) else { return }
                            failures = 0
                            self.push(event)
                        } else if let onLine, let hit = lines.line(line) {
                            self.push(try onLine(hit.0, hit.1))
                        }
                    }
                    for try await byte in bytes {
                        if !live() { return }
                        if let line = splitter.push(byte) { try handle(line) }
                    }
                    // An unterminated SSE event is DISCARDED (the spec's rule);
                    // an unterminated NDJSON line is still a value.
                    if !sse, let tail = splitter.finish() { try handle(tail) }
                    // URLSession reports a chunked body cut off by a GRACEFUL
                    // close (FIN, no terminating chunk) as a clean end — fetch
                    // and HttpURLConnection both report it as an error, which is
                    // what makes the web reconnect. The only trace left here is
                    // an event half-built when the bytes stopped, so read that
                    // as the dropped connection it almost always is. Measured on
                    // a local server: FIN mid-event → clean end, RST → -1005.
                    // A cut landing exactly on an event boundary stays
                    // indistinguishable from a clean end (a disclosed limit).
                    if sse, splitter.finish() != nil || parser.hasPendingEvent {
                        throw PyreonStreamError.truncated
                    }
                    ended = true
                }
            } catch {
                if !live() || error is CancellationError || (error as? URLError)?.code == .cancelled { return }
                failure = error
            }
            if ended, !(policy?.onEnd ?? false) {
                if live() { status = "closed" }
                return
            }
            if let failure {
                guard let p = policy, PyreonStreamPolicy.isRetryable(failure), failures < p.attempts else {
                    if live() { fail(failure) }
                    return
                }
                failures += 1
            }
            let wait = PyreonStreamPolicy.wait(
                failed: failure != nil,
                base: delay,
                failures: failures,
                maxDelay: policy?.maxDelay ?? 0
            )
            attempt += 1
            do {
                try await _Concurrency.Task.sleep(nanoseconds: UInt64(max(0, wait)) * 1_000_000)
            } catch {
                return
            }
        }
    }
}
