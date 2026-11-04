// The well-formed prefix of an SVG path-data string.
//
// SVG's error rule (SVG 2, "Error handling in path data"): render the path up to
// the last command that parsed completely, and drop the rest. Browsers do this,
// and so does the iOS runtime (`PyreonSVGPathParser` in PyreonCanvas.swift
// stops at the first bad token and keeps what it parsed).
//
// androidx `PathParser` does not: it THROWS on an unknown command such as `X`,
// and `PyreonShapeSpec.Svg` then drew NOTHING — so `M10 10 L20 20 X 5 5` drew a
// line on the web and on iOS and an empty canvas on Android. Feeding the parser
// this prefix gives all three targets the same picture.
//
// The grammar mirrors the Swift parser exactly, so the two runtimes cut a
// malformed string at the same place:
//   - commands M L H V C S Q T A Z, absolute and lowercase-relative;
//   - separators are space, comma, \n, \t, \r;
//   - implicit repeats after a command (M/m repeat as L/l; Z/z takes none);
//   - data must start with a command;
//   - a command whose arguments are incomplete is dropped whole.
//
// Dependency-free on purpose: it lives outside PyreonCanvas.kt (which needs the
// Android SDK) so `run-kotlin-tests` can actually RUN its test.

package com.pyreon.runtime

/** The longest prefix of [d] made of complete, valid path commands. */
fun pyreonSvgPathValidPrefix(d: String): String {
    var i = 0
    val n = d.length

    fun skipSeparators() {
        while (i < n && (d[i] == ' ' || d[i] == ',' || d[i] == '\n' || d[i] == '\t' || d[i] == '\r')) i++
    }

    fun isDigit(c: Char) = c in '0'..'9'

    // optional sign, digits, optional fraction, optional exponent.
    fun number(): Boolean {
        skipSeparators()
        val begin = i
        if (i < n && (d[i] == '+' || d[i] == '-')) i++
        var digits = false
        while (i < n && isDigit(d[i])) { i++; digits = true }
        if (i < n && d[i] == '.') {
            i++
            while (i < n && isDigit(d[i])) { i++; digits = true }
        }
        if (!digits) { i = begin; return false }
        if (i < n && (d[i] == 'e' || d[i] == 'E')) {
            var j = i + 1
            if (j < n && (d[j] == '+' || d[j] == '-')) j++
            if (j < n && isDigit(d[j])) {
                i = j
                while (i < n && isDigit(d[i])) i++
            }
        }
        return true
    }

    // an arc flag: a single 0 / 1, needing no separator after it.
    fun flag(): Boolean {
        skipSeparators()
        if (i < n && (d[i] == '0' || d[i] == '1')) { i++; return true }
        return false
    }

    fun numbers(count: Int): Boolean {
        repeat(count) { if (!number()) return false }
        return true
    }

    fun apply(cmd: Char): Boolean = when (cmd.uppercaseChar()) {
        'M', 'L', 'T' -> numbers(2)
        'H', 'V' -> numbers(1)
        'C' -> numbers(6)
        'S', 'Q' -> numbers(4)
        'A' -> numbers(3) && flag() && flag() && numbers(2)
        'Z' -> true
        else -> false
    }

    var end = 0
    var command: Char? = null
    while (true) {
        skipSeparators()
        if (i >= n) break
        val c = d[i]
        val cmd: Char
        if (c.isLetter()) {
            cmd = c
            i++
        } else {
            cmd = command ?: break // data must start with a command
        }
        if (!apply(cmd)) break
        end = i
        command = when (cmd) {
            'M' -> 'L'
            'm' -> 'l'
            'Z', 'z' -> null
            else -> cmd
        }
    }
    return d.substring(0, end)
}
