package com.pyreon.runtime

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect

// The PURE half of PyreonFlowEdgeCanvas.kt — everything that needs no
// Compose Foundation `Canvas`: the closed move/line/cubic/quad vocabulary
// (`EdgeSegment` in `types.ts`), the stroke record, the Path builder and the
// hex-color parser. Split out of the canvas file so it is verified by the
// co-source gate (`pyreon.native.kotlinServices.PyreonFlowEdgeGeometry`,
// against functional `Path`/`Color`/`PathEffect` stubs) the way the Swift
// twin's geometry has always been — the canvas composable itself stays
// `kotlinSdkOnly`, device-gate territory, and is now ~20 lines.
//
// See PyreonFlowEdgeCanvas.swift's header for the design rationale (why the
// color parser is SELF-CONTAINED rather than reusing charts', what this
// deliberately does NOT do — compute segments from node positions).

/** Parses `#rgb` / `#rrggbb` into a Compose `Color`, falling back to gray. */
internal fun pyreonFlowEdgeColor(s: String): Color {
    val str = s.trim()
    if (!str.startsWith("#")) return Color.Gray
    val hex = str.drop(1)
    fun code(c: Char): Int {
        if (c in '0'..'9') return c - '0'
        if (c in 'a'..'f') return c - 'a' + 10
        if (c in 'A'..'F') return c - 'A' + 10
        return 0
    }
    if (hex.length == 3) {
        return Color(code(hex[0]) * 17, code(hex[1]) * 17, code(hex[2]) * 17)
    }
    if (hex.length == 6) {
        return Color(
            code(hex[0]) * 16 + code(hex[1]),
            code(hex[2]) * 16 + code(hex[3]),
            code(hex[4]) * 16 + code(hex[5]))
    }
    return Color.Gray
}

/** One drawing primitive in an edge's path — `move`/`line`/`cubic`/`quad`,
 *  the exact vocabulary `EdgeSegment` (`types.ts`) defines. */
data class PyreonFlowEdgeSegment(
    val kind: String,
    val x: Double,
    val y: Double,
    val c1x: Double? = null,
    val c1y: Double? = null,
    val c2x: Double? = null,
    val c2y: Double? = null,
    val cx: Double? = null,
    val cy: Double? = null,
) {
    companion object {
        fun move(x: Double, y: Double) = PyreonFlowEdgeSegment("move", x, y)
        fun line(x: Double, y: Double) = PyreonFlowEdgeSegment("line", x, y)
        fun cubic(x: Double, y: Double, c1x: Double, c1y: Double, c2x: Double, c2y: Double) =
            PyreonFlowEdgeSegment("cubic", x, y, c1x = c1x, c1y = c1y, c2x = c2x, c2y = c2y)
        fun quad(x: Double, y: Double, cx: Double, cy: Double) =
            PyreonFlowEdgeSegment("quad", x, y, cx = cx, cy = cy)
    }
}

/** Builds an UNSCALED Compose `Path` (flow coordinates) from a segment list.
 *  The viewport transform is applied ONCE by the canvas (`withTransform`),
 *  not per point — v1 transformed every point of every edge on every draw.
 *  Malformed segments (a `cubic`/`quad` missing its control points, an
 *  unknown `kind`) are skipped, mirroring the Swift builder. */
internal fun pyreonFlowEdgePath(segments: List<PyreonFlowEdgeSegment>): Path {
    val p = Path()
    for (seg in segments) {
        when (seg.kind) {
            "move" -> p.moveTo(seg.x.toFloat(), seg.y.toFloat())
            "line" -> p.lineTo(seg.x.toFloat(), seg.y.toFloat())
            "cubic" -> {
                val c1x = seg.c1x
                val c1y = seg.c1y
                val c2x = seg.c2x
                val c2y = seg.c2y
                if (c1x == null || c1y == null || c2x == null || c2y == null) continue
                p.cubicTo(c1x.toFloat(), c1y.toFloat(), c2x.toFloat(), c2y.toFloat(), seg.x.toFloat(), seg.y.toFloat())
            }
            "quad" -> {
                val cx = seg.cx
                val cy = seg.cy
                if (cx == null || cy == null) continue
                p.quadraticBezierTo(cx.toFloat(), cy.toFloat(), seg.x.toFloat(), seg.y.toFloat())
            }
        }
    }
    return p
}

/** One edge's stroke — its segment list plus how to draw it. The `Path`, the
 *  resolved `Color` and the dash effect are built ONCE (lazily, on first
 *  draw), never inside the draw closure: v1 rebuilt the path, re-parsed the
 *  hex color and re-allocated the dash `FloatArray` + `PathEffect` for every
 *  edge on every draw, at gesture rate. `width`/`dash` are in FLOW units and
 *  scale with the zoom through the canvas transform. */
data class PyreonFlowEdgeStroke(
    val id: String,
    val segments: List<PyreonFlowEdgeSegment>,
    val color: String = "#999999",
    val width: Double = 1.5,
    val dash: List<Double>? = null,
) {
    /** Unscaled, built once from [segments]. */
    val path: Path by lazy { pyreonFlowEdgePath(segments) }
    /** [color] parsed once. */
    val resolvedColor: Color by lazy { pyreonFlowEdgeColor(color) }
    /** [dash] converted once; `null` for a solid stroke. */
    val pathEffect: PathEffect? by lazy {
        dash?.let { PathEffect.dashPathEffect(it.map { d -> d.toFloat() }.toFloatArray()) }
    }
}
