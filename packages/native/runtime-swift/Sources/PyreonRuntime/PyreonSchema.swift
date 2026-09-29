// PyreonSchema — the types every PMTC-emitted schema struct shares.
//
// A file-scope `s.object({ … })` / `z.object({ … })` lowers to a struct whose
// `parse` throws `PyreonSchemaError` and whose `safeParseResult` returns a
// `PyreonParseResult`. These used to be emitted INTO each file that declared a
// schema, which is fine for one file and fatal for two: two schema-bearing
// modules in one Xcode target each declared `enum PyreonSchemaError`, and the
// target failed with `invalid redeclaration of 'PyreonSchemaError'`. Every
// per-file gate stayed green, because a per-file gate cannot see a
// cross-file collision. Declared once, here, they cannot collide.
//
// `public` because the runtime is its own module (`import PyreonRuntime`).

import Foundation

public enum PyreonSchemaError: Error {
    case missingOrWrongType(field: String, expected: String)
    case constraintViolation(field: String, rule: String)
    case unknown
}

/// The web-faithful `{ success, data }` result of `Schema.safeParse(x)`.
/// Swift's `Result` carries no `.success` Bool, so a validated schema also
/// exposes `safeParseResult` returning this shape.
public struct PyreonParseResult<T> {
    public let success: Bool
    public let data: T?

    public init(success: Bool, data: T?) {
        self.success = success
        self.data = data
    }
}
