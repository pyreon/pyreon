// PyreonFlowEdgeGeometry behaviour assertions (Android) — the Kotlin twin of
// the Swift edge-canvas checks in PyreonFlowStateTests.swift. Runs against the
// co-source gate's functional graphics stubs, whose `Path` RECORDS the
// commands it receives (the real SDK Path exposes no such list — the recorder
// exists for this test alone, and the runtime never touches it), so what is
// asserted here is the builder's COMMAND SEQUENCE and the color channels.

import com.pyreon.runtime.PyreonFlowEdgeSegment
import com.pyreon.runtime.PyreonFlowEdgeStroke
import com.pyreon.runtime.PyreonFlowPathPoint
import com.pyreon.runtime.PyreonFlowNodeBox
import com.pyreon.runtime.PyreonFlowHandleConfig
import com.pyreon.runtime.PyreonFlowMeasuredHandle
import com.pyreon.runtime.PyreonFlowNode
import com.pyreon.runtime.PyreonFlowNodeMeasurement
import com.pyreon.runtime.PyreonFlowPosition
import com.pyreon.runtime.PyreonXYPosition
import com.pyreon.runtime.pyreonBezierPath
import com.pyreon.runtime.pyreonEdgePath
import com.pyreon.runtime.pyreonEffectiveDimensions
import com.pyreon.runtime.pyreonComputeEdgePath
import com.pyreon.runtime.pyreonFloatingEndpoints
import com.pyreon.runtime.pyreonHandlePosition
import com.pyreon.runtime.pyreonNodeIntersection
import com.pyreon.runtime.pyreonResolveHandleAnchor
import com.pyreon.runtime.pyreonFlowInteractiveHandles
import com.pyreon.runtime.pyreonFlowConnectionPreview
import com.pyreon.runtime.pyreonNearestFlowHandle
import com.pyreon.runtime.pyreonFlowEdgeDistance
import com.pyreon.runtime.pyreonNearestFlowEdge
import com.pyreon.runtime.pyreonFlowEdgeColor
import com.pyreon.runtime.pyreonFlowEdgePath
import com.pyreon.runtime.pyreonStraightPath
import com.pyreon.runtime.pyreonSmoothStepPath
import com.pyreon.runtime.pyreonStepPath
import com.pyreon.runtime.pyreonWaypointPath
import com.pyreon.runtime.pyreonFlowParseSvgPath
import com.pyreon.runtime.pyreonFlowPathResultFromSvg

private fun check(cond: Boolean, msg: String) {
    if (!cond) throw AssertionError("PyreonFlowEdgeGeometryTest: $msg")
}

private fun checkSvgPaths() {
    fun near(a: Double?, b: Double) = a != null && kotlin.math.abs(a - b) < 1e-9
    fun same(got: List<PyreonFlowEdgeSegment>, want: List<Pair<String, List<Double>>>): Boolean {
        if (got.size != want.size) return false
        for ((g, w) in got.zip(want)) {
            if (g.kind != w.first) return false
            val v: List<Double?> = when (g.kind) { "cubic" -> listOf(g.x, g.y, g.c1x, g.c1y, g.c2x, g.c2y); "quad" -> listOf(g.x, g.y, g.cx, g.cy); else -> listOf(g.x, g.y) }
            if (v.size != w.second.size || !v.zip(w.second).all { near(it.first, it.second) }) return false
        }
        return true
    }
    check(same(pyreonFlowParseSvgPath("M10 20 L30 40"), listOf(Pair("move", listOf(10.0, 20.0)), Pair("line", listOf(30.0, 40.0)))), "svg path parses 'M10 20 L30 40'")
    check(same(pyreonFlowParseSvgPath("m10 20 l5 5 h10 v-5"), listOf(Pair("move", listOf(10.0, 20.0)), Pair("line", listOf(15.0, 25.0)), Pair("line", listOf(25.0, 25.0)), Pair("line", listOf(25.0, 20.0)))), "svg path parses 'm10 20 l5 5 h10 v-5'")
    check(same(pyreonFlowParseSvgPath("M0,0 C10,0 20,10 30,10 S50,20 60,20"), listOf(Pair("move", listOf(0.0, 0.0)), Pair("cubic", listOf(30.0, 10.0, 10.0, 0.0, 20.0, 10.0)), Pair("cubic", listOf(60.0, 20.0, 40.0, 10.0, 50.0, 20.0)))), "svg path parses 'M0,0 C10,0 20,10 30,10 S50,20 60,20'")
    check(same(pyreonFlowParseSvgPath("M0 0 Q10 10 20 0 T40 0"), listOf(Pair("move", listOf(0.0, 0.0)), Pair("quad", listOf(20.0, 0.0, 10.0, 10.0)), Pair("quad", listOf(40.0, 0.0, 30.0, -10.0)))), "svg path parses 'M0 0 Q10 10 20 0 T40 0'")
    check(same(pyreonFlowParseSvgPath("M0 0 L10 0 L10 10 Z"), listOf(Pair("move", listOf(0.0, 0.0)), Pair("line", listOf(10.0, 0.0)), Pair("line", listOf(10.0, 10.0)), Pair("line", listOf(0.0, 0.0)))), "svg path parses 'M0 0 L10 0 L10 10 Z'")
    check(same(pyreonFlowParseSvgPath("M0 0 10 10 20 0"), listOf(Pair("move", listOf(0.0, 0.0)), Pair("line", listOf(10.0, 10.0)), Pair("line", listOf(20.0, 0.0)))), "svg path parses 'M0 0 10 10 20 0'")
    check(same(pyreonFlowParseSvgPath("m1 1 2 2"), listOf(Pair("move", listOf(1.0, 1.0)), Pair("line", listOf(3.0, 3.0)))), "svg path parses 'm1 1 2 2'")
    check(same(pyreonFlowParseSvgPath("M-1.5.5e1-2"), listOf(Pair("move", listOf(-1.5, 5.0)))), "svg path parses 'M-1.5.5e1-2'")
    check(same(pyreonFlowParseSvgPath("M0 0 X10 10"), listOf(Pair("move", listOf(0.0, 0.0)))), "svg path parses 'M0 0 X10 10'")
    check(same(pyreonFlowParseSvgPath(""), listOf()), "svg path parses ''")
    check(same(pyreonFlowParseSvgPath("M0 0 H10 V10 H0 z m5 5 l1 0"), listOf(Pair("move", listOf(0.0, 0.0)), Pair("line", listOf(10.0, 0.0)), Pair("line", listOf(10.0, 10.0)), Pair("line", listOf(0.0, 10.0)), Pair("line", listOf(0.0, 0.0)), Pair("move", listOf(5.0, 5.0)), Pair("line", listOf(6.0, 5.0)))), "svg path parses 'M0 0 H10 V10 H0 z m5 5 l1 0'")
    check(same(pyreonFlowParseSvgPath("M0 0 c1 2 3 4 5 6 s1 1 2 2"), listOf(Pair("move", listOf(0.0, 0.0)), Pair("cubic", listOf(5.0, 6.0, 1.0, 2.0, 3.0, 4.0)), Pair("cubic", listOf(7.0, 8.0, 7.0, 8.0, 6.0, 7.0)))), "svg path parses 'M0 0 c1 2 3 4 5 6 s1 1 2 2'")
    val arc = pyreonFlowParseSvgPath("M0 0 A10 10 0 0 1 20 0")
    check(arc.size == 3 && arc[1].kind == "cubic" && near(arc[1].x, 10.0) && near(arc[1].y, -10.0) && near(arc[2].x, 20.0) && near(arc[2].y, 0.0), "a half-circle arc ends each quarter on the circle")
    val quarter = pyreonFlowParseSvgPath("M0 0a10 10 0 0110 10")
    check(quarter.size == 2 && near(quarter[1].x, 10.0) && near(quarter[1].y, 10.0), "compact arc flags parse and the arc ends at the relative endpoint")
    val result = pyreonFlowPathResultFromSvg("M0 0 L20 10")
    check(near(result.labelX, 10.0) && near(result.labelY, 5.0) && result.path == "M0,0 L20,10", "a parsed path result centres its label and round-trips to path data")
}

fun main() {
    checkSvgPaths()
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

    val routedStraight = pyreonStraightPath(0.0, 0.0, 100.0, 50.0)
    check(routedStraight.labelX == 50.0 && routedStraight.labelY == 25.0 && routedStraight.segments.size == 2, "straight routing returns midpoint and segments")
    check(routedStraight.path == "M0,0 L100,50", "native path results preserve the public SVG path string")
    val routedBezier = pyreonBezierPath(0.0, 0.0, PyreonFlowPosition.Right, 200.0, 100.0, PyreonFlowPosition.Left)
    check(routedBezier.segments[1].c1x!! > 0.0 && routedBezier.segments[1].c2x!! < 200.0, "bezier routing offsets controls along handle directions")
    check(routedBezier.path.startsWith("M0,0 C"), "bezier SVG serialization preserves its cubic command")
    val measuredDimensions = pyreonEffectiveDimensions(PyreonFlowNode("dims", position = PyreonXYPosition(0.0, 0.0), data = "D", width = 90.0), PyreonFlowNodeMeasurement(80.0, 30.0))
    check(measuredDimensions.width == 90.0 && measuredDimensions.height == 30.0, "effective dimensions preserve explicit-measured-default precedence")
    val helperSource = PyreonFlowNode("helper-source", position = PyreonXYPosition(0.0, 0.0), data = "S", width = 100.0, height = 40.0, sourceHandles = listOf(PyreonFlowHandleConfig("out", "source", PyreonFlowPosition.Right)))
    val helperTarget = PyreonFlowNode("helper-target", position = PyreonXYPosition(200.0, 80.0), data = "T", width = 120.0, height = 60.0)
    val helperDimensions = com.pyreon.runtime.PyreonFlowNodeBoxDimensions(100.0, 40.0, 120.0, 60.0)
    val helperEndpoints = com.pyreon.runtime.pyreonGetFloatingEndpoints(helperSource, helperTarget, helperDimensions)
    check(helperEndpoints.source.position == PyreonFlowPosition.Bottom && helperEndpoints.target.position == PyreonFlowPosition.Left, "public floating helper preserves perimeter sides")
    val helperSmart = com.pyreon.runtime.pyreonGetSmartHandlePositions(helperSource, helperTarget)
    check(helperSmart.sourcePosition == PyreonFlowPosition.Right && helperSmart.targetPosition == PyreonFlowPosition.Left, "public smart helper honors configured and inferred sides")
    val helperAnchor = com.pyreon.runtime.pyreonResolveHandleAnchor(helperSource, "out", "source", com.pyreon.runtime.PyreonFlowDimensions(100.0, 40.0))
    check(helperAnchor == com.pyreon.runtime.PyreonFlowHandleAnchor(100.0, 20.0, PyreonFlowPosition.Right), "public anchor helper resolves configured handle geometry")
    check(pyreonEdgePath("straight", 0.0, 0.0, PyreonFlowPosition.Right, 100.0, 50.0, PyreonFlowPosition.Left).path == "M0,0 L100,50", "public edge dispatcher preserves straight geometry")
    val previewSource = com.pyreon.runtime.PyreonFlowInteractiveHandle("n", "out", "source", PyreonFlowPosition.Right, 0.0, 0.0)
    check(pyreonFlowConnectionPreview("straight", previewSource, PyreonFlowPathPoint(100.0, 50.0)).map { it.kind } == listOf("move", "line"), "straight connection preview uses straight geometry")
    check(pyreonFlowConnectionPreview("bezier", previewSource, PyreonFlowPathPoint(100.0, 50.0))[1].kind == "cubic", "bezier connection preview preserves the source tangent")
    check(pyreonFlowConnectionPreview("step", previewSource, PyreonFlowPathPoint(100.0, 50.0)).any { it.kind == "quad" }, "step connection preview uses routed geometry")
    val routedWaypoint = pyreonWaypointPath(0.0, 0.0, 100.0, 100.0, listOf(PyreonFlowPathPoint(25.0, 30.0), PyreonFlowPathPoint(75.0, 80.0)))
    check(routedWaypoint.labelX == 75.0 && routedWaypoint.labelY == 80.0 && routedWaypoint.segments.size == 4, "waypoint routing uses the middle waypoint label and every segment")
    val orientations = listOf(
        Triple(PyreonFlowPosition.Right, PyreonFlowPosition.Top, listOf("move:0.0,0.0", "line:20.0,0.0", "line:20.0,55.0", "quad:25.0,60.0", "line:100.0,60.0", "line:100.0,80.0")),
        Triple(PyreonFlowPosition.Bottom, PyreonFlowPosition.Left, listOf("move:0.0,0.0", "line:0.0,20.0", "line:75.0,20.0", "quad:80.0,25.0", "line:80.0,80.0", "line:100.0,80.0")),
        Triple(PyreonFlowPosition.Right, PyreonFlowPosition.Left, listOf("move:0.0,0.0", "line:20.0,0.0", "line:50.0,0.0", "quad:50.0,40.0", "line:50.0,80.0", "line:80.0,80.0", "line:100.0,80.0")),
        Triple(PyreonFlowPosition.Bottom, PyreonFlowPosition.Top, listOf("move:0.0,0.0", "line:0.0,20.0", "line:0.0,40.0", "quad:50.0,40.0", "line:100.0,40.0", "line:100.0,60.0", "line:100.0,80.0")),
    )
    for ((sourceSide, targetSide, expected) in orientations) {
        val route = pyreonSmoothStepPath(0.0, 0.0, sourceSide, 100.0, 80.0, targetSide, borderRadius = 5.0, offset = 20.0)
        check(route.segments.map { "${it.kind}:${it.x},${it.y}" } == expected, "smoothstep $sourceSide->$targetSide exactly matches the web segment packet")
    }
    val step = pyreonStepPath(0.0, 0.0, PyreonFlowPosition.Right, 100.0, 80.0, PyreonFlowPosition.Left)
    check(step == pyreonSmoothStepPath(0.0, 0.0, PyreonFlowPosition.Right, 100.0, 80.0, PyreonFlowPosition.Left, borderRadius = 0.0), "step is exactly smoothstep with a zero-radius corner")
    check(pyreonHandlePosition(PyreonFlowPosition.Right, 0.0, 0.0, 150.0, 40.0) == PyreonFlowPathPoint(150.0, 20.0), "right handle uses the node-side midpoint")
    val sourceBox = PyreonFlowNodeBox(0.0, 0.0, 150.0, 40.0)
    val targetBox = PyreonFlowNodeBox(200.0, 100.0, 150.0, 40.0)
    check(pyreonNodeIntersection(sourceBox, PyreonFlowPathPoint(275.0, 120.0)) == PyreonFlowPathPoint(115.0, 40.0), "node intersection matches the web perimeter crossing")
    val floating = pyreonFloatingEndpoints(sourceBox, targetBox)
    check(floating.source.x == 115.0 && floating.source.y == 40.0 && floating.source.position == PyreonFlowPosition.Bottom, "floating source exactly matches web")
    check(floating.target.x == 235.0 && floating.target.y == 100.0 && floating.target.position == PyreonFlowPosition.Top, "floating target exactly matches web")
    val configHandles = listOf(PyreonFlowHandleConfig("cfg", "source", PyreonFlowPosition.Right))
    val measurement = PyreonFlowNodeMeasurement(180.0, 60.0, listOf(PyreonFlowMeasuredHandle("real", "source", PyreonFlowPosition.Bottom, 45.0, 61.0)))
    check(pyreonResolveHandleAnchor(10.0, 20.0, 200.0, 80.0, "real", "source", configHandles, measurement) == com.pyreon.runtime.PyreonFlowHandleAnchor(55.0, 81.0, PyreonFlowPosition.Bottom), "named measured handle wins with its exact rendered center")
    check(pyreonResolveHandleAnchor(10.0, 20.0, 200.0, 80.0, "cfg", "source", configHandles, measurement) == com.pyreon.runtime.PyreonFlowHandleAnchor(210.0, 60.0, PyreonFlowPosition.Right), "named config handle uses effective dimensions")
    check(pyreonResolveHandleAnchor(10.0, 20.0, 200.0, 80.0, "missing", "source", configHandles, measurement)?.x == 55.0, "unknown id falls back to the first measured handle")
    val interactive = pyreonFlowInteractiveHandles("n1", PyreonFlowNodeBox(10.0, 20.0, 200.0, 80.0), configHandles)
    check(interactive.single().x == 210.0 && interactive.single().y == 60.0, "interactive handle layout resolves graph coordinates")
    val offsetHandle = pyreonFlowInteractiveHandles("n1", PyreonFlowNodeBox(10.0, 20.0, 200.0, 80.0), listOf(PyreonFlowHandleConfig("offset", "source", PyreonFlowPosition.Right, 75.0)))
    check(offsetHandle.single().x == 210.0 && offsetHandle.single().y == 80.0, "interactive handles preserve the web offset percentage")
    val targetHandle = com.pyreon.runtime.PyreonFlowInteractiveHandle("n2", "in", "target", PyreonFlowPosition.Left, 240.0, 60.0)
    check(pyreonNearestFlowHandle(interactive + targetHandle, PyreonFlowPathPoint(244.0, 60.0), "target", 5.0)?.nodeId == "n2", "connection hit testing chooses the nearest matching handle")
    check(pyreonNearestFlowHandle(interactive + targetHandle, PyreonFlowPathPoint(246.0, 60.0), "target", 5.0) == null, "connection hit testing respects its graph-space radius")
    val completeFloating = pyreonComputeEdgePath("bezier", sourceBox, targetBox)
    check(completeFloating.labelX == 175.0 && completeFloating.labelY == 70.0 && completeFloating.segments[0] == PyreonFlowEdgeSegment.move(115.0, 40.0), "complete dispatcher matches web floating endpoints and label")
    check(kotlin.math.abs(completeFloating.segments[1].c1y!! - 73.54101966249684) < 0.000000001, "complete dispatcher matches web bezier control geometry")
    val completeHandled = pyreonComputeEdgePath("straight", sourceBox, targetBox, "out", "in", configHandles, listOf(PyreonFlowHandleConfig("in", "target", PyreonFlowPosition.Left)))
    check(completeHandled.segments == listOf(PyreonFlowEdgeSegment.move(150.0, 20.0), PyreonFlowEdgeSegment.line(200.0, 120.0)), "complete dispatcher matches web configured-handle straight route")
    val hitEdges = listOf(
        PyreonFlowEdgeStroke("far", listOf(PyreonFlowEdgeSegment.move(0.0, 40.0), PyreonFlowEdgeSegment.line(100.0, 40.0)), interactionWidth = 20.0),
        PyreonFlowEdgeStroke("near", listOf(PyreonFlowEdgeSegment.move(0.0, 0.0), PyreonFlowEdgeSegment.line(100.0, 0.0)), interactionWidth = 20.0),
    )
    check(pyreonFlowEdgeDistance(hitEdges[1].segments, PyreonFlowPathPoint(50.0, 4.0)) == 4.0, "edge hit distance covers the full line, not only its label")
    check(pyreonNearestFlowEdge(hitEdges, PyreonFlowPathPoint(50.0, 4.0), 1.0)?.id == "near", "edge hit testing selects the nearest path")
    check(pyreonNearestFlowEdge(hitEdges, PyreonFlowPathPoint(50.0, 6.0), 2.0) == null, "edge interaction width remains constant in screen pixels under zoom")

    println("PyreonFlowEdgeGeometryTest: all checks passed")
}
