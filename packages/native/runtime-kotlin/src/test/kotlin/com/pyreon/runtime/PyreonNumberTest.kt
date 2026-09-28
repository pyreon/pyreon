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
    println("[PyreonNumberTest] all smoke tests passed")
}
