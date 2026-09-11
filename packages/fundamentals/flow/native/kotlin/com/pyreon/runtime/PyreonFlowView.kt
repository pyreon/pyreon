package com.pyreon.runtime

import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.matchParentSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.IntOffset
import kotlin.math.roundToInt

enum class PyreonFlowBackgroundVariant { Dots, Lines, Cross }

data class PyreonFlowBackgroundStyle(
    val variant: PyreonFlowBackgroundVariant = PyreonFlowBackgroundVariant.Dots,
    val gap: Double = 20.0,
    val size: Double = 1.0,
    val color: String = "#dddddd",
)

@Composable
fun PyreonFlowBackground(
    style: PyreonFlowBackgroundStyle,
    viewport: PyreonFlowViewport,
    modifier: Modifier = Modifier,
) {
    Canvas(modifier) {
        val step = maxOf(1f, (style.gap * viewport.zoom).toFloat())
        val radius = maxOf(0.5f, (style.size * viewport.zoom).toFloat())
        val x0 = viewport.x.toFloat() % step
        val y0 = viewport.y.toFloat() % step
        val color = pyreonFlowEdgeColor(style.color)
        when (style.variant) {
            PyreonFlowBackgroundVariant.Dots, PyreonFlowBackgroundVariant.Cross -> {
                var x = x0
                while (x <= size.width) {
                    var y = y0
                    while (y <= size.height) {
                        if (style.variant == PyreonFlowBackgroundVariant.Dots) {
                            drawCircle(color, radius, Offset(x, y))
                        } else {
                            drawLine(color, Offset(x - radius * 2, y), Offset(x + radius * 2, y), radius)
                            drawLine(color, Offset(x, y - radius * 2), Offset(x, y + radius * 2), radius)
                        }
                        y += step
                    }
                    x += step
                }
            }
            PyreonFlowBackgroundVariant.Lines -> {
                var x = x0
                while (x <= size.width) { drawLine(color, Offset(x, 0f), Offset(x, size.height), radius); x += step }
                var y = y0
                while (y <= size.height) { drawLine(color, Offset(0f, y), Offset(size.width, y), radius); y += step }
            }
        }
    }
}

/** Native Compose host for Flow state, rendering without a WebView. */
@Composable
fun <T> PyreonFlowView(
    state: PyreonFlowState<T>,
    modifier: Modifier = Modifier,
    edgeColor: String = "#999999",
    edgeWidth: Double = 1.5,
    background: PyreonFlowBackgroundStyle? = null,
    nodeContent: @Composable (PyreonFlowNode<T>) -> Unit,
) {
    val density = LocalDensity.current
    Box(
        modifier = modifier.onSizeChanged { size ->
            state.containerSize = PyreonFlowContainerSize(size.width.toDouble(), size.height.toDouble())
        },
    ) {
        Box(
            Modifier.matchParentSize().pointerInput(state) {
                detectTransformGestures { _, pan, zoom, _ ->
                    state.setViewport(
                        x = state.viewport.x + pan.x,
                        y = state.viewport.y + pan.y,
                    )
                    state.zoomTo(state.viewport.zoom * zoom)
                }
            },
        )

        if (background != null) {
            PyreonFlowBackground(background, state.viewport, Modifier.matchParentSize())
        }

        PyreonFlowEdgeCanvas(
            edges = pyreonFlowEdgeStrokes(state, edgeColor, edgeWidth),
            viewport = state.viewport,
            modifier = Modifier.matchParentSize(),
        )

        Box(
            Modifier.matchParentSize().graphicsLayer {
                translationX = state.viewport.x.toFloat()
                translationY = state.viewport.y.toFloat()
                scaleX = state.viewport.zoom.toFloat()
                scaleY = state.viewport.zoom.toFloat()
                transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f)
            },
        ) {
            for (node in state.nodes) {
                if (node.hidden == true) continue
                val absolute = state.getAbsolutePosition(node.id)
                val width = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
                val height = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
                var nodeModifier = Modifier
                    .offset { IntOffset(absolute.x.roundToInt(), absolute.y.roundToInt()) }
                    .requiredSize(
                        with(density) { width.toFloat().toDp() },
                        with(density) { height.toFloat().toDp() },
                    )
                    .semantics {
                        contentDescription = node.ariaLabel ?: node.id
                        selected = state.isNodeSelected(node.id)
                    }
                if (node.selectable != false) {
                    nodeModifier = nodeModifier.clickable { state.selectNode(node.id) }
                }
                if (node.draggable != false) {
                    nodeModifier = nodeModifier.pointerInput(node.id, state.viewport.zoom) {
                        detectDragGestures { change, amount ->
                            change.consume()
                            val current = state.getNode(node.id)?.position ?: return@detectDragGestures
                            state.updateNodePosition(
                                node.id,
                                PyreonXYPosition(
                                    current.x + amount.x,
                                    current.y + amount.y,
                                ),
                            )
                        }
                    }
                }
                Box(nodeModifier) { nodeContent(node) }
            }
        }
    }
}
