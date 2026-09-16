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
        .filter { it.type == type && kotlin.math.hypot(it.x - point.x, it.y - point.y) <= radius }
        .minByOrNull { kotlin.math.hypot(it.x - point.x, it.y - point.y) }
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
