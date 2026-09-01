// Behavioral tests for the GENERATED chart engine — real geometry executed
// on the real emit (`swift test`, Darwin), not a typecheck. The drift test
// in @pyreon/native-compiler proves the emit matches the web engine's
// source byte-for-byte; these prove the emitted code RUNS and produces a
// coherent draw list, mirroring the web engine's own unit assertions
// about renderChart's output shape.

import XCTest
@testable import PyreonRuntime

final class PyreonChartEngineTests: XCTestCase {
    private let theme = ChartTheme(axis: "#888", grid: "#eee", label: "#333", fontSize: 12.0)
    /// Text measure the web renderer gets from the canvas context —
    /// a monospace-ish approximation is fine for geometry assertions.
    private let measure: (String, Double) -> Double = { text, size in
        Double(text.count) * size * 0.6
    }

    func testLineChartProducesAxesAndPolyline() throws {
        let s = Series(kind: "line", values: [1.0, 3.0, 2.0, 5.0], color: "#f00",
                       width: 2.0, radius: 0.0, label: "a")
        let spec = ChartSpec(width: 400.0, height: 300.0, series: [s],
                             categories: ["q1", "q2", "q3", "q4"], theme: theme,
                             showXAxis: true, showYAxis: true, showGrid: true)
        let cmds = renderChart(spec, measure)
        XCTAssertFalse(cmds.isEmpty, "a line chart renders a non-empty draw list")
        XCTAssertTrue(cmds.contains { $0.kind == "polyline" && $0.stroke == "#f00" },
                      "the series polyline is present with its color")
        XCTAssertTrue(cmds.contains { $0.kind == "text" }, "tick labels render")
    }

    func testPieRendersOnePolygonPerSlice() throws {
        let slices = [
            Slice(value: 3.0, label: "a", color: "#f00"),
            Slice(value: 2.0, label: "b", color: "#0f0"),
            Slice(value: 1.0, label: "c", color: "#00f"),
        ]
        let box = PyreonChartRect(x: 0.0, y: 0.0, w: 400.0, h: 300.0)
        let opts = PieOptions(innerRadius: 0.0, showLabels: false,
                              labelColor: "#333", fontSize: 12.0)
        let cmds = renderPie(slices, box, opts)
        let polys = cmds.filter { $0.kind == "polygon" }
        XCTAssertEqual(polys.count, slices.count, "one filled polygon per slice")
    }

    func testArcPolygonClosesTheRingBand() throws {
        // The descending inner-edge walk — the shape that was silently
        // gutted before the count-loop lowering landed. A ring (innerR > 0)
        // must produce MORE points than the outer edge alone.
        let center = PyreonChartPt(x: 0.0, y: 0.0)
        let ring = arcPolygon(center, 10.0, 5.0, 0.0, 3.0)
        let wedge = arcPolygon(center, 10.0, 0.0, 0.0, 3.0)
        XCTAssertGreaterThan(ring.count, wedge.count,
                             "the inner edge walks back (descending loop emitted)")
    }
}
