import SwiftUI

// Compiles PyreonFlowEdgeCanvas into the real app target. Nothing in shared
// source can reference it yet (no <Flow> host emit), so without this file the
// canvas is linked by no device build at all — "the device gate covers it"
// was true of nothing. A hand-wired SwiftUI view is exactly how the runtime
// documents consuming the canvas today; this one is small enough to be the
// reference for that. Not routed to from the app; the point is the build.
@available(iOS 17.0, *)
struct FlowEdgesPreview: View {
    let strokes: [PyreonFlowEdgeStroke] = [
        PyreonFlowEdgeStroke(
            id: "e1",
            segments: [.move(150, 20), .cubic(200, 20, c1x: 175, c1y: 20, c2x: 175, c2y: 20)],
            color: "#0a8f7c",
            width: 2),
    ]
    var body: some View {
        // `.equatable()` joins once #3320 (Equatable canvas) is on main.
        PyreonFlowEdgeCanvas(edges: strokes, viewport: PyreonFlowViewport(x: 0, y: 0, zoom: 1))
            .frame(height: 80)
    }
}
