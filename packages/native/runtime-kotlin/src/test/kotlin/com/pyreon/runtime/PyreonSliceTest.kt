// pyreonSlice must return exactly what JavaScript's `slice` returns — in
// particular for a negative bound held in a variable, which is the case Kotlin's
// own `drop` / `takeLast` throw on.

package com.pyreon.runtime

private fun <T> expect(got: T, want: T, what: String) {
    check(got == want) { "$what should be $want, got=$got" }
}

fun main() {
    val xs = listOf(1, 2, 3, 4, 5)
    expect(pyreonSlice(xs, 2), listOf(3, 4, 5), "slice(2)")
    expect(pyreonSlice(xs, -2), listOf(4, 5), "slice(-2)")
    expect(pyreonSlice(xs, 1, -1), listOf(2, 3, 4), "slice(1, -1)")
    expect(pyreonSlice(xs, 2, -2), listOf(3), "slice(2, -2)")
    expect(pyreonSlice(xs, -10), listOf(1, 2, 3, 4, 5), "slice(-10) clamps to the start")
    expect(pyreonSlice(xs, 10), emptyList<Int>(), "slice(10) clamps to the end")
    expect(pyreonSlice(xs, 3, 1), emptyList<Int>(), "start >= end is empty")
    expect(pyreonSlice(xs, -1, -3), emptyList<Int>(), "a negative start past a negative end is empty")
    expect(pyreonSlice("hello", 1, -1), "ell", "string slice(1, -1)")
    expect(pyreonSlice("hello", -3), "llo", "string slice(-3)")
    println("[PyreonSliceTest] all smoke tests passed")
}
