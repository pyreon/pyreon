// The phase contract every <Gesture> target keeps: one "start", any number of
// "change", one "end" — and "end" exactly once even when SwiftUI reports the
// finish twice (onEnded AND the @GestureState reset) or only via the reset
// (a cancelled gesture never calls onEnded).

import XCTest
@testable import PyreonRuntime

final class PyreonGestureTests: XCTestCase {
    private func pan(_ dx: Double, _ phase: String) -> PyreonPanEvent {
        PyreonPanEvent(dx: dx, dy: 0, x: dx, y: 0, phase: phase)
    }

    func testStartThenChange() {
        var p = PyreonGesturePhase<PyreonPanEvent>()
        XCTAssertFalse(p.isActive)
        XCTAssertEqual(p.changed { self.pan(1, $0) }.phase, "start")
        XCTAssertTrue(p.isActive)
        XCTAssertEqual(p.changed { self.pan(2, $0) }.phase, "change")
        XCTAssertEqual(p.changed { self.pan(3, $0) }.phase, "change")
    }

    func testEndCarriesTheLastSampleAndFiresOnce() {
        var p = PyreonGesturePhase<PyreonPanEvent>()
        _ = p.changed { self.pan(5, $0) }
        _ = p.changed { self.pan(9, $0) }
        let end = p.ended { $0.with(phase: "end") }
        XCTAssertEqual(end, pan(9, "end"))
        // The second finish path (onEnded after the @GestureState reset, or the
        // reverse) must deliver nothing.
        XCTAssertNil(p.ended { $0.with(phase: "end") })
        XCTAssertFalse(p.isActive)
    }

    func testEndWithoutAStartDeliversNothing() {
        var p = PyreonGesturePhase<PyreonRotateEvent>()
        XCTAssertNil(p.ended { $0.with(phase: "end") })
    }

    func testTheNextGestureStartsAgain() {
        var p = PyreonGesturePhase<PyreonPinchEvent>()
        _ = p.changed { PyreonPinchEvent(scale: 2, centerX: 0, centerY: 0, phase: $0) }
        _ = p.ended { $0.with(phase: "end") }
        XCTAssertEqual(
            p.changed { PyreonPinchEvent(scale: 1.1, centerX: 0, centerY: 0, phase: $0) }.phase,
            "start")
    }
}
