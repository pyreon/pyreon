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
