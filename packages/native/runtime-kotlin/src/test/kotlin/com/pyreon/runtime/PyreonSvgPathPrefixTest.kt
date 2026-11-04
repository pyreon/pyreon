// The Android half of SVG's path-data error rule: render up to the first bad
// command. Every expectation here is what the iOS parser keeps for the same
// input (PyreonCanvasTests.swift) and what a browser draws.

package com.pyreon.runtime

private fun expectPrefix(d: String, want: String) {
    val got = pyreonSvgPathValidPrefix(d)
    check(got == want) { "pyreonSvgPathValidPrefix(\"$d\") should be \"$want\", got=\"$got\"" }
}

fun main() {
    // Well-formed input passes through untouched.
    expectPrefix("M10 10 L20 20", "M10 10 L20 20")
    expectPrefix("M0 10 A10 10 0 0 1 20 10 Z", "M0 10 A10 10 0 0 1 20 10 Z")
    expectPrefix("M0 10a10 10 0 0120 0", "M0 10a10 10 0 0120 0")
    expectPrefix("M0 0 10 10 20 0", "M0 0 10 10 20 0") // implicit linetos
    expectPrefix("M1e2 1.5.5 2", "M1e2 1.5.5 2") // `1.5.5` is 1.5, .5
    expectPrefix("M1e2 1.5.5", "M1e2 1.5") // ...so the implicit L lacks its y

    // An unknown command keeps everything before it — the reported case.
    expectPrefix("M10 10 L20 20 X 5 5", "M10 10 L20 20")
    // An incomplete command is dropped whole.
    expectPrefix("M0 0 L10 10 L", "M0 0 L10 10")
    expectPrefix("M0 0 C1 1 2 2 3", "M0 0")
    expectPrefix("M0 0 A10 10 0 2 1 5 5", "M0 0") // a flag must be 0 or 1
    // Numbers after Z have no command to belong to.
    expectPrefix("M0 0 L5 5 Z 3 3", "M0 0 L5 5 Z")

    // Nothing valid at all.
    expectPrefix("garbage", "")
    expectPrefix("", "")
    expectPrefix("10 10 L5 5", "")
    println("[PyreonSvgPathPrefixTest] all smoke tests passed")
}
