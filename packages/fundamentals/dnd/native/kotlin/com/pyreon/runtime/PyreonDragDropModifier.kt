package com.pyreon.runtime

import android.content.ClipData
import android.content.ClipDescription
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.draganddrop.dragAndDropSource
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.DragAndDropTransferData
import androidx.compose.ui.draganddrop.toAndroidDragEvent
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import kotlinx.serialization.json.Json

// The Compose gesture half of @pyreon/dnd's `useDraggable` / `useDroppable`, split out of PyreonDragDrop.kt so the
// state engine stays dependency-free and headlessly verifiable (see that file's header). Declared
// `pyreon.native.kotlinSdkOnly`: the co-source stub harness models no Compose drag-and-drop surface, so this file is
// verified by the Android device gate, not by `check-native-cosource`.
//
// LONG-PRESS-THEN-DRAG is the Android drag idiom, so the source starts a platform drag session from a long press
// (`dragAndDropSource` + `startTransfer`) and the target is a platform `DragAndDropTarget`, which also receives drags
// from OTHER apps in multi-window. The payload crosses as plain text, so a target never needs the source's type.

/** Decode a drag payload into the type a droppable's `onDrop` names; `null` for the wrong shape (the drop is refused). */
inline fun <reified S> pyreonDecodeDrag(text: String): S? =
    try {
        Json { ignoreUnknownKeys = true }.decodeFromString<S>(text)
    } catch (_: Exception) {
        null
    }

private class DropBox {
    var x = 0f
    var y = 0f
    var width = 0f
    var height = 0f
}

private const val PYREON_DRAG_LABEL = "pyreon-drag"

/**
 * Make this composable a drag source of [state]. Emitted by PMTC for `ref={d.ref}` on a `useDraggable`.
 */
@OptIn(ExperimentalFoundationApi::class)
fun Modifier.pyreonDraggable(state: PyreonDraggableState): Modifier =
    if (state.isDisabled()) {
        this
    } else {
        // The transfer-data overload: Compose starts the drag itself after a long press and calls this with the press
        // position, so there is no gesture detector to write (and none to get wrong).
        this.dragAndDropSource { _ ->
            DragAndDropTransferData(clipData = ClipData.newPlainText(PYREON_DRAG_LABEL, state.begin()))
        }
    }

/**
 * Make this composable a drop target of [state]. Emitted by PMTC for `ref={d.ref}` on a `useDroppable`.
 */
@Composable
@OptIn(ExperimentalFoundationApi::class)
fun <S> Modifier.pyreonDroppable(state: PyreonDroppableState<S>): Modifier {
    // The box the target occupies in the root, so the platform's root-relative drag coordinates become local ones.
    // Remembered, because a Modifier extension re-runs on every recomposition and a plain local would reset.
    val box = remember { DropBox() }
    val target = remember(state) { object : DragAndDropTarget {
        override fun onEntered(event: DragAndDropEvent) {
            state.enter()
        }

        override fun onMoved(event: DragAndDropEvent) {
            val drag = event.toAndroidDragEvent()
            state.move(drag.x - box.x, drag.y - box.y, box.width, box.height)
        }

        override fun onExited(event: DragAndDropEvent) {
            state.leave()
        }

        override fun onDrop(event: DragAndDropEvent): Boolean {
            val drag = event.toAndroidDragEvent()
            val text = drag.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.text?.toString()
                ?: return false.also { state.leave() }
            return state.accept(text, drag.x - box.x, drag.y - box.y, box.width, box.height)
        }
    } }
    return this
        .onGloballyPositioned { coords ->
            val origin = coords.positionInRoot()
            box.x = origin.x
            box.y = origin.y
            box.width = coords.size.width.toFloat()
            box.height = coords.size.height.toFloat()
        }
        .dragAndDropTarget(
            shouldStartDragAndDrop = { event ->
                event.toAndroidDragEvent().clipDescription?.hasMimeType(ClipDescription.MIMETYPE_TEXT_PLAIN) == true
            },
            target = target,
        )
}
