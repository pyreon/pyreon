package com.pyreon.runtime

import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput

// The Compose gesture half of @pyreon/dnd's `useSortable`, split out of
// PyreonSortable.kt so the state engine stays dependency-free and headlessly
// verifiable (see that file's header). This file is declared
// `pyreon.native.kotlinSdkOnly` — the co-source stub harness models no Compose
// gesture surface, so it is verified by the Android device gate and by the
// emit-level `validateKotlin` stubs, not by `check-native-cosource`.
//
// LONG-PRESS-THEN-DRAG is the Android reorder idiom (what every reorderable
// list uses, and what Material specifies), so this is the platform's own
// gesture rather than a port of the web's pointer protocol. The DISPLACEMENT
// model it implies — drag N row-heights, move N slots — differs from iOS's
// drop-target model on purpose; both funnel into `PyreonSortableState`, so the
// resulting list is identical on every target.
//
// `PointerInputScope.size` is the dragged row's own measured size, which is
// what makes a global bounds registry unnecessary: a slot is one row-extent.

/**
 * Make this composable a sortable item of [state], identified by [key].
 * Emitted by PMTC for `ref={s.itemRef(key)}`.
 */
fun <T> Modifier.pyreonSortableItem(state: PyreonSortableState<T>, key: String): Modifier =
    this.pointerInput(key) {
        val extent =
            if (state.axis == PyreonSortAxis.VERTICAL) size.height.toFloat()
            else size.width.toFloat()
        detectDragGesturesAfterLongPress(
            onDragStart = { state.pickUp(key) },
            onDragEnd = { state.drop() },
            onDragCancel = { state.cancel() },
            onDrag = { change, dragAmount ->
                change.consume()
                val delta =
                    if (state.axis == PyreonSortAxis.VERTICAL) dragAmount.y else dragAmount.x
                state.dragBy(delta, extent)
            },
        )
    }

/**
 * Mark this composable as the sortable CONTAINER of [state]. Emitted by PMTC
 * for `ref={s.containerRef}`.
 *
 * Deliberately a no-op on Android: the displacement gesture is entirely
 * per-item (a slot is one row extent, read from the item's own
 * `PointerInputScope.size`), so unlike SwiftUI — where the container supplies
 * the accessibility grouping the flattened view tree would otherwise lose —
 * there is nothing for a Compose container to carry. It exists so ONE source
 * emits on both targets without the compiler needing a per-target branch, and
 * so the seam is already here if container-level wiring is ever needed.
 */
@Suppress("UNUSED_PARAMETER")
fun <T> Modifier.pyreonSortableContainer(state: PyreonSortableState<T>): Modifier = this
