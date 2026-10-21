import AuthenticationServices
import Foundation
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// The system-browser half of native sign-in: ASWebAuthenticationSession, the mechanism
// RFC 8252 recommends for native apps. It runs the provider's page in a browser the app
// cannot read, shares the system browser's cookies (so an existing provider session signs
// in without a password), and returns the redirect URL straight to the caller — so iOS
// needs no deep-link plumbing in the host app at all.

@MainActor
public final class PyreonWebAuthBrowser: NSObject, PyreonAuthBrowser, ASWebAuthenticationPresentationContextProviding {
    /// An ephemeral session shares no cookies with Safari (always shows the login form).
    public let ephemeral: Bool
    private var session: ASWebAuthenticationSession?

    public init(ephemeral: Bool = false) {
        self.ephemeral = ephemeral
    }

    public static func makeDefault() -> PyreonAuthBrowser { PyreonWebAuthBrowser() }

    /// The cross-target error code for a browser failure.
    public static func code(for error: Error) -> String {
        if let e = error as? ASWebAuthenticationSessionError { return e.code == .canceledLogin ? "cancelled" : "browser_failed" }
        return "unknown"
    }

    public func authorize(url: URL, redirectUri: String) async throws -> URL {
        guard let redirect = URL(string: redirectUri), let scheme = redirect.scheme?.lowercased() else {
            throw PyreonAuthError("invalid_url", "redirectUri is not a valid URL")
        }
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let done: (URL?, Error?) -> Void = { [weak self] callback, error in
                self?.session = nil
                if let callback { cont.resume(returning: callback) }
                else { cont.resume(throwing: error ?? PyreonAuthError("browser_failed", "the browser returned nothing")) }
            }
            let s: ASWebAuthenticationSession
            if scheme == "https", #available(iOS 17.4, macOS 14.4, *), let host = redirect.host {
                // A universal-link redirect: matched by host + path, not by a claimable scheme.
                s = ASWebAuthenticationSession(url: url, callback: .https(host: host, path: redirect.path), completionHandler: done)
            } else {
                s = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme, completionHandler: done)
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = ephemeral
            session = s
            if !s.start() {
                session = nil
                cont.resume(throwing: PyreonAuthError("browser_failed", "the authentication session could not start"))
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        #if canImport(UIKit)
        let windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
        return windows.first(where: \.isKeyWindow) ?? windows.first ?? ASPresentationAnchor()
        #else
        return NSApplication.shared.keyWindow ?? ASPresentationAnchor()
        #endif
    }
}
