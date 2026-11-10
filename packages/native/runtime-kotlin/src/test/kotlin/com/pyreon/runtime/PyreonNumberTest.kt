// pyreonNumberString must print exactly what JavaScript's `String(number)`
// prints for every value a template literal or a chart label can carry —
// the whole point is that iOS, Android and the web read the same.

package com.pyreon.runtime

private fun expectString(value: Number, want: String) {
    val got = pyreonNumberString(value)
    check(got == want) { "pyreonNumberString($value) should be $want, got=$got" }
}

fun main() {
    expectString(7.0, "7")
    expectString(-3.0, "-3")
    expectString(-0.0, "0")
    expectString(1.5, "1.5")
    expectString(0.1, "0.1")
    expectString(1709251200000.0, "1709251200000")
    expectString(1e20, "100000000000000000000")
    expectString(Double.NaN, "NaN")
    expectString(Double.POSITIVE_INFINITY, "Infinity")
    expectString(Double.NEGATIVE_INFINITY, "-Infinity")
    expectString(42, "42")
    expectString(1709251200000L, "1709251200000")
    // pyreonRound is JavaScript's Math.round; the iOS emit calls the same function (#4258).
    check(pyreonRound(2.5) == 3.0) { "round(2.5)" }
    check(pyreonRound(-2.5) == -2.0) { "round(-2.5)" }
    check(pyreonRound(0.49999999999999994) == 0.0) { "round(0.49999999999999994)" }
    check(pyreonRound(4503599627370497.0) == 4503599627370497.0) { "round(2^52 + 1)" }
    check(pyreonRound(1e300) == 1e300) { "round(1e300)" }
    check(1.0 / pyreonRound(-0.4) == Double.NEGATIVE_INFINITY) { "round(-0.4) is -0" }
    check(pyreonRound(Double.NaN).isNaN()) { "round(NaN)" }
    check(pyreonRound(Double.POSITIVE_INFINITY) == Double.POSITIVE_INFINITY) { "round(Infinity)" }
    check((pyreonRound(Double.NaN) + 1.0).toLong() == 0L) { "round(NaN) + 1 stored" }
    println("[PyreonNumberTest] all smoke tests passed")
}
