import SwiftUI

// `<Gesture>` from @pyreon/primitives — continuous pan / pinch / rotate.
//
// The compiler emits `PyreonGesture(onPan:onPinch:onRotate:) { … }`. The
// payload types mirror the TypeScript `PanEvent` / `PinchEvent` /
// `RotateEvent` field for field (packages/native/compiler/src/gesture-events.ts
// is the compiler's copy of the same shape), and the phase contract is the
// one every target keeps: exactly one "start", any number of "change", then
// exactly one "end" — including when the system CANCELS the gesture.

/// A pan (drag) update. Translation is cumulative since the gesture began, in points.
public struct PyreonPanEvent: Equatable {
    public let dx: Double
    public let dy: Double
    public let x: Double
    public let y: Double
    public let phase: String
    public init(dx: Double, dy: Double, x: Double, y: Double, phase: String) {
        self.dx = dx; self.dy = dy; self.x = x; self.y = y; self.phase = phase
    }
    func with(phase: String) -> PyreonPanEvent {
        PyreonPanEvent(dx: dx, dy: dy, x: x, y: y, phase: phase)
    }
}

/// A pinch update. `scale` is cumulative since the gesture began (1 = unchanged).
public struct PyreonPinchEvent: Equatable {
    public let scale: Double
    public let centerX: Double
    public let centerY: Double
    public let phase: String
    public init(scale: Double, centerX: Double, centerY: Double, phase: String) {
        self.scale = scale; self.centerX = centerX; self.centerY = centerY; self.phase = phase
    }
    func with(phase: String) -> PyreonPinchEvent {
        PyreonPinchEvent(scale: scale, centerX: centerX, centerY: centerY, phase: phase)
    }
}

/// A rotation update. `degrees` is cumulative since the gesture began; positive = clockwise.
public struct PyreonRotateEvent: Equatable {
    public let degrees: Double
    public let phase: String
    public init(degrees: Double, phase: String) {
        self.degrees = degrees; self.phase = phase
    }
    func with(phase: String) -> PyreonRotateEvent {
        PyreonRotateEvent(degrees: degrees, phase: phase)
    }
}

/// The start / change / end bookkeeping for ONE recogniser, kept free of
/// SwiftUI so the contract is unit-testable.
///
/// SwiftUI calls `onChanged` for every update (the first one included) and
/// `onEnded` when the gesture completes — but NOT when it is cancelled (an
/// incoming call, the view disappearing, a competing gesture winning). The
/// emitted `@GestureState` flag resets in both cases, so `ended` is called from
/// either path and must deliver "end" at most once.
public struct PyreonGesturePhase<Event: Equatable>: Equatable {
    public private(set) var last: Event?
    public init() {}

    public var isActive: Bool { last != nil }

    /// Phase for a new sample, recording it.
    public mutating func changed(_ make: (String) -> Event) -> Event {
        let ev = make(last == nil ? "start" : "change")
        last = ev
        return ev
    }

    /// The final sample re-tagged "end", or nil when no gesture is active
    /// (already ended, or never started). Deactivates.
    public mutating func ended(_ retag: (Event) -> Event) -> Event? {
        guard let ev = last else { return nil }
        last = nil
        return retag(ev)
    }
}

/// A region that recognises continuous gestures SIMULTANEOUSLY. Only the
/// recognisers whose handler is non-nil participate (a `GestureMask` of
/// `.subviews` leaves just the children's gestures enabled), so a pan-only
/// region never competes with a child's pinch.
///
/// Children keep their own taps: `DragGesture`'s default 10pt minimum
/// distance means a tap never becomes a pan, and a simultaneous gesture does
/// not block the children's.
public struct PyreonGesture<Content: View>: View {
    private let onPan: ((PyreonPanEvent) -> Void)?
    private let onPinch: ((PyreonPinchEvent) -> Void)?
    private let onRotate: ((PyreonRotateEvent) -> Void)?
    private let content: Content

    @State private var pan = PyreonGesturePhase<PyreonPanEvent>()
    @State private var pinch = PyreonGesturePhase<PyreonPinchEvent>()
    @State private var rotate = PyreonGesturePhase<PyreonRotateEvent>()
    @GestureState private var panLive = false
    @GestureState private var pinchLive = false
    @GestureState private var rotateLive = false

    public init(
        onPan: ((PyreonPanEvent) -> Void)? = nil,
        onPinch: ((PyreonPinchEvent) -> Void)? = nil,
        onRotate: ((PyreonRotateEvent) -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        self.onPan = onPan
        self.onPinch = onPinch
        self.onRotate = onRotate
        self.content = content()
    }

    public var body: some View {
        content
            // Hit-test the whole frame, not only the drawn pixels — an empty
            // area of a canvas must still be pannable.
            .contentShape(Rectangle())
            .simultaneousGesture(panGesture, including: onPan == nil ? .subviews : .all)
            .simultaneousGesture(pinchGesture, including: onPinch == nil ? .subviews : .all)
            .simultaneousGesture(rotateGesture, including: onRotate == nil ? .subviews : .all)
            .onChange(of: panLive) { _, live in if !live { finishPan() } }
            .onChange(of: pinchLive) { _, live in if !live { finishPinch() } }
            .onChange(of: rotateLive) { _, live in if !live { finishRotate() } }
    }

    private var panGesture: some Gesture {
        DragGesture()
            .updating($panLive) { _, live, _ in live = true }
            .onChanged { v in
                let ev = pan.changed { phase in
                    PyreonPanEvent(
                        dx: Double(v.translation.width), dy: Double(v.translation.height),
                        x: Double(v.location.x), y: Double(v.location.y), phase: phase)
                }
                onPan?(ev)
            }
            .onEnded { _ in finishPan() }
    }

    private var pinchGesture: some Gesture {
        MagnifyGesture()
            .updating($pinchLive) { _, live, _ in live = true }
            .onChanged { v in
                let ev = pinch.changed { phase in
                    PyreonPinchEvent(
                        scale: Double(v.magnification),
                        centerX: Double(v.startLocation.x), centerY: Double(v.startLocation.y),
                        phase: phase)
                }
                onPinch?(ev)
            }
            .onEnded { _ in finishPinch() }
    }

    private var rotateGesture: some Gesture {
        RotateGesture()
            .updating($rotateLive) { _, live, _ in live = true }
            .onChanged { v in
                let ev = rotate.changed { phase in
                    PyreonRotateEvent(degrees: v.rotation.degrees, phase: phase)
                }
                onRotate?(ev)
            }
            .onEnded { _ in finishRotate() }
    }

    private func finishPan() {
        if let ev = pan.ended({ $0.with(phase: "end") }) { onPan?(ev) }
    }
    private func finishPinch() {
        if let ev = pinch.ended({ $0.with(phase: "end") }) { onPinch?(ev) }
    }
    private func finishRotate() {
        if let ev = rotate.ended({ $0.with(phase: "end") }) { onRotate?(ev) }
    }
}
