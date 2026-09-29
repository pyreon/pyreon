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
        // A binding declared with an integer default is Int on both targets
        // (the repo-wide inferTypeFromInitial rule), so a fractional or
        // out-of-range value has no representation — fall back to the default,
        // the same answer the web gives for a value it cannot read.
        //
        // The bound is Kotlin's 32-bit Int, not Swift's 64-bit one, so both
        // targets accept the same set: one shared source must not read
        // ?page=3000000000 as a number on iOS and the default on Android.
        guard n.rounded() == n, n >= -2147483648, n <= 2147483647 else { return defaultValue }
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
    public func set(_ value: Double) {
        let s = value.rounded() == value && value.magnitude < 1e15
            ? String(Int(value))
            : String(value)
        router?.setQueryParam(key, s)
    }
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
