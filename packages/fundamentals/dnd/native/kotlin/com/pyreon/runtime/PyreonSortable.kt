package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf
import kotlin.math.roundToInt

// PyreonSortable — the Android-native port of @pyreon/dnd's `useSortable`.
//
// The web hook is pointer-driven (pragmatic-drag-and-drop over DOM events).
// That engine does NOT cross: a drag on Android is a platform gesture. What
// DOES cross is the REORDER SEMANTICS — which item is lifted, which item it is
// over, which EDGE of that item is nearest, and where the moved element lands.
// `moveIndex` below is a verbatim port of the TypeScript `performReorder`
// arithmetic, and the Swift port routes through the identical primitive, so a
// reorder produces the SAME list on web, iOS and Android.
//
// This file is deliberately PURE: the only Compose dependency is
// `mutableStateOf` (so a mutation recomposes a reader), exactly like
// PyreonTableState.kt. There is no gesture code here — the long-press drag is
// EMITTED into the app's own composable by PMTC, following the same shape
// `<Press onSwipeLeft>` already uses (`pointerInput` +
// `detectDragGesturesAfterLongPress`). Keeping the gesture in the emit rather
// than the runtime is what lets `validateKotlin` type-check it against the
// mirrored Compose stubs, and lets this file be verified headlessly by
// `check-native-cosource` with no Compose-UI stub bundle at all.
//
// Android's drag model is DISPLACEMENT-based (long-press, then move by whole
// slots) where iOS is DROP-TARGET-based. Both funnel into `moveIndex`, so the
// gesture differs per platform — as it should — while the RESULT does not.

/** Which way the list runs. Mirrors the web `axis` option. */
enum class PyreonSortAxis { VERTICAL, HORIZONTAL }

/** The edge of the hovered item nearest the pointer — the insert side. */
enum class PyreonDropEdge { TOP, BOTTOM, LEFT, RIGHT }

/**
 * Sortable-list state: which key is lifted, which key it is over, and the edge
 * of that key. Backed by `mutableStateOf` so a drag recomposes the rows that
 * read `isActive` / `isOver`.
 */
class PyreonSortableState<T>(
    val axis: PyreonSortAxis = PyreonSortAxis.VERTICAL,
) {
    private var itemsProvider: () -> List<T> = { emptyList() }
    private var keyOf: (T) -> String = { "" }
    private var onReorderFn: (List<T>) -> Unit = {}

    private val _activeKey = mutableStateOf<String?>(null)
    /** The key of the item being dragged, `null` when idle. */
    val activeKey: String?
        get() = _activeKey.value

    private val _overKey = mutableStateOf<String?>(null)
    /** The key of the item currently hovered, `null` when none. */
    val overKey: String?
        get() = _overKey.value

    private val _currentEdge = mutableStateOf<PyreonDropEdge?>(null)
    /** The nearest edge of [overKey], `null` when none. */
    val currentEdge: PyreonDropEdge?
        get() = _currentEdge.value

    // Accumulated drag distance along the axis, in pixels, since pick-up, and
    // the dragged row's extent (height for a vertical list). Plain fields, not
    // Compose state: they change on every pointer sample and nothing renders
    // them directly — the derived slot delta lands in _overKey, which does.
    private var dragAccum: Float = 0f
    private var itemExtent: Float = 0f

    /** Wire the reactive item source + reorder sink. */
    fun bind(items: () -> List<T>, by: (T) -> String, onReorder: (List<T>) -> Unit) {
        itemsProvider = items
        keyOf = by
        onReorderFn = onReorder
    }

    // ── the web result surface, name-for-name ────────────────────────────────
    // `useSortable` returns `isActive` / `isOverKey` / `activeId` / `overId` /
    // `overEdge`, so the native engine spells them IDENTICALLY and returns the
    // same value shapes (edge as its lowercase string). That is what lets a row
    // template compile unchanged on all three targets with no compiler-side
    // name mapping.
    fun isActive(key: String): Boolean = activeKey == key
    fun isOverKey(key: String): Boolean = overKey == key
    fun activeId(): String? = activeKey
    fun overId(): String? = overKey
    fun overEdge(): String? = currentEdge?.name?.lowercase()

    // ── drag lifecycle ───────────────────────────────────────────────────────
    /** The long-press lifted `key`. */
    fun pickUp(key: String) {
        _activeKey.value = key
        dragAccum = 0f
        itemExtent = 0f
    }

    /**
     * Accumulate a drag sample. [delta] is this frame's movement along the
     * axis and [extent] the dragged row's size on that axis (Compose hands
     * both to the emitted gesture: the drag amount and `PointerInputScope.size`).
     *
     * A zero/negative extent is ignored rather than dividing — a row measured
     * before layout reports 0, and a divide there would send the slot delta to
     * infinity and reorder the list on the first pixel of movement.
     */
    fun dragBy(delta: Float, extent: Float) {
        if (extent > 0f) itemExtent = extent
        dragAccum += delta
        val active = activeKey ?: return
        val slots = slotDelta()
        if (slots == 0) {
            _overKey.value = null
            _currentEdge.value = null
            return
        }
        val current = itemsProvider()
        val from = current.indexOfFirst { keyOf(it) == active }
        if (from < 0) return
        val target = (from + slots).coerceIn(0, current.size - 1)
        _overKey.value = keyOf(current[target])
        _currentEdge.value = if (slots > 0) {
            if (axis == PyreonSortAxis.VERTICAL) PyreonDropEdge.BOTTOM else PyreonDropEdge.RIGHT
        } else {
            if (axis == PyreonSortAxis.VERTICAL) PyreonDropEdge.TOP else PyreonDropEdge.LEFT
        }
    }

    /** How many whole slots the accumulated drag covers. */
    private fun slotDelta(): Int =
        if (itemExtent <= 0f) 0 else (dragAccum / itemExtent).roundToInt()

    /**
     * Commit the drag. Returns `true` when the list actually changed.
     */
    fun drop(): Boolean {
        val active = activeKey
        val slots = slotDelta()
        cancel()
        if (active == null || slots == 0) return false
        val current = itemsProvider()
        val from = current.indexOfFirst { keyOf(it) == active }
        if (from < 0) return false
        val to = (from + slots).coerceIn(0, current.size - 1)
        if (to == from) return false
        onReorderFn(moveIndex(current, from, to))
        return true
    }

    /** The drag ended without a drop. */
    fun cancel() {
        _activeKey.value = null
        _overKey.value = null
        _currentEdge.value = null
        dragAccum = 0f
        itemExtent = 0f
    }

    // ── the shared reorder algorithm ─────────────────────────────────────────
    /**
     * Pure reorder: move `dragKey` next to `dropKey`, inserting on `edge`'s
     * side. Returns `null` when the move is a no-op (same key, or either key
     * missing) — matching the TypeScript `performReorder` guards exactly.
     *
     * Not on the Android gesture path (which is displacement-based) but kept
     * as the CROSS-PLATFORM contract: it is the shape the web engine and the
     * iOS drop destination both use, and the parity test asserts all three
     * agree.
     */
    fun reordered(dragKey: String, dropKey: String, edge: PyreonDropEdge): List<T>? {
        if (dragKey == dropKey) return null
        val current = itemsProvider()
        val dragIndex = current.indexOfFirst { keyOf(it) == dragKey }
        val dropIndex = current.indexOfFirst { keyOf(it) == dropKey }
        if (dragIndex < 0 || dropIndex < 0) return null

        val after = edge == PyreonDropEdge.BOTTOM || edge == PyreonDropEdge.RIGHT
        val rawInsert = if (after) {
            if (dropIndex >= dragIndex) dropIndex else dropIndex + 1
        } else {
            if (dropIndex <= dragIndex) dropIndex else dropIndex - 1
        }
        return moveIndex(current, dragIndex, rawInsert)
    }

    companion object {
        /**
         * Move the element at [from] so that it sits at [to], where [to] is an
         * index in the list WITHOUT the moved element. The single mutation
         * primitive every platform routes through.
         */
        fun <T> moveIndex(list: List<T>, from: Int, to: Int): List<T> {
            val out = list.toMutableList()
            val moved = out.removeAt(from)
            out.add(to.coerceIn(0, out.size), moved)
            return out
        }
    }
}
