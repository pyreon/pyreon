// PyreonHttp — the SwiftUI side of Pyreon's cross-platform HTTP story
// (Tier 0e — richer requests). `PyreonFetch` is the reactive RESULT
// container (data / error / isPending) with an INJECTED fetcher; it is
// method-agnostic by design. `PyreonHttp` is the request/response layer
// that fetcher uses — so `useFetch`-style code can do POST / PUT / DELETE
// with custom headers + a JSON body, not just a bare GET.
//
//     // The fetcher PyreonFetch.begin/resolve/reject drives:
//     let res = try await PyreonHttp.send(.post("https://api/x", jsonBody: body,
//                                               headers: ["Authorization": "Bearer …"]))
//     let user = try res.decode(User.self)
//
// ## Two layers — pure request-building + real URLSession edge
//
// The PURE half (`PyreonHttpRequest` builders, `buildURLRequest`,
// `PyreonHttpResponse` decode helpers) is synchronously unit-testable:
// assert the method / headers / body are wired correctly, assert decode +
// `isOK` semantics. It touches no network.
//
// The LIVE EDGE is a real `URLSession` (`send(_:)` via `data(for:)`).
// It compiles under `swift build`; an actual round-trip over the network
// is integration/device territory, NOT asserted in the unit tests — the
// same "real edge constructed, not asserted" boundary the other runtime
// services use.
//
// ## Relationship to the PMTC compiler emit
//
// The emit detects `useFetch('/url', { method, headers, body })`
// and emits a `PyreonFetch` whose `.task { }` calls `PyreonHttp.send(...)`
// + `.decode(T.self)` and feeds the result into `resolve` / `reject`.
// It is equally usable by hand-written SwiftUI code.

import Foundation

/// HTTP method. Raw value is the wire verb.
public enum PyreonHttpMethod: String, Sendable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

/// A richer HTTP request — method + URL + headers + optional body. Mirrors
/// the Kotlin `PyreonHttpRequest` one-for-one.
public struct PyreonHttpRequest: Sendable {
    public var method: PyreonHttpMethod
    public var url: String
    public var headers: [String: String]
    public var body: Data?
    /// A file or `multipart/form-data` body, STREAMED from disk by `send`
    /// rather than held in memory (a picked video must not be read whole).
    /// Takes precedence over `body`.
    public var upload: PyreonHttpUpload?

    public init(
        method: PyreonHttpMethod = .get,
        url: String,
        headers: [String: String] = [:],
        body: Data? = nil,
        upload: PyreonHttpUpload? = nil
    ) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
        self.upload = upload
    }

    /// A GET request.
    public static func get(_ url: String, headers: [String: String] = [:]) -> PyreonHttpRequest {
        PyreonHttpRequest(method: .get, url: url, headers: headers)
    }

    /// A POST request with a raw body.
    public static func post(
        _ url: String,
        body: Data? = nil,
        headers: [String: String] = [:]
    ) -> PyreonHttpRequest {
        PyreonHttpRequest(method: .post, url: url, headers: headers, body: body)
    }

    /// A POST request with a JSON body — sets `Content-Type: application/json`
    /// (unless the caller already provided one).
    public static func post(
        _ url: String,
        jsonBody: Data?,
        headers: [String: String] = [:]
    ) -> PyreonHttpRequest {
        var h = headers
        if h["Content-Type"] == nil, h["content-type"] == nil {
            h["Content-Type"] = "application/json"
        }
        return PyreonHttpRequest(method: .post, url: url, headers: h, body: jsonBody)
    }
}

/// An HTTP response — status + headers + raw body, with decode helpers.
/// Mirrors the Kotlin `PyreonHttpResponse`.
public struct PyreonHttpResponse: Sendable {
    public let status: Int
    public let headers: [String: String]
    public let body: Data

    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }

    /// True for a 2xx status.
    public var isOK: Bool { (200..<300).contains(status) }

    /// The body decoded as UTF-8 text.
    public var text: String { String(decoding: body, as: UTF8.self) }

    /// Decode the body as `T` (JSON). Throws on decode failure.
    public func decode<T: Decodable>(_ type: T.Type) throws -> T {
        try JSONDecoder().decode(T.self, from: body)
    }
}

/// HTTP failures distinct from URLSession's own errors.
public enum PyreonHttpError: Error, Equatable {
    case invalidURL(String)
    /// The server answered with a non-2xx status.
    ///
    /// Distinct from a decode failure on purpose. Handing an error page to
    /// `JSONDecoder` surfaces as "the server sent bad JSON", which sends the
    /// reader looking at their model types when the real answer is a 404 or a
    /// 500. The `useFetch` emit checks `isOK` and throws this instead.
    case badStatus(Int)
    /// A `fileFromUri` URI that names no readable file (or a scheme the
    /// native runtime cannot read).
    case unreadableFile(String)
}

/// The HTTP layer `PyreonFetch`'s injected fetcher uses for richer requests.
public enum PyreonHttp {
    /// Build a `URLRequest` from a `PyreonHttpRequest`. PURE + unit-testable
    /// — the method / headers / body wiring with no network. Returns `nil`
    /// for an unparseable URL.
    public static func buildURLRequest(_ request: PyreonHttpRequest) -> URLRequest? {
        guard let url = URL(string: request.url) else { return nil }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        for (key, value) in request.headers {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        urlRequest.httpBody = request.body
        return urlRequest
    }

    /// Execute `request` over the network and return a `PyreonHttpResponse`.
    /// Real `URLSession` — compiles under `swift build`; a live round-trip
    /// is integration/device territory, NOT asserted in the unit tests
    /// (which cover `buildURLRequest` + the response helpers).
    public static func send(
        _ request: PyreonHttpRequest,
        session: URLSession = .shared
    ) async throws -> PyreonHttpResponse {
        guard var urlRequest = buildURLRequest(request) else {
            throw PyreonHttpError.invalidURL(request.url)
        }
        let (data, response): (Data, URLResponse)
        if let upload = request.upload {
            (data, response) = try await sendUpload(upload, &urlRequest, request.headers, session)
        } else {
            (data, response) = try await session.data(for: urlRequest)
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        var headers: [String: String] = [:]
        if let http = response as? HTTPURLResponse {
            for (key, value) in http.allHeaderFields {
                if let k = key as? String, let v = value as? String { headers[k] = v }
            }
        }
        return PyreonHttpResponse(status: status, headers: headers, body: data)
    }

    /// Execute `request` through the client's lowered middleware, outermost
    /// first — what an `@pyreon/http` endpoint call on a
    /// `createHttp({ use: [...] })` client lowers to. The chain semantics are
    /// `PyreonHttpPipeline`'s; the transport is `send(_:session:)`.
    public static func send(
        _ request: PyreonHttpRequest,
        middleware: [PyreonHttpMiddleware],
        session: URLSession = .shared
    ) async throws -> PyreonHttpResponse {
        try await PyreonHttpPipeline.run(request, middleware: middleware) { req in
            try await send(req, session: session)
        }
    }

    /// Whether the caller already set a header (HTTP names are case-insensitive).
    static func hasHeader(_ headers: [String: String], _ name: String) -> Bool {
        headers.keys.contains { $0.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// Send a streamed body. A file goes out with `upload(for:fromFile:)`
    /// straight from where it is; a multipart body is serialized to a temp
    /// file once, streaming each file part from disk, and that is uploaded.
    /// The Content-Type is what `fetch` sends for the same `body` / `FormData`
    /// — unless the caller set one, which wins, exactly as on the web.
    static func sendUpload(
        _ upload: PyreonHttpUpload,
        _ urlRequest: inout URLRequest,
        _ headers: [String: String],
        _ session: URLSession
    ) async throws -> (Data, URLResponse) {
        urlRequest.httpBody = nil
        switch upload {
        case .file(let file):
            if !hasHeader(headers, "content-type"), !file.type.isEmpty {
                urlRequest.setValue(file.type, forHTTPHeaderField: "Content-Type")
            }
            switch file.source {
            case .file(let url):
                return try await session.upload(for: urlRequest, fromFile: url)
            case .bytes(let bytes):
                return try await session.upload(for: urlRequest, from: bytes)
            }
        case .multipart(let body):
            let boundary = PyreonMultipartBody.newBoundary()
            if !hasHeader(headers, "content-type") {
                urlRequest.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
            }
            let temp = FileManager.default.temporaryDirectory
                .appendingPathComponent("pyreon-multipart-\(UUID().uuidString)")
            defer { try? FileManager.default.removeItem(at: temp) }
            try body.write(to: temp, boundary: boundary)
            return try await session.upload(for: urlRequest, fromFile: temp)
        }
    }

    /// `send`, then REJECT a non-2xx — what awaiting an `@pyreon/http`
    /// endpoint call means on the web (`throwHttpErrors` defaults to true).
    /// The compiler emits `try await PyreonHttp.call(…)` for an endpoint
    /// awaited in an event handler; the response is returned for a caller
    /// that wants it, and is otherwise discarded.
    @discardableResult
    public static func call(
        _ request: PyreonHttpRequest,
        session: URLSession = .shared
    ) async throws -> PyreonHttpResponse {
        let response = try await send(request, session: session)
        guard response.isOK else { throw PyreonHttpError.badStatus(response.status) }
        return response
    }

    /// An endpoint call that is NOT awaited — on the web, a Promise nobody
    /// reads: the request goes out, the handler moves on, a rejection is
    /// unhandled. The request is an ARGUMENT, so it is built from the values
    /// of the moment of the call, before the handler continues; only the send
    /// is deferred. A failure is reported to the log, as the web reports an
    /// unhandled rejection.
    public static func fire(_ request: PyreonHttpRequest, session: URLSession = .shared) {
        _Concurrency.Task {
            do {
                try await call(request, session: session)
            } catch {
                print("[Pyreon] Unhandled error in an endpoint call: \(error)")
            }
        }
    }
}

// MARK: - Client middleware
//
// The native half of `@pyreon/http`'s `use: [...]` array. The compiler reads a
// LITERAL `use` array at build time and lowers each statically-readable entry
// to one case below; anything it cannot read (`refresh`, `dedupe`, a custom
// function) keeps the whole client's endpoint calls on the web, with a named
// warning — so a request never silently loses a middleware it has on the web.
//
// The semantics mirror `packages/fundamentals/http/src/middleware/*.ts`
// line for line, and a differential test runs both on the same inputs
// (`native-http-middleware-parity.test.ts`). Three choices make that hold:
//
//   - The chain is a real ONION (`run(index)` → `next()`), not a pre/post
//     hook pair, so ORDER means the same thing it does on the web:
//     `[bearer, retry]` reads the token once, `[retry, bearer]` per attempt.
//   - The request is ONE mutable box shared by the whole chain, because the
//     web mutates `request.headers` in place. With a value-copy per layer, a
//     `[retry, bearer]` chain whose token becomes nil would drop the header
//     on the second attempt where the web still sends the first one.
//   - Randomness, sleeping, the clock and the log sink come from
//     `PyreonHttpPipelineEnv`, so the backoff schedule is testable exactly.

/// `retry(...)`'s options, with the web's defaults.
public struct PyreonRetryPolicy {
    /// Retries AFTER the initial attempt. Default 2.
    public var limit: Int
    /// Wire verbs eligible for a retry. Default: the idempotent methods.
    public var methods: [String]
    /// Statuses worth replaying. Default `[408, 413, 429, 500, 502, 503, 504]`.
    public var statuses: [Int]
    /// Retry transport failures (offline, DNS). Default `true`.
    public var network: Bool
    /// Honour a `Retry-After` response header. Default `true`.
    public var respectRetryAfter: Bool
    /// Upper bound for any single wait, in ms. Default 30 000.
    public var maxDelay: Double

    public static let idempotent: [String] = ["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]
    public static let retryable: [Int] = [408, 413, 429, 500, 502, 503, 504]

    public init(
        limit: Int = 2,
        methods: [String] = PyreonRetryPolicy.idempotent,
        statuses: [Int] = PyreonRetryPolicy.retryable,
        network: Bool = true,
        respectRetryAfter: Bool = true,
        maxDelay: Double = 30_000
    ) {
        self.limit = limit
        self.methods = methods
        self.statuses = statuses
        self.network = network
        self.respectRetryAfter = respectRetryAfter
        self.maxDelay = maxDelay
    }
}

/// One lowered entry of a client's `use: [...]` array.
public enum PyreonHttpMiddleware {
    /// `bearer(() => token, { crossOrigin })`. `token` is called per pass
    /// through this layer; a nil or empty value sends no header.
    case bearer(baseUrl: String, crossOrigin: Bool, token: () -> String?)
    /// `retry({ … })`.
    case retry(PyreonRetryPolicy)
    /// `logger({ production })`. Debug builds only, unless `production`.
    case logger(production: Bool)
}

/// Everything the pipeline needs from the outside world, injectable for tests.
public struct PyreonHttpPipelineEnv {
    /// Wait `ms` milliseconds. Throws when the surrounding task is cancelled.
    public var sleep: (Double) async throws -> Void
    /// A uniform value in `[0, 1)` — the backoff jitter.
    public var random: () -> Double
    /// Milliseconds since the epoch — the reference for an HTTP-date `Retry-After`.
    public var now: () -> Double
    /// Where a `logger` line goes, with the request's duration in ms.
    public var log: (String, Double) -> Void
    /// Whether this is a debug build (the native stand-in for the web's
    /// `NODE_ENV !== 'production'`).
    public var isDebug: Bool

    public init(
        sleep: @escaping (Double) async throws -> Void,
        random: @escaping () -> Double,
        now: @escaping () -> Double,
        log: @escaping (String, Double) -> Void,
        isDebug: Bool
    ) {
        self.sleep = sleep
        self.random = random
        self.now = now
        self.log = log
        self.isDebug = isDebug
    }

    public static var live: PyreonHttpPipelineEnv {
        #if DEBUG
        let debug = true
        #else
        let debug = false
        #endif
        return PyreonHttpPipelineEnv(
            sleep: { ms in
                if ms > 0 { try await Task.sleep(nanoseconds: UInt64(ms * 1_000_000)) }
            },
            random: { Double.random(in: 0..<1) },
            now: { Date().timeIntervalSince1970 * 1000 },
            log: { line, ms in print("\(line) (\(Int(ms.rounded()))ms)") },
            isDebug: debug
        )
    }
}

public enum PyreonHttpPipeline {
    public typealias Transport = (PyreonHttpRequest) async throws -> PyreonHttpResponse

    /// The request as the chain sees it: one box, mutated in place (see above).
    final class Box {
        var request: PyreonHttpRequest
        init(_ request: PyreonHttpRequest) { self.request = request }
    }

    /// Run `request` through `middleware` (outermost first) into `transport`.
    public static func run(
        _ request: PyreonHttpRequest,
        middleware: [PyreonHttpMiddleware],
        env: PyreonHttpPipelineEnv = .live,
        transport: Transport
    ) async throws -> PyreonHttpResponse {
        let box = Box(request)
        return try await dispatch(0, box, middleware, env, transport)
    }

    static func dispatch(
        _ index: Int,
        _ box: Box,
        _ middleware: [PyreonHttpMiddleware],
        _ env: PyreonHttpPipelineEnv,
        _ transport: Transport
    ) async throws -> PyreonHttpResponse {
        guard index < middleware.count else { return try await transport(box.request) }
        func next() async throws -> PyreonHttpResponse {
            try await dispatch(index + 1, box, middleware, env, transport)
        }
        switch middleware[index] {
        case let .bearer(baseUrl, crossOrigin, token):
            if !crossOrigin && !targetsBaseOrigin(url: box.request.url, baseUrl: baseUrl) {
                return try await next()
            }
            if let value = token(), !value.isEmpty {
                setHeader(&box.request.headers, "authorization", "Bearer \(value)")
            }
            return try await next()
        case let .retry(policy):
            return try await retry(policy, box, env, next)
        case let .logger(production):
            if !production && !env.isDebug { return try await next() }
            let started = env.now()
            let description = "\(box.request.method.rawValue) \(redactURL(box.request.url))"
            do {
                let response = try await next()
                env.log("[Pyreon] http \(description) → \(response.status)", env.now() - started)
                return response
            } catch {
                env.log("[Pyreon] http \(description) → failed", env.now() - started)
                throw error
            }
        }
    }

    static func retry(
        _ policy: PyreonRetryPolicy,
        _ box: Box,
        _ env: PyreonHttpPipelineEnv,
        _ next: () async throws -> PyreonHttpResponse
    ) async throws -> PyreonHttpResponse {
        // A native body is bytes in memory, always replayable — the web's
        // `isReplayable` (a one-shot stream body) has no native counterpart.
        if policy.limit <= 0 || !policy.methods.contains(box.request.method.rawValue) {
            return try await next()
        }
        var attempt = 0
        while true {
            let response: PyreonHttpResponse
            do {
                response = try await next()
            } catch {
                // Cancellation is never a failure to retry.
                if isAbort(error) || !policy.network || attempt >= policy.limit { throw error }
                attempt += 1
                try await env.sleep(min(defaultBackoff(attempt: attempt, random: env.random()), policy.maxDelay))
                continue
            }
            if !policy.statuses.contains(response.status) { return response }
            if attempt >= policy.limit { return response }
            attempt += 1
            let after = policy.respectRetryAfter
                ? parseRetryAfter(header(response.headers, "retry-after"), now: env.now())
                : nil
            try await env.sleep(min(after ?? defaultBackoff(attempt: attempt, random: env.random()), policy.maxDelay))
        }
    }

    /// Exponential backoff with full jitter — the web's `defaultBackoff`.
    public static func defaultBackoff(attempt: Int, random: Double) -> Double {
        let base = min(1000 * pow(2, Double(attempt - 1)), 20_000)
        return (base / 2 + random * (base / 2)).rounded(.toNearestOrAwayFromZero)
    }

    /// `Retry-After` as delta-seconds or an HTTP date, in ms; nil when absent or unparseable.
    public static func parseRetryAfter(_ header: String?, now: Double) -> Double? {
        guard let header, !header.isEmpty else { return nil }
        let trimmed = header.trimmingCharacters(in: .whitespacesAndNewlines)
        // JavaScript's `Number('')` (whitespace-only) is 0.
        if trimmed.isEmpty { return 0 }
        if trimmed.range(of: #"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$"#, options: .regularExpression) != nil,
           let seconds = Double(trimmed), seconds.isFinite
        {
            return max(0, seconds * 1000)
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "GMT")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        guard let date = formatter.date(from: trimmed) else { return nil }
        return max(0, (date.timeIntervalSince1970 * 1000).rounded() - now)
    }

    /// The web's `targetsBaseOrigin`: does the request stay on the `baseUrl`'s origin?
    public static func targetsBaseOrigin(url: String, baseUrl: String) -> Bool {
        if baseUrl.isEmpty { return true }
        let trimmed = baseUrl.hasSuffix("/") ? String(baseUrl.dropLast()) : baseUrl
        if url == trimmed || url.hasPrefix(trimmed + "/") { return true }
        if !isAbsolute(url) && !isAbsolute(baseUrl) && !url.hasPrefix("//") { return true }
        guard let a = origin(of: url), let b = origin(of: baseUrl) else { return false }
        return a == b
    }

    /// The web's `redactUrl`: no query, no fragment, no userinfo.
    public static func redactURL(_ url: String) -> String {
        var base = url
        if let cut = base.firstIndex(where: { $0 == "?" || $0 == "#" }) { base = String(base[..<cut]) }
        guard let scheme = base.range(of: #"^[A-Za-z][A-Za-z\d+\-.]*://"#, options: .regularExpression) else {
            return base
        }
        let rest = base[scheme.upperBound...]
        let authorityEnd = rest.firstIndex(of: "/") ?? rest.endIndex
        // The web's `[^/@]*@` stops at the FIRST `@` of the authority.
        guard let at = rest[..<authorityEnd].firstIndex(of: "@") else { return base }
        return String(base[..<scheme.upperBound]) + String(rest[rest.index(after: at)...])
    }

    static func isAbort(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return false
    }

    static func isAbsolute(_ url: String) -> Bool {
        url.range(of: #"^[A-Za-z][A-Za-z\d+\-.]*://"#, options: .regularExpression) != nil
    }

    /// The ORIGIN a URL resolves to, relative to the placeholder origin the
    /// web uses when there is no `location` (as on a device).
    static func origin(of url: String) -> String? {
        let resolved: String
        if isAbsolute(url) { resolved = url }
        else if url.hasPrefix("//") { resolved = "http:" + url }
        else { resolved = "http://pyreon.invalid" }
        guard let parts = URLComponents(string: resolved), let scheme = parts.scheme?.lowercased(),
              let host = parts.host?.lowercased()
        else { return nil }
        let defaults = ["http": 80, "https": 443, "ws": 80, "wss": 443]
        if let port = parts.port, port != defaults[scheme] { return "\(scheme)://\(host):\(port)" }
        return "\(scheme)://\(host)"
    }

    /// `Headers.set` — replaces every case-variant of `name`.
    static func setHeader(_ headers: inout [String: String], _ name: String, _ value: String) {
        for key in headers.keys where key.lowercased() == name { headers.removeValue(forKey: key) }
        headers[name] = value
    }

    /// `Headers.get` — case-insensitive.
    static func header(_ headers: [String: String], _ name: String) -> String? {
        headers.first(where: { $0.key.lowercased() == name })?.value
    }
}

// MARK: - Uploads

/// A streamed request body: a file (`body: await fileFromUri(uri)`) or a
/// `multipart/form-data` form (`multipart: { file, caption }`).
public enum PyreonHttpUpload: Sendable {
    case file(PyreonUploadFile)
    case multipart(PyreonMultipartBody)
}

/// A file to upload — what `fileFromUri(uri, { name, type })` lowers to.
///
/// It names the file; it does not hold it. A `file://` file is streamed from
/// disk when the request is sent, so a large picked video is never read into
/// memory (and never twice). A `data:` URI is the one inline source.
public struct PyreonUploadFile: Sendable {
    public enum Source: Sendable {
        case file(URL)
        case bytes(Data)
    }

    public let source: Source
    /// The filename a multipart part carries — the web `File.name`.
    public let name: String
    /// The MIME type — the web `File.type`; empty when unknown, as on the web.
    public let type: String

    public init(source: Source, name: String, type: String) {
        self.source = source
        self.name = name
        self.type = type
    }

    /// Resolve a picker / camera URI. `name` and `type` default to the file's
    /// own (its last path component, and the type its extension implies); pass
    /// them to send the same filename from every platform, since a picker's
    /// temporary copy is not always named like the original.
    public static func from(_ uri: String, name: String? = nil, type: String? = nil) async throws -> PyreonUploadFile {
        if uri.hasPrefix("data:") {
            guard let parsed = parseDataURI(uri) else { throw PyreonHttpError.unreadableFile(uri) }
            return PyreonUploadFile(source: .bytes(parsed.bytes), name: name ?? "blob", type: type ?? parsed.type)
        }
        guard let url = URL(string: uri), url.isFileURL,
              FileManager.default.isReadableFile(atPath: url.path)
        else { throw PyreonHttpError.unreadableFile(uri) }
        return PyreonUploadFile(
            source: .file(url),
            name: name ?? url.lastPathComponent,
            type: type ?? mimeType(forExtension: url.pathExtension)
        )
    }

    /// `data:[<type>][;base64],<payload>` — the type, and the decoded bytes.
    static func parseDataURI(_ uri: String) -> (type: String, bytes: Data)? {
        guard let comma = uri.firstIndex(of: ",") else { return nil }
        var meta = String(uri[uri.index(uri.startIndex, offsetBy: 5)..<comma])
        // Percent-decoded to BYTES, as the Fetch standard does: `%FF` is the byte 0xFF, not invalid UTF-8.
        let payload = percentDecode(String(uri[uri.index(after: comma)...]))
        let trimmedMeta = meta.trimmingCharacters(in: .whitespaces)
        let base64 = trimmedMeta.lowercased().hasSuffix(";base64")
        if base64 { meta = String(trimmedMeta.dropLast(";base64".count)) }
        let bytes: Data?
        if base64 {
            let text = String(decoding: payload, as: UTF8.self).filter { !$0.isWhitespace }
            bytes = Data(base64Encoded: text)
        } else {
            bytes = payload
        }
        guard let bytes else { return nil }
        return (dataURIType(meta), bytes)
    }

    /// `%XX` → that byte; everything else is its UTF-8 bytes. A malformed escape stays literal, as the Fetch standard keeps it.
    static func percentDecode(_ text: String) -> Data {
        let raw = Array(text.utf8)
        var out = Data(capacity: raw.count)
        var i = 0
        func hex(_ c: UInt8) -> UInt8? {
            switch c {
            case 0x30...0x39: return c - 0x30
            case 0x41...0x46: return c - 0x41 + 10
            case 0x61...0x66: return c - 0x61 + 10
            default: return nil
            }
        }
        while i < raw.count {
            if raw[i] == 0x25, i + 2 < raw.count, let hi = hex(raw[i + 1]), let lo = hex(raw[i + 2]) {
                out.append(hi * 16 + lo)
                i += 3
            } else {
                out.append(raw[i])
                i += 1
            }
        }
        return out
    }

    /// The Fetch standard's data-URL type: absent means `text/plain;charset=US-ASCII`, and a bare parameter list
    /// (`;charset=utf-8`) is a parameter of `text/plain` — what `fetch(uri).blob().type` reports on the web.
    static func dataURIType(_ meta: String) -> String {
        let trimmed = meta.trimmingCharacters(in: .whitespaces)
        if trimmed.isEmpty { return "text/plain;charset=us-ascii" }
        if trimmed.hasPrefix(";") { return ("text/plain" + trimmed).lowercased() }
        return trimmed.lowercased()
    }

    /// The common upload types by extension — what a browser reports for a
    /// picked file. An unknown extension is `""`, which a multipart part sends
    /// as `application/octet-stream`, as the web does.
    static func mimeType(forExtension ext: String) -> String {
        switch ext.lowercased() {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        case "heif": return "image/heif"
        case "svg": return "image/svg+xml"
        case "pdf": return "application/pdf"
        case "json": return "application/json"
        case "txt": return "text/plain"
        case "csv": return "text/csv"
        case "html", "htm": return "text/html"
        case "zip": return "application/zip"
        case "mp4": return "video/mp4"
        case "mov": return "video/quicktime"
        case "m4a": return "audio/mp4"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        default: return ""
        }
    }
}

/// A `multipart/form-data` body, serialized exactly as the web's `FormData`
/// (WHATWG): `encodeMultipart` from `@pyreon/http` is the oracle.
///
/// Built from alternating name / value arguments in SOURCE order. A `nil`
/// value is omitted, an array repeats its name, a `PyreonUploadFile` is a
/// file part, anything else is a text part holding JavaScript's
/// `String(value)` (the compiler serializes an object value with
/// `JSON.stringify` before it gets here, as `encodeMultipart` does).
public struct PyreonMultipartBody: Sendable {
    public enum Value: Sendable {
        case text(String)
        case file(PyreonUploadFile)
    }

    public struct Part: Sendable {
        public let name: String
        public let value: Value
    }

    public private(set) var parts: [Part] = []

    public init(_ pairs: Any?...) {
        var index = 0
        while index + 1 < pairs.count {
            if let name = pairs[index] as? String { add(name, pairs[index + 1]) }
            index += 2
        }
    }

    /// `encodeMultipart` expands ONE level: an array field appends each element as its own part.
    private mutating func add(_ name: String, _ value: Any?) {
        guard let present = PyreonURL.unwrap(value) else { return }
        if let list = present as? [Any?] {
            for item in list { part(name, item) }
        } else if let list = present as? [Any] {
            for item in list { part(name, item) }
        } else {
            part(name, present)
        }
    }

    private mutating func part(_ name: String, _ value: Any?) {
        guard let present = PyreonURL.unwrap(value) else { return }
        if let file = present as? PyreonUploadFile {
            parts.append(Part(name: name, value: .file(file)))
        } else {
            parts.append(Part(name: name, value: .text(PyreonURL.jsString(present))))
        }
    }

    /// A boundary in the shape browsers use; random so it cannot occur in a part.
    public static func newBoundary() -> String {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
        return "----PyreonFormBoundary" + String((0..<16).map { _ in alphabet.randomElement()! })
    }

    /// CR, LF and CRLF all become CRLF — the spec's newline normalization for names and text values.
    static func normalizeNewlines(_ text: String) -> String {
        text.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: "\n", with: "\r\n")
    }

    /// A name or filename inside the quoted Content-Disposition parameter.
    static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "\n", with: "%0A")
            .replacingOccurrences(of: "\r", with: "%0D")
            .replacingOccurrences(of: "\"", with: "%22")
    }

    /// Serialize to `url`, streaming each file part from disk in chunks.
    public func write(to url: URL, boundary: String) throws {
        FileManager.default.createFile(atPath: url.path, contents: nil)
        let out = try FileHandle(forWritingTo: url)
        defer { try? out.close() }
        func put(_ text: String) { out.write(Data(text.utf8)) }
        for part in parts {
            put("--\(boundary)\r\n")
            let name = Self.escape(Self.normalizeNewlines(part.name))
            switch part.value {
            case .text(let text):
                put("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
                put(Self.normalizeNewlines(text))
            case .file(let file):
                put("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(Self.escape(file.name))\"\r\n")
                put("Content-Type: \(file.type.isEmpty ? "application/octet-stream" : file.type)\r\n\r\n")
                switch file.source {
                case .bytes(let bytes):
                    out.write(bytes)
                case .file(let source):
                    let input = try FileHandle(forReadingFrom: source)
                    defer { try? input.close() }
                    while let chunk = try input.read(upToCount: 64 * 1024), !chunk.isEmpty {
                        out.write(chunk)
                    }
                }
            }
            put("\r\n")
        }
        put("--\(boundary)--\r\n")
    }
}

/// URL construction shared with the generated fetch/query call sites.
///
/// A path parameter supplied at RUNTIME cannot be percent-encoded at compile
/// time, so the encoding has to live here — and it has to agree with the web
/// exactly, or the same call reaches a different URL on each platform.
///
/// The web spells it `encodeURIComponent(String(value))`
/// (`@pyreon/http`'s `applyPathParams`), so BOTH halves are mirrored: the
/// JavaScript `String()` conversion for the value, then the encode.
public enum PyreonURL {
    /// The characters `encodeURIComponent` leaves alone: ASCII alphanumerics
    /// plus `-_.!~*'()`.
    ///
    /// Written out rather than taken from `CharacterSet.alphanumerics`, which
    /// also contains non-ASCII letters (`é`, `日`) — and rather than
    /// `.urlPathAllowed`, which permits `/`, `&`, `+` and `=`, so a parameter
    /// containing a slash would silently add a path segment and one containing
    /// `&` would open a query.
    private static let unreserved: CharacterSet = {
        var set = CharacterSet()
        set.insert(charactersIn: "abcdefghijklmnopqrstuvwxyz")
        set.insert(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        set.insert(charactersIn: "0123456789")
        set.insert(charactersIn: "-_.!~*'()")
        return set
    }()

    /// Percent-encode one path SEGMENT, matching JavaScript's
    /// `encodeURIComponent`.
    ///
    /// Note this is the PATH encoder. A query value is
    /// application/x-www-form-urlencoded, where a space is `+` and `'` is
    /// `%27`; the same character differs by position, so one encoder for both
    /// positions is wrong in both.
    public static func encodePathParam(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }

    /// Integer overload. `String(Int)` already matches JavaScript's
    /// `String(number)` for every integral value, so this only encodes.
    public static func encodePathParam(_ value: Int) -> String {
        encodePathParam(String(value))
    }

    /// Floating-point overload, and the one place the two languages disagree
    /// by default: JavaScript has a single number type, so `String(1.0)` is
    /// `"1"`, while Swift's is `"1.0"`. A whole-valued Double is therefore
    /// rendered as an integer, which is what the web would have sent.
    ///
    /// Outside that range the default description is used. Very large
    /// magnitudes (≥ 1e21, where JavaScript switches to exponent notation)
    /// and the non-finite values are a KNOWN divergence — a path parameter is
    /// an identifier, so neither shape occurs in practice, and inventing a
    /// JavaScript number formatter to cover them would be more code than the
    /// case is worth.
    public static func encodePathParam(_ value: Double) -> String {
        if value.isFinite, value == value.rounded(), abs(value) < 1e21 {
            return encodePathParam(String(Int64(value)))
        }
        return encodePathParam(String(value))
    }

    // MARK: - Query strings

    /// A query string built at RUNTIME, matching the web's `buildQuery`
    /// (`@pyreon/http` → `URLSearchParams`) byte for byte.
    ///
    /// `pairs` alternates a key and its value, in SOURCE order — the order the
    /// web appends them. A value is written the way the web writes it:
    ///
    /// - `nil` (a JavaScript `null` / `undefined`) drops the pair;
    /// - an array repeats the key once per non-nil element (`tag=a&tag=b`);
    /// - a number is JavaScript's `String(number)` (`1`, not `1.0`);
    /// - a boolean is `true` / `false`.
    ///
    /// Each key and value is application/x-www-form-urlencoded — a space is `+`
    /// and only `*-._` and ASCII alphanumerics stay literal — which is NOT the
    /// path encoding (`encodePathParam`): the same character differs by
    /// position. Returns `""` when every pair was dropped, else `joiner` (`?`,
    /// or `&` when the path already carries a query) followed by the pairs.
    public static func query(_ joiner: String, _ pairs: Any?...) -> String {
        var out: [String] = []
        var index = 0
        while index + 1 < pairs.count {
            if let key = pairs[index] as? String {
                for value in queryValues(pairs[index + 1]) {
                    out.append(formEncode(key) + "=" + formEncode(value))
                }
            }
            index += 2
        }
        return out.isEmpty ? "" : joiner + out.joined(separator: "&")
    }

    /// The strings one query value contributes: none for `nil`, one per element for an array.
    static func queryValues(_ value: Any?) -> [String] {
        guard let present = unwrap(value) else { return [] }
        if let list = present as? [Any?] {
            return list.compactMap { unwrap($0).map(jsString) }
        }
        if let list = present as? [Any] {
            return list.compactMap { unwrap($0).map(jsString) }
        }
        return [jsString(present)]
    }

    /// An `Any` that holds an `Optional` (Swift boxes `String?` that way) unwrapped, `nil` for an absent one.
    static func unwrap(_ value: Any?) -> Any? {
        guard let value else { return nil }
        let mirror = Mirror(reflecting: value)
        if mirror.displayStyle == .optional {
            return mirror.children.first.flatMap { unwrap($0.value) }
        }
        return value
    }

    /// JavaScript's `String(value)` for the scalar shapes a query value takes.
    static func jsString(_ value: Any) -> String {
        switch value {
        case let s as String: return s
        case let b as Bool: return b ? "true" : "false"
        // Integers before floating point: an integer is already whole, and must never take a bridging cast.
        case let i as Int: return String(i)
        case let i as Int64: return String(i)
        case let i as Int32: return String(i)
        case let d as Double: return jsNumberString(d)
        case let f as Float: return jsNumberString(Double(f))
        default: return String(describing: value)
        }
    }

    /// `String(number)`: the `JSON.stringify` digits for a finite value, JavaScript's spelling otherwise.
    static func jsNumberString(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        return PyreonJSON.jsNumber(value)
    }

    /// The application/x-www-form-urlencoded byte serializer `URLSearchParams` uses.
    static func formEncode(_ text: String) -> String {
        var out = ""
        for byte in text.utf8 {
            switch byte {
            case 0x2A, 0x2D, 0x2E, 0x5F, 0x30...0x39, 0x41...0x5A, 0x61...0x7A:
                out.unicodeScalars.append(Unicode.Scalar(byte))
            case 0x20:
                out += "+"
            default:
                out += String(format: "%%%02X", byte)
            }
        }
        return out
    }
}
