package com.pyreon.runtime

import androidx.compose.runtime.mutableStateOf
import kotlin.math.abs
import kotlin.math.floor

// PyreonDragDrop — the Android-native port of @pyreon/dnd's `useDraggable` / `useDroppable`.
//
// The web hooks register DOM elements with pragmatic-drag-and-drop. That engine does NOT cross: a drag on Android is
// a platform gesture. What DOES cross is what an author reasons about — WHAT is carried (`data`), WHERE it may land
// (`canDrop`), WHAT happens on landing (`onDrop(source, { edge })`) and the hover state a target renders (`isOver`,
// `overEdge`). The Compose gesture layer lives in PyreonDragDropModifier.kt so THIS file stays dependency-free and
// headlessly verifiable, like PyreonSortable.kt.
//
// The PAYLOAD is JSON text, byte-identical to what the Swift draggable writes (sorted keys, the same number
// formatting), so a drag crosses platforms and the web with no shared type: a draggable carries a map of scalars and
// a droppable decodes it into whatever type its `onDrop` parameter is annotated with.

/** The JSON text a drag carries. Keys are sorted so one `data` always serialises to the same string. */
object PyreonDragPayload {
    fun encode(data: Map<String, Any?>): String =
        data.entries.sortedBy { it.key }.joinToString(prefix = "{", postfix = "}", separator = ",") { (key, value) ->
            "${quote(key)}:${scalar(value)}"
        }

    private fun scalar(value: Any?): String = when (value) {
        null -> "null"
        is Boolean -> value.toString()
        is Int, is Long -> value.toString()
        is Number -> number(value.toDouble())
        else -> quote(value.toString())
    }

    // A whole-valued double prints without ".0" — the Swift JSONEncoder spelling — so an `Int` field decodes on
    // either side of a cross-platform drag.
    private fun number(d: Double): String =
        if (d == floor(d) && abs(d) < 1e15) d.toLong().toString() else d.toString()

    private fun quote(text: String): String {
        val out = StringBuilder("\"")
        for (c in text) {
            when (c) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> if (c < ' ') out.append("\\u%04x".format(c.code)) else out.append(c)
            }
        }
        return out.append('"').toString()
    }
}

/**
 * Where a drop landed — the second argument of `onDrop(source, location)`. [edge] is the nearest CONFIGURED edge
 * (`null` when the droppable configured none), captured before the hover state resets, as on the web.
 */
data class PyreonDropLocation(val edge: String?)

/**
 * Which draggable is mid-drag, so a drop landing anywhere can clear its `isDragging`. One slot, replaced on every
 * drag start — bounded by construction, no registry to leak.
 */
object PyreonDragSession {
    private var finishActive: (() -> Unit)? = null

    fun begin(finish: () -> Unit) {
        finishActive?.invoke()
        finishActive = finish
    }

    fun finish() {
        val done = finishActive
        finishActive = null
        done?.invoke()
    }
}

/**
 * The nearest of the configured [edges] to ([x], [y]) inside a [width]×[height] box — pdnd's closest-edge, over
 * only the edges the author asked for. `null` with no edges configured.
 */
fun pyreonClosestEdge(x: Float, y: Float, width: Float, height: Float, edges: List<PyreonDropEdge>): PyreonDropEdge? {
    var best: PyreonDropEdge? = null
    var bestDistance = Float.MAX_VALUE
    for (edge in edges) {
        val distance = when (edge) {
            PyreonDropEdge.TOP -> y
            PyreonDropEdge.BOTTOM -> height - y
            PyreonDropEdge.LEFT -> x
            PyreonDropEdge.RIGHT -> width - x
        }
        if (distance < bestDistance) {
            best = edge
            bestDistance = distance
        }
    }
    return best
}

/** Draggable state. The data source is wired through [bind] in the composable body. */
class PyreonDraggableState {
    private var dataProvider: () -> Map<String, Any?> = { emptyMap() }
    private var disabledProvider: () -> Boolean = { false }
    private val _dragging = mutableStateOf(false)

    /** True from drag start until the next drop (a cancelled drag is reported by [end] from the gesture layer). */
    val dragging: Boolean
        get() = _dragging.value

    fun bind(data: () -> Map<String, Any?>, disabled: () -> Boolean = { false }) {
        dataProvider = data
        disabledProvider = disabled
    }

    // The web result surface, name-for-name (`isDragging`), so a row template compiles unchanged.
    fun isDragging(): Boolean = dragging
    fun isDisabled(): Boolean = disabledProvider()

    /** The drag lifted: mark it and hand back the JSON payload. */
    fun begin(): String {
        _dragging.value = true
        PyreonDragSession.begin { end() }
        return PyreonDragPayload.encode(dataProvider())
    }

    fun end() {
        _dragging.value = false
    }
}

/**
 * Droppable state: whether a drag hovers, the nearest configured edge, and the sinks. [decode] turns the payload text
 * into the type the author's `onDrop` parameter names; it returns `null` for a payload of the wrong shape, which
 * refuses the drop rather than crashing it.
 */
class PyreonDroppableState<S>(
    val edges: List<PyreonDropEdge> = emptyList(),
    private val decode: (String) -> S?,
) {
    private var canDropFn: (S) -> Boolean = { true }
    private var onDropFn: (S, PyreonDropLocation) -> Unit = { _, _ -> }
    private var onEnterFn: () -> Unit = {}
    private var onLeaveFn: () -> Unit = {}

    private val _over = mutableStateOf(false)
    private val _edge = mutableStateOf<PyreonDropEdge?>(null)

    val over: Boolean
        get() = _over.value
    val edge: PyreonDropEdge?
        get() = _edge.value

    fun bind(
        canDrop: (S) -> Boolean = { true },
        onDrop: (S, PyreonDropLocation) -> Unit = { _, _ -> },
        onDragEnter: () -> Unit = {},
        onDragLeave: () -> Unit = {},
    ) {
        canDropFn = canDrop
        onDropFn = onDrop
        onEnterFn = onDragEnter
        onLeaveFn = onDragLeave
    }

    fun isOver(): Boolean = over
    fun overEdge(): String? = edge?.name?.lowercase()

    fun enter() {
        if (!over) onEnterFn()
        _over.value = true
    }

    fun move(x: Float, y: Float, width: Float, height: Float) {
        _edge.value = pyreonClosestEdge(x, y, width, height, edges)
    }

    fun leave() {
        if (over) onLeaveFn()
        _over.value = false
        _edge.value = null
    }

    /**
     * A drop landed with [text] as its payload. Returns whether it was accepted. The edge is captured BEFORE the
     * hover state resets, as on the web.
     */
    fun accept(text: String, x: Float, y: Float, width: Float, height: Float): Boolean {
        val landed = pyreonClosestEdge(x, y, width, height, edges)
        _over.value = false
        _edge.value = null
        val source = decode(text)
        if (source == null || !canDropFn(source)) {
            PyreonDragSession.finish()
            return false
        }
        onDropFn(source, PyreonDropLocation(landed?.name?.lowercase()))
        PyreonDragSession.finish()
        return true
    }
}
