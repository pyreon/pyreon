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

    public init(
        method: PyreonHttpMethod = .get,
        url: String,
        headers: [String: String] = [:],
        body: Data? = nil
    ) {
        self.method = method
        self.url = url
        self.headers = headers
        self.body = body
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
        guard let urlRequest = buildURLRequest(request) else {
            throw PyreonHttpError.invalidURL(request.url)
        }
        let (data, response) = try await session.data(for: urlRequest)
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
}
