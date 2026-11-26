---
"@pyreon/lathe": minor
"@pyreon/config": minor
---

Lathe can now write the spec's models as plain native types. The new `swift` and `kotlin` plugins write `swift/Models.swift` (`Codable` structs, enums and unions) and `kotlin/Models.kt` (kotlinx.serialization `@Serializable` data classes). This is for iOS and Android apps that have their own networking and want the same contract types as the web client. `nativeModels: { kotlinPackage, swiftAccess }` sets the Kotlin package (default `api`) and the Swift access level (default `internal`). The files are covered by `lathe check` and by pruning. The project `format` hook does not receive them. `@pyreon/config`'s `LatheSection` accepts the new plugin names and the `nativeModels` key. A union with a `discriminator` dispatches on the tag. When the tag property is a plain string, the values come from OpenAPI's `mapping` or the member's component name, which the IR union now keeps as `declared`.
