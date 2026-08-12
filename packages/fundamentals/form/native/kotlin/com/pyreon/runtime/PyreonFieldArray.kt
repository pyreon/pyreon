// PyreonFieldArray — the Compose half of `useFieldArray`, mirroring the web
// `@pyreon/form` surface one-for-one (items with STABLE KEYS + append /
// prepend / insert / remove / update / move / swap / replace / values).
// Sibling of the Swift PyreonFieldArray.swift — keep the two byte-aligned
// in semantics (both smoke suites assert the identical contract).
//
// ## Why stable keys are the load-bearing part
//
// A dynamic list of form inputs needs keyed reconciliation — removing row 1
// must not re-key rows 2..n, or every input below the removal loses its
// identity (and focus/IME state). The Compose lowering renders
// `items(array.items, key = { it.key })`; keys are monotonically-assigned
// Ints, never reused, exactly like the web's `nextKey++`.
//
// ## String-specialized (v1, deliberate)
//
// The web hook is generic; the native container is String-valued because
// the whole PMTC form vocabulary is String-typed. Documented divergence.
//
// ## Not form-bound
//
// Like the web hook: an independent reactive list, composed with
// `PyreonForm` in the component (submit reads `array.values()`).

package com.pyreon.runtime

import androidx.compose.runtime.mutableStateListOf

/** One keyed row. [key] is stable across mutations (never reused). */
public data class PyreonFieldArrayItem(
    public val key: Int,
    public val value: String,
)

/** Observable dynamic-list container — the Compose half of `useFieldArray`. */
public class PyreonFieldArray(initial: List<String> = emptyList()) {
    private var nextKey: Int = 0

    /** Reactive keyed rows — render with `items(array.items, key = { it.key })`.
     * A SnapshotStateList, so structural mutations recompose readers. */
    public val items = mutableStateListOf<PyreonFieldArrayItem>()

    init {
        initial.forEach { items.add(makeItem(it)) }
    }

    /** Number of rows (reactive through [items]). */
    public val length: Int get() = items.size

    private fun makeItem(value: String): PyreonFieldArrayItem =
        PyreonFieldArrayItem(key = nextKey++, value = value)

    /** Append a new row at the end. */
    public fun append(value: String) {
        items.add(makeItem(value))
    }

    /** Prepend a new row at the start — existing keys are untouched. */
    public fun prepend(value: String) {
        items.add(0, makeItem(value))
    }

    /** Insert a row at [index] (clamped to bounds — splice semantics). */
    public fun insert(index: Int, value: String) {
        val at = index.coerceIn(0, items.size)
        items.add(at, makeItem(value))
    }

    /** Remove the row at [index]. Out-of-bounds is a no-op, never a crash. */
    public fun remove(index: Int) {
        if (index !in items.indices) return
        items.removeAt(index)
    }

    /** Update the value at [index], KEEPING its key (row identity — and
     * focus — survives the edit). Out-of-bounds is a no-op. */
    public fun update(index: Int, value: String) {
        if (index !in items.indices) return
        items[index] = items[index].copy(value = value)
    }

    /** Move a row from one index to another. Invalid indices are a no-op. */
    public fun move(from: Int, to: Int) {
        if (from !in items.indices || to !in items.indices) return
        val item = items.removeAt(from)
        items.add(to, item)
    }

    /** Swap two rows by index. Invalid indices are a no-op. */
    public fun swap(indexA: Int, indexB: Int) {
        if (indexA !in items.indices || indexB !in items.indices) return
        val a = items[indexA]
        items[indexA] = items[indexB]
        items[indexB] = a
    }

    /** Replace ALL rows — every row gets a FRESH key (replace is a new
     * list, not an in-place edit — the web contract). */
    public fun replace(values: List<String>) {
        items.clear()
        values.forEach { items.add(makeItem(it)) }
    }

    /** All current values as a plain list (submit-handler shape). */
    public fun values(): List<String> = items.map { it.value }
}
