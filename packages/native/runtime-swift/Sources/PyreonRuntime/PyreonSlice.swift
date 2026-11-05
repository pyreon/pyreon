/// JavaScript's `Array.prototype.slice` / `String.prototype.slice`.
///
/// The compiler lowers `slice` with LITERAL bounds to Swift's own operations
/// (`suffix(2)`, `dropFirst(1).dropLast(1)`), because a literal's sign is known.
/// Any other bound goes through here: `dropFirst(n)` / `suffix(n)` trap when `n`
/// is negative, while JavaScript reads a negative bound as counting from the end.
///
/// Semantics, exactly JavaScript's: a negative bound is added to the length,
/// both bounds are clamped to `0...count`, and `start >= end` gives an empty
/// result. A `String` is sliced by `Character`, as the literal lowering does.
public func pyreonSlice<T>(_ a: [T], _ start: Int, _ end: Int? = nil) -> [T] {
    let (lo, hi) = pyreonSliceBounds(a.count, start, end)
    return lo < hi ? Array(a[lo..<hi]) : []
}

public func pyreonSlice(_ s: String, _ start: Int, _ end: Int? = nil) -> String {
    let chars = Array(s)
    let (lo, hi) = pyreonSliceBounds(chars.count, start, end)
    return lo < hi ? String(chars[lo..<hi]) : ""
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
 * JavaScript's `str.substring(start, end?)`: each bound clamped into `0...count` (a negative bound reads as 0), and
 * the two SWAPPED when `start > end`. Counted in Characters, like `pyreonSlice` and `count`.
 */
public func pyreonSubstring(_ s: String, _ start: Int, _ end: Int? = nil) -> String {
    let chars = Array(s)
    func clamp(_ i: Int) -> Int { max(0, min(i, chars.count)) }
    let a = clamp(start), b = clamp(end ?? chars.count)
    return String(chars[min(a, b)..<max(a, b)])
}
