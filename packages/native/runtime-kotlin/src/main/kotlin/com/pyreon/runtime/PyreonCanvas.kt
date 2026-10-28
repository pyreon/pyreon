// `<Canvas>` from @pyreon/primitives — a fixed-size vector drawing surface.
//
// The compiler emits:
//
//   PyreonCanvas(width = 200.0, height = 120.0) {
//     PyreonShape(PyreonShapeSpec.Rect(10.0, 10.0, 80.0, 50.0, 6.0), fill = Color(…), stroke = null, strokeWidth = 0.0)
//     …
//   }
//
// Each shape is a full-canvas Compose `Canvas` draw layer stacked in a clipped
// Box, so its coordinates are the canvas's own (top-left origin, y down, dp)
// and later shapes draw over earlier ones — the iOS ZStack-of-Paths model and
// the web's stacked <svg> layers.

package com.pyreon.runtime

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material.ProvideTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.abs
import kotlin.math.min

/** A clipped, fixed-size, top-start drawing surface. */
@Composable
fun PyreonCanvas(
    width: Double,
    height: Double,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    Box(modifier = modifier.size(width.dp, height.dp).clipToBounds()) {
        content()
    }
}

/**
 * `<CanvasText>`: text whose TOP-LEFT sits at (x, y) in canvas coordinates —
 * the web draws it with `dominant-baseline="hanging"`, so the same numbers
 * place it the same way. The content is an ordinary `Text`, styled through the
 * provided text style.
 */
@Composable
fun PyreonCanvasText(
    x: Double,
    y: Double,
    size: Double,
    color: Color,
    content: @Composable () -> Unit,
) {
    Box(modifier = Modifier.offset(x.dp, y.dp)) {
        ProvideTextStyle(TextStyle(fontSize = size.sp, color = color)) {
            content()
        }
    }
}

/** The geometry of one shape primitive, in dp. */
sealed class PyreonShapeSpec {
    data class Rect(val x: Double, val y: Double, val width: Double, val height: Double, val radius: Double) : PyreonShapeSpec()
    data class Circle(val cx: Double, val cy: Double, val r: Double) : PyreonShapeSpec()
    data class Line(val x1: Double, val y1: Double, val x2: Double, val y2: Double) : PyreonShapeSpec()
    data class Svg(val d: String) : PyreonShapeSpec()

    /** The path in dp; the draw layer scales it by the density. */
    fun toPath(): Path = when (this) {
        is Rect -> Path().apply {
            val r = androidx.compose.ui.geometry.Rect(x.toFloat(), y.toFloat(), (x + width).toFloat(), (y + height).toFloat())
            // A radius past half the short side is clamped, as SVG `rx` is.
            val clamped = min(radius, min(abs(width), abs(height)) / 2).toFloat()
            if (clamped > 0f) addRoundRect(RoundRect(r, CornerRadius(clamped, clamped))) else addRect(r)
        }
        is Circle -> Path().apply {
            addOval(androidx.compose.ui.geometry.Rect(Offset(cx.toFloat(), cy.toFloat()), r.toFloat()))
        }
        is Line -> Path().apply {
            moveTo(x1.toFloat(), y1.toFloat())
            lineTo(x2.toFloat(), y2.toFloat())
        }
        // androidx's own SVG path-data parser — every command, arcs included.
        // It throws on malformed data; an empty path is the browser's answer.
        is Svg -> runCatching { PathParser().parsePathString(d).toPath() }.getOrElse { Path() }
    }
}

/**
 * One filled and/or stroked shape. Fill first, stroke on top — the SVG paint
 * order. The path is built in dp and drawn inside a density scale, so the
 * stroke width is in dp as well, matching the canvas units.
 */
@Composable
fun PyreonShape(
    shape: PyreonShapeSpec,
    fill: Color? = null,
    stroke: Color? = null,
    strokeWidth: Double = 0.0,
) {
    val path = remember(shape) { shape.toPath() }
    Canvas(modifier = Modifier.fillMaxSize()) {
        scale(density, pivot = Offset.Zero) {
            if (fill != null) drawPath(path, fill)
            if (stroke != null) drawPath(path, stroke, style = Stroke(width = strokeWidth.toFloat()))
        }
    }
}
