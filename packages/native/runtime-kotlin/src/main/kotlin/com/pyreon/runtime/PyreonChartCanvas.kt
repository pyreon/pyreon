package com.pyreon.runtime

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
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
    var from: PyreonChartPt,
    var to: PyreonChartPt,
    var stops: List<PyreonChartGradientStop>,
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
            grad = c.grad?.let { PyreonChartGradient(mp(it.from), mp(it.to), it.stops) },
            align = c.align?.let { if (it == "start") "end" else if (it == "end") "start" else it },
            rotate = c.rotate?.let { -it },
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

@Composable
fun PyreonChartCanvas(
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
                    } else {
                        val topLeft = Offset(r.x.toFloat(), r.y.toFloat())
                        val size = Size(r.w.toFloat(), r.h.toFloat())
                        if (brush != null) drawRect(brush = brush, topLeft = topLeft, size = size)
                        else
                            drawRect(
                                color = pyreonChartColor(fill), topLeft = topLeft, size = size)
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
