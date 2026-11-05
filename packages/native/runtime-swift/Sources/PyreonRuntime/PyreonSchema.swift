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

public enum PyreonSchemaError: Error, LocalizedError, CustomStringConvertible {
    case missingOrWrongType(field: String, expected: String)
    case constraintViolation(field: String, rule: String)
    case unknown

    /// The same text Kotlin's PyreonSchemaError carries as its message, so a caught Pet.parse(x) failure
    /// reads identically on both targets (e.message in the shared source).
    public var errorDescription: String? {
        switch self {
        case let .missingOrWrongType(field, expected):
            return "Field '\(field)' missing or wrong type (expected \(expected))"
        case let .constraintViolation(field, rule):
            return "Field '\(field)' violated constraint '\(rule)'"
        case .unknown:
            return "Schema validation failed"
        }
    }

    public var description: String { errorDescription ?? "Schema validation failed" }
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

// MARK: - The libraries' own result shapes
//
// Each schema library's `parse` has its OWN web result shape, and the native
// emit reproduces it rather than borrowing zod's:
//
//   @pyreon/validate    `s.object(…).parse(x)` and `.safeParse(x)` (the same
//                       method) → `{ ok, value } | { ok: false, issues }`,
//                       `issues[i].path` an ARRAY of keys. Never throws.
//   @pyreon/validation  `zodSchema(…).parse(x)` (the adapter has no
//                       `safeParse`) → the same, but `issues[i].path` is a
//                       DOT-STRING. Never throws.
//
// `value` is implicitly unwrapped: the shared source reads it only after
// narrowing on `ok` (TypeScript rejects `r.value` otherwise), so `r.value.name`
// must compile as written. A native parse stops at the first failing field, so
// `issues` holds at most one entry where the web may report several.

/// One `@pyreon/validate` issue: the message and the key path (`["address", "city"]`).
public struct PyreonValidateIssue: Codable, Equatable {
    public let message: String
    public let path: [String]
    public init(message: String, path: [String]) {
        self.message = message
        self.path = path
    }
}

/// `@pyreon/validate`'s `{ ok, value } | { ok: false, issues }`.
public struct PyreonValidateResult<T> {
    public let ok: Bool
    public let value: T!
    public let issues: [PyreonValidateIssue]
    public init(ok: Bool, value: T?, issues: [PyreonValidateIssue]) {
        self.ok = ok
        self.value = value
        self.issues = issues
    }
}

/// One `@pyreon/validation` adapter issue: the message and a dot-separated path (`"address.city"`).
public struct PyreonValidationIssue: Codable, Equatable {
    public let path: String
    public let message: String
    public init(path: String, message: String) {
        self.path = path
        self.message = message
    }
}

/// A `@pyreon/validation` adapter's `parse` result: `{ ok, value } | { ok: false, issues }`.
public struct PyreonValidationResult<T> {
    public let ok: Bool
    public let value: T!
    public let issues: [PyreonValidationIssue]
    public init(ok: Bool, value: T?, issues: [PyreonValidationIssue]) {
        self.ok = ok
        self.value = value
        self.issues = issues
    }
}

/// The failing field of a native schema error (`""` when it names none).
func pyreonIssueField(_ e: Error) -> String {
    switch e as? PyreonSchemaError {
    case let .missingOrWrongType(field, _)?: return field
    case let .constraintViolation(field, _)?: return field
    default: return ""
    }
}

func pyreonIssueMessage(_ e: Error) -> String {
    (e as? LocalizedError)?.errorDescription ?? String(describing: e)
}

/// Run a native schema `parse` and report it as `@pyreon/validate` does: never throwing.
public func pyreonValidateResult<T>(_ parse: () throws -> T) -> PyreonValidateResult<T> {
    do {
        return PyreonValidateResult(ok: true, value: try parse(), issues: [])
    } catch {
        let field = pyreonIssueField(error)
        let path = field.isEmpty ? [] : field.split(separator: ".").map(String.init)
        return PyreonValidateResult(ok: false, value: nil, issues: [PyreonValidateIssue(message: pyreonIssueMessage(error), path: path)])
    }
}

/// Run a native schema `parse` and report it as a `@pyreon/validation` adapter's `parse` does: never throwing.
public func pyreonValidationResult<T>(_ parse: () throws -> T) -> PyreonValidationResult<T> {
    do {
        return PyreonValidationResult(ok: true, value: try parse(), issues: [])
    } catch {
        return PyreonValidationResult(ok: false, value: nil, issues: [PyreonValidationIssue(path: pyreonIssueField(error), message: pyreonIssueMessage(error))])
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
