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
