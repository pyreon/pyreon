package com.pyreon.runtime

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import kotlin.math.hypot

// The PURE half of PyreonFlowEdgeCanvas.kt — everything that needs no
// Compose Foundation `Canvas`: the closed move/line/cubic/quad vocabulary
// (`EdgeSegment` in `types.ts`), the stroke record, the Path builder and the
// hex-color parser. Split out of the canvas file so it is verified by the
// co-source gate (`pyreon.native.kotlinServices.PyreonFlowEdgeGeometry`,
// against functional `Path`/`Color`/`PathEffect` stubs) the way the Swift
// twin's geometry has always been — the canvas composable itself stays
// `kotlinSdkOnly`, device-gate territory, and is now ~20 lines.
//
data class PyreonFlowPathResult(
    val labelX: Double,
    val labelY: Double,
    val segments: List<PyreonFlowEdgeSegment>,
) {
    val path: String get() = segments.mapNotNull { segment ->
        val point = "${pyreonFlowSvgNumber(segment.x)},${pyreonFlowSvgNumber(segment.y)}"
        when (segment.kind) {
            "move" -> "M$point"
            "line" -> "L$point"
            "cubic" -> "C${pyreonFlowSvgNumber(segment.c1x ?: 0.0)},${pyreonFlowSvgNumber(segment.c1y ?: 0.0)} ${pyreonFlowSvgNumber(segment.c2x ?: 0.0)},${pyreonFlowSvgNumber(segment.c2y ?: 0.0)} $point"
            "quad" -> "Q${pyreonFlowSvgNumber(segment.cx ?: 0.0)},${pyreonFlowSvgNumber(segment.cy ?: 0.0)} $point"
            else -> null
        }
    }.joinToString(" ")
}

private fun pyreonFlowSvgNumber(value: Double): String =
    if (value.isFinite() && value == value.toLong().toDouble()) value.toLong().toString() else value.toString()
data class PyreonFlowNodeBox(val x: Double, val y: Double, val width: Double, val height: Double)
data class PyreonFlowHandleAnchor(val x: Double, val y: Double, val position: PyreonFlowPosition)
data class PyreonFlowFloatingEndpoints(val source: PyreonFlowHandleAnchor, val target: PyreonFlowHandleAnchor)

fun pyreonHandlePosition(position: PyreonFlowPosition, nodeX: Double, nodeY: Double, nodeWidth: Double, nodeHeight: Double, offset: Double = 50.0): PyreonFlowPathPoint = when (position) {
    PyreonFlowPosition.Top -> PyreonFlowPathPoint(nodeX + nodeWidth * offset.coerceIn(0.0, 100.0) / 100.0, nodeY)
    PyreonFlowPosition.Right -> PyreonFlowPathPoint(nodeX + nodeWidth, nodeY + nodeHeight * offset.coerceIn(0.0, 100.0) / 100.0)
    PyreonFlowPosition.Bottom -> PyreonFlowPathPoint(nodeX + nodeWidth * offset.coerceIn(0.0, 100.0) / 100.0, nodeY + nodeHeight)
    PyreonFlowPosition.Left -> PyreonFlowPathPoint(nodeX, nodeY + nodeHeight * offset.coerceIn(0.0, 100.0) / 100.0)
}

fun pyreonNodeIntersection(box: PyreonFlowNodeBox, toward: PyreonFlowPathPoint): PyreonFlowPathPoint {
    val cx = box.x + box.width / 2; val cy = box.y + box.height / 2
    val dx = toward.x - cx; val dy = toward.y - cy
    if (dx == 0.0 && dy == 0.0) return PyreonFlowPathPoint(cx, cy)
    val scaleX = if (dx != 0.0) box.width / 2 / kotlin.math.abs(dx) else Double.POSITIVE_INFINITY
    val scaleY = if (dy != 0.0) box.height / 2 / kotlin.math.abs(dy) else Double.POSITIVE_INFINITY
    val scale = kotlin.math.min(scaleX, scaleY)
    return PyreonFlowPathPoint(cx + dx * scale, cy + dy * scale)
}

private fun pyreonSideOfPoint(box: PyreonFlowNodeBox, point: PyreonFlowPathPoint): PyreonFlowPosition = when {
    kotlin.math.abs(point.x - box.x) <= 1 -> PyreonFlowPosition.Left
    kotlin.math.abs(point.x - (box.x + box.width)) <= 1 -> PyreonFlowPosition.Right
    kotlin.math.abs(point.y - box.y) <= 1 -> PyreonFlowPosition.Top
    else -> PyreonFlowPosition.Bottom
}

fun pyreonFloatingEndpoints(source: PyreonFlowNodeBox, target: PyreonFlowNodeBox): PyreonFlowFloatingEndpoints {
    val sourceCenter = PyreonFlowPathPoint(source.x + source.width / 2, source.y + source.height / 2)
    val targetCenter = PyreonFlowPathPoint(target.x + target.width / 2, target.y + target.height / 2)
    val sp = pyreonNodeIntersection(source, targetCenter); val tp = pyreonNodeIntersection(target, sourceCenter)
    return PyreonFlowFloatingEndpoints(PyreonFlowHandleAnchor(sp.x, sp.y, pyreonSideOfPoint(source, sp)), PyreonFlowHandleAnchor(tp.x, tp.y, pyreonSideOfPoint(target, tp)))
}

fun <S, T> pyreonGetFloatingEndpoints(sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions): PyreonFlowFloatingEndpoints =
    pyreonFloatingEndpoints(
        PyreonFlowNodeBox(sourceNode.position.x, sourceNode.position.y, dimensions.sourceW, dimensions.sourceH),
        PyreonFlowNodeBox(targetNode.position.x, targetNode.position.y, dimensions.targetW, dimensions.targetH),
    )

fun pyreonResolveHandleAnchor(nodeX: Double, nodeY: Double, nodeWidth: Double, nodeHeight: Double, handleId: String?, type: String, config: List<PyreonFlowHandleConfig>, measurement: PyreonFlowNodeMeasurement?): PyreonFlowHandleAnchor? {
    val measured = measurement?.handles?.filter { it.type == type } ?: emptyList()
    if (handleId != null) {
        measured.firstOrNull { it.id == handleId }?.let { return PyreonFlowHandleAnchor(nodeX + it.x, nodeY + it.y, it.position) }
        config.firstOrNull { it.id == handleId }?.let {
            val point = pyreonHandlePosition(it.position, nodeX, nodeY, nodeWidth, nodeHeight, it.offset)
            return PyreonFlowHandleAnchor(point.x, point.y, it.position)
        }
    }
    measured.firstOrNull()?.let { return PyreonFlowHandleAnchor(nodeX + it.x, nodeY + it.y, it.position) }
    config.firstOrNull()?.let {
        val point = pyreonHandlePosition(it.position, nodeX, nodeY, nodeWidth, nodeHeight, it.offset)
        return PyreonFlowHandleAnchor(point.x, point.y, it.position)
    }
    return null
}

fun pyreonFlowInteractiveHandles(nodeId: String, node: PyreonFlowNodeBox, handles: List<PyreonFlowHandleConfig>): List<PyreonFlowInteractiveHandle> =
    handles.map { handle ->
        val point = pyreonHandlePosition(handle.position, node.x, node.y, node.width, node.height, handle.offset)
        PyreonFlowInteractiveHandle(nodeId, handle.id, handle.type, handle.position, point.x, point.y)
    }

fun pyreonNearestFlowHandle(handles: List<PyreonFlowInteractiveHandle>, point: PyreonFlowPathPoint, type: String, radius: Double): PyreonFlowInteractiveHandle? {
    if (radius < 0.0) return null
    return handles.asSequence()
        .filter { (type == "any" || it.type == type) && kotlin.math.hypot(it.x - point.x, it.y - point.y) <= radius }
        .minByOrNull { kotlin.math.hypot(it.x - point.x, it.y - point.y) }
}

/**
 * The connection a handle drag makes when it ends at [point], under the web's
 * `connectionMode` rules: `"strict"` accepts only the opposite handle type and
 * always yields source -> target; `"loose"` accepts any handle, oriented from
 * the start. The start node is never a candidate. Mirrors Swift.
 */
fun pyreonFlowResolveConnection(start: PyreonFlowInteractiveHandle, handles: List<PyreonFlowInteractiveHandle>, point: PyreonFlowPathPoint, radius: Double, connectionMode: String): PyreonFlowConnection? {
    val loose = connectionMode == "loose"
    val want = if (loose) "any" else if (start.type == "target") "source" else "target"
    val end = pyreonNearestFlowHandle(handles.filter { it.nodeId != start.nodeId }, point, want, radius) ?: return null
    return if (!loose && start.type == "target") PyreonFlowConnection(end.nodeId, start.nodeId, end.handleId, start.handleId)
    else PyreonFlowConnection(start.nodeId, end.nodeId, start.handleId, end.handleId)
}

fun pyreonSmartHandlePositions(source: PyreonFlowNodeBox, target: PyreonFlowNodeBox, sourceHandles: List<PyreonFlowHandleConfig> = emptyList(), targetHandles: List<PyreonFlowHandleConfig> = emptyList()): PyreonFlowSmartPositions {
    val dx = target.x + target.width / 2 - (source.x + source.width / 2)
    val dy = target.y + target.height / 2 - (source.y + source.height / 2)
    val horizontal = kotlin.math.abs(dx) > kotlin.math.abs(dy)
    val sourceSide = sourceHandles.firstOrNull()?.position ?: if (horizontal) if (dx > 0) PyreonFlowPosition.Right else PyreonFlowPosition.Left else if (dy > 0) PyreonFlowPosition.Bottom else PyreonFlowPosition.Top
    val targetSide = targetHandles.firstOrNull()?.position ?: if (horizontal) if (dx > 0) PyreonFlowPosition.Left else PyreonFlowPosition.Right else if (dy > 0) PyreonFlowPosition.Top else PyreonFlowPosition.Bottom
    return PyreonFlowSmartPositions(sourceSide, targetSide)
}

fun <S, T> pyreonGetSmartHandlePositions(sourceNode: PyreonFlowNode<S>, targetNode: PyreonFlowNode<T>, dimensions: PyreonFlowNodeBoxDimensions? = null): PyreonFlowSmartPositions {
    val source = PyreonFlowNodeBox(sourceNode.position.x, sourceNode.position.y, dimensions?.sourceW ?: sourceNode.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, dimensions?.sourceH ?: sourceNode.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT)
    val target = PyreonFlowNodeBox(targetNode.position.x, targetNode.position.y, dimensions?.targetW ?: targetNode.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, dimensions?.targetH ?: targetNode.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT)
    return pyreonSmartHandlePositions(source, target, sourceNode.sourceHandles, targetNode.targetHandles)
}

fun <T> pyreonResolveHandleAnchor(node: PyreonFlowNode<T>, handleId: String?, type: String, dimensions: PyreonFlowDimensions, measurement: PyreonFlowNodeMeasurement? = null): PyreonFlowHandleAnchor? =
    pyreonResolveHandleAnchor(node.position.x, node.position.y, dimensions.width, dimensions.height, handleId, type, if (type == "source") node.sourceHandles else node.targetHandles, measurement)

fun pyreonComputeEdgePath(type: String, source: PyreonFlowNodeBox, target: PyreonFlowNodeBox, sourceHandleId: String? = null, targetHandleId: String? = null, sourceHandles: List<PyreonFlowHandleConfig> = emptyList(), targetHandles: List<PyreonFlowHandleConfig> = emptyList(), sourceMeasurement: PyreonFlowNodeMeasurement? = null, targetMeasurement: PyreonFlowNodeMeasurement? = null, waypoints: List<PyreonFlowPathPoint> = emptyList(), borderRadius: Double = 5.0, offset: Double = 20.0, curvature: Double = 0.25): PyreonFlowPathResult {
    val sa = pyreonResolveHandleAnchor(source.x, source.y, source.width, source.height, sourceHandleId, "source", sourceHandles, sourceMeasurement)
    val ta = pyreonResolveHandleAnchor(target.x, target.y, target.width, target.height, targetHandleId, "target", targetHandles, targetMeasurement)
    val anchors = if (sa == null && ta == null && waypoints.isEmpty()) pyreonFloatingEndpoints(source, target) else {
        val smart = pyreonSmartHandlePositions(source, target, sourceHandles, targetHandles)
        val sp = pyreonHandlePosition(smart.source, source.x, source.y, source.width, source.height)
        val tp = pyreonHandlePosition(smart.target, target.x, target.y, target.width, target.height)
        PyreonFlowFloatingEndpoints(sa ?: PyreonFlowHandleAnchor(sp.x, sp.y, smart.source), ta ?: PyreonFlowHandleAnchor(tp.x, tp.y, smart.target))
    }
    if (waypoints.isNotEmpty()) return pyreonWaypointPath(anchors.source.x, anchors.source.y, anchors.target.x, anchors.target.y, waypoints)
    return when (type) {
        "smoothstep" -> pyreonSmoothStepPath(anchors.source.x, anchors.source.y, anchors.source.position, anchors.target.x, anchors.target.y, anchors.target.position, borderRadius, offset)
        "straight" -> pyreonStraightPath(anchors.source.x, anchors.source.y, anchors.target.x, anchors.target.y)
        "step" -> pyreonStepPath(anchors.source.x, anchors.source.y, anchors.source.position, anchors.target.x, anchors.target.y, anchors.target.position, offset)
        else -> pyreonBezierPath(anchors.source.x, anchors.source.y, anchors.source.position, anchors.target.x, anchors.target.y, anchors.target.position, curvature)
    }
}

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

fun pyreonStraightPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double) =
    PyreonFlowPathResult((sourceX + targetX) / 2, (sourceY + targetY) / 2, listOf(PyreonFlowEdgeSegment.move(sourceX, sourceY), PyreonFlowEdgeSegment.line(targetX, targetY)))

fun pyreonBezierPath(
    sourceX: Double,
    sourceY: Double,
    sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom,
    targetX: Double,
    targetY: Double,
    targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top,
    curvature: Double = 0.25,
): PyreonFlowPathResult {
    val offset = hypot(targetX - sourceX, targetY - sourceY) * curvature
    var scx = sourceX; var scy = sourceY; var tcx = targetX; var tcy = targetY
    when (sourcePosition) { PyreonFlowPosition.Top -> scy -= offset; PyreonFlowPosition.Bottom -> scy += offset; PyreonFlowPosition.Left -> scx -= offset; PyreonFlowPosition.Right -> scx += offset }
    when (targetPosition) { PyreonFlowPosition.Top -> tcy -= offset; PyreonFlowPosition.Bottom -> tcy += offset; PyreonFlowPosition.Left -> tcx -= offset; PyreonFlowPosition.Right -> tcx += offset }
    return PyreonFlowPathResult((sourceX + targetX) / 2, (sourceY + targetY) / 2, listOf(PyreonFlowEdgeSegment.move(sourceX, sourceY), PyreonFlowEdgeSegment.cubic(targetX, targetY, scx, scy, tcx, tcy)))
}

fun pyreonWaypointPath(sourceX: Double, sourceY: Double, targetX: Double, targetY: Double, waypoints: List<PyreonFlowPathPoint>): PyreonFlowPathResult {
    if (waypoints.isEmpty()) return pyreonStraightPath(sourceX, sourceY, targetX, targetY)
    val points = listOf(PyreonFlowPathPoint(sourceX, sourceY)) + waypoints + PyreonFlowPathPoint(targetX, targetY)
    val segments = points.mapIndexed { index, point -> if (index == 0) PyreonFlowEdgeSegment.move(point.x, point.y) else PyreonFlowEdgeSegment.line(point.x, point.y) }
    val label = waypoints[waypoints.size / 2]
    return PyreonFlowPathResult(label.x, label.y, segments)
}

fun pyreonSmoothStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top, borderRadius: Double = 5.0, offset: Double = 20.0): PyreonFlowPathResult {
    val hs = sourcePosition == PyreonFlowPosition.Left || sourcePosition == PyreonFlowPosition.Right
    val ht = targetPosition == PyreonFlowPosition.Left || targetPosition == PyreonFlowPosition.Right
    val sx = sourceX + if (sourcePosition == PyreonFlowPosition.Right) offset else if (sourcePosition == PyreonFlowPosition.Left) -offset else 0.0
    val sy = sourceY + if (sourcePosition == PyreonFlowPosition.Bottom) offset else if (sourcePosition == PyreonFlowPosition.Top) -offset else 0.0
    val tx = targetX + if (targetPosition == PyreonFlowPosition.Right) offset else if (targetPosition == PyreonFlowPosition.Left) -offset else 0.0
    val ty = targetY + if (targetPosition == PyreonFlowPosition.Bottom) offset else if (targetPosition == PyreonFlowPosition.Top) -offset else 0.0
    val mx = (sx + tx) / 2; val my = (sy + ty) / 2; val r = borderRadius
    val segments = when {
        hs && !ht -> {
            val runY = if (ty > sy) ty - r else ty + r; val outX = sx + if (tx > sx) r else -r
            listOf(PyreonFlowEdgeSegment.move(sourceX, sourceY), PyreonFlowEdgeSegment.line(sx, sy), PyreonFlowEdgeSegment.line(sx, runY), PyreonFlowEdgeSegment.quad(outX, ty, sx, ty), PyreonFlowEdgeSegment.line(tx, ty), PyreonFlowEdgeSegment.line(targetX, targetY))
        }
        !hs && ht -> {
            val runX = if (tx > sx) tx - r else tx + r; val outY = sy + if (ty > sy) r else -r
            listOf(PyreonFlowEdgeSegment.move(sourceX, sourceY), PyreonFlowEdgeSegment.line(sx, sy), PyreonFlowEdgeSegment.line(runX, sy), PyreonFlowEdgeSegment.quad(tx, outY, tx, sy), PyreonFlowEdgeSegment.line(tx, ty), PyreonFlowEdgeSegment.line(targetX, targetY))
        }
        hs && ht -> listOf(PyreonFlowEdgeSegment.move(sourceX, sourceY), PyreonFlowEdgeSegment.line(sx, sourceY), PyreonFlowEdgeSegment.line(mx, sourceY), PyreonFlowEdgeSegment.quad(mx, my, mx, sourceY), PyreonFlowEdgeSegment.line(mx, targetY), PyreonFlowEdgeSegment.line(tx, targetY), PyreonFlowEdgeSegment.line(targetX, targetY))
        else -> listOf(PyreonFlowEdgeSegment.move(sourceX, sourceY), PyreonFlowEdgeSegment.line(sourceX, sy), PyreonFlowEdgeSegment.line(sourceX, my), PyreonFlowEdgeSegment.quad(mx, my, sourceX, my), PyreonFlowEdgeSegment.line(targetX, my), PyreonFlowEdgeSegment.line(targetX, ty), PyreonFlowEdgeSegment.line(targetX, targetY))
    }
    return PyreonFlowPathResult((sourceX + targetX) / 2, (sourceY + targetY) / 2, segments)
}

fun pyreonStepPath(sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition = PyreonFlowPosition.Bottom, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition = PyreonFlowPosition.Top, offset: Double = 20.0) =
    pyreonSmoothStepPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, 0.0, offset)

fun pyreonEdgePath(type: String, sourceX: Double, sourceY: Double, sourcePosition: PyreonFlowPosition, targetX: Double, targetY: Double, targetPosition: PyreonFlowPosition, borderRadius: Double = 5.0, offset: Double = 20.0, curvature: Double = 0.25): PyreonFlowPathResult = when (type) {
    "smoothstep" -> pyreonSmoothStepPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius, offset)
    "straight" -> pyreonStraightPath(sourceX, sourceY, targetX, targetY)
    "step" -> pyreonStepPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offset)
    else -> pyreonBezierPath(sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature)
}

fun pyreonFlowConnectionPreview(type: String, source: PyreonFlowInteractiveHandle, target: PyreonFlowPathPoint): List<PyreonFlowEdgeSegment> = when (type) {
    "smoothstep" -> pyreonSmoothStepPath(source.x, source.y, source.position, target.x, target.y, PyreonFlowPosition.Left).segments
    "straight" -> pyreonStraightPath(source.x, source.y, target.x, target.y).segments
    "step" -> pyreonStepPath(source.x, source.y, source.position, target.x, target.y, PyreonFlowPosition.Left).segments
    else -> pyreonBezierPath(source.x, source.y, source.position, target.x, target.y, PyreonFlowPosition.Left).segments
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
data class PyreonFlowMarkerGlyph(val points: List<PyreonFlowPathPoint>, val closed: Boolean, val color: String, val strokeWidth: Double)

fun pyreonFlowMarkerGlyph(marker: PyreonFlowMarker, segments: List<PyreonFlowEdgeSegment>, atStart: Boolean, edgeColor: String): PyreonFlowMarkerGlyph? {
    if (segments.size < 2) return null
    val tip: PyreonFlowPathPoint; val toward: PyreonFlowPathPoint
    if (atStart) {
        val first = segments.first(); val next = segments[1]
        tip = PyreonFlowPathPoint(first.x, first.y); toward = PyreonFlowPathPoint(next.c1x ?: next.cx ?: next.x, next.c1y ?: next.cy ?: next.y)
    } else {
        val last = segments.last(); val previous = segments[segments.lastIndex - 1]
        tip = PyreonFlowPathPoint(last.x, last.y); toward = PyreonFlowPathPoint(last.c2x ?: last.cx ?: previous.x, last.c2y ?: last.cy ?: previous.y)
    }
    var dx = tip.x - toward.x; var dy = tip.y - toward.y
    val length = hypot(dx, dy); if (length <= 0.0) return null
    dx /= length; dy /= length
    val back = PyreonFlowPathPoint(tip.x - dx * marker.width, tip.y - dy * marker.width)
    val px = -dy * marker.height / 2; val py = dx * marker.height / 2
    val a = PyreonFlowPathPoint(back.x + px, back.y + py); val b = PyreonFlowPathPoint(back.x - px, back.y - py)
    return PyreonFlowMarkerGlyph(if (marker.type == "arrowclosed") listOf(tip, a, b) else listOf(a, tip, b), marker.type == "arrowclosed", marker.color ?: edgeColor, marker.strokeWidth)
}

private fun pyreonPointSegmentDistance(point: PyreonFlowPathPoint, a: PyreonFlowPathPoint, b: PyreonFlowPathPoint): Double {
    val dx = b.x - a.x; val dy = b.y - a.y; val length2 = dx * dx + dy * dy
    if (length2 == 0.0) return hypot(point.x - a.x, point.y - a.y)
    val t = (((point.x - a.x) * dx + (point.y - a.y) * dy) / length2).coerceIn(0.0, 1.0)
    return hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy))
}

fun pyreonFlowEdgeDistance(segments: List<PyreonFlowEdgeSegment>, point: PyreonFlowPathPoint, curveSteps: Int = 24): Double {
    var current: PyreonFlowPathPoint? = null; var best = Double.POSITIVE_INFINITY
    for (segment in segments) {
        val end = PyreonFlowPathPoint(segment.x, segment.y)
        if (segment.kind == "move") { current = end; continue }
        val start = current
        if (start == null) { current = end; continue }
        var previous: PyreonFlowPathPoint = start
        val steps = if (segment.kind == "line") 1 else maxOf(1, curveSteps)
        for (i in 1..steps) {
            val t = i.toDouble() / steps; val u = 1 - t
            val sample: PyreonFlowPathPoint = when {
                segment.kind == "cubic" && segment.c1x != null && segment.c1y != null && segment.c2x != null && segment.c2y != null -> PyreonFlowPathPoint(u*u*u*start.x + 3*u*u*t*segment.c1x + 3*u*t*t*segment.c2x + t*t*t*end.x, u*u*u*start.y + 3*u*u*t*segment.c1y + 3*u*t*t*segment.c2y + t*t*t*end.y)
                segment.kind == "quad" && segment.cx != null && segment.cy != null -> PyreonFlowPathPoint(u*u*start.x + 2*u*t*segment.cx + t*t*end.x, u*u*start.y + 2*u*t*segment.cy + t*t*end.y)
                else -> end
            }
            best = minOf(best, pyreonPointSegmentDistance(point, previous, sample)); previous = sample
        }
        current = end
    }
    return best
}

data class PyreonFlowEdgeStroke(
    val id: String,
    val segments: List<PyreonFlowEdgeSegment>,
    val color: String = "#999999",
    val width: Double = 1.5,
    val dash: List<Double>? = null,
    val startMarker: PyreonFlowMarkerGlyph? = null,
    val endMarker: PyreonFlowMarkerGlyph? = null,
    val interactionWidth: Double = 20.0,
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

fun pyreonNearestFlowEdge(edges: List<PyreonFlowEdgeStroke>, point: PyreonFlowPathPoint, zoom: Double): PyreonFlowEdgeStroke? {
    val safeZoom = maxOf(zoom, 0.000001)
    return edges.filter { pyreonFlowEdgeDistance(it.segments, point) <= it.interactionWidth / 2 / safeZoom }
        .minByOrNull { pyreonFlowEdgeDistance(it.segments, point) }
}

/**
 * Parses SVG path data (the `d` attribute) into the same absolute segments the
 * path helpers produce, so a custom edge or connection line drawn from an
 * arbitrary path string renders natively. Every command is supported,
 * absolute and relative: M L H V C S Q T A Z. Arcs become cubic curves; `Z`
 * becomes a line back to the subpath start. Parsing stops at the first
 * malformed token, keeping what came before, as a browser does. The label
 * point is the centre of the segment endpoints' bounds. Mirrors Swift's
 * `PyreonFlowPathResult(svgPath:)`.
 */
fun pyreonFlowPathResultFromSvg(d: String): PyreonFlowPathResult {
    val segments = pyreonFlowParseSvgPath(d)
    val xs = segments.map { it.x }
    val ys = segments.map { it.y }
    val labelX = if (xs.isEmpty()) 0.0 else (xs.min() + xs.max()) / 2
    val labelY = if (ys.isEmpty()) 0.0 else (ys.min() + ys.max()) / 2
    return PyreonFlowPathResult(labelX, labelY, segments)
}

fun pyreonFlowParseSvgPath(d: String): List<PyreonFlowEdgeSegment> {
    var i = 0
    val out = mutableListOf<PyreonFlowEdgeSegment>()
    var cx = 0.0
    var cy = 0.0
    var startX = 0.0
    var startY = 0.0
    var lastCubic: Pair<Double, Double>? = null
    var lastQuad: Pair<Double, Double>? = null
    var command: Char? = null
    val commands = "MmLlHhVvCcSsQqTtAaZz"

    fun skipSeparators() {
        while (i < d.length && (d[i] == ' ' || d[i] == ',' || d[i] == '\n' || d[i] == '\t' || d[i] == '\r')) i++
    }
    fun number(): Double? {
        skipSeparators()
        if (i >= d.length) return null
        val start = i
        var sawDot = false
        var sawExp = false
        var sawDigit = false
        if (d[i] == '+' || d[i] == '-') i++
        while (i < d.length) {
            val c = d[i]
            if (c in '0'..'9') { sawDigit = true; i++ }
            else if (c == '.' && !sawDot && !sawExp) { sawDot = true; i++ }
            else if ((c == 'e' || c == 'E') && sawDigit && !sawExp) {
                sawExp = true; i++
                if (i < d.length && (d[i] == '+' || d[i] == '-')) i++
            } else break
        }
        return if (sawDigit) d.substring(start, i).toDoubleOrNull() else null
    }
    fun flag(): Boolean? {
        skipSeparators()
        if (i >= d.length || (d[i] != '0' && d[i] != '1')) return null
        val value = d[i] == '1'
        i++
        return value
    }

    while (true) {
        skipSeparators()
        if (i >= d.length) break
        if (d[i] in commands) {
            command = d[i]
            i++
        } else if (command == null) {
            break
        }
        val cmd = command ?: break
        val relative = cmd.isLowerCase()
        val ox = if (relative) cx else 0.0
        val oy = if (relative) cy else 0.0
        when (cmd.uppercaseChar()) {
            'Z' -> {
                out += PyreonFlowEdgeSegment.line(startX, startY)
                cx = startX; cy = startY
                lastCubic = null; lastQuad = null
                command = null
            }
            'M' -> {
                val x = number() ?: break
                val y = number() ?: break
                cx = ox + x; cy = oy + y; startX = cx; startY = cy
                out += PyreonFlowEdgeSegment.move(cx, cy)
                lastCubic = null; lastQuad = null
                // Coordinate pairs after a moveto are implicit linetos.
                command = if (relative) 'l' else 'L'
            }
            'L' -> {
                val x = number() ?: break
                val y = number() ?: break
                cx = ox + x; cy = oy + y
                out += PyreonFlowEdgeSegment.line(cx, cy); lastCubic = null; lastQuad = null
            }
            'H' -> {
                val x = number() ?: break
                cx = ox + x
                out += PyreonFlowEdgeSegment.line(cx, cy); lastCubic = null; lastQuad = null
            }
            'V' -> {
                val y = number() ?: break
                cy = oy + y
                out += PyreonFlowEdgeSegment.line(cx, cy); lastCubic = null; lastQuad = null
            }
            'C' -> {
                val x1 = number() ?: break
                val y1 = number() ?: break
                val x2 = number() ?: break
                val y2 = number() ?: break
                val x = number() ?: break
                val y = number() ?: break
                val c2 = Pair(ox + x2, oy + y2)
                cx = ox + x; cy = oy + y
                out += PyreonFlowEdgeSegment.cubic(cx, cy, ox + x1, oy + y1, c2.first, c2.second)
                lastCubic = c2; lastQuad = null
            }
            'S' -> {
                val x2 = number() ?: break
                val y2 = number() ?: break
                val x = number() ?: break
                val y = number() ?: break
                val c1 = lastCubic?.let { Pair(2 * cx - it.first, 2 * cy - it.second) } ?: Pair(cx, cy)
                val c2 = Pair(ox + x2, oy + y2)
                cx = ox + x; cy = oy + y
                out += PyreonFlowEdgeSegment.cubic(cx, cy, c1.first, c1.second, c2.first, c2.second)
                lastCubic = c2; lastQuad = null
            }
            'Q' -> {
                val x1 = number() ?: break
                val y1 = number() ?: break
                val x = number() ?: break
                val y = number() ?: break
                val c = Pair(ox + x1, oy + y1)
                cx = ox + x; cy = oy + y
                out += PyreonFlowEdgeSegment.quad(cx, cy, c.first, c.second)
                lastQuad = c; lastCubic = null
            }
            'T' -> {
                val x = number() ?: break
                val y = number() ?: break
                val c = lastQuad?.let { Pair(2 * cx - it.first, 2 * cy - it.second) } ?: Pair(cx, cy)
                cx = ox + x; cy = oy + y
                out += PyreonFlowEdgeSegment.quad(cx, cy, c.first, c.second)
                lastQuad = c; lastCubic = null
            }
            'A' -> {
                val rx = number() ?: break
                val ry = number() ?: break
                val rotation = number() ?: break
                val large = flag() ?: break
                val sweep = flag() ?: break
                val x = number() ?: break
                val y = number() ?: break
                val ex = ox + x
                val ey = oy + y
                out += pyreonFlowArcToCubics(cx, cy, rx, ry, rotation, large, sweep, ex, ey)
                cx = ex; cy = ey
                lastCubic = null; lastQuad = null
            }
            else -> break
        }
    }
    return out
}

/** An SVG elliptical arc as cubic Béziers (SVG spec appendix F.6), at most a quarter turn per curve. */
internal fun pyreonFlowArcToCubics(
    x0: Double, y0: Double, rxIn: Double, ryIn: Double, rotation: Double,
    largeArc: Boolean, sweep: Boolean, x: Double, y: Double,
): List<PyreonFlowEdgeSegment> {
    if (x0 == x && y0 == y) return emptyList()
    var rx = kotlin.math.abs(rxIn)
    var ry = kotlin.math.abs(ryIn)
    if (rx == 0.0 || ry == 0.0) return listOf(PyreonFlowEdgeSegment.line(x, y))
    val phi = rotation * kotlin.math.PI / 180
    val cosPhi = kotlin.math.cos(phi)
    val sinPhi = kotlin.math.sin(phi)
    val dx = (x0 - x) / 2
    val dy = (y0 - y) / 2
    val x1p = cosPhi * dx + sinPhi * dy
    val y1p = -sinPhi * dx + cosPhi * dy
    val lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
    if (lambda > 1) { rx *= kotlin.math.sqrt(lambda); ry *= kotlin.math.sqrt(lambda) }
    val num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
    val den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
    var coef = if (den == 0.0) 0.0 else kotlin.math.sqrt(maxOf(0.0, num / den))
    if (largeArc == sweep) coef = -coef
    val cxp = coef * rx * y1p / ry
    val cyp = -coef * ry * x1p / rx
    val centerX = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2
    val centerY = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2
    fun angle(ux: Double, uy: Double, vx: Double, vy: Double) = kotlin.math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    val theta1 = angle(1.0, 0.0, (x1p - cxp) / rx, (y1p - cyp) / ry)
    var delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
    if (!sweep && delta > 0) delta -= 2 * kotlin.math.PI
    if (sweep && delta < 0) delta += 2 * kotlin.math.PI
    val pieces = maxOf(1, kotlin.math.ceil(kotlin.math.abs(delta) / (kotlin.math.PI / 2)).toInt())
    val step = delta / pieces
    val k = 4.0 / 3.0 * kotlin.math.tan(step / 4)
    fun point(a: Double): Pair<Double, Double> {
        val px = rx * kotlin.math.cos(a)
        val py = ry * kotlin.math.sin(a)
        return Pair(cosPhi * px - sinPhi * py + centerX, sinPhi * px + cosPhi * py + centerY)
    }
    fun derivative(a: Double): Pair<Double, Double> {
        val px = -rx * kotlin.math.sin(a)
        val py = ry * kotlin.math.cos(a)
        return Pair(cosPhi * px - sinPhi * py, sinPhi * px + cosPhi * py)
    }
    val out = mutableListOf<PyreonFlowEdgeSegment>()
    var t = theta1
    for (piece in 0 until pieces) {
        val t2 = t + step
        val p1 = point(t)
        val p2 = point(t2)
        val d1 = derivative(t)
        val d2 = derivative(t2)
        val end = if (piece == pieces - 1) Pair(x, y) else p2
        out += PyreonFlowEdgeSegment.cubic(end.first, end.second, p1.first + k * d1.first, p1.second + k * d1.second, p2.first - k * d2.first, p2.second - k * d2.second)
        t = t2
    }
    return out
}

// ─── Inline <svg> in a native Flow renderer ─────────────────────────────────

/**
 * One shape of a lowered `<svg>`: every SVG shape is lowered to path data by
 * the compiler, and paint arrives resolved (inheritance included). Mirrors
 * Swift's `PyreonFlowSvgShape`.
 */
data class PyreonFlowSvgShape(
    val result: PyreonFlowPathResult,
    /** The stroke colour; `null` draws no stroke (SVG `stroke: none`, the initial value). */
    val stroke: String? = null,
    val strokeWidth: Double = 1.0,
    /** The fill colour; `null` draws no fill (SVG `fill: none`). */
    val fill: String? = "#000000",
)

data class PyreonFlowSvgSize(val width: Double, val height: Double)
data class PyreonFlowSvgTransform(val scaleX: Double, val scaleY: Double, val translateX: Double, val translateY: Double)

/**
 * The `<svg>` element's rendered size, in dp. Explicit `width` and `height`
 * win; with one, the other follows the viewBox aspect; with neither, the
 * replaced-element default of 300 wide applies. Mirrors Swift.
 */
fun pyreonFlowSvgSize(width: Double?, height: Double?, viewBox: List<Double>?): PyreonFlowSvgSize {
    val aspect = if (viewBox != null && viewBox.size == 4 && viewBox[2] > 0 && viewBox[3] > 0) viewBox[3] / viewBox[2] else null
    return when {
        width != null && height != null -> PyreonFlowSvgSize(width, height)
        width != null -> PyreonFlowSvgSize(width, aspect?.let { width * it } ?: 150.0)
        height != null -> PyreonFlowSvgSize(aspect?.let { height / it } ?: 300.0, height)
        else -> PyreonFlowSvgSize(300.0, aspect?.let { 300.0 * it } ?: 150.0)
    }
}

/**
 * viewBox units onto the viewport, in dp: `xMidYMid meet` by default (uniform
 * fit, centred), non-uniform when [stretch] (`preserveAspectRatio="none"`).
 * Without a viewBox, user units are dp. Mirrors Swift.
 */
fun pyreonFlowSvgTransform(width: Double, height: Double, viewBox: List<Double>?, stretch: Boolean = false): PyreonFlowSvgTransform {
    if (viewBox == null || viewBox.size != 4 || viewBox[2] <= 0 || viewBox[3] <= 0) return PyreonFlowSvgTransform(1.0, 1.0, 0.0, 0.0)
    if (stretch) {
        val sx = width / viewBox[2]
        val sy = height / viewBox[3]
        return PyreonFlowSvgTransform(sx, sy, -viewBox[0] * sx, -viewBox[1] * sy)
    }
    val s = minOf(width / viewBox[2], height / viewBox[3])
    return PyreonFlowSvgTransform(s, s, -viewBox[0] * s + (width - viewBox[2] * s) / 2, -viewBox[1] * s + (height - viewBox[3] * s) / 2)
}

// ─── Auto-pan (mirrors the web's auto-pan.ts and Swift) ─────────────────────

/** How far to pan the viewport this frame while dragging at canvas point ([x], [y]). Mirrors Swift. */
fun pyreonFlowAutoPanVelocity(x: Double, y: Double, width: Double, height: Double, speed: Double = 15.0, threshold: Double = 40.0): PyreonFlowPathPoint {
    fun axis(value: Double, size: Double): Double = when {
        size <= 2 * threshold -> 0.0
        value < threshold -> minOf(maxOf(threshold - value, 1.0), threshold) / threshold
        value > size - threshold -> -minOf(maxOf(value - (size - threshold), 1.0), threshold) / threshold
        else -> 0.0
    }
    return PyreonFlowPathPoint(axis(x, width) * speed, axis(y, height) * speed)
}
