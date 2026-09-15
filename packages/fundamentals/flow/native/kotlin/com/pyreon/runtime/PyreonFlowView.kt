package com.pyreon.runtime

import androidx.compose.foundation.clickable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.Button
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

enum class PyreonFlowBackgroundVariant { Dots, Lines, Cross }

data class PyreonFlowBackgroundStyle(
    val variant: PyreonFlowBackgroundVariant = PyreonFlowBackgroundVariant.Dots,
    val gap: Double = 20.0,
    val size: Double = 1.0,
    val color: String = "#dddddd",
)

enum class PyreonFlowControlsPosition { TopLeft, TopRight, BottomLeft, BottomRight }

data class PyreonFlowControlsStyle(
    val showZoomIn: Boolean = true,
    val showZoomOut: Boolean = true,
    val showFitView: Boolean = true,
    val showLock: Boolean = false,
    val position: PyreonFlowControlsPosition = PyreonFlowControlsPosition.BottomLeft,
)

data class PyreonFlowMiniMapStyle(
    val nodeColor: String = "#e2e8f0",
    val maskColor: String = "#000000",
    val width: Double = 200.0,
    val height: Double = 150.0,
    val pannable: Boolean = true,
    val zoomable: Boolean = true,
)

private data class PyreonFlowConnectionDraft(
    val source: PyreonFlowInteractiveHandle,
    val current: PyreonFlowPathPoint,
)
private data class PyreonFlowReconnectDraft(
    val updater: PyreonFlowEdgeUpdater,
    val fixed: PyreonFlowPathPoint,
    val current: PyreonFlowPathPoint,
)

@Composable
fun <T> PyreonFlowMiniMap(
    state: PyreonFlowState<T>,
    style: PyreonFlowMiniMapStyle = PyreonFlowMiniMapStyle(),
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val layout = pyreonFlowMiniMapLayout(state, style.width, style.height)
    Canvas(
        modifier
            .requiredSize(with(density) { style.width.toFloat().toDp() }, with(density) { style.height.toFloat().toDp() })
            .semantics { contentDescription = "minimap" }
            .pointerInput(layout, style.pannable) {
                if (style.pannable) detectTapGestures { point ->
                    if (layout.scale > 0) state.setCenter(point.x / layout.scale + layout.minX - 40, point.y / layout.scale + layout.minY - 40)
                }
            }
            .pointerInput(layout.scale, style.pannable, style.zoomable) {
                detectTransformGestures { _, pan, zoom, _ ->
                    if (style.pannable && layout.scale > 0) {
                        state.setViewport(x = state.viewport.x - pan.x / layout.scale * state.zoom, y = state.viewport.y - pan.y / layout.scale * state.zoom)
                    }
                    if (style.zoomable) {
                        val centerX = (state.containerSize.width / 2 - state.viewport.x) / state.zoom
                        val centerY = (state.containerSize.height / 2 - state.viewport.y) / state.zoom
                        state.setCenter(centerX, centerY, state.zoom * zoom)
                    }
                }
            },
    ) {
        val nodeColor = pyreonFlowEdgeColor(style.nodeColor)
        for (node in layout.nodes) {
            drawRect(nodeColor, Offset(node.x.toFloat(), node.y.toFloat()), androidx.compose.ui.geometry.Size(node.width.toFloat(), node.height.toFloat()))
        }
        val vp = layout.viewport
        drawRect(
            pyreonFlowEdgeColor(style.maskColor),
            Offset(vp.x.toFloat(), vp.y.toFloat()),
            androidx.compose.ui.geometry.Size(vp.width.toFloat(), vp.height.toFloat()),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1f),
        )
    }
}

@Composable
fun <T> PyreonFlowControls(
    state: PyreonFlowState<T>,
    style: PyreonFlowControlsStyle,
    locked: Boolean,
    onLockedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.padding(2.dp)) {
        if (style.showZoomIn) Button(onClick = { state.zoomIn() }, modifier = Modifier.semantics { contentDescription = "Zoom in" }) { Text("+") }
        if (style.showZoomOut) Button(onClick = { state.zoomOut() }, modifier = Modifier.semantics { contentDescription = "Zoom out" }) { Text("−") }
        if (style.showFitView) Button(onClick = { state.fitView() }, modifier = Modifier.semantics { contentDescription = "Fit view" }) { Text("Fit") }
        if (style.showLock) Button(onClick = { onLockedChange(!locked) }, modifier = Modifier.semantics { contentDescription = "Lock the canvas"; selected = locked }) { Text(if (locked) "Unlock" else "Lock") }
        Text("${(state.zoom * 100).roundToInt()}%", modifier = Modifier.semantics { contentDescription = "Current zoom level" })
    }
}

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
    controls: PyreonFlowControlsStyle? = null,
    miniMap: PyreonFlowMiniMapStyle? = null,
    nodeContent: @Composable (PyreonFlowNode<T>) -> Unit,
) = PyreonFlowView(state, modifier, edgeColor, edgeWidth, background, controls, miniMap) { node, _, _ -> nodeContent(node) }

@Composable
fun <T> PyreonFlowView(
    state: PyreonFlowState<T>,
    modifier: Modifier = Modifier,
    edgeColor: String = "#999999",
    edgeWidth: Double = 1.5,
    background: PyreonFlowBackgroundStyle? = null,
    controls: PyreonFlowControlsStyle? = null,
    miniMap: PyreonFlowMiniMapStyle? = null,
    nodeContent: @Composable (PyreonFlowNode<T>, Boolean, Boolean) -> Unit,
) {
    val density = LocalDensity.current
    var interactionsLocked by remember { mutableStateOf(false) }
    var connectionDraft by remember { mutableStateOf<PyreonFlowConnectionDraft?>(null) }
    var reconnectDraft by remember { mutableStateOf<PyreonFlowReconnectDraft?>(null) }
    var nodeDragStarts by remember { mutableStateOf<Map<String, PyreonXYPosition>>(emptyMap()) }
    var didInitialFit by remember { mutableStateOf(false) }
    val visibleNodes = state.nodes.filter { it.hidden != true && (!state.onlyRenderVisibleElements || state.isNodeVisible(it.id)) }
    val interactiveHandles = visibleNodes.flatMap { node ->
        if (node.hidden == true || !(node.connectable ?: state.nodesConnectable)) emptyList() else {
            val absolute = state.getAbsolutePosition(node.id)
            pyreonFlowInteractiveHandles(
                node.id,
                PyreonFlowNodeBox(absolute.x, absolute.y, node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT),
                node.sourceHandles + node.targetHandles,
            )
        }
    }
    val edgeStrokes = pyreonFlowEdgeStrokes(state, edgeColor, edgeWidth).filter { !state.onlyRenderVisibleElements || pyreonFlowEdgeStrokeIsVisible(it, state) }.toMutableList().also { strokes ->
        connectionDraft?.let { draft ->
            strokes += PyreonFlowEdgeStroke(
                "__connection-preview",
                pyreonFlowConnectionPreview(state.connectionLineType, draft.source, draft.current),
                edgeColor,
                edgeWidth,
            )
        }
        reconnectDraft?.let { draft ->
            strokes += PyreonFlowEdgeStroke(
                "__reconnect-preview",
                listOf(PyreonFlowEdgeSegment.move(draft.fixed.x, draft.fixed.y), PyreonFlowEdgeSegment.line(draft.current.x, draft.current.y)),
                edgeColor,
                edgeWidth,
            )
        }
    }
    Box(
        modifier = modifier.onSizeChanged { size ->
            state.containerSize = PyreonFlowContainerSize(size.width.toDouble(), size.height.toDouble())
            if (state.fitViewOnLoad && !didInitialFit && size.width > 0 && size.height > 0) {
                didInitialFit = true
                state.fitView(padding = state.fitViewPadding)
            }
        },
    ) {
        var selectionStart by remember { mutableStateOf<Offset?>(null) }
        var selectionCurrent by remember { mutableStateOf<Offset?>(null) }
        Box(
            Modifier.matchParentSize().pointerInput(state, interactionsLocked, state.selectionOnDrag, state.multiSelect) {
                if (interactionsLocked) return@pointerInput
                if (state.selectionOnDrag && state.multiSelect) detectDragGestures(
                    onDragStart = { point -> selectionStart = point; selectionCurrent = point },
                    onDragCancel = { selectionStart = null; selectionCurrent = null },
                    onDragEnd = {
                        val start = selectionStart; val end = selectionCurrent
                        if (start != null && end != null) state.selectNodes(state.nodesInSelection(
                            PyreonXYPosition((start.x - state.viewport.x) / state.zoom, (start.y - state.viewport.y) / state.zoom),
                            PyreonXYPosition((end.x - state.viewport.x) / state.zoom, (end.y - state.viewport.y) / state.zoom),
                        ))
                        selectionStart = null; selectionCurrent = null
                    },
                ) { change, _ -> change.consume(); selectionCurrent = change.position }
                else detectTransformGestures { _, pan, zoom, _ ->
                    if (interactionsLocked) return@detectTransformGestures
                    if (state.pannable && state.panOnDrag) state.setViewport(x = state.viewport.x + pan.x, y = state.viewport.y + pan.y)
                    if (state.zoomable && state.zoomOnPinch) state.zoomTo(state.viewport.zoom * zoom)
                }
            }.pointerInput(state, edgeStrokes, state.viewport) {
                detectTapGestures(onDoubleTap = { screen ->
                    if (!interactionsLocked && state.zoomable && state.zoomOnDoubleClick) {
                        val point = PyreonXYPosition((screen.x - state.viewport.x) / state.zoom, (screen.y - state.viewport.y) / state.zoom)
                        state.zoomTo(state.zoom * 1.2)
                        val next = state.zoom
                        state.setViewport(x = screen.x - point.x * next, y = screen.y - point.y * next, zoom = next)
                    }
                }, onTap = { screen ->
                    val point = PyreonFlowPathPoint((screen.x - state.viewport.x) / state.viewport.zoom, (screen.y - state.viewport.y) / state.viewport.zoom)
                    val edge = pyreonNearestFlowEdge(edgeStrokes.filter { it.id != "__connection-preview" }, point, state.viewport.zoom)
                    if (edge != null) { state.selectEdge(edge.id); state.emitEdgeClick(edge.id) }
                    else state.emitPaneClick(PyreonXYPosition(point.x, point.y))
                })
            },
        )

        if (background != null) {
            PyreonFlowBackground(background, state.viewport, Modifier.matchParentSize())
        }

        PyreonFlowEdgeCanvas(
            edges = edgeStrokes,
            viewport = state.viewport,
            modifier = Modifier.matchParentSize(),
        )

        val selectionA = selectionStart
        val selectionB = selectionCurrent
        if (selectionA != null && selectionB != null) Canvas(Modifier.matchParentSize()) {
            val left = minOf(selectionA.x, selectionB.x); val top = minOf(selectionA.y, selectionB.y)
            val size = androidx.compose.ui.geometry.Size(kotlin.math.abs(selectionB.x - selectionA.x), kotlin.math.abs(selectionB.y - selectionA.y))
            drawRect(androidx.compose.ui.graphics.Color.Blue.copy(alpha = 0.10f), Offset(left, top), size)
            drawRect(androidx.compose.ui.graphics.Color.Blue.copy(alpha = 0.8f), Offset(left, top), size, style = Stroke(width = 1f))
        }

        Box(
            Modifier.matchParentSize().graphicsLayer {
                translationX = state.viewport.x.toFloat()
                translationY = state.viewport.y.toFloat()
                scaleX = state.viewport.zoom.toFloat()
                scaleY = state.viewport.zoom.toFloat()
                transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f)
            },
        ) {
            val visibleEdgeIds = edgeStrokes.mapTo(mutableSetOf()) { it.id }
            for (edge in pyreonFlowEdgeLabels(state).filter { visibleEdgeIds.contains(it.id) }) {
                var edgeModifier = Modifier
                    .offset { IntOffset(edge.x.roundToInt(), edge.y.roundToInt()) }
                    .clickable { state.selectEdge(edge.id); state.emitEdgeClick(edge.id) }
                edgeModifier = if (edge.focusable) edgeModifier.semantics {
                    contentDescription = edge.accessibilityLabel
                    selected = state.isEdgeSelected(edge.id)
                } else edgeModifier.clearAndSetSemantics { }
                Text(
                    edge.text ?: "",
                    edgeModifier,
                )
            }
            for (node in visibleNodes) {
                val absolute = state.getAbsolutePosition(node.id)
                val width = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
                val height = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
                var nodeModifier = Modifier
                    .offset { IntOffset(absolute.x.roundToInt(), absolute.y.roundToInt()) }
                    .requiredSize(
                        with(density) { width.toFloat().toDp() },
                        with(density) { height.toFloat().toDp() },
                    )
                if (node.selectable ?: state.nodesSelectable) {
                    nodeModifier = nodeModifier.pointerInput(node.id, "node-taps") {
                        detectTapGestures(
                            onDoubleTap = { state.emitNodeDoubleClick(node.id) },
                            onTap = { state.selectNode(node.id); state.emitNodeClick(node.id) },
                        )
                    }
                }
                if (!interactionsLocked && (node.draggable ?: state.nodesDraggable)) {
                    nodeModifier = nodeModifier.pointerInput(node.id, state.viewport.zoom) {
                        detectDragGestures(
                            onDragStart = {
                                state.pushHistory()
                                nodeDragStarts = pyreonFlowDragNodeIds(state, node.id).associateWith { id -> state.getNode(id)!!.position }
                                state.emitNodeDragStart(node.id)
                            },
                            onDragCancel = { if (nodeDragStarts.isNotEmpty()) state.emitNodeDragEnd(node.id); nodeDragStarts = emptyMap() },
                            onDragEnd = { if (nodeDragStarts.isNotEmpty()) state.emitNodeDragEnd(node.id); nodeDragStarts = emptyMap() },
                        ) { change, _ ->
                            change.consume()
                            val delta = change.position - change.previousPosition
                            val primary = nodeDragStarts[node.id] ?: return@detectDragGestures
                            val rawPrimary = PyreonXYPosition(primary.x + delta.x / state.viewport.zoom, primary.y + delta.y / state.viewport.zoom)
                            val snappedPrimary = state.snappedNodePosition(node.id, rawPrimary, nodeDragStarts.keys)
                            val actualDx = snappedPrimary.x - primary.x
                            val actualDy = snappedPrimary.y - primary.y
                            for ((id, current) in nodeDragStarts) {
                                val next = PyreonXYPosition(current.x + actualDx, current.y + actualDy)
                                nodeDragStarts = nodeDragStarts + (id to next)
                                state.updateNodePosition(id, next)
                            }
                            state.emitNodeDrag(node.id)
                        }
                    }
                }
                nodeModifier = if (!state.disableKeyboardA11y && (node.focusable ?: state.nodesFocusable)) nodeModifier.semantics {
                    contentDescription = node.ariaLabel ?: node.id
                    selected = state.isNodeSelected(node.id)
                    if (node.selectable ?: state.nodesSelectable) onClick {
                        state.selectNode(node.id)
                        state.emitNodeClick(node.id)
                        true
                    }
                } else nodeModifier.clearAndSetSemantics { }
                Box(nodeModifier) { nodeContent(node, state.isNodeSelected(node.id), nodeDragStarts.containsKey(node.id)) }
            }
            for (handle in interactiveHandles) {
                val diameter = 12.0 / state.viewport.zoom
                Canvas(
                    Modifier
                        .offset { IntOffset((handle.x - diameter / 2).roundToInt(), (handle.y - diameter / 2).roundToInt()) }
                        .requiredSize(with(density) { diameter.toFloat().toDp() })
                        .semantics { contentDescription = "${handle.type} handle ${handle.handleId ?: "default"}" }
                        .pointerInput(handle, interactionsLocked, state.viewport.zoom) {
                            if (interactionsLocked || handle.type != "source") return@pointerInput
                            var current = PyreonFlowPathPoint(handle.x, handle.y)
                            detectDragGestures(
                                onDragStart = { state.emitConnectStart(handle.nodeId, handle.handleId); connectionDraft = PyreonFlowConnectionDraft(handle, current) },
                                onDragCancel = { state.emitConnectEnd(null); connectionDraft = null },
                                onDragEnd = {
                                    val target = pyreonNearestFlowHandle(interactiveHandles, current, "target", (6.0 + state.connectionRadius) / state.viewport.zoom)
                                    var completed: PyreonFlowConnection? = null
                                    if (target != null) {
                                        val connection = PyreonFlowConnection(handle.nodeId, target.nodeId, handle.handleId, target.handleId)
                                        if (state.connect(connection) != null) completed = connection
                                    }
                                    state.emitConnectEnd(completed)
                                    connectionDraft = null
                                },
                            ) { change, amount ->
                                change.consume()
                                current = PyreonFlowPathPoint(current.x + amount.x, current.y + amount.y)
                                connectionDraft = PyreonFlowConnectionDraft(handle, current)
                            }
                        },
                ) {
                    drawCircle(if (handle.type == "source") androidx.compose.ui.graphics.Color.Blue else androidx.compose.ui.graphics.Color.Green)
                }
            }
            for (updater in pyreonFlowEdgeUpdaters(state, edgeStrokes)) {
                val diameter = 12.0 / state.viewport.zoom
                Canvas(
                    Modifier
                        .offset { IntOffset((updater.x - diameter / 2).roundToInt(), (updater.y - diameter / 2).roundToInt()) }
                        .requiredSize(with(density) { diameter.toFloat().toDp() })
                        .semantics { contentDescription = "Reconnect ${updater.end} of edge ${updater.edgeId}" }
                        .pointerInput(updater, interactionsLocked, state.viewport.zoom) {
                            if (interactionsLocked) return@pointerInput
                            var current = PyreonFlowPathPoint(updater.x, updater.y)
                            var fixed = current
                            detectDragGestures(
                                onDragStart = {
                                    val segments = edgeStrokes.firstOrNull { it.id == updater.edgeId }?.segments
                                    if (!segments.isNullOrEmpty()) {
                                        fixed = if (updater.end == "target") PyreonFlowPathPoint(segments.first().x, segments.first().y) else PyreonFlowPathPoint(segments.last().x, segments.last().y)
                                        reconnectDraft = PyreonFlowReconnectDraft(updater, fixed, current)
                                    }
                                },
                                onDragCancel = { reconnectDraft = null },
                                onDragEnd = {
                                    val edge = state.getEdge(updater.edgeId)
                                    if (edge != null) {
                                        val movingTarget = updater.end == "target"
                                        val fixedNodeId = if (movingTarget) edge.source else edge.target
                                        val target = pyreonNearestFlowHandle(interactiveHandles.filter { it.nodeId != fixedNodeId }, current, if (movingTarget) "target" else "source", (6.0 + state.connectionRadius) / state.viewport.zoom)
                                        if (target != null) {
                                            pyreonFlowReconnectConnection(edge, updater.end, target)?.let { state.reconnectEdge(edge.id, it) }
                                        }
                                    }
                                    reconnectDraft = null
                                },
                            ) { change, amount ->
                                change.consume()
                                current = PyreonFlowPathPoint(current.x + amount.x, current.y + amount.y)
                                reconnectDraft = PyreonFlowReconnectDraft(updater, fixed, current)
                            }
                        },
                ) { drawCircle(androidx.compose.ui.graphics.Color.Blue.copy(alpha = 0.35f)) }
            }
        }

        if (controls != null) {
            val alignment = when (controls.position) {
                PyreonFlowControlsPosition.TopLeft -> androidx.compose.ui.Alignment.TopStart
                PyreonFlowControlsPosition.TopRight -> androidx.compose.ui.Alignment.TopEnd
                PyreonFlowControlsPosition.BottomLeft -> androidx.compose.ui.Alignment.BottomStart
                PyreonFlowControlsPosition.BottomRight -> androidx.compose.ui.Alignment.BottomEnd
            }
            PyreonFlowControls(
                state,
                controls,
                interactionsLocked,
                { interactionsLocked = it },
                Modifier.align(alignment).padding(10.dp),
            )
        }
        if (miniMap != null) {
            PyreonFlowMiniMap(state, miniMap, Modifier.align(androidx.compose.ui.Alignment.BottomEnd).padding(10.dp))
        }
    }
}
