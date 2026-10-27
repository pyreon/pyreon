// PyreonDragDrop behaviour assertions (Android). The wire strings are IDENTICAL to PyreonDragDropTests.swift's — that
// is the point: a drag from an iOS draggable must decode on an Android droppable (and the web's) and back.

import com.pyreon.runtime.PyreonDragPayload
import com.pyreon.runtime.PyreonDragSession
import com.pyreon.runtime.PyreonDraggableState
import com.pyreon.runtime.PyreonDropEdge
import com.pyreon.runtime.PyreonDroppableState
import com.pyreon.runtime.pyreonClosestEdge

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonDragDropTest: $msg")
}

// A hand-rolled decoder: the cosource harness has no kotlinx, and the real emit supplies a kotlinx one.
private data class Card(val id: String, val kind: String)

private fun decodeCard(text: String): Card? {
    val id = Regex("\"id\":\"([^\"]*)\"").find(text)?.groupValues?.get(1) ?: return null
    val kind = Regex("\"kind\":\"([^\"]*)\"").find(text)?.groupValues?.get(1) ?: return null
    return Card(id, kind)
}

fun main() {
    // ── 1. the wire format: sorted keys, scalars keep their JSON type ───────────
    val text = PyreonDragPayload.encode(
        mapOf("kind" to "card", "id" to "c1", "n" to 3, "ratio" to 0.5, "done" to true),
    )
    check(text == """{"done":true,"id":"c1","kind":"card","n":3,"ratio":0.5}""", "wire format $text")
    check(PyreonDragPayload.encode(mapOf("n" to 2.0)) == """{"n":2}""", "a whole double prints without .0")
    check(PyreonDragPayload.encode(mapOf("s" to "a\"b\\c\n")) == """{"s":"a\"b\\c\n"}""", "string escapes")

    // ── 2. draggable: begin() marks the drag and returns the bound data ─────────
    val drag = PyreonDraggableState()
    drag.bind({ mapOf("id" to "c9", "kind" to "card") })
    check(!drag.isDragging(), "idle before begin")
    val payload = drag.begin()
    check(payload == """{"id":"c9","kind":"card"}""", "begin returns the payload $payload")
    check(drag.isDragging(), "dragging after begin")
    PyreonDragSession.finish()
    check(!drag.isDragging(), "a drop anywhere clears isDragging")

    val off = PyreonDraggableState()
    off.bind({ emptyMap() }, { true })
    check(off.isDisabled(), "disabled is read live")

    // ── 3. droppable: accept runs canDrop then onDrop with the landing edge ─────
    val dropped = mutableListOf<String>()
    var enters = 0
    var leaves = 0
    val drop = PyreonDroppableState<Card>(listOf(PyreonDropEdge.TOP, PyreonDropEdge.BOTTOM), ::decodeCard)
    drop.bind(
        canDrop = { it.kind == "card" },
        onDrop = { src, loc -> dropped.add("${src.id}@${loc.edge ?: "none"}") },
        onDragEnter = { enters += 1 },
        onDragLeave = { leaves += 1 },
    )
    drop.enter()
    drop.enter()
    check(enters == 1, "enter fires once per hover, got $enters")
    check(drop.isOver(), "over after enter")
    drop.move(50f, 90f, 100f, 100f)
    check(drop.overEdge() == "bottom", "nearest configured edge is bottom, got ${drop.overEdge()}")
    check(drop.accept("""{"id":"c1","kind":"card"}""", 50f, 10f, 100f, 100f), "valid drop accepted")
    check(dropped == listOf("c1@top"), "onDrop got the LANDING edge: $dropped")
    check(!drop.isOver() && drop.overEdge() == null, "drop resets the hover state")

    check(!drop.accept("""{"id":"c2","kind":"note"}""", 0f, 0f, 100f, 100f), "canDrop false is rejected")
    check(!drop.accept("not json", 0f, 0f, 100f, 100f), "a foreign payload is rejected")
    check(dropped == listOf("c1@top"), "rejected drops never reach onDrop")

    drop.enter()
    drop.leave()
    check(leaves == 1 && !drop.isOver(), "leave fires once and clears")
    drop.leave()
    check(leaves == 1, "a stray leave does not re-fire")

    // ── 4. no edges configured → the edge is null, as on the web ────────────────
    val plain = PyreonDroppableState<Card>(emptyList(), ::decodeCard)
    plain.move(1f, 1f, 100f, 100f)
    check(plain.overEdge() == null, "no edges configured means no edge")

    // ── 5. horizontal edges pick left/right ─────────────────────────────────────
    val sides = listOf(PyreonDropEdge.LEFT, PyreonDropEdge.RIGHT)
    check(pyreonClosestEdge(5f, 50f, 100f, 100f, sides) == PyreonDropEdge.LEFT, "left")
    check(pyreonClosestEdge(95f, 50f, 100f, 100f, sides) == PyreonDropEdge.RIGHT, "right")

    println("PyreonDragDropTest: ok")
}
