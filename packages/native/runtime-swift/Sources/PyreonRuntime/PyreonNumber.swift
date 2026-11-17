import Foundation

/// JavaScript's `String(number)` for a `Double` — ECMAScript `Number::toString`, which a template literal, a
/// `String(x)` call and a `"text" + x` concatenation all perform.
///
/// Swift's own interpolation prints a whole-valued `Double` with a trailing `.0` (`"\(7.0)"` is `"7.0"`) and uses
/// its own exponent form (`1e-07`, `1e+15`), where the web prints `7`, `1e-7` and `1000000000000000`. This is the
/// whole algorithm, not an approximation of it: the SHORTEST digits that round-trip (Swift's `description` already
/// produces them) laid out by the ECMAScript rules — positional for a decimal exponent in (-7, 21], `1.5e-7` /
/// `1e+21` beyond — with `NaN` / `Infinity` / `-Infinity` spelled as JavaScript spells them and `-0` printed `0`.
/// `PyreonJSON.jsNumber` is the same algorithm for `JSON.stringify` (kept in its own file so each links alone);
/// `native-number-format-parity.test.ts` holds both to the web over one corpus.
public func pyreonNumberString(_ v: Double) -> String {
    if v.isNaN { return "NaN" }
    if v.isInfinite { return v < 0 ? "-Infinity" : "Infinity" }
    if v == 0 { return "0" }
    // Every counter, index and id: a whole value below 2^53 is its integer digits.
    if v == v.rounded(.towardZero), abs(v) < 9.0e15 { return String(Int64(v)) }
    let negative = v < 0
    let text = (negative ? -v : v).description
    var mantissa = Substring(text)
    var exponent = 0
    if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
        mantissa = text[..<e]
        exponent = Int(text[text.index(after: e)...]) ?? 0
    }
    var digits: [Character] = []
    var point = -1
    for ch in mantissa {
        if ch == "." { point = digits.count } else { digits.append(ch) }
    }
    if point < 0 { point = digits.count }
    // n: where the decimal point sits relative to the first digit.
    var n = point + exponent
    while digits.count > 1 && digits.first == "0" {
        digits.removeFirst()
        n -= 1
    }
    while digits.count > 1 && digits.last == "0" { digits.removeLast() }
    return (negative ? "-" : "") + pyreonNumberLayout(String(digits), n)
}

/// ECMAScript `Number::toString` layout for the digits `s` (k of them) with the decimal point at `n`.
func pyreonNumberLayout(_ s: String, _ n: Int) -> String {
    let k = s.count
    if k <= n && n <= 21 { return s + String(repeating: "0", count: n - k) }
    if 0 < n && n <= 21 {
        let i = s.index(s.startIndex, offsetBy: n)
        return String(s[..<i]) + "." + String(s[i...])
    }
    if -6 < n && n <= 0 { return "0." + String(repeating: "0", count: -n) + s }
    let e = n - 1
    let sign = e < 0 ? "-" : "+"
    let head = String(s.first!)
    let tail = k == 1 ? "" : "." + String(s.dropFirst())
    return head + tail + "e" + sign + String(abs(e))
}

/// JavaScript's `Number.prototype.toFixed(digits)`.
///
/// `String(format: "%.2f", x)` is not it: C's `printf` breaks an EXACT tie toward the even digit, where
/// `toFixed` picks the larger magnitude — `(2.5).toFixed(0)` is `"3"`, `(0.125).toFixed(2)` is `"0.13"`, and
/// `printf` gives `"2"` / `"0.12"`. The rounding here works on the double's exact decimal expansion (a double has
/// at most `52 - exponent` fractional digits, so a `printf` at that precision is exact), rounding half up as the
/// specification does, so `(1.005).toFixed(2)` stays `"1.00"` (1.005 is 1.00499999… in binary) on every target.
/// A negative value keeps its sign even when it rounds to zero (`(-0.0001).toFixed(2)` is `"-0.00"`), a value
/// at or past 1e21 prints as `String(x)`, and `digits` is clamped to toFixed's 0…100.
public func pyreonToFixed(_ x: Double, _ digits: Int) -> String {
    if !x.isFinite || abs(x) >= 1e21 { return pyreonNumberString(x) }
    let f = max(0, min(100, digits))
    let negative = x < 0
    let a = negative ? -x : x
    var intPart: [UInt8]
    var frac: [UInt8]
    if a == 0 {
        intPart = [0]
        frac = []
    } else {
        let exact = max(f + 1, min(1074, 52 - Int(a.exponent)))
        let text = String(format: "%.\(exact)f", a)
        let parts = text.split(separator: ".", omittingEmptySubsequences: false)
        intPart = parts[0].utf8.map { $0 - 48 }
        frac = parts.count > 1 ? parts[1].utf8.map { $0 - 48 } : []
    }
    while frac.count < f + 1 { frac.append(0) }
    var kept = intPart + frac[0..<f]
    if frac[f] >= 5 {
        var i = kept.count - 1
        while i >= 0 {
            if kept[i] == 9 { kept[i] = 0; i -= 1 } else { kept[i] += 1; break }
        }
        if i < 0 { kept.insert(1, at: 0) }
    }
    let whole = kept.count - f
    let digitsText = String(decoding: kept.map { $0 + 48 }, as: UTF8.self)
    let head = String(digitsText.prefix(whole))
    let body = f == 0 ? head : head + "." + String(digitsText.suffix(f))
    return (negative ? "-" : "") + body
}

/// `toFixed` on an integer value: the same digits with `digits` zeros after the point.
public func pyreonToFixed(_ x: Int, _ digits: Int) -> String { pyreonToFixed(Double(x), digits) }

/// The integer overload: `String(Int)` already matches JavaScript.
public func pyreonNumberString(_ v: Int) -> String { String(v) }

/// JavaScript's `Math.round`: the nearest integer, a tie rounding toward +Infinity (`-2.5` is `-2`), and NaN,
/// ±Infinity and every value already whole (|x| >= 2^52) returned unchanged. The Android emit calls the same
/// function, so `Math.round(0 / 0) + 1` is NaN on both targets (and `0` once stored into an integer field)
/// instead of `1` on Android, where `java.lang.Math.round` turns NaN into `0` and saturates at `Long.MAX_VALUE`.
/// `floor(x + 0.5)` is not this either: `0.49999999999999994 + 0.5` rounds to `1.0` before the floor.
public func pyreonRound(_ x: Double) -> Double {
    if !x.isFinite || abs(x) >= 4_503_599_627_370_496.0 { return x }
    let f = floor(x)
    let r = x - f >= 0.5 ? f + 1 : f
    // `Math.round(-0.4)` is -0, as on the web.
    return r == 0 && x < 0 ? -0.0 : r
}

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
