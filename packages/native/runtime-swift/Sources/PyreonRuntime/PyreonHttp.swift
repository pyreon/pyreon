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
