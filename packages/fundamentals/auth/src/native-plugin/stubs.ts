/**
 * The compile-gate stubs the `@pyreon/auth` lowering's emit needs beyond the SwiftUI / Compose bundle: the public surface
 * of `PyreonOidcAuth` and the Compose factory, as the real runtimes declare it (`native/swift/PyreonOidcAuth.swift`,
 * `native/kotlin/.../PyreonOidcAuth.kt` + `PyreonOidcAndroid.kt`). They mirror the members the emit touches EXACTLY — a
 * superset stub masks real breakage, a narrower one manufactures it. The defaulted dependencies the real initialisers
 * also take (store, transport, browser, executor, clock) are never written by the emit, so they are not modelled; every
 * member the emit CAN produce is.
 */
import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const AUTH_SWIFT_STUBS = `public enum PyreonOidcStatus {
    public static let signedOut = "signedOut"
    public static let signingIn = "signingIn"
    public static let signedIn = "signedIn"
    public static let error = "error"
}
public final class PyreonOidcAuth {
    public private(set) var status: String = PyreonOidcStatus.signedOut
    public private(set) var subject: String?
    public private(set) var accessToken: String?
    public private(set) var expiresAt: Double?
    public private(set) var error: String?
    public var isAuthenticated: Bool { status == PyreonOidcStatus.signedIn }
    public func claim(_ name: String) -> String? { nil }
    public init(issuer: String, clientId: String, redirectUri: String, scope: String = "openid profile email",
                postLogoutRedirectUri: String? = nil, authorizationParams: [String: String] = [:]) {}
    public func signIn() {}
    public func refresh() {}
    public func signOut(endProviderSession: Bool = false) {}
    public func handleCallback(_ url: String) {}
}
`

export const AUTH_KOTLIN_STUBS = `object PyreonOidcStatus {
  const val SIGNED_OUT: String = "signedOut"
  const val SIGNING_IN: String = "signingIn"
  const val SIGNED_IN: String = "signedIn"
  const val ERROR: String = "error"
}
class PyreonOidcAuth {
  val status: MutableState<String> = mutableStateOf(PyreonOidcStatus.SIGNED_OUT)
  val subject: MutableState<String?> = mutableStateOf(null)
  val accessToken: MutableState<String?> = mutableStateOf(null)
  val expiresAt: MutableState<Double?> = mutableStateOf(null)
  val error: MutableState<String?> = mutableStateOf(null)
  val isAuthenticated: Boolean get() = status.value == PyreonOidcStatus.SIGNED_IN
  fun claim(name: String): String? = null
  fun signIn() {}
  fun refresh() {}
  fun signOut(endProviderSession: Boolean = false) {}
  fun handleCallback(url: String) {}
}
@Composable
fun rememberPyreonOidcAuth(
  issuer: String,
  clientId: String,
  redirectUri: String,
  scope: String = "openid profile email",
  postLogoutRedirectUri: String? = null,
  authorizationParams: Map<String, String> = emptyMap(),
): PyreonOidcAuth = PyreonOidcAuth()
`

export const authStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonOidcAuth\b/.test(source) ? AUTH_SWIFT_STUBS : ''),
  kotlin: (source) => (/\brememberPyreonOidcAuth\b|\bPyreonOidcAuth\b/.test(source) ? AUTH_KOTLIN_STUBS : ''),
}
