// PyreonSortableState behaviour assertions (iOS). The expected arrays are
// GROUND TRUTH taken from running @pyreon/dnd's own `performReorder`
// arithmetic (use-sortable.ts) over the same seed — not hand-derived — so this
// test and its Kotlin twin pin all three platforms to one reorder semantic.

import Foundation

@available(iOS 17.0, macOS 14.0, *)
@main
struct PyreonSortableTests {
    static func check(_ c: Bool, _ m: String) {
        if !c { fatalError("PyreonSortableTests: \(m)") }
    }

    static func make(_ items: [String]) -> (PyreonSortableState<String>, () -> [String]) {
        var live = items
        let s = PyreonSortableState<String>()
        s.bind(items: { live }, by: { $0 }, onReorder: { live = $0 })
        return (s, { live })
    }

    static func main() {
        let seed = ["a", "b", "c", "d"]

        // ── 1. the four edge cases, against web ground truth ────────────────
        let expectations: [(String, String, PyreonDropEdge, [String])] = [
            ("a", "c", .bottom, ["b", "c", "a", "d"]),
            ("d", "b", .top, ["a", "d", "b", "c"]),
            ("a", "c", .top, ["b", "a", "c", "d"]),
            ("d", "b", .bottom, ["a", "b", "d", "c"]),
            ("a", "b", .top, ["a", "b", "c", "d"]),
            ("a", "d", .bottom, ["b", "c", "d", "a"]),
        ]
        for (drag, drop, edge, want) in expectations {
            let (s, _) = make(seed)
            let got = s.reordered(dragKey: drag, dropKey: drop, edge: edge)
            check(got == want, "\(drag)->\(drop)@\(edge.rawValue) = \(got ?? []) want \(want)")
        }

        // ── 2. no-op guards return nil (web returns early) ──────────────────
        let (guardState, _) = make(seed)
        check(guardState.reordered(dragKey: "b", dropKey: "b", edge: .top) == nil, "same key is nil")
        check(guardState.reordered(dragKey: "zz", dropKey: "a", edge: .top) == nil, "missing drag is nil")
        check(guardState.reordered(dragKey: "a", dropKey: "zz", edge: .top) == nil, "missing drop is nil")

        // ── 3. drop() commits through the bound sink ────────────────────────
        let (dropState, readBack) = make(seed)
        let changed = dropState.drop(source: "a", on: "c", edge: .bottom)
        check(changed, "drop reports handled")
        check(readBack() == ["b", "c", "a", "d"], "drop committed \(readBack())")
        check(dropState.activeId() == nil, "drop clears activeId")
        check(dropState.overId() == nil, "drop clears overId")

        // A no-op drop must NOT report handled, and must not call the sink.
        let (noopState, noopRead) = make(seed)
        check(!noopState.drop(source: "b", on: "b", edge: .top), "same-key drop not handled")
        check(noopRead() == seed, "same-key drop left the list alone")

        // ── 4. drag lifecycle + the stale-leave guard ───────────────────────
        let (life, _) = make(seed)
        life.pickUp("a")
        check(life.isActive("a"), "isActive after pickUp")
        check(!life.isActive("b"), "isActive is per-key")
        life.dragOver("c", edge: .top)
        check(life.isOverKey("c"), "isOverKey after dragOver")
        check(life.overEdge() == "top", "overEdge() returns the web edge string")
        check(life.activeId() == "a", "activeId() mirrors the web accessor")
        check(life.overId() == "c", "overId() mirrors the web accessor")
        // The outgoing target's leave arrives AFTER the incoming target's
        // enter; clearing on a stale key would blank the live highlight.
        life.dragLeave("b")
        check(life.isOverKey("c"), "a stale leave does NOT clear the live target")
        life.dragLeave("c")
        check(life.overId() == nil, "a matching leave clears")
        check(life.overEdge() == nil, "a matching leave clears the edge")
        life.cancel()
        check(life.activeId() == nil, "cancel clears activeId")

        // ── 5. edge(at:in:) splits on the midline, per axis ─────────────────
        let vertical = PyreonSortableState<String>(axis: .vertical)
        let box = CGSize(width: 100, height: 40)
        check(vertical.edgeAt(CGPoint(x: 50, y: 5), in: box) == .top, "vertical top half")
        check(vertical.edgeAt(CGPoint(x: 50, y: 35), in: box) == .bottom, "vertical bottom half")
        let horizontal = PyreonSortableState<String>(axis: .horizontal)
        check(horizontal.edgeAt(CGPoint(x: 5, y: 20), in: box) == .left, "horizontal left half")
        check(horizontal.edgeAt(CGPoint(x: 95, y: 20), in: box) == .right, "horizontal right half")

        print("PyreonSortableTests: OK")
    }
}
