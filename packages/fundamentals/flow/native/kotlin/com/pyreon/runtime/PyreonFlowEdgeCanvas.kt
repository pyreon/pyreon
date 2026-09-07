package com.pyreon.runtime

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
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
        withTransform({
            translate(left = viewport.x.toFloat(), top = viewport.y.toFloat())
            scale(scaleX = viewport.zoom.toFloat(), scaleY = viewport.zoom.toFloat(), pivot = Offset.Zero)
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
            }
        }
    }
}
