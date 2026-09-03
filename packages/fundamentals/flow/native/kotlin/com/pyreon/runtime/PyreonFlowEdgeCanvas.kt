package com.pyreon.runtime

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke

// The Android twin of PyreonFlowEdgeCanvas.swift — see that file's header
// for the full design rationale (the closed move/line/cubic/quad vocabulary,
// why the color parser is SELF-CONTAINED rather than reusing
// PyreonChartCanvas.kt's `pyreonChartColor`, and what this deliberately does
// NOT do — compute segments from node positions).
//
// Declared `pyreon.native.kotlinSdkOnly` in package.json: `Canvas`/`drawPath`
// are real Compose Foundation APIs the co-source stub harness does not model
// (same reason PyreonSortableModifier.kt is marked), so this file is verified
// by the Android device gate + the emit-level `validateKotlin` stubs, not by
// `check-native-cosource`.

/** Parses `#rgb` / `#rrggbb` into a Compose `Color`, falling back to gray.
 *  Self-contained — see the file header for why this doesn't reuse charts'
 *  `pyreonChartColor` (co-located packages verify in isolation; an app
 *  depending on `@pyreon/flow` without `@pyreon/charts` would never link
 *  PyreonChartCanvas.kt at all). */
private fun pyreonFlowEdgeColor(s: String): Color {
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

/** One edge's stroke — its segment list plus how to draw it. */
data class PyreonFlowEdgeStroke(
    val id: String,
    val segments: List<PyreonFlowEdgeSegment>,
    val color: String = "#999999",
    val width: Double = 1.5,
    val dash: List<Double>? = null,
)

/** Builds a Compose `Path` from a segment list, applying the viewport
 *  transform (uniform scale + translate) to every point — the DrawScope
 *  equivalent of the web edge layer's single CSS transform on its `<svg>`. */
private fun pyreonFlowEdgePath(
    segments: List<PyreonFlowEdgeSegment>,
    zoom: Double,
    tx: Double,
    ty: Double,
): Path {
    fun px(x: Double) = (x * zoom + tx).toFloat()
    fun py(y: Double) = (y * zoom + ty).toFloat()
    val p = Path()
    for (seg in segments) {
        when (seg.kind) {
            "move" -> p.moveTo(px(seg.x), py(seg.y))
            "line" -> p.lineTo(px(seg.x), py(seg.y))
            "cubic" -> {
                val c1x = seg.c1x
                val c1y = seg.c1y
                val c2x = seg.c2x
                val c2y = seg.c2y
                if (c1x == null || c1y == null || c2x == null || c2y == null) continue
                p.cubicTo(px(c1x), py(c1y), px(c2x), py(c2y), px(seg.x), py(seg.y))
            }
            "quad" -> {
                val cx = seg.cx
                val cy = seg.cy
                if (cx == null || cy == null) continue
                p.quadraticBezierTo(px(cx), py(cy), px(seg.x), py(seg.y))
            }
        }
    }
    return p
}

/**
 * Draws every edge in [edges], applying the SAME viewport transform (pan +
 * uniform zoom) to all of them — one `Canvas` draw pass, not one composable
 * per edge, so panning/zooming a large graph stays O(1) composable-identity
 * work per frame.
 */
@Composable
fun PyreonFlowEdgeCanvas(
    edges: List<PyreonFlowEdgeStroke>,
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        for (edge in edges) {
            val path = pyreonFlowEdgePath(edge.segments, viewport.zoom, viewport.x, viewport.y)
            val effect =
                edge.dash?.let {
                    PathEffect.dashPathEffect(
                        it.map { d -> (d * viewport.zoom).toFloat() }.toFloatArray())
                }
            drawPath(
                path = path,
                color = pyreonFlowEdgeColor(edge.color),
                style =
                    Stroke(
                        width = (edge.width * viewport.zoom).toFloat(),
                        cap = StrokeCap.Round,
                        join = StrokeJoin.Round,
                        pathEffect = effect,
                    ),
            )
        }
    }
}
