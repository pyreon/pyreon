// PyreonBiometrics — the SwiftUI side of Pyreon's biometric-gate service
// (M3.5). Mirrors the core `@pyreon/hooks` `useBiometrics` shape and the
// Kotlin `PyreonBiometrics` one-for-one.
//
// Surface:
//
//     let ok = await bio.authenticate("Unlock to continue")  // Face ID / Touch ID
//
// `authenticate(_:)` is ASYNC — it is the first Pyreon service with an
// async RESULT a consumer `await`s. PMTC lowers a `const ok = await
// bio.authenticate(...)` inside an `async` handler to a `Task { let ok =
// await bio.authenticate(...) }` (the M4.5 lowering). Because it never
// throws to the caller (all failures collapse to `false`), the emitted
// `await` needs no `try` / error handling.
//
// LocalAuthentication is guarded with `#if canImport` so the type still
// compiles on platforms without it (the emit references the type shape).

import Foundation
#if canImport(LocalAuthentication)
import LocalAuthentication
#endif

public struct PyreonBiometrics {
    public init() {}

    /// Prompt for biometric authentication (Face ID / Touch ID). Resolves to
    /// `true` ONLY on a successful match; any failure, cancellation, or a
    /// device/simulator with no enrolled biometrics resolves to `false`
    /// (never throws). `reason` is shown in the system prompt.
    ///
    /// Uses the biometrics-ONLY policy (`.deviceOwnerAuthenticationWithBiometrics`)
    /// rather than the passcode-fallback one, so an unenrolled simulator fails
    /// deterministically instead of surfacing a passcode UI.
    public func authenticate(_ reason: String) async -> Bool {
        #if canImport(LocalAuthentication)
        let context = LAContext()
        var policyError: NSError?
        guard context.canEvaluatePolicy(
            .deviceOwnerAuthenticationWithBiometrics,
            error: &policyError
        ) else {
            return false
        }
        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
        } catch {
            return false
        }
        #else
        return false
        #endif
    }
}
