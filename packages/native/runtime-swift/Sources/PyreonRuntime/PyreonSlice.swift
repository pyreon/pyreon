/// JavaScript's `Array.prototype.slice` / `String.prototype.slice`.
///
/// The compiler lowers `slice` with LITERAL bounds to Swift's own operations
/// (`suffix(2)`, `dropFirst(1).dropLast(1)`), because a literal's sign is known.
/// Any other bound goes through here: `dropFirst(n)` / `suffix(n)` trap when `n`
/// is negative, while JavaScript reads a negative bound as counting from the end.
///
/// Semantics, exactly JavaScript's: a negative bound is added to the length,
/// both bounds are clamped to `0...count`, and `start >= end` gives an empty
/// result.
///
/// A `String` is indexed by UTF-16 code unit, as JavaScript does and as the
/// compiler's `.length` (`utf16.count`) counts. Counting `Character`s instead put
/// `"a👍b".slice(0, 3)` at `"a👍b"` natively and `"a👍"` on the web — the bound and
/// the length disagreed about what a position is. The one thing a Swift `String`
/// cannot hold is a LONE surrogate, so a bound that splits a surrogate pair decodes
/// that half as U+FFFD where JavaScript keeps the unpaired unit.
public func pyreonSlice<T>(_ a: [T], _ start: Int, _ end: Int? = nil) -> [T] {
    let (lo, hi) = pyreonSliceBounds(a.count, start, end)
    return lo < hi ? Array(a[lo..<hi]) : []
}

public func pyreonSlice(_ s: String, _ start: Int, _ end: Int? = nil) -> String {
    let units = Array(s.utf16)
    let (lo, hi) = pyreonSliceBounds(units.count, start, end)
    return lo < hi ? String(decoding: units[lo..<hi], as: UTF16.self) : ""
}

func pyreonSliceBounds(_ count: Int, _ start: Int, _ end: Int?) -> (Int, Int) {
    func resolve(_ i: Int) -> Int { i < 0 ? max(count + i, 0) : min(i, count) }
    return (resolve(start), resolve(end ?? count))
}

/**
 * A fractional `slice` bound, converted the way JavaScript does (`ToIntegerOrInfinity`): truncated toward zero, NaN
 * read as 0, and ±Infinity (or anything past `Int`'s range) clamped. `Int(d)` alone TRAPS on NaN and the
 * infinities, where `xs.slice(0, NaN)` is just `[]` on the web. Kotlin's `Double.toLong()` already has these
 * semantics, so only Swift needs the helper.
 */
public func pyreonSliceIndex(_ d: Double) -> Int {
    if d.isNaN { return 0 }
    if d >= 9.223372036854775807e18 { return Int.max }
    if d <= -9.223372036854775808e18 { return Int.min }
    return Int(d)
}

/**
 * JavaScript's `str.substring(start, end?)`: each bound clamped into `0...length` (a negative bound reads as 0), and
 * the two SWAPPED when `start > end`. Counted in UTF-16 units, like `pyreonSlice` and `.length`.
 */
public func pyreonSubstring(_ s: String, _ start: Int, _ end: Int? = nil) -> String {
    let units = Array(s.utf16)
    func clamp(_ i: Int) -> Int { max(0, min(i, units.count)) }
    let a = clamp(start), b = clamp(end ?? units.count)
    return String(decoding: units[min(a, b)..<max(a, b)], as: UTF16.self)
}

/// JavaScript's `str.charAt(i)`: the UTF-16 unit at `i` as a one-unit string, or `""` out of range.
public func pyreonCharAt(_ s: String, _ i: Int) -> String {
    let units = Array(s.utf16)
    return i >= 0 && i < units.count ? String(decoding: [units[i]], as: UTF16.self) : ""
}

/// JavaScript's `str.indexOf(search, from?)`: the UTF-16 offset of the first exact (code-unit) match at or after
/// `from` (clamped into `0...length`), or -1. An empty search matches at `from`. Foundation's `range(of:)` is not a
/// substitute: it compares canonically-equivalent text as equal and reports a `String.Index`, not an offset.
public func pyreonIndexOf(_ s: String, _ search: String, _ from: Int = 0) -> Int {
    let h = Array(s.utf16), n = Array(search.utf16)
    var i = max(0, min(from, h.count))
    if n.isEmpty { return i }
    while i + n.count <= h.count {
        if h[i..<(i + n.count)].elementsEqual(n) { return i }
        i += 1
    }
    return -1
}

/// JavaScript's `str.startsWith(search, position)`: a code-unit prefix test from `position` (clamped).
public func pyreonStartsWith(_ s: String, _ search: String, _ position: Int) -> Bool {
    let h = Array(s.utf16), n = Array(search.utf16)
    let start = max(0, min(position, h.count))
    return start + n.count <= h.count && h[start..<(start + n.count)].elementsEqual(n)
}

/// JavaScript's `str.endsWith(search, endPosition)`: a code-unit suffix test of the first `endPosition` units.
public func pyreonEndsWith(_ s: String, _ search: String, _ endPosition: Int) -> Bool {
    let h = Array(s.utf16), n = Array(search.utf16)
    let end = max(0, min(endPosition, h.count))
    return end - n.count >= 0 && h[(end - n.count)..<end].elementsEqual(n)
}
