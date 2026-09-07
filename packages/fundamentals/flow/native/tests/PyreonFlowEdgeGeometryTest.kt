// PyreonFlowEdgeGeometry behaviour assertions (Android) — the Kotlin twin of
// the Swift edge-canvas checks in PyreonFlowStateTests.swift. Runs against the
// co-source gate's functional graphics stubs, whose `Path` RECORDS the
// commands it receives (the real SDK Path exposes no such list — the recorder
// exists for this test alone, and the runtime never touches it), so what is
// asserted here is the builder's COMMAND SEQUENCE and the color channels.

import com.pyreon.runtime.PyreonFlowEdgeSegment
import com.pyreon.runtime.PyreonFlowEdgeStroke
import com.pyreon.runtime.pyreonFlowEdgeColor
import com.pyreon.runtime.pyreonFlowEdgePath

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonFlowEdgeGeometryTest: $msg")
}

fun main() {
    // 1. A straight two-point edge — move + line, endpoints exact.
    val straight = pyreonFlowEdgePath(listOf(PyreonFlowEdgeSegment.move(0.0, 0.0), PyreonFlowEdgeSegment.line(100.0, 50.0)))
    check(straight.ops == listOf("move(0.0,0.0)", "line(100.0,50.0)"), "straight edge is move+line, got ${straight.ops}")

    // 2. A cubic keeps both control points in order (c1, c2, end).
    val cubic = pyreonFlowEdgePath(listOf(PyreonFlowEdgeSegment.move(0.0, 0.0), PyreonFlowEdgeSegment.cubic(100.0, 0.0, c1x = 50.0, c1y = -40.0, c2x = 50.0, c2y = 40.0)))
    check(cubic.ops[1] == "cubic(50.0,-40.0,50.0,40.0,100.0,0.0)", "cubic carries c1,c2,end in order, got ${cubic.ops[1]}")

    // 3. A quad keeps its single control point.
    val quad = pyreonFlowEdgePath(listOf(PyreonFlowEdgeSegment.move(0.0, 0.0), PyreonFlowEdgeSegment.quad(10.0, 10.0, cx = 5.0, cy = 20.0)))
    check(quad.ops[1] == "quad(5.0,20.0,10.0,10.0)", "quad carries control then end, got ${quad.ops[1]}")

    // 4. Malformed segments are SKIPPED, not drawn wrong — mirrors Swift.
    val malformed = pyreonFlowEdgePath(listOf(
        PyreonFlowEdgeSegment.move(0.0, 0.0),
        PyreonFlowEdgeSegment("cubic", 1.0, 1.0),
        PyreonFlowEdgeSegment("quad", 2.0, 2.0),
        PyreonFlowEdgeSegment("arc", 3.0, 3.0),
        PyreonFlowEdgeSegment.line(4.0, 4.0),
    ))
    check(malformed.ops == listOf("move(0.0,0.0)", "line(4.0,4.0)"), "cubic/quad without controls and unknown kinds are skipped, got ${malformed.ops}")

    // 5. Hex colors: 3- and 6-digit, upper/lower case, whitespace; else gray.
    val red = pyreonFlowEdgeColor("#f00")
    check(red.red == 1f && red.green == 0f && red.blue == 0f, "#f00 is pure red")
    val teal = pyreonFlowEdgeColor("  #0A8F7C ")
    check(teal.red == 10f / 255f && teal.green == 143f / 255f && teal.blue == 124f / 255f, "#0A8F7C parses each channel (whitespace trimmed, case-insensitive)")
    check(pyreonFlowEdgeColor("rgb(1,2,3)") == androidx.compose.ui.graphics.Color.Gray, "a non-hex color falls back to gray")
    check(pyreonFlowEdgeColor("#12345") == androidx.compose.ui.graphics.Color.Gray, "a 5-digit hex falls back to gray")

    // 6. A stroke prebuilds its path/color/dash ONCE (same instance on re-read).
    val stroke = PyreonFlowEdgeStroke("e1", listOf(PyreonFlowEdgeSegment.move(0.0, 0.0), PyreonFlowEdgeSegment.line(1.0, 1.0)), color = "#123456", dash = listOf(4.0, 2.0))
    check(stroke.path === stroke.path && stroke.resolvedColor == pyreonFlowEdgeColor("#123456"), "stroke caches its path and resolved color")
    check(stroke.pathEffect != null && PyreonFlowEdgeStroke("e2", emptyList()).pathEffect == null, "dash builds a PathEffect once; a solid stroke has none")

    println("PyreonFlowEdgeGeometryTest: all checks passed")
}
