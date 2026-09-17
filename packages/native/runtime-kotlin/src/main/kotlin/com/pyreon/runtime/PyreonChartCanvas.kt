package com.pyreon.runtime

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.animation.core.withInfiniteAnimationFrameNanos
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect as ComposeRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.graphics.nativeCanvas
import android.graphics.Paint
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

// The chart draw-list contract — the Kotlin twin of PyreonChartCanvas.swift.
// The RUNTIME owns these types; the generated PyreonChartEngine geometry
// (gen-native-chart-engine, follow-up) references them rather than
// re-declaring. Field-for-field the fat-struct lowering of the engine's
// `DrawCmd` union: `kind` discriminates, variant fields default null.
data class PyreonChartPt(var x: Double, var y: Double)

data class PyreonChartRect(var x: Double, var y: Double, var w: Double, var h: Double)

/**
 * One colour along a gradient's axis, and the gradient itself — runtime-owned
 * like PyreonChartPt/Rect/DrawCmd so the draw-command vocabulary lives in one
 * place on both targets.
 */
data class PyreonChartGradientStop(var offset: Double, var color: String)

data class PyreonChartGradient(
    /** Linear: the ramp's start. Radial: the centre. */
    var from: PyreonChartPt,
    /** Linear: the ramp's end. Radial: a point ON the outer circle — its distance from `from` is the radius. */
    var to: PyreonChartPt,
    var stops: List<PyreonChartGradientStop>,
    /** A radial ramp instead of a linear one; both shapes are two points, so mirror and transpose move it unchanged. */
    var radial: Boolean = false,
)

data class PyreonChartPattern(
    var kind: String,
    var color: String,
    var spacing: Double,
    var width: Double,
)

data class PyreonDrawCmd(
    var kind: String,
    var rect: PyreonChartRect? = null,
    var from: PyreonChartPt? = null,
    var to: PyreonChartPt? = null,
    var stroke: String? = null,
    var width: Double? = null,
    var dash: List<Double>? = null,
    var points: List<PyreonChartPt>? = null,
    var fill: String? = null,
    /**
     * Corner radii for a `rect` — [topLeft, topRight, bottomRight, bottomLeft],
     * in engine units. Clamped through the engine's `cornerRadii`, so this
     * canvas rounds by the same numbers the web canvas and the SVG do.
     */
    var corners: List<Double>? = null,
    /** Paint the fill as a linear gradient; `fill` stays the fallback. */
    var grad: PyreonChartGradient? = null,
    var pattern: PyreonChartPattern? = null,
    var center: PyreonChartPt? = null,
    var radius: Double? = null,
    var text: String? = null,
    var at: PyreonChartPt? = null,
    var size: Double? = null,
    var align: String? = null,
    var baseline: String? = null,
    /** Rotation about `at` in degrees, clockwise positive — a slanted axis label. */
    var rotate: Double? = null,
)

/**
 * Parse the engine's color strings — `#rgb`, `#rrggbb`, `rgb(r, g, b)` and
 * `rgba(r, g, b, a)`. An unknown string paints transparent rather than
 * throwing: a wrong color must never take the chart down.
 */
fun pyreonChartColor(s: String): Color {
    val str = s.trim()
    if (str.startsWith("#")) {
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
        return Color.Transparent
    }
    if (str.startsWith("rgba(") || str.startsWith("rgb(")) {
        val inner = str.substringAfter("(").substringBeforeLast(")")
        val parts = inner.split(",").map { it.trim().toDoubleOrNull() ?: 0.0 }
        if (parts.size >= 3) {
            val a = if (parts.size >= 4) parts[3] else 1.0
            return Color(
                (parts[0] / 255.0).toFloat(),
                (parts[1] / 255.0).toFloat(),
                (parts[2] / 255.0).toFloat(),
                a.toFloat())
        }
    }
    return Color.Transparent
}

/**
 * A Compose Canvas walking the engine's flat draw list — the native twin of
 * canvas-web's renderer (same dispatch, same text-anchor semantics).
 */
/**
 * Text width in engine units (dp) — the MeasureText the layout functions
 * take. The draw list is scaled by the density once at paint time, so the
 * measure is taken at the unscaled size: measureText is linear in the
 * text size, which makes dp-at-1x the same number as px-at-density / density.
 */
fun pyreonChartMeasure(text: String, size: Double): Double {
    val p = Paint()
    p.textSize = size.toFloat()
    p.isAntiAlias = true
    return p.measureText(text).toDouble()
}

/**
 * Move a draw list down the canvas — the host sits a plot below the title and
 * legend it drew at (0, 0). Translating the commands keeps every layout
 * function at (0, 0), exactly as the web hosts do (shiftCmd in Chart.tsx).
 */
fun pyreonShiftCmds(cmds: List<PyreonDrawCmd>, dy: Double): List<PyreonDrawCmd> = pyreonShiftCmdsXY(cmds, 0.0, dy)

/**
 * The two-axis form: a legend placed on the LEFT indents the plot as well as
 * a title pushes it down, so the host needs both offsets in one pass.
 */
fun pyreonShiftCmdsXY(cmds: List<PyreonDrawCmd>, dx: Double, dy: Double): List<PyreonDrawCmd> {
    if (dx == 0.0 && dy == 0.0) return cmds
    return cmds.map { c ->
        c.copy(
            rect = c.rect?.let { PyreonChartRect(it.x + dx, it.y + dy, it.w, it.h) },
            from = c.from?.let { PyreonChartPt(it.x + dx, it.y + dy) },
            to = c.to?.let { PyreonChartPt(it.x + dx, it.y + dy) },
            points = c.points?.map { PyreonChartPt(it.x + dx, it.y + dy) },
            center = c.center?.let { PyreonChartPt(it.x + dx, it.y + dy) },
            at = c.at?.let { PyreonChartPt(it.x + dx, it.y + dy) },
        )
    }
}

/**
 * Widen a chart channel to `Double`.
 *
 * The Swift twin of the same name exists because PMTC types a bare `number`
 * as `Int` and every engine function takes `Double`; emitting the coercion by
 * NAME lets one target-neutral desugar serve both backends instead of each
 * spelling its own conversion.
 */
fun pyreonChartDouble(v: Double): Double = v

fun pyreonChartDouble(v: Int): Double = v.toDouble()

/** Locale-aware chart formatters matching the web host's `Intl` defaults. */
fun pyreonLocaleNumberFormatter(tag: String): (Double) -> String {
    val locale = Locale.forLanguageTag(tag).takeIf { it.language.isNotEmpty() } ?: Locale.ENGLISH
    val formatter = NumberFormat.getNumberInstance(locale).apply {
        minimumFractionDigits = 0
        maximumFractionDigits = 2
        isGroupingUsed = true
    }
    return { value -> if (value.isFinite()) formatter.format(value) else "" }
}

fun pyreonLocaleDateFormatter(tag: String): (Double) -> String {
    val locale = Locale.forLanguageTag(tag).takeIf { it.language.isNotEmpty() } ?: Locale.ENGLISH
    val pattern = android.text.format.DateFormat.getBestDateTimePattern(locale, "MMMd")
    val formatter = SimpleDateFormat(pattern, locale).apply { timeZone = TimeZone.getTimeZone("UTC") }
    return { value -> if (value.isFinite()) formatter.format(Date(value.toLong())) else "" }
}

/**
 * Mirror a draw list about the canvas's vertical centreline — a right-to-left
 * chart IS the mirror of its left-to-right one.
 *
 * The twin of `mirrorCmds` in the web engine (`engine/rtl.ts`), hand-written
 * here for the same reason `pyreonShiftCmds` is: the draw command is a
 * discriminated union in TypeScript and this flat struct on native, so the
 * web switch has no lowering. `native-chart-mirror-parity.test.ts` runs the
 * same commands through both and compares the numbers, so the two cannot
 * drift.
 *
 * A rect's `x` is its LEFT edge, so the mirrored left edge is the mirror of
 * its RIGHT edge; corner radii swap left-to-right; a text anchor flips and a
 * rotated label's angle negates. Strings are never reversed.
 */
fun pyreonMirrorCmds(cmds: List<PyreonDrawCmd>, width: Double): List<PyreonDrawCmd> {
    fun mx(x: Double): Double = width - x
    fun mp(p: PyreonChartPt): PyreonChartPt = PyreonChartPt(mx(p.x), p.y)
    return cmds.map { c ->
        c.copy(
            rect = c.rect?.let { PyreonChartRect(mx(it.x + it.w), it.y, it.w, it.h) },
            from = c.from?.let { mp(it) },
            to = c.to?.let { mp(it) },
            points = c.points?.map { mp(it) },
            center = c.center?.let { mp(it) },
            at = c.at?.let { mp(it) },
            corners = c.corners?.let { if (it.size == 4) listOf(it[1], it[0], it[3], it[2]) else it },
            grad = c.grad?.let { PyreonChartGradient(mp(it.from), mp(it.to), it.stops, it.radial) },
            align = c.align?.let { if (it == "start") "end" else if (it == "end") "start" else it },
            rotate = c.rotate?.let { -it },
        )
    }
}

/**
 * Transpose a draw list — a VERTICAL sankey / calendar / parallel is the
 * horizontal one reflected across the diagonal. The twin of the web engine's
 * `transposeCmds` and the iOS runtime's `pyreonTransposeCmds`; parity is
 * asserted by EXECUTION, so every field it touches must match field for field.
 */
fun pyreonTransposeCmds(cmds: List<PyreonDrawCmd>): List<PyreonDrawCmd> {
    fun tp(p: PyreonChartPt): PyreonChartPt = PyreonChartPt(p.y, p.x)
    return cmds.map { c ->
        c.copy(
            rect = c.rect?.let { PyreonChartRect(it.y, it.x, it.h, it.w) },
            from = c.from?.let { tp(it) },
            to = c.to?.let { tp(it) },
            points = c.points?.map { tp(it) },
            center = c.center?.let { tp(it) },
            at = c.at?.let { tp(it) },
            // Corners run top-left, top-right, bottom-right, bottom-left; the diagonal fixes the first and third and swaps the other two.
            corners = c.corners?.let { if (it.size == 4) listOf(it[0], it[3], it[2], it[1]) else it },
            grad = c.grad?.let { PyreonChartGradient(tp(it.from), tp(it.to), it.stops, it.radial) },
            // Text is anchored, never reflected: the horizontal anchor becomes the vertical one and back.
            align = c.baseline?.let { if (it == "top") "start" else if (it == "bottom") "end" else "middle" } ?: c.align,
            baseline = c.align?.let { if (it == "start") "top" else if (it == "end") "bottom" else "middle" } ?: c.baseline,
            rotate = c.rotate?.let { 90.0 - it },
        )
    }
}

/**
 * A Compose brush from the engine's gradient, or null when there is none (the
 * caller then paints the solid colour).
 */
fun pyreonChartBrush(grad: PyreonChartGradient?): Brush? {
    val g = grad ?: return null
    if (g.stops.isEmpty()) return null
    val stops =
        g.stops
            .map { st ->
                Pair(
                    st.offset.coerceIn(0.0, 1.0).toFloat(), pyreonChartColor(st.color))
            }
            .toTypedArray()
    if (g.radial) {
        val dx = g.to.x - g.from.x
        val dy = g.to.y - g.from.y
        return Brush.radialGradient(
            colorStops = stops,
            center = Offset(g.from.x.toFloat(), g.from.y.toFloat()),
            radius = kotlin.math.sqrt(dx * dx + dy * dy).toFloat().coerceAtLeast(Float.MIN_VALUE))
    }
    return Brush.linearGradient(
        colorStops = stops,
        start = Offset(g.from.x.toFloat(), g.from.y.toFloat()),
        end = Offset(g.to.x.toFloat(), g.to.y.toFloat()))
}

/**
 * The four arcs of a rounded rect — the twin of canvas-web's `traceRoundedRect`
 * and svg.ts's path builder, corner for corner.
 */
fun pyreonRoundedRectPath(r: PyreonChartRect, radii: List<Double>): Path {
    val tl = radii[0].toFloat()
    val tr = radii[1].toFloat()
    val br = radii[2].toFloat()
    val bl = radii[3].toFloat()
    val x = r.x.toFloat()
    val y = r.y.toFloat()
    val w = r.w.toFloat()
    val h = r.h.toFloat()
    val p = Path()
    p.moveTo(x + tl, y)
    p.lineTo(x + w - tr, y)
    if (tr > 0f) p.arcTo(ComposeRect(x + w - 2f * tr, y, x + w, y + 2f * tr), -90f, 90f, false)
    p.lineTo(x + w, y + h - br)
    if (br > 0f)
        p.arcTo(ComposeRect(x + w - 2f * br, y + h - 2f * br, x + w, y + h), 0f, 90f, false)
    p.lineTo(x + bl, y + h)
    if (bl > 0f) p.arcTo(ComposeRect(x, y + h - 2f * bl, x + 2f * bl, y + h), 90f, 90f, false)
    p.lineTo(x, y + tl)
    if (tl > 0f) p.arcTo(ComposeRect(x, y, x + 2f * tl, y + 2f * tl), 180f, 90f, false)
    p.close()
    return p
}

private fun DrawScope.pyreonPaintPattern(pattern: PyreonChartPattern?, clip: Path, bounds: PyreonChartRect) {
    pattern ?: return
    val spacing = pattern.spacing.coerceAtLeast(2.0).toFloat()
    val width = pattern.width.coerceAtLeast(0.5).toFloat()
    val color = pyreonChartColor(pattern.color)
    clipPath(clip) {
        if (pattern.kind == "dots") {
            var y = bounds.y.toFloat()
            while (y <= (bounds.y + bounds.h).toFloat()) {
                var x = bounds.x.toFloat()
                while (x <= (bounds.x + bounds.w).toFloat()) {
                    drawCircle(color = color, radius = width / 2f, center = Offset(x, y))
                    x += spacing
                }
                y += spacing
            }
        } else {
            val span = (bounds.w + bounds.h).toFloat()
            var d = -bounds.h.toFloat()
            while (d <= bounds.w.toFloat()) {
                drawLine(color, Offset(bounds.x.toFloat() + d, (bounds.y + bounds.h).toFloat()), Offset(bounds.x.toFloat() + d + span, bounds.y.toFloat()), width)
                if (pattern.kind == "cross") {
                    drawLine(color, Offset(bounds.x.toFloat() + d, bounds.y.toFloat()), Offset(bounds.x.toFloat() + d + span, (bounds.y + bounds.h).toFloat()), width)
                }
                d += spacing
            }
        }
    }
}

private fun pyreonChartMix(a: Double, b: Double, t: Double): Double = a + (b - a) * t
private fun pyreonChartMixPoint(a: PyreonChartPt, b: PyreonChartPt, t: Double) =
    PyreonChartPt(pyreonChartMix(a.x, b.x, t), pyreonChartMix(a.y, b.y, t))

fun pyreonSameChartCommandShape(a: List<PyreonDrawCmd>, b: List<PyreonDrawCmd>): Boolean {
    if (a.size != b.size) return false
    for (i in a.indices) {
        if (a[i].kind != b[i].kind) return false
        if ((a[i].kind == "polyline" || a[i].kind == "polygon") && a[i].points?.size != b[i].points?.size) return false
        if (a[i].kind == "text" && a[i].text != b[i].text) return false
    }
    return true
}

fun pyreonTweenChartCommands(from: List<PyreonDrawCmd>, to: List<PyreonDrawCmd>, progress: Double): List<PyreonDrawCmd> {
    if (progress >= 1.0 || !pyreonSameChartCommandShape(from, to)) return to
    return to.indices.map { i ->
        val a = from[i]
        val b = to[i]
        when (b.kind) {
            "rect" -> b.copy(rect = if (a.rect != null && b.rect != null) PyreonChartRect(
                pyreonChartMix(a.rect!!.x, b.rect!!.x, progress), pyreonChartMix(a.rect!!.y, b.rect!!.y, progress),
                pyreonChartMix(a.rect!!.w, b.rect!!.w, progress), pyreonChartMix(a.rect!!.h, b.rect!!.h, progress)) else b.rect)
            "line" -> b.copy(
                from = if (a.from != null && b.from != null) pyreonChartMixPoint(a.from!!, b.from!!, progress) else b.from,
                to = if (a.to != null && b.to != null) pyreonChartMixPoint(a.to!!, b.to!!, progress) else b.to)
            "polyline", "polygon" -> b.copy(points = if (a.points != null && b.points != null && a.points!!.size == b.points!!.size)
                b.points!!.indices.map { pyreonChartMixPoint(a.points!![it], b.points!![it], progress) } else b.points)
            "circle" -> b.copy(
                center = if (a.center != null && b.center != null) pyreonChartMixPoint(a.center!!, b.center!!, progress) else b.center,
                radius = if (a.radius != null && b.radius != null) pyreonChartMix(a.radius!!, b.radius!!, progress) else b.radius)
            "text" -> b.copy(
                at = if (a.at != null && b.at != null) pyreonChartMixPoint(a.at!!, b.at!!, progress) else b.at,
                size = pyreonChartMix(a.size ?: b.size ?: 0.0, b.size ?: 0.0, progress))
            else -> b
        }
    }
}

private fun pyreonChartBounds(command: PyreonDrawCmd): PyreonChartRect {
    val points = when {
        command.rect != null -> listOf(PyreonChartPt(command.rect!!.x, command.rect!!.y), PyreonChartPt(command.rect!!.x + command.rect!!.w, command.rect!!.y + command.rect!!.h))
        command.from != null && command.to != null -> listOf(command.from!!, command.to!!)
        command.points != null -> command.points!!
        command.center != null && command.radius != null -> listOf(PyreonChartPt(command.center!!.x - command.radius!!, command.center!!.y - command.radius!!), PyreonChartPt(command.center!!.x + command.radius!!, command.center!!.y + command.radius!!))
        command.at != null -> listOf(command.at!!)
        else -> emptyList()
    }
    if (points.isEmpty()) return PyreonChartRect(0.0, 0.0, 0.0, 0.0)
    var minX = points[0].x; var maxX = minX; var minY = points[0].y; var maxY = minY
    for (point in points.drop(1)) {
        minX = minOf(minX, point.x); maxX = maxOf(maxX, point.x)
        minY = minOf(minY, point.y); maxY = maxOf(maxY, point.y)
    }
    return PyreonChartRect(minX, minY, maxX - minX, maxY - minY)
}

private fun pyreonCollapsedChartCommand(command: PyreonDrawCmd): PyreonDrawCmd {
    val box = pyreonChartBounds(command)
    val center = PyreonChartPt(box.x + box.w / 2.0, box.y + box.h / 2.0)
    return when (command.kind) {
        "rect" -> command.copy(rect = PyreonChartRect(center.x, center.y, 0.0, 0.0))
        "line" -> command.copy(from = center, to = center)
        "polyline", "polygon" -> command.copy(points = List(command.points?.size ?: 0) { center.copy() })
        "circle" -> command.copy(center = center, radius = 0.0)
        "text" -> command.copy(at = center, size = 0.0)
        else -> command
    }
}

private fun pyreonChartTarget(target: PyreonDrawCmd, source: PyreonDrawCmd?): PyreonDrawCmd {
    if (source == null) return pyreonCollapsedChartCommand(target)
    val box = pyreonChartBounds(source)
    val center = PyreonChartPt(box.x + box.w / 2.0, box.y + box.h / 2.0)
    return when (target.kind) {
        "rect" -> target.copy(rect = box)
        "line" -> target.copy(from = PyreonChartPt(box.x, box.y), to = PyreonChartPt(box.x + box.w, box.y + box.h))
        "polyline", "polygon" -> target.copy(points = List(target.points?.size ?: 0) { center.copy() })
        "circle" -> target.copy(center = center, radius = maxOf(box.w, box.h) / 2.0)
        "text" -> target.copy(at = center, size = if (source.kind == "text") source.size else 0.0)
        else -> target
    }
}

fun pyreonUniversalTweenChartCommands(from: List<PyreonDrawCmd>, to: List<PyreonDrawCmd>, progress: Double): List<PyreonDrawCmd> {
    if (progress >= 1.0) return to
    if (pyreonSameChartCommandShape(from, to)) return pyreonTweenChartCommands(from, to, progress)
    val used = mutableSetOf<Int>()
    val out = mutableListOf<PyreonDrawCmd>()
    for (target in to) {
        var sourceIndex = from.indices.firstOrNull { it !in used && from[it].kind == target.kind }
        if (sourceIndex == null) sourceIndex = from.indices.firstOrNull { it !in used }
        if (sourceIndex != null) used.add(sourceIndex)
        val start = pyreonChartTarget(target, sourceIndex?.let { from[it] })
        out.add(pyreonTweenChartCommands(listOf(start), listOf(target), progress)[0])
    }
    for (i in from.indices) if (i !in used) {
        out.add(pyreonTweenChartCommands(listOf(from[i]), listOf(pyreonCollapsedChartCommand(from[i])), progress)[0])
    }
    return out
}

@Composable
private fun PyreonStaticChartCanvas(
    cmds: List<PyreonDrawCmd>,
    modifier: Modifier = Modifier,
) {
    // The draw list is in density-independent units — the same numbers the web
    // canvas paints in CSS px and SwiftUI in points — so scale by the density
    // once here rather than converting every coordinate and font size.
    val density = LocalDensity.current.density
    Canvas(modifier = modifier) {
        scale(scale = density, pivot = Offset.Zero) {
        for (c in cmds) {
            when (c.kind) {
                "rect" -> {
                    val r = c.rect ?: continue
                    val fill = c.fill ?: continue
                    val radii = cornerRadii(r, c.corners)
                    val brush = pyreonChartBrush(c.grad)
                    if (hasCorners(radii)) {
                        val path = pyreonRoundedRectPath(r, radii)
                        if (brush != null) drawPath(path = path, brush = brush, style = Fill)
                        else drawPath(path = path, color = pyreonChartColor(fill), style = Fill)
                        pyreonPaintPattern(c.pattern, path, r)
                    } else {
                        val topLeft = Offset(r.x.toFloat(), r.y.toFloat())
                        val size = Size(r.w.toFloat(), r.h.toFloat())
                        if (brush != null) drawRect(brush = brush, topLeft = topLeft, size = size)
                        else
                            drawRect(
                                color = pyreonChartColor(fill), topLeft = topLeft, size = size)
                        val path = Path().apply {
                            addRect(ComposeRect(r.x.toFloat(), r.y.toFloat(), (r.x + r.w).toFloat(), (r.y + r.h).toFloat()))
                        }
                        pyreonPaintPattern(c.pattern, path, r)
                    }
                }
                "line" -> {
                    val f = c.from ?: continue
                    val t = c.to ?: continue
                    val stroke = c.stroke ?: continue
                    val effect =
                        c.dash?.let {
                            PathEffect.dashPathEffect(it.map { d -> d.toFloat() }.toFloatArray())
                        }
                    drawLine(
                        color = pyreonChartColor(stroke),
                        start = Offset(f.x.toFloat(), f.y.toFloat()),
                        end = Offset(t.x.toFloat(), t.y.toFloat()),
                        strokeWidth = (c.width ?: 1.0).toFloat(),
                        pathEffect = effect)
                }
                "polyline" -> {
                    val pts = c.points ?: continue
                    val stroke = c.stroke ?: continue
                    if (pts.size < 2) continue
                    val p = Path()
                    p.moveTo(pts[0].x.toFloat(), pts[0].y.toFloat())
                    for (i in 1 until pts.size) p.lineTo(pts[i].x.toFloat(), pts[i].y.toFloat())
                    val effect =
                        c.dash?.let {
                            PathEffect.dashPathEffect(it.map { d -> d.toFloat() }.toFloatArray())
                        }
                    drawPath(
                        path = p,
                        color = pyreonChartColor(stroke),
                        style = Stroke(width = (c.width ?: 1.0).toFloat(), pathEffect = effect))
                }
                "polygon" -> {
                    val pts = c.points ?: continue
                    val fill = c.fill ?: continue
                    if (pts.size < 3) continue
                    val p = Path()
                    p.moveTo(pts[0].x.toFloat(), pts[0].y.toFloat())
                    for (i in 1 until pts.size) p.lineTo(pts[i].x.toFloat(), pts[i].y.toFloat())
                    p.close()
                    val pbrush = pyreonChartBrush(c.grad)
                    if (pbrush != null) drawPath(path = p, brush = pbrush, style = Fill)
                    else drawPath(path = p, color = pyreonChartColor(fill), style = Fill)
                    val minX = pts.minOf { it.x }
                    val maxX = pts.maxOf { it.x }
                    val minY = pts.minOf { it.y }
                    val maxY = pts.maxOf { it.y }
                    pyreonPaintPattern(c.pattern, p, PyreonChartRect(minX, minY, maxX - minX, maxY - minY))
                }
                "circle" -> {
                    val ctr = c.center ?: continue
                    val rad = c.radius ?: continue
                    val fill = c.fill ?: continue
                    drawCircle(
                        color = pyreonChartColor(fill),
                        radius = rad.toFloat(),
                        center = Offset(ctr.x.toFloat(), ctr.y.toFloat()))
                }
                "text" -> {
                    val txt = c.text ?: continue
                    val at = c.at ?: continue
                    val fill = c.fill ?: continue
                    val paint = Paint()
                    paint.color = android.graphics.Color.argb(
                        (pyreonChartColor(fill).alpha * 255).toInt(),
                        (pyreonChartColor(fill).red * 255).toInt(),
                        (pyreonChartColor(fill).green * 255).toInt(),
                        (pyreonChartColor(fill).blue * 255).toInt())
                    paint.textSize = (c.size ?: 12.0).toFloat() * density
                    paint.isAntiAlias = true
                    // web: textAlign start|center|end
                    paint.textAlign = when (c.align ?: "start") {
                        "middle" -> Paint.Align.CENTER
                        "end" -> Paint.Align.RIGHT
                        else -> Paint.Align.LEFT
                    }
                    // web: textBaseline top|middle|alphabetic — Android draws at
                    // the alphabetic baseline; offset via font metrics.
                    val fm = paint.fontMetrics
                    val y = when (c.baseline ?: "bottom") {
                        "top" -> at.y.toFloat() - fm.ascent
                        "middle" -> at.y.toFloat() - (fm.ascent + fm.descent) / 2f
                        else -> at.y.toFloat()
                    }
                    val rot = c.rotate ?: 0.0
                    if (rot != 0.0) {
                        // Rotate about the anchor; align/baseline apply in the
                        // rotated frame (the web canvas's translate + rotate).
                        val nc = drawContext.canvas.nativeCanvas
                        nc.save()
                        nc.rotate(rot.toFloat(), at.x.toFloat(), at.y.toFloat())
                        nc.drawText(txt, at.x.toFloat(), y, paint)
                        nc.restore()
                    } else {
                        drawContext.canvas.nativeCanvas.drawText(txt, at.x.toFloat(), y, paint)
                    }
                }
            }
        }
        }
    }
}

/** Draw-list transition host for reactive chart updates on Android. */
@Composable
fun PyreonChartCanvas(
    cmds: List<PyreonDrawCmd>,
    modifier: Modifier = Modifier,
    durationMs: Double = 350.0,
    universal: Boolean = false,
    animated: Boolean = true,
) {
    val context = LocalContext.current
    val reduceMotion = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    var from by remember { mutableStateOf(cmds) }
    var target by remember { mutableStateOf(cmds) }
    val progress = remember { Animatable(1f) }
    LaunchedEffect(cmds, durationMs, universal, reduceMotion) {
        from = if (universal) {
            pyreonUniversalTweenChartCommands(from, target, progress.value.toDouble())
        } else {
            pyreonTweenChartCommands(from, target, progress.value.toDouble())
        }
        target = cmds
        progress.snapTo(if (!animated || reduceMotion || durationMs <= 0.0 || from == target) 1f else 0f)
        if (progress.value < 1f) {
            progress.animateTo(1f, tween(durationMs.toInt(), easing = LinearEasing))
            from = target
        }
    }
    val rendered = if (universal) {
        pyreonUniversalTweenChartCommands(from, target, progress.value.toDouble())
    } else {
        pyreonTweenChartCommands(from, target, progress.value.toDouble())
    }
    PyreonStaticChartCanvas(rendered, modifier)
}

// ── Radial chart components ─────────────────────────────────────────────
//
// The native twins of `@pyreon/charts/plot`'s `<PieChart>` / `<GaugeChart>`.
// PMTC lowers those JSX components to these composables; the geometry comes
// from the GENERATED PyreonChartEngine (renderPie / renderGauge), so web and
// native draw from the same byte-locked math. Defaults mirror the web
// component bodies exactly (PieChart.tsx).

/** The web `<PieChart>` fallback palette, byte-for-byte. */
val pyreonChartPalette: List<String> =
    listOf("#0f766e", "#b45309", "#1d4ed8", "#b42318", "#15803d", "#7c3aed")

@Composable
fun <T> PyreonPieChart(
    data: List<T>,
    // Number, not Double: a TS `amount: number` field infers Int, and the
    // accessor's return coerces here rather than failing every Int column.
    value: (T) -> Number,
    label: (T) -> String,
    color: ((T) -> String)? = null,
    width: Double = 300.0,
    height: Double = 240.0,
    innerRadius: Double = 0.0,
    showLabels: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val slices = data.mapIndexed { i, d ->
        Slice(
            value = value(d).toDouble(),
            label = label(d),
            color = color?.invoke(d) ?: pyreonChartPalette[i % pyreonChartPalette.size])
    }
    val cmds = renderPie(
        slices,
        PyreonChartRect(x = 0.0, y = 0.0, w = width, h = height),
        PieOptions(
            innerRadius = innerRadius,
            showLabels = showLabels,
            labelColor = "#ffffff",
            fontSize = 11.0))
    PyreonChartCanvas(cmds, modifier.size(width.dp, height.dp))
}

@Composable
fun PyreonGaugeChart(
    value: Double,
    min: Double = 0.0,
    max: Double = 100.0,
    width: Double = 240.0,
    height: Double = 140.0,
    thickness: Double = 22.0,
    trackColor: String = "rgba(132,150,165,0.22)",
    valueColor: String = "#0f766e",
    showValue: Boolean = true,
    modifier: Modifier = Modifier,
) {
    // The half-circle occupies the top half of its box, so the drawing box is
    // twice the visible height — the web component's exact shape.
    val cmds = renderGauge(
        value,
        PyreonChartRect(x = 0.0, y = 0.0, w = width, h = height * 2.0),
        GaugeOptions(
            min = min,
            max = max,
            sweep = Math.PI,
            thickness = thickness,
            trackColor = trackColor,
            valueColor = valueColor)).toMutableList()
    if (showValue) {
        cmds.add(
            PyreonDrawCmd(
                kind = "text",
                fill = "#10161d",
                text = plain(value),
                at = PyreonChartPt(x = width / 2.0, y = height - 6.0),
                size = 20.0,
                align = "middle",
                baseline = "bottom"))
    }
    PyreonChartCanvas(cmds, modifier.size(width.dp, height.dp))
}

// ---- Entrance tween ---------------------------------------------------------

/** The web canvas host's entrance easing: cubic ease-out on a clamped 0..1 `t`. */
fun pyreonEntranceProgress(t: Double): Double {
    val c = if (t < 0.0) 0.0 else if (t > 1.0) 1.0 else t
    val u = 1.0 - c
    return 1.0 - u * u * u
}

/**
 * Drives a chart's one-time entrance (`animate`, on by default): `content`
 * receives the progress 0..1 on every frame of the tween and 1 afterwards —
 * the same `progress` the engine's render functions take on the web. Honours
 * the system animator scale (Developer options → "Animation duration scale"
 * off, the Android twin of `prefers-reduced-motion`) by rendering fully
 * formed at once. The Animatable settles at 1, so a finished chart recomposes
 * no more.
 */
/** The effect clock (mirror of Swift's `PyreonChartClock`): seconds since first composition, per frame; 0 when animations are off. */
@Composable
fun PyreonChartClock(content: @Composable (Double) -> Unit) {
    val context = LocalContext.current
    val reduceMotion = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    if (reduceMotion) {
        content(0.0)
        return
    }
    var seconds by remember { mutableStateOf(0.0) }
    LaunchedEffect(Unit) {
        var start = -1L
        // The INFINITE-animation frame API: it is what lets a UI test (and any
        // idling policy) treat a never-ending loop as settled. A plain
        // withFrameNanos loop kept the Compose test harness busy forever.
        while (true) {
            withInfiniteAnimationFrameNanos { now ->
                if (start < 0L) start = now
                seconds = (now - start) / 1_000_000_000.0
            }
        }
    }
    content(seconds)
}

@Composable
fun PyreonChartEntrance(durationMs: Double, content: @Composable (Double) -> Unit) {
    val context = LocalContext.current
    val reduceMotion = remember {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
    if (durationMs <= 0.0 || reduceMotion) {
        content(1.0)
        return
    }
    val t = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        t.animateTo(1f, tween(durationMs.toInt(), easing = LinearEasing))
    }
    content(pyreonEntranceProgress(t.value.toDouble()))
}
