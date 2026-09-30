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

// MARK: - Typed values as schema input
//
// An emitted schema's `parse` reads a `[String: Any]` — the shape an object
// LITERAL lowers to. `Pet.safeParse(pet())`, where `pet` holds a typed struct,
// has to reach the same shape, so the struct goes through its own Codable
// encoding and back out as plain JSON values. Round-tripping through JSON is
// deliberate: it is the only conversion that applies the struct's REAL coding
// (keys, omitted nils, nested structs) rather than a second, hand-rolled
// reading of it that could disagree.

/// A typed value as the `[String: Any]` an emitted schema's `parse` reads.
/// A value that does not encode to a JSON object yields `[:]`, which every
/// schema with a required field rejects — an invalid result, never a crash.
public func pyreonSchemaInput<T: Encodable>(_ value: T) -> [String: Any] {
    pyreonSchemaValue(value) as? [String: Any] ?? [:]
}

/// Already a dictionary (a literal lowered elsewhere): passed through.
public func pyreonSchemaInput(_ value: [String: Any]) -> [String: Any] {
    value
}

/// A typed value as the plain JSON value (`String`, `NSNumber`, `Bool`,
/// `[Any]`, `[String: Any]`, `NSNull`) a schema reads for a nested field.
public func pyreonSchemaValue<T: Encodable>(_ value: T) -> Any {
    guard let data = try? JSONEncoder().encode(value),
          let json = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    else { return NSNull() }
    return pyreonSchemaNormalize(json)
}

/// JSONSerialization hands booleans back as `NSNumber`, which would satisfy a
/// schema's `as? Int` for a Bool field and its `as? Bool` for a 0/1 number.
/// Booleans become Swift `Bool`; numbers stay `NSNumber`, whose bridging
/// (`as? Int` fails for 3.5, succeeds for 3) matches a JS number's.
func pyreonSchemaNormalize(_ value: Any) -> Any {
    switch value {
    case let n as NSNumber where CFGetTypeID(n) == CFBooleanGetTypeID():
        return n.boolValue
    case let a as [Any]:
        return a.map(pyreonSchemaNormalize)
    case let d as [String: Any]:
        return d.mapValues(pyreonSchemaNormalize)
    default:
        return value
    }
}
