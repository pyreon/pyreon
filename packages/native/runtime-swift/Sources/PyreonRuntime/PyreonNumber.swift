import Foundation

/// JavaScript's `String(number)` for a `Double`, which a template literal
/// performs on every interpolated number.
///
/// Swift's own interpolation prints a whole-valued `Double` with a trailing
/// `.0` (`"\(7.0)"` is `"7.0"`), where the web prints `7`. The compiler routes
/// every Double-typed template interpoland through this, so a label, an axis
/// tick or a counter reads the same on every target.
///
/// Whole values below 1e21 (where JavaScript switches to exponent notation)
/// print as integers, and the non-finite values use JavaScript's spelling.
/// A fractional value keeps Swift's shortest round-trip description, which
/// agrees with JavaScript's except in exponent notation (`1e-07` vs `1e-7`),
/// a known divergence.
public func pyreonNumberString(_ v: Double) -> String {
    if v.isNaN { return "NaN" }
    if v.isInfinite { return v < 0 ? "-Infinity" : "Infinity" }
    if v == v.rounded(.towardZero), abs(v) < 1e21 {
        if abs(v) < 9.0e15 { return String(Int64(v)) }
        return String(format: "%.0f", v)
    }
    return "\(v)"
}

/// The integer overload: `String(Int)` already matches JavaScript.
public func pyreonNumberString(_ v: Int) -> String { String(v) }

/// A whole-valued `Double` (`Math.floor(x)`, `Math.round(a / b)`, ...) stored into an
/// INTEGER field. Swift's `Int(_:)` TRAPS on NaN, ±Infinity and anything outside
/// `Int`'s range, which `Math.floor(NaN)` or `Math.round(x / 0)` reach at runtime.
/// This is Kotlin's `Double.toLong()`, which the Android emit uses for the same
/// store, so both targets hold the same value and neither crashes: NaN is 0,
/// ±Infinity and out-of-range values saturate to `Int.max` / `Int.min`, and every
/// other value truncates toward zero.
public func pyreonInt(_ v: Double) -> Int {
    if v.isNaN { return 0 }
    // `Double(Int.max)` rounds up to 2^63, which is itself out of range.
    if v >= 9_223_372_036_854_775_808.0 { return Int.max }
    if v <= -9_223_372_036_854_775_808.0 { return Int.min }
    return Int(v)
}

// MARK: - Parsing text into numbers (ECMAScript `parseInt` / `parseFloat` / `Number`)
//
// Foundation's `Int(_:)` / `Double(_:)` accept a WHOLE string in Swift's own literal grammar; the web's functions do
// not. `parseInt("3.5")` is 3 and `parseFloat("12px")` is 12 (both read the longest valid PREFIX), `Number("")` is 0
// and `Number(" 12 ")` is 12 (whitespace is trimmed, the empty string is zero), `Number("0x1f")` is 31. Each function
// below is that algorithm, so a value parsed from user input is the same number on every target. Locked against the
// web's own answers by the native-compiler `native-platform-globals` test, which executes these.

private func pyreonIsJSSpace(_ c: Character) -> Bool { c.isWhitespace || c == "\u{FEFF}" }

private func pyreonDigit(_ c: Character, _ radix: Int) -> Int? {
    guard let v = c.hexDigitValue ?? (c.isASCII && c.isLetter ? Int(c.asciiValue! | 0x20) - 87 : nil) else { return nil }
    return v < radix ? v : nil
}

/// JavaScript's `parseInt(text, radix)`. `nil` where the web returns `NaN`. A value past `Int`'s range clamps to it
/// (the web keeps an imprecise float there).
public func pyreonParseInt(_ text: String, _ radix: Int? = nil) -> Int? {
    var chars = Substring(text).drop(while: pyreonIsJSSpace)
    var negative = false
    if let c = chars.first, c == "+" || c == "-" {
        negative = c == "-"
        chars = chars.dropFirst()
    }
    var r = radix ?? 0
    var stripPrefix = true
    if r != 0 {
        if r < 2 || r > 36 { return nil }
        if r != 16 { stripPrefix = false }
    } else {
        r = 10
    }
    if stripPrefix, chars.count >= 2, chars.first == "0", let x = chars.dropFirst().first, x == "x" || x == "X" {
        chars = chars.dropFirst(2)
        r = 16
    }
    var value = 0
    var any = false
    var overflow = false
    for c in chars {
        guard let d = pyreonDigit(c, r) else { break }
        any = true
        if !overflow {
            let (m, o1) = value.multipliedReportingOverflow(by: r)
            let (a, o2) = m.addingReportingOverflow(d)
            if o1 || o2 { overflow = true } else { value = a }
        }
    }
    if !any { return nil }
    if overflow { return negative ? Int.min : Int.max }
    return negative ? -value : value
}

/// The longest prefix of `s` that is an ECMAScript StrDecimalLiteral (sign, `Infinity`, digits, fraction, exponent),
/// as a Double — or `nil` when no prefix is one. `whole` demands that the literal is all of `s`.
private func pyreonDecimalPrefix(_ s: Substring, whole: Bool) -> Double? {
    var i = s.startIndex
    var sign = 1.0
    if i < s.endIndex, s[i] == "+" || s[i] == "-" {
        if s[i] == "-" { sign = -1 }
        i = s.index(after: i)
    }
    if s[i...].hasPrefix("Infinity") {
        let end = s.index(i, offsetBy: 8)
        if whole && end != s.endIndex { return nil }
        return sign * Double.infinity
    }
    let start = i
    var intDigits = 0
    while i < s.endIndex, s[i].isASCII, s[i].isNumber { i = s.index(after: i); intDigits += 1 }
    var fracDigits = 0
    if i < s.endIndex, s[i] == "." {
        var j = s.index(after: i)
        while j < s.endIndex, s[j].isASCII, s[j].isNumber { j = s.index(after: j); fracDigits += 1 }
        if intDigits > 0 || fracDigits > 0 { i = j }
    }
    if intDigits == 0 && fracDigits == 0 { return nil }
    var end = i
    if i < s.endIndex, s[i] == "e" || s[i] == "E" {
        var j = s.index(after: i)
        if j < s.endIndex, s[j] == "+" || s[j] == "-" { j = s.index(after: j) }
        var expDigits = 0
        while j < s.endIndex, s[j].isASCII, s[j].isNumber { j = s.index(after: j); expDigits += 1 }
        if expDigits > 0 { end = j }
    }
    if whole && end != s.endIndex { return nil }
    guard let v = Double(String(s[start..<end])) else { return nil }
    return sign * v
}

/// JavaScript's `parseFloat(text)`: the longest decimal prefix after leading whitespace, `NaN` when there is none.
public func pyreonParseFloat(_ text: String) -> Double {
    pyreonDecimalPrefix(Substring(text).drop(while: pyreonIsJSSpace), whole: false) ?? .nan
}

/// JavaScript's `Number(text)` for a string: whitespace-trimmed, the empty string is 0, `0x` / `0o` / `0b` integers,
/// otherwise the WHOLE string must be a decimal literal — `NaN` when it is not.
public func pyreonToNumber(_ text: String) -> Double {
    var s = Substring(text).drop(while: pyreonIsJSSpace)
    while let last = s.last, pyreonIsJSSpace(last) { s = s.dropLast() }
    if s.isEmpty { return 0 }
    if s.count > 2, s.first == "0", let p = s.dropFirst().first {
        let radix: Int? = (p == "x" || p == "X") ? 16 : (p == "o" || p == "O") ? 8 : (p == "b" || p == "B") ? 2 : nil
        if let radix {
            var v = 0.0
            for c in s.dropFirst(2) {
                guard let d = pyreonDigit(c, radix) else { return .nan }
                v = v * Double(radix) + Double(d)
            }
            return v
        }
    }
    return pyreonDecimalPrefix(s, whole: true) ?? .nan
}
