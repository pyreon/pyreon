import UIKit

/// An APP-provided native module — the iOS half of the FFI escape hatch.
///
/// Nothing about this class is framework-owned: `@pyreon/native-compiler`
/// does not know it exists. The shared `Counter.tsx` declares
/// `useNativeModule<{ platformName(): string }>('DeviceInfo')`, PMTC lowers
/// that to `@State private var device = DeviceInfo()`, and member calls pass
/// through verbatim — so THIS file is what Swift type-checks the call
/// against. Adding a platform capability is now an app-level change, not a
/// framework PR.
///
/// The contract PMTC's emit relies on:
///   - the class name matches the string passed to `useNativeModule`
///   - it has a NO-ARGUMENT initialiser (Android's counterpart instead takes
///     a single `Context`, which the Compose emit injects)
///   - method names/arities match what the shared source calls
///
/// Mark the class `@Observable` (Swift 5.9+) if its state should drive the
/// view; a stateless service like this one does not need it.
final class DeviceInfo {
  /// Returns the platform family name. Deliberately DIFFERENTIATING across
  /// targets — iOS answers "iOS" and the Kotlin sibling answers "Android",
  /// so the device test proves the real platform class ran rather than a
  /// value baked in by the compiler.
  func platformName() -> String {
    UIDevice.current.systemName
  }
}
