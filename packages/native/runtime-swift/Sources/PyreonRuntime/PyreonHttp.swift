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
// A later emit pass detects `useFetch('/url', { method, headers, body })`
// and emits a `PyreonFetch` whose `.task { }` calls `PyreonHttp.send(...)`
// + `.decode(T.self)` and feeds the result into `resolve` / `reject`.
// Until that lands (the per-service-port follow-up), this is usable by
// hand-written SwiftUI code.

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
}
