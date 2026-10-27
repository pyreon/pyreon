// PyreonDragDrop behaviour assertions (iOS). NOT @main: PyreonSortableTests owns this directory's single entry point
// and calls runAll(). The payload is JSON text, so these pin the wire format a draggable
// writes and a droppable reads — the Kotlin twin (PyreonDragDropTest.kt) asserts the SAME strings, which is what
// keeps a drag from an iOS draggable landing on an Android droppable (or the web's) decodable on every side.

import Foundation

private struct Card: Decodable {
    let id: String
    let kind: String
}

@available(iOS 17.0, macOS 14.0, *)
struct PyreonDragDropTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonDragDropTests: \(m)") }
    }

    static func runAll() {
        // ── 1. the wire format: sorted keys, scalars keep their JSON type ───────
        let text = PyreonDragPayload.encode([
            "kind": PyreonDragValue("card"),
            "id": PyreonDragValue("c1"),
            "n": PyreonDragValue(3),
            "ratio": PyreonDragValue(0.5),
            "done": PyreonDragValue(true),
        ])
        check(text == #"{"done":true,"id":"c1","kind":"card","n":3,"ratio":0.5}"#, "wire format \(text)")

        // ── 2. decoding: a matching shape decodes, a foreign string is refused ──
        let card = PyreonDragPayload.decode(#"{"id":"c1","kind":"card"}"#, as: Card.self)
        check(card?.id == "c1" && card?.kind == "card", "decodes a matching payload")
        check(PyreonDragPayload.decode("just text", as: Card.self) == nil, "foreign text is refused")
        check(PyreonDragPayload.decode(#"{"id":"c1"}"#, as: Card.self) == nil, "missing field is refused")

        // ── 3. draggable: begin() marks the drag and returns the bound data ─────
        let drag = PyreonDraggableState()
        drag.bind(data: { ["id": PyreonDragValue("c9"), "kind": PyreonDragValue("card")] })
        check(!drag.isDragging(), "idle before begin")
        let payload = drag.begin()
        check(payload == #"{"id":"c9","kind":"card"}"#, "begin returns the payload \(payload)")
        check(drag.isDragging(), "dragging after begin")
        PyreonDragSession.finish()
        check(!drag.isDragging(), "a drop anywhere clears isDragging")

        let off = PyreonDraggableState()
        off.bind(data: { [:] }, disabled: { true })
        check(off.isDisabled(), "disabled is read live")

        // ── 4. droppable: accept runs canDrop then onDrop with the landing edge ─
        var dropped: [String] = []
        var enters = 0
        var leaves = 0
        let size = CGSize(width: 100, height: 100)
        let drop = PyreonDroppableState<Card>(edges: [.top, .bottom])
        drop.bind(
            canDrop: { $0.kind == "card" },
            onDrop: { src, loc in dropped.append("\(src.id)@\(loc.edge ?? "none")") },
            onDragEnter: { enters += 1 },
            onDragLeave: { leaves += 1 }
        )
        drop.enter()
        drop.enter()
        check(enters == 1, "enter fires once per hover, got \(enters)")
        check(drop.isOver(), "over after enter")
        drop.move(CGPoint(x: 50, y: 90), in: size)
        check(drop.overEdge() == "bottom", "nearest configured edge is bottom, got \(String(describing: drop.overEdge()))")
        check(drop.accept(#"{"id":"c1","kind":"card"}"#, at: CGPoint(x: 50, y: 10), in: size), "valid drop accepted")
        check(dropped == ["c1@top"], "onDrop got the LANDING edge: \(dropped)")
        check(!drop.isOver() && drop.overEdge() == nil, "drop resets the hover state")

        check(!drop.accept(#"{"id":"c2","kind":"note"}"#, at: .zero, in: size), "canDrop false is rejected")
        check(!drop.accept("not json", at: .zero, in: size), "a foreign payload is rejected")
        check(dropped == ["c1@top"], "rejected drops never reach onDrop")

        drop.enter()
        drop.leave()
        check(leaves == 1 && !drop.isOver(), "leave fires once and clears")
        drop.leave()
        check(leaves == 1, "a stray leave does not re-fire")

        // ── 5. no edges configured → the edge is nil, as on the web ─────────────
        let plain = PyreonDroppableState<Card>()
        plain.move(CGPoint(x: 1, y: 1), in: size)
        check(plain.overEdge() == nil, "no edges configured means no edge")

        // ── 6. horizontal edges pick left/right ─────────────────────────────────
        check(pyreonClosestEdge(CGPoint(x: 5, y: 50), in: size, edges: [.left, .right]) == .left, "left")
        check(pyreonClosestEdge(CGPoint(x: 95, y: 50), in: size, edges: [.left, .right]) == .right, "right")

        print("PyreonDragDropTests: ok")
    }
}
