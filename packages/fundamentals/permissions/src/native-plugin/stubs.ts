/**
 * The compile-gate stubs the `@pyreon/permissions` lowering's emit needs beyond the SwiftUI / Compose stub bundle: the
 * `PyreonPermissions` grant container and the environment key / CompositionLocal a bare `usePermissions()` reads. They
 * mirror the REAL runtimes (`@pyreon/permissions/native`) exactly — a superset stub masks real breakage, a narrower
 * one manufactures it (this very type was once rejected for being stricter than the runtime).
 *
 * The generic SwiftUI `EnvironmentKey` protocol and Compose `compositionLocalOf` / `CompositionLocalProvider` model
 * the platforms, not this library, and stay in the core bundle. Appended to the bundle only for an emit that names a
 * runtime type (see {@link permissionsStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const PERMISSIONS_SWIFT_STUBS = `// PyreonPermissions - MIRRORS the real init exactly:
// \`public init(_ granted: Set<String> = [])\`. The stub previously declared
// \`init(_ grants: [String])\` - no default, and an Array where the real type
// takes a Set - so it REJECTED the emit's correct \`PyreonPermissions()\`.
// That is the inverse of the usual masking failure: a stub STRICTER than
// reality fails correct code. Latent only because no fixture used the hook.
// The real type is an @Observable FINAL CLASS, not a struct. That is not a
// cosmetic difference: the emit binds it through @Environment (read-only), so
// a struct cannot typecheck the mutators at all - \`p.grant("x")\` on a struct
// needs \`mutating\`, which an @Environment binding cannot satisfy. The struct
// stub therefore rejected correct code twice over: wrong kind AND five missing
// members (can/cannot/set/grant/revoke, plus the granted property).
// warningSink/warnUnprovidedOnce/resetWarningForTesting mirror the no-provider
// dev warning (usePermissions() with no <PermissionsProvider> above it) — the
// same subset-stub-manufactures-a-bug shape, this time an outright missing
// member rather than a mismatched signature.
public final class PyreonPermissions {
  public init(_ granted: Set<String> = []) {}
  public static func makeUnprovided() -> PyreonPermissions { PyreonPermissions() }
  public let isUnprovidedFallback: Bool = false
  public private(set) var granted: Set<String> = []
  public static var warningSink: (String) -> Void = { print($0) }
  public static func warnUnprovidedOnce() {}
  public static func resetWarningForTesting() {}
  public func can(_ key: String) -> Bool { false }
  public func cannot(_ key: String) -> Bool { false }
  public func not(_ key: String) -> Bool { false }
  public func all(_ keys: String...) -> Bool { false }
  public func any(_ keys: String...) -> Bool { false }
  public func callAsFunction(_ key: String) -> Bool { false } // used as \`can("x")\`
  public func set(_ keys: Set<String>) {}
  public func grant(_ key: String) {}
  public func revoke(_ key: String) {}
}
// BEGIN runtime mirror: fundamentals/permissions/native/swift/PyreonPermissionsEnvironment.swift
@available(iOS 17.0, macOS 14.0, *)
private struct PyreonPermissionsKey: EnvironmentKey {
    static let defaultValue = PyreonPermissions.makeUnprovided()
}

@available(iOS 17.0, macOS 14.0, *)
extension EnvironmentValues {
    public var pyreonPermissions: PyreonPermissions {
        get { self[PyreonPermissionsKey.self] }
        set { self[PyreonPermissionsKey.self] = newValue }
    }
}
// END runtime mirror
`

export const PERMISSIONS_KOTLIN_STUBS = `// PyreonPermissions — mirror of @pyreon/native-runtime-kotlin's
// PyreonPermissions.kt surface the emit touches: callable shape
// (operator invoke), not / cannot / all / any. Added with the
// permissions contract fixture — before it, NO usePermissions shape
// was kotlinc-validated at all.
// MIRRORS the real signature exactly:
// \`PyreonPermissions(granted: Set<String> = emptySet())\`, with \`granted\`
// exposed as Compose MutableState (read \`.value\`). The stub previously took a
// REQUIRED \`initial\` and a plain Set - stricter than reality on the ctor, and
// a different TYPE on the property. It therefore rejected the emit's correct
// \`PyreonPermissions()\`. A stub stricter than reality fails correct code,
// the inverse of the usual superset-masks problem.
class PyreonPermissions(granted: Set<String> = emptySet()) {
  companion object { fun unprovided(): PyreonPermissions = PyreonPermissions() }
  val isUnprovidedFallback: Boolean = false
  val granted: MutableState<Set<String>> = mutableStateOf(granted)
  fun can(key: String): Boolean {
    if (granted.value.contains(key)) return true
    return granted.value.any { it.endsWith(".*") && key.startsWith(it.dropLast(1)) }
  }
  fun cannot(key: String): Boolean = !can(key)
  fun not(key: String): Boolean = !can(key)
  fun all(vararg keys: String): Boolean = keys.all { can(it) }
  fun any(vararg keys: String): Boolean = keys.any { can(it) }
  operator fun invoke(key: String): Boolean = can(key)
  // The mutators the real runtime ships. Their absence rejected a correct
  // \`perms.grant("x")\` - a stub NARROWER than the runtime fails working code,
  // the inverse of the usual superset-stub masking failure.
  fun set(keys: Set<String>) {}
  fun grant(key: String) {}
  fun revoke(key: String) {}
}
// BEGIN runtime mirror: fundamentals/permissions/native/kotlin/com/pyreon/runtime/PyreonPermissionsLocal.kt
val LocalPyreonPermissions: ProvidableCompositionLocal<PyreonPermissions> = compositionLocalOf { PyreonPermissions.unprovided() }
// END runtime mirror
`

/** The permissions compile-gate stubs, appended only to an emit that names a type they declare. */
export const permissionsStubs: StubAugmentation = {
  swift: (source) => (/\bPyreonPermissions\b|\bpyreonPermissions\b/.test(source) ? PERMISSIONS_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreonPermissions\b|\bLocalPyreonPermissions\b/.test(source) ? PERMISSIONS_KOTLIN_STUBS : ''),
}
