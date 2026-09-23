package com.pyreon.runtime

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform

// The Android twin of PyreonFlowEdgeCanvas.swift. The geometry (segments,
// stroke record, Path builder, color parser) lives in
// PyreonFlowEdgeGeometry.kt, which the co-source gate verifies; THIS file is
// only the Compose Foundation `Canvas` composable, declared
// `pyreon.native.kotlinSdkOnly` in package.json because `Canvas`/`drawPath`
// are real SDK surface the stub harness does not model — device-gate territory.

/**
 * Draws every edge in [edges] under ONE viewport transform (pan + uniform
 * zoom — the DrawScope equivalent of the web edge layer's single CSS
 * transform on its `<svg>`), one `Canvas` draw pass, not one composable per
 * edge. Each stroke's `Path`/`Color`/dash are prebuilt (see
 * [PyreonFlowEdgeStroke]), so the pass allocates nothing per edge. Stroke
 * width and dash scale with the zoom through the transform — the same visual
 * result as v1's `width * zoom`. `StrokeCap.Butt` matches the web SVG layer
 * (no `stroke-linecap`) and the Swift twin; v1's rounded caps were a
 * per-target divergence.
 */
@Composable
fun PyreonFlowEdgeCanvas(
    edges: List<PyreonFlowEdgeStroke>,
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    modifier: Modifier = Modifier,
) {
    Canvas(modifier = modifier) {
        // Graph and viewport units are dp (iOS points, web CSS px); the canvas
        // draws px, so the density joins the zoom in the one transform.
        val unit = density
        withTransform({
            translate(left = viewport.x.toFloat() * unit, top = viewport.y.toFloat() * unit)
            scale(scaleX = viewport.zoom.toFloat() * unit, scaleY = viewport.zoom.toFloat() * unit, pivot = Offset.Zero)
        }) {
            for (edge in edges) {
                drawPath(
                    path = edge.path,
                    color = edge.resolvedColor,
                    style = Stroke(
                        width = edge.width.toFloat(),
                        cap = StrokeCap.Butt,
                        join = StrokeJoin.Round,
                        pathEffect = edge.pathEffect,
                    ),
                )
                for (marker in listOfNotNull(edge.startMarker, edge.endMarker)) {
                    val points = marker.points
                    if (points.isEmpty()) continue
                    val markerPath = androidx.compose.ui.graphics.Path().apply {
                        moveTo(points[0].x.toFloat(), points[0].y.toFloat())
                        for (point in points.drop(1)) lineTo(point.x.toFloat(), point.y.toFloat())
                        if (marker.closed) close()
                    }
                    if (marker.closed) drawPath(markerPath, pyreonFlowEdgeColor(marker.color))
                    else drawPath(markerPath, pyreonFlowEdgeColor(marker.color), style = Stroke(width = marker.strokeWidth.toFloat(), cap = StrokeCap.Butt, join = StrokeJoin.Round))
                }
            }
        }
    }
}

/** Compiler target for a shared-source custom edge SVG `<path>`. */
@Composable
fun PyreonFlowCustomEdgePath(
    result: PyreonFlowPathResult,
    /** The stroke colour; `null` draws no stroke (SVG `stroke: none`). */
    color: String? = "#999999",
    width: Double = 1.5,
    dash: List<Double>? = null,
    /** The fill colour; `null` draws no fill (SVG `fill: none`). */
    fill: String? = null,
    modifier: Modifier = Modifier,
) {
    val effect = dash?.let { PathEffect.dashPathEffect(it.map(Double::toFloat).toFloatArray()) }
    Canvas(modifier.fillMaxSize()) {
        val path = pyreonFlowEdgePath(result.segments)
        if (fill != null) drawPath(path, pyreonFlowEdgeColor(fill))
        if (color != null) {
            drawPath(path, pyreonFlowEdgeColor(color), style = Stroke(width = width.toFloat(), pathEffect = effect))
        }
    }
}
