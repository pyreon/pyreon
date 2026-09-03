package com.pyreon.runtime

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect as ComposeRect
import androidx.compose.ui.geometry.Size
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

// The chart draw-list contract — the Kotlin twin of PyreonChartCanvas.swift.
// The RUNTIME owns these types; the generated PyreonChartEngine geometry
// (gen-native-chart-engine, follow-up) references them rather than
// re-declaring. Field-for-field the fat-struct lowering of the engine's
// `DrawCmd` union: `kind` discriminates, variant fields default null.
data class PyreonChartPt(var x: Double, var y: Double)

data class PyreonChartRect(var x: Double, var y: Double, var w: Double, var h: Double)

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
    var center: PyreonChartPt? = null,
    var radius: Double? = null,
    var text: String? = null,
    var at: PyreonChartPt? = null,
    var size: Double? = null,
    var align: String? = null,
    var baseline: String? = null,
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
                    drawRect(
                        color = pyreonChartColor(fill),
                        topLeft = Offset(r.x.toFloat(), r.y.toFloat()),
                        size = Size(r.w.toFloat(), r.h.toFloat()))
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
                    drawPath(path = p, color = pyreonChartColor(fill), style = Fill)
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
                    drawContext.canvas.nativeCanvas.drawText(txt, at.x.toFloat(), y, paint)
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
