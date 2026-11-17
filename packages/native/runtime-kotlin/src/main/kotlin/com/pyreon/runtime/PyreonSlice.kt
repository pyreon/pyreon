// JavaScript's `Array.prototype.slice` / `String.prototype.slice`.
//
// The compiler lowers `slice` with LITERAL bounds to Kotlin's own operations
// (`takeLast(2)`, `drop(1).dropLast(1)`), because a literal's sign is known. Any
// other bound goes through here: `drop(n)` / `takeLast(n)` throw when `n` is
// negative, while JavaScript reads a negative bound as counting from the end.
//
// Semantics, exactly JavaScript's: a negative bound is added to the length, both
// bounds are clamped to 0..size, and start >= end gives an empty result. Strings
// slice by UTF-16 unit, as JavaScript does.

package com.pyreon.runtime

public fun <T> pyreonSlice(a: List<T>, start: Long, end: Long? = null): List<T> {
    val (lo, hi) = pyreonSliceBounds(a.size, start, end)
    return if (lo < hi) a.subList(lo, hi).toList() else emptyList()
}

public fun pyreonSlice(s: String, start: Long, end: Long? = null): String {
    val (lo, hi) = pyreonSliceBounds(s.length, start, end)
    return if (lo < hi) s.substring(lo, hi) else ""
}

internal fun pyreonSliceBounds(size: Int, start: Long, end: Long?): Pair<Int, Int> {
    fun resolve(i: Long): Int = (if (i < 0) maxOf(size + i, 0L) else minOf(i, size.toLong())).toInt()
    return resolve(start) to resolve(end ?: size.toLong())
}

/**
 * JavaScript's `str.substring(start, end?)`: each bound clamped into `0..length` (a negative bound reads as 0), and
 * the two SWAPPED when `start > end`. Kotlin's own `String.substring` throws `StringIndexOutOfBoundsException` for
 * every one of those inputs — including the everyday truncation idiom `title.substring(0, 10)` on a shorter string.
 */
public fun pyreonSubstring(s: String, start: Long, end: Long? = null): String {
    fun clamp(i: Long): Int = maxOf(0L, minOf(i, s.length.toLong())).toInt()
    val a = clamp(start)
    val b = clamp(end ?: s.length.toLong())
    return if (a <= b) s.substring(a, b) else s.substring(b, a)
}

/**
 * JavaScript's `str.split(separator, limit?)` for a string separator. An EMPTY separator splits into UTF-16 code units
 * (`"a🙂".split("")` is three elements); Kotlin's own `split("")` adds an empty string at each end. An empty receiver
 * split by `""` is `[]`. A negative limit means no limit. (Twin of `PyreonSlice.swift`.)
 */
public fun pyreonSplit(s: String, separator: String, limit: Long? = null): List<String> {
    val parts = if (separator.isEmpty()) s.map { it.toString() } else s.split(separator)
    if (limit == null || limit < 0) return parts
    return parts.take(minOf(limit, Int.MAX_VALUE.toLong()).toInt())
}

/** `[...str]` / `Array.from(str)`: the string's CODE POINTS, as the web's string iterator yields them. */
public fun pyreonCodePoints(s: String): List<String> {
    val out = ArrayList<String>(s.length)
    var i = 0
    while (i < s.length) {
        val cp = s.codePointAt(i)
        val n = Character.charCount(cp)
        out.add(s.substring(i, i + n))
        i += n
    }
    return out
}
