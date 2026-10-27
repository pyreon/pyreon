// PyreonUrlState — the native half of `@pyreon/url-state`'s `useUrlState`.
//
// Compiler emit:
//   const page = useUrlState('page', 1)
//   ↓
//   PyreonUrlStateInt(router: pyreonRouter, key: "page", defaultValue: 1)
//
// One value type per default type (string / Int / Double / Bool), each binding
// ONE search parameter of the active router. `callAsFunction` is what keeps the
// web call shape: `page()` reads and `page.set(v)` writes, so shared source
// does not fork per target.
//
// These used to be emitted INLINE into every generated file that called
// `useUrlState`. Each file compiled on its own; two such files in one Xcode
// target failed with `invalid redeclaration of 'PyreonUrlState'`. They need the
// router, so this module — which IS the router — is where they belong.
//
// The validation stubs carry a byte-for-byte copy
// (`@pyreon/native-compiler` swift-stubs.ts); `runtime-stub-parity.test.ts`
// fails the moment the two disagree.

import Foundation

// MARK: - stub-mirror

@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlState {
    // Optional because the environment router is: a component rendered outside
    // a RouterProvider must degrade to the default rather than crash, which is
    // the same choice useNavigate/useParams make.
    let router: PyreonRouter?
    let key: String
    let defaultValue: String
    public init(router: PyreonRouter?, key: String, defaultValue: String) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> String { router?.query[key] ?? defaultValue }
    public func set(_ value: String) { router?.setQueryParam(key, value) }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// JS `ToNumber(String)`, reproduced.
///
/// A URL carries text, so a number-valued `useUrlState` has to decode it — and
/// the web decodes with `+raw` (`inferSerializer`, url-state/src/serializers.ts),
/// whose grammar is NOT what either target's own string→number initializer
/// accepts. Handing the raw string to `Double(_:)` / `toDoubleOrNull()` would
/// diverge on exactly the inputs this feature exists for (a pasted deep link):
///
///     ""        JS 0          Swift nil      Kotlin null
///     "  42  "  JS 42         Swift nil      Kotlin null
///     "0b101"   JS 5          Swift nil      Kotlin null
///     "inf"     JS NaN        Swift infinity Kotlin null
///     "1.5f"    JS NaN        Swift nil      Kotlin 1.5
///     "NaN"     JS NaN        Swift nan      Kotlin nan
///
/// So the grammar is checked here instead, identically on both targets: trim,
/// empty → the default (the web reads `?page=` as absent, not 0), the three
/// `Infinity` spellings, the 0x/0o/0b radix prefixes, then a charset guard that
/// rejects every letter except the exponent `e`/`E` before deferring to the
/// native parse. Unparseable → the declared default, which is what the web does
/// for NaN.
func pyreonUrlNumber(_ raw: String, _ fallback: Double) -> Double {
    let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if t.isEmpty { return fallback }
    if t == "Infinity" || t == "+Infinity" { return .infinity }
    if t == "-Infinity" { return -.infinity }
    if t.count > 2, t.hasPrefix("0") {
        let radix: Int?
        switch t[t.index(t.startIndex, offsetBy: 1)] {
        case "x", "X": radix = 16
        case "o", "O": radix = 8
        case "b", "B": radix = 2
        default: radix = nil
        }
        if let r = radix {
            guard let v = UInt64(String(t.dropFirst(2)), radix: r) else { return fallback }
            return Double(v)
        }
    }
    // Only the decimal grammar's own characters. Rejects "inf"/"NaN"/"1_0"
    // and any suffix form, all of which JS reads as NaN.
    for ch in t where !("0"..."9" ~= ch || ch == "+" || ch == "-" || ch == "." || ch == "e" || ch == "E") {
        return fallback
    }
    guard let v = Double(t), !v.isNaN else { return fallback }
    return v
}

/// JS `String(v)` for a number: a whole Double prints WITHOUT a trailing `.0`
/// (Swift's own `String(1.0)` gives "1.0"). Fractional values and exponent forms
/// (below 1e-6, from 1e21) still use the target's own spelling. Shared by the scalar Double binding
/// and the number-list bindings so one value serializes one way everywhere.
func pyreonUrlFormatDouble(_ value: Double) -> String {
    // JS prints the non-finite values by name; Swift's own `String(Double.infinity)` is "inf".
    if value.isNaN { return "NaN" }
    if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
    // A whole number prints as plain digits below 1e21 (JS switches to exponent form there); `%.0f` is exact for them.
    if value.rounded() == value && value.magnitude < 1e21 { return String(format: "%.0f", value) }
    return String(value)
}

// MARK: - list codec
//
// The web's comma format (`inferSerializer`, url-state/src/serializers.ts): the
// elements join with `,`, and an element that itself holds `,` or `%` is
// escaped (`%` -> `%25` FIRST so the escape stays reversible, then `,` -> `%2C`).
// Decoding touches only those two sequences, so a pre-existing `?tags=50%` still
// reads `50%`; `%2c` is accepted case-insensitively, `%25` only as written.

func pyreonUrlEscapeElement(_ s: String) -> String {
    guard s.contains("%") || s.contains(",") else { return s }
    return s.replacingOccurrences(of: "%", with: "%25").replacingOccurrences(of: ",", with: "%2C")
}

func pyreonUrlUnescapeElement(_ s: String) -> String {
    guard s.contains("%") else { return s }
    return s.replacingOccurrences(of: "%2C", with: ",", options: .caseInsensitive)
        .replacingOccurrences(of: "%25", with: "%")
}

/// `''` is the EMPTY list (not one empty element); otherwise every comma splits,
/// empties included (`"a,,b"` is three elements, as JS `split(',')` makes it).
func pyreonUrlSplitList(_ raw: String) -> [String] {
    if raw.isEmpty { return [] }
    return raw.split(separator: ",", omittingEmptySubsequences: false).map { pyreonUrlUnescapeElement(String($0)) }
}

func pyreonUrlJoinList(_ parts: [String]) -> String {
    parts.map(pyreonUrlEscapeElement).joined(separator: ",")
}

/// One bad element makes the WHOLE list fall back to the default (the web's
/// `INVALID` rule): a URL is untrusted, so a wrong-typed element must not reach
/// app state. NaN is the "invalid" sentinel here, which `pyreonUrlNumber`
/// already returns for every spelling JS reads as NaN, and for blank text.
func pyreonUrlListNumbers(_ raw: String) -> [Double]? {
    var out: [Double] = []
    for part in pyreonUrlSplitList(raw) {
        let n = pyreonUrlNumber(part, .nan)
        if n.isNaN { return nil }
        out.append(n)
    }
    return out
}

/// Int-valued search parameter. See `pyreonUrlNumber` for the decode.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateInt {
    let router: PyreonRouter?
    let key: String
    let defaultValue: Int
    public init(router: PyreonRouter?, key: String, defaultValue: Int) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> Int {
        guard let raw = router?.query[key] else { return defaultValue }
        let n = pyreonUrlNumber(raw, Double(defaultValue))
        // A binding declared with an integer default is a 64-bit integer on
        // both targets (Swift Int and Kotlin Long), so a fractional value has
        // no representation — fall back to the default, the same answer the
        // web gives for a value it cannot read.
        //
        // The bound is the JS safe-integer range on BOTH targets, so one
        // shared source reads the same set: ?page=3000000000 is a number
        // everywhere, the way the web's Number(raw) reads it.
        guard n.rounded() == n, n >= -9007199254740991, n <= 9007199254740991 else { return defaultValue }
        return Int(n)
    }
    public func set(_ value: Int) { router?.setQueryParam(key, String(value)) }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// Double-valued search parameter. `set` mirrors JS `String(v)`, which prints
/// a whole Double WITHOUT a trailing `.0` — Swift's own `String(1.0)` gives
/// "1.0", so the round-trip would not match the web's `?zoom=1`.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateDouble {
    let router: PyreonRouter?
    let key: String
    let defaultValue: Double
    public init(router: PyreonRouter?, key: String, defaultValue: Double) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> Double {
        guard let raw = router?.query[key] else { return defaultValue }
        return pyreonUrlNumber(raw, defaultValue)
    }
    public func set(_ value: Double) { router?.setQueryParam(key, pyreonUrlFormatDouble(value)) }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// Bool-valued search parameter. Mirrors the web decode: true/1 → true,
/// false/0 → false, anything else → the DEFAULT (not `false`).
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateBool {
    let router: PyreonRouter?
    let key: String
    let defaultValue: Bool
    public init(router: PyreonRouter?, key: String, defaultValue: Bool) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> Bool {
        guard let raw = router?.query[key] else { return defaultValue }
        switch raw {
        case "true", "1": return true
        case "false", "0": return false
        default: return defaultValue
        }
    }
    public func set(_ value: Bool) { router?.setQueryParam(key, value ? "true" : "false") }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// String-list search parameter (`useUrlState('tags', ['a'])`, or an empty
/// default, which carries no element type so stays strings, as on the web).
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateStrings {
    let router: PyreonRouter?
    let key: String
    let defaultValue: [String]
    public init(router: PyreonRouter?, key: String, defaultValue: [String]) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> [String] {
        guard let raw = router?.query[key] else { return defaultValue }
        return pyreonUrlSplitList(raw)
    }
    public func set(_ value: [String]) { router?.setQueryParam(key, pyreonUrlJoinList(value)) }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// Int-list search parameter. An element must be a whole number inside the JS
/// safe-integer range, exactly like the scalar Int binding; anything else
/// makes the whole list fall back to the default.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateInts {
    let router: PyreonRouter?
    let key: String
    let defaultValue: [Int]
    public init(router: PyreonRouter?, key: String, defaultValue: [Int]) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> [Int] {
        guard let raw = router?.query[key], let nums = pyreonUrlListNumbers(raw) else { return defaultValue }
        var out: [Int] = []
        for n in nums {
            guard n.rounded() == n, n >= -9007199254740991, n <= 9007199254740991 else { return defaultValue }
            out.append(Int(n))
        }
        return out
    }
    public func set(_ value: [Int]) { router?.setQueryParam(key, pyreonUrlJoinList(value.map { String($0) })) }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// Double-list search parameter.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateDoubles {
    let router: PyreonRouter?
    let key: String
    let defaultValue: [Double]
    public init(router: PyreonRouter?, key: String, defaultValue: [Double]) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> [Double] {
        guard let raw = router?.query[key], let nums = pyreonUrlListNumbers(raw) else { return defaultValue }
        return nums
    }
    public func set(_ value: [Double]) { router?.setQueryParam(key, pyreonUrlJoinList(value.map(pyreonUrlFormatDouble))) }
    public func clear() { router?.setQueryParam(key, nil) }
}

/// Bool-list search parameter. Each element decodes like the scalar Bool
/// (true/1, false/0); any other element makes the whole list the default.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonUrlStateBools {
    let router: PyreonRouter?
    let key: String
    let defaultValue: [Bool]
    public init(router: PyreonRouter?, key: String, defaultValue: [Bool]) {
        self.router = router
        self.key = key
        self.defaultValue = defaultValue
    }
    public func callAsFunction() -> [Bool] {
        guard let raw = router?.query[key] else { return defaultValue }
        var out: [Bool] = []
        for part in pyreonUrlSplitList(raw) {
            switch part {
            case "true", "1": out.append(true)
            case "false", "0": out.append(false)
            default: return defaultValue
            }
        }
        return out
    }
    public func set(_ value: [Bool]) { router?.setQueryParam(key, pyreonUrlJoinList(value.map { $0 ? "true" : "false" })) }
    public func clear() { router?.setQueryParam(key, nil) }
}
