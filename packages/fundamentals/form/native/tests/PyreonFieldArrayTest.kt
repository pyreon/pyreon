// Smoke tests for PyreonFieldArray — the dynamic form-list container.
// Dependency-free `check(...)` harness; runs via
// `verify-kotlin.ts --service=PyreonFieldArray`.
//
// The asserted set is BYTE-ALIGNED with the Swift PyreonRuntimeTests
// field-array block and the web use-field-array tests — the cross-platform
// contract, with STABLE KEYS as the load-bearing clause (a removal must not
// re-key surviving rows, or every input below it loses identity/focus).

package com.pyreon.runtime

fun testFieldArrayInitialAndAppendKeys() {
    val arr = PyreonFieldArray(listOf("a", "b"))
    check(arr.length == 2) { "initial length" }
    check(arr.values() == listOf("a", "b")) { "initial values" }
    check(arr.items[0].key == 0 && arr.items[1].key == 1) { "initial keys 0,1" }
    arr.append("c")
    check(arr.items[2].key == 2) { "append continues the key sequence" }
}

fun testFieldArrayRemoveKeepsSurvivorKeys() {
    val arr = PyreonFieldArray(listOf("a", "b", "c"))
    arr.remove(1)
    check(arr.values() == listOf("a", "c")) { "b removed" }
    check(arr.items[0].key == 0 && arr.items[1].key == 2) {
        "survivor keys UNCHANGED (0,2) — re-keying would destroy row identity"
    }
    arr.append("d")
    check(arr.items[2].key == 3) { "keys are never reused after a removal" }
}

fun testFieldArrayUpdateKeepsKey() {
    val arr = PyreonFieldArray(listOf("a"))
    arr.update(0, "edited")
    check(arr.values() == listOf("edited")) { "value updated" }
    check(arr.items[0].key == 0) { "update keeps the row's key" }
}

fun testFieldArrayPrependInsertClamped() {
    val arr = PyreonFieldArray(listOf("b"))
    arr.prepend("a")
    check(arr.values() == listOf("a", "b")) { "prepend at head" }
    arr.insert(99, "z")
    check(arr.values() == listOf("a", "b", "z")) { "insert clamps to end (splice semantics)" }
    arr.insert(-5, "0")
    check(arr.values() == listOf("0", "a", "b", "z")) { "insert clamps to start" }
}

fun testFieldArrayMoveSwapReplace() {
    val arr = PyreonFieldArray(listOf("a", "b", "c"))
    arr.move(0, 2)
    check(arr.values() == listOf("b", "c", "a")) { "move 0→2" }
    arr.swap(0, 1)
    check(arr.values() == listOf("c", "b", "a")) { "swap 0,1" }
    val keysBefore = arr.items.map { it.key }
    arr.replace(listOf("x", "y"))
    check(arr.values() == listOf("x", "y")) { "replace swaps the whole list" }
    check(arr.items.none { it.key in keysBefore }) {
        "replace assigns FRESH keys (a new list, not an in-place edit)"
    }
}

fun testFieldArrayOutOfBoundsAreNoOps() {
    val arr = PyreonFieldArray(listOf("a"))
    arr.remove(5)
    arr.update(5, "x")
    arr.move(0, 9)
    arr.swap(0, 9)
    check(arr.values() == listOf("a")) { "OOB ops are no-ops, never crashes" }
}

fun main() {
    testFieldArrayInitialAndAppendKeys()
    testFieldArrayRemoveKeepsSurvivorKeys()
    testFieldArrayUpdateKeepsKey()
    testFieldArrayPrependInsertClamped()
    testFieldArrayMoveSwapReplace()
    testFieldArrayOutOfBoundsAreNoOps()
    println("[PyreonFieldArrayTest] all smoke tests passed")
}
