package com.pyreon.runtime

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.focusable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.Button
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Surface
import androidx.compose.material.Text
import androidx.compose.material.darkColors
import androidx.compose.material.lightColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.zIndex
import androidx.compose.ui.unit.sp
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

enum class PyreonFlowBackgroundVariant { Dots, Lines, Cross }
fun pyreonFlowBackgroundVariant(value: String): PyreonFlowBackgroundVariant = when (value) {
    "lines" -> PyreonFlowBackgroundVariant.Lines
    "cross" -> PyreonFlowBackgroundVariant.Cross
    else -> PyreonFlowBackgroundVariant.Dots
}

data class PyreonFlowBackgroundStyle(
    val variant: PyreonFlowBackgroundVariant = PyreonFlowBackgroundVariant.Dots,
    val gap: Double = 20.0,
    val size: Double = 1.0,
    /** `null` follows the palette's `backgroundPattern` (light `#dddddd`). */
    val color: String? = null,
)

enum class PyreonFlowControlsPosition { TopLeft, TopRight, BottomLeft, BottomRight }
fun pyreonFlowControlsPosition(value: String): PyreonFlowControlsPosition = when (value) {
    "top-left" -> PyreonFlowControlsPosition.TopLeft
    "top-right" -> PyreonFlowControlsPosition.TopRight
    "bottom-right" -> PyreonFlowControlsPosition.BottomRight
    else -> PyreonFlowControlsPosition.BottomLeft
}

data class PyreonFlowControlsStyle(
    val showZoomIn: Boolean = true,
    val showZoomOut: Boolean = true,
    val showFitView: Boolean = true,
    val showLock: Boolean = false,
    val position: PyreonFlowControlsPosition = PyreonFlowControlsPosition.BottomLeft,
)

data class PyreonFlowMiniMapStyle(
    /** `null` follows the palette's `minimapNode` (light `#e2e8f0`). */
    val nodeColor: String? = null,
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

data class PyreonFlowCustomEdgeContext(
    val edge: PyreonFlowEdge,
    val sourceX: Double, val sourceY: Double,
    val targetX: Double, val targetY: Double,
    val sourcePosition: PyreonFlowPosition, val targetPosition: PyreonFlowPosition,
    val selected: Boolean,
    val labelX: Double, val labelY: Double,
)

data class PyreonFlowConnectionLineContext(
    val sourceX: Double, val sourceY: Double,
    val targetX: Double, val targetY: Double,
    val sourcePosition: PyreonFlowPosition,
    val path: PyreonFlowPathResult,
)

private val LocalPyreonFlowEdgeLabelPoint = staticCompositionLocalOf { PyreonFlowPathPoint(0.0, 0.0) }

/**
 * The colour tokens the web renderer exposes as `--pyreon-flow-*` variables,
 * resolved per colour mode. `light` mirrors the web's fallback values and
 * `dark` its `[data-color-mode="dark"]` block, so a `<Flow colorMode>` paints
 * the same surfaces on every target. Every hex value here is the web's.
 */
data class PyreonFlowPalette(
    val canvasBackground: String?,
    val nodeBackground: String,
    val nodeColor: String,
    val nodeBorder: String,
    val nodeSelected: String,
    val edge: String,
    val edgeLabel: String,
    val accent: String,
    val handleBackground: String,
    val handleBorder: String,
    val panelBackground: String,
    val panelBorder: String,
    val controlColor: String,
    val minimapNode: String,
    val backgroundPattern: String,
    val resizerBackground: String,
) {
    companion object {
        val light = PyreonFlowPalette(
            canvasBackground = null, nodeBackground = "#ffffff", nodeColor = "#1a192b", nodeBorder = "#dddddd",
            nodeSelected = "#3b82f6", edge = "#999999", edgeLabel = "#666666", accent = "#3b82f6",
            handleBackground = "#555555", handleBorder = "#ffffff", panelBackground = "#ffffff", panelBorder = "#dddddd",
            controlColor = "#555555", minimapNode = "#e2e8f0", backgroundPattern = "#dddddd", resizerBackground = "#ffffff",
        )
        val dark = PyreonFlowPalette(
            canvasBackground = "#0b1220", nodeBackground = "#1f2937", nodeColor = "#f3f4f6", nodeBorder = "#374151",
            nodeSelected = "#60a5fa", edge = "#6b7280", edgeLabel = "#9ca3af", accent = "#60a5fa",
            handleBackground = "#374151", handleBorder = "#6b7280", panelBackground = "#111827", panelBorder = "#374151",
            controlColor = "#e5e7eb", minimapNode = "#374151", backgroundPattern = "#374151", resizerBackground = "#60a5fa",
        )

        /**
         * `"dark"` / `"light"` force a palette; anything else (`"system"`) follows the
         * OS scheme — the web's `prefers-color-scheme` branch.
         */
        fun resolve(colorMode: String, systemDark: Boolean): PyreonFlowPalette = when (colorMode) {
            "dark" -> dark
            "light" -> light
            else -> if (systemDark) dark else light
        }

        fun isDark(colorMode: String, systemDark: Boolean): Boolean =
            colorMode == "dark" || (colorMode != "light" && systemDark)
    }
}

/** The palette the nearest [PyreonFlowView] (or [PyreonFlowColorMode]) resolved. */
val LocalPyreonFlowPalette = staticCompositionLocalOf { PyreonFlowPalette.light }

/**
 * Scopes a `<Flow colorMode>` to THIS subtree — the flow canvas and the `<Panel>`
 * overlays the compiler stacks beside it — the way the web's `data-color-mode`
 * attribute scopes its tokens to the `.pyreon-flow` container.
 */
@Composable
fun PyreonFlowColorMode(colorMode: String, content: @Composable () -> Unit) {
    val systemDark = isSystemInDarkTheme()
    val palette = PyreonFlowPalette.resolve(colorMode, systemDark)
    CompositionLocalProvider(LocalPyreonFlowPalette provides palette) {
        if (colorMode == "dark" || colorMode == "light") {
            MaterialTheme(colors = if (PyreonFlowPalette.isDark(colorMode, systemDark)) darkColors() else lightColors(), content = content)
        } else {
            content()
        }
    }
}

/** The web's `BaseEdge` stroke: [color] when styled, else the palette's edge colour. Mirrors Swift. */
@Composable
fun PyreonFlowBaseEdgePath(result: PyreonFlowPathResult, color: String? = null, width: Double = 1.5) {
    PyreonFlowCustomEdgePath(result = result, color = color ?: LocalPyreonFlowPalette.current.edge, width = width, fill = null)
}

/** A text label centred at a flow point in a custom edge (the web's `EdgeText`). Mirrors Swift. */
@Composable
fun PyreonFlowEdgeText(x: Double, y: Double, label: String) {
    val palette = LocalPyreonFlowPalette.current
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    Text(
        label,
        fontSize = 12.sp,
        color = pyreonFlowEdgeColor(palette.edgeLabel),
        modifier = Modifier
            .onSizeChanged { size = it }
            .offset { IntOffset((x * density).roundToInt() - size.width / 2, (y * density).roundToInt() - size.height / 2) },
    )
}

@Composable
fun PyreonFlowEdgeLabelRenderer(content: @Composable () -> Unit) {
    val point = LocalPyreonFlowEdgeLabelPoint.current
    Box(Modifier.offset { IntOffset((point.x * density).roundToInt(), (point.y * density).roundToInt()) }) { content() }
}

private fun pyreonFlowSegmentPosition(segments: List<PyreonFlowEdgeSegment>, atStart: Boolean): PyreonFlowPosition {
    val first = segments.firstOrNull() ?: return if (atStart) PyreonFlowPosition.Right else PyreonFlowPosition.Left
    val last = segments.last()
    val anchorX = if (atStart) first.x else last.x; val anchorY = if (atStart) first.y else last.y
    val segment = if (atStart && segments.size > 1) segments[1] else last
    val previous = if (segments.size > 1) segments[segments.size - 2] else first
    val probeX = if (atStart) segment.c1x ?: segment.cx ?: segment.x else segment.c2x ?: segment.cx ?: previous.x
    val probeY = if (atStart) segment.c1y ?: segment.cy ?: segment.y else segment.c2y ?: segment.cy ?: previous.y
    val dx = if (atStart) probeX - anchorX else anchorX - probeX
    val dy = if (atStart) probeY - anchorY else anchorY - probeY
    return if (kotlin.math.abs(dx) >= kotlin.math.abs(dy)) {
        if (dx >= 0) PyreonFlowPosition.Right else PyreonFlowPosition.Left
    } else if (dy >= 0) PyreonFlowPosition.Bottom else PyreonFlowPosition.Top
}

private fun pyreonFlowKeyName(event: KeyEvent): String? = when (event.key) {
    Key.DirectionLeft -> "ArrowLeft"
    Key.DirectionRight -> "ArrowRight"
    Key.DirectionUp -> "ArrowUp"
    Key.DirectionDown -> "ArrowDown"
    Key.Enter, Key.NumPadEnter -> "Enter"
    Key.Spacebar -> " "
    Key.Backspace -> "Backspace"
    Key.Delete -> "Delete"
    Key.Escape -> "Escape"
    Key.A -> "a"
    Key.C -> "c"
    Key.V -> "v"
    Key.Z -> "z"
    else -> null
}

private fun <T> PyreonFlowState<T>.handleKeyEvent(event: KeyEvent, nodeId: String? = null, edgeId: String? = null): Boolean {
    if (event.type != KeyEventType.KeyDown) return false
    val key = pyreonFlowKeyName(event) ?: return false
    return handleKeyboardCommand(
        key = key,
        nodeId = nodeId,
        edgeId = edgeId,
        shift = event.isShiftPressed,
        command = event.isCtrlPressed || event.isMetaPressed,
        // Compose's common KeyEvent surface does not expose repeat count.
        // Repeated Android key-down events still arrive as individual calls.
        repeatKey = false,
    )
}

@Composable
fun <T> PyreonFlowMiniMap(
    state: PyreonFlowState<T>,
    style: PyreonFlowMiniMapStyle = PyreonFlowMiniMapStyle(),
    nodeColor: (PyreonFlowNode<T>) -> String = { "" },
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current
    val palette = LocalPyreonFlowPalette.current
    val layout = pyreonFlowMiniMapLayout(state, style.width, style.height)
    Canvas(
        modifier
            .requiredSize(style.width.toFloat().dp, style.height.toFloat().dp)
            .background(pyreonFlowEdgeColor(palette.panelBackground).copy(alpha = 0.92f), RoundedCornerShape(4.dp))
            .border(1.dp, pyreonFlowEdgeColor(palette.panelBorder), RoundedCornerShape(4.dp))
            .semantics { contentDescription = "minimap" }
            .pointerInput(layout, style.pannable) {
                if (style.pannable) detectTapGestures { tap ->
                    val point = tap / density.density
                    if (layout.scale > 0) state.setCenter(point.x / layout.scale + layout.minX - 40, point.y / layout.scale + layout.minY - 40)
                }
            }
            .pointerInput(layout.scale, style.pannable, style.zoomable) {
                detectTransformGestures { _, panPx, zoom, _ ->
                    val pan = panPx / density.density
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
        // The layout is in dp (the unit of `style.width`); the canvas draws px.
        val unit = density.density
        withTransform({ scale(unit, unit, pivot = Offset.Zero) }) {
        val nodesById = state.nodes.associateBy { it.id }
        for (node in layout.nodes) {
            val resolved = nodesById[node.id]?.let(nodeColor).orEmpty()
            drawRect(pyreonFlowEdgeColor(resolved.ifEmpty { style.nodeColor ?: palette.minimapNode }), Offset(node.x.toFloat(), node.y.toFloat()), androidx.compose.ui.geometry.Size(node.width.toFloat(), node.height.toFloat()))
        }
        val vp = layout.viewport
        drawRect(
            pyreonFlowEdgeColor(style.maskColor),
            Offset(vp.x.toFloat(), vp.y.toFloat()),
            androidx.compose.ui.geometry.Size(vp.width.toFloat(), vp.height.toFloat()),
            style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1f / unit),
        )
        }
    }
}

@Composable
fun <T> PyreonFlowControls(
    state: PyreonFlowState<T>,
    style: PyreonFlowControlsStyle,
    locked: Boolean,
    onLockedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    extraContent: @Composable () -> Unit = {},
) {
    // The web's `.pyreon-flow-controls`: a bordered panel box of 28px
    // transparent buttons drawn in `--pyreon-flow-control-color`, not the
    // platform's filled buttons.
    val palette = LocalPyreonFlowPalette.current
    val panelShape = RoundedCornerShape(6.dp)
    Column(
        modifier
            .background(pyreonFlowEdgeColor(palette.panelBackground), panelShape)
            .border(1.dp, pyreonFlowEdgeColor(palette.panelBorder), panelShape)
            .padding(2.dp),
    ) {
        if (style.showZoomIn) PyreonFlowControlButton("+", "Zoom in", palette) { state.zoomIn() }
        if (style.showZoomOut) PyreonFlowControlButton("−", "Zoom out", palette) { state.zoomOut() }
        if (style.showFitView) PyreonFlowControlButton("Fit", "Fit view", palette) { state.fitView() }
        if (style.showLock) PyreonFlowControlButton(if (locked) "Unlock" else "Lock", "Lock the canvas", palette, selected = locked) { onLockedChange(!locked) }
        Text("${(state.zoom * 100).roundToInt()}%", color = pyreonFlowEdgeColor(palette.controlColor), modifier = Modifier.semantics { contentDescription = "Current zoom level" })
        extraContent()
    }
}

@Composable
private fun PyreonFlowControlButton(
    glyph: String,
    label: String,
    palette: PyreonFlowPalette,
    selected: Boolean? = null,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .defaultMinSize(minWidth = 28.dp, minHeight = 28.dp)
            .clickable(onClick = onClick)
            .semantics {
                contentDescription = label
                role = androidx.compose.ui.semantics.Role.Button
                if (selected != null) this.selected = selected
            },
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Text(glyph, color = pyreonFlowEdgeColor(palette.controlColor))
    }
}

/**
 * The web's default node: a labelled box with the palette's node background,
 * text and border colours, 2px border (the selected colour while selected),
 * 6px corners, 8x16 padding, 13px text and an 80px minimum width. The
 * compiler emits it for every node without a custom `type`.
 */
@Composable
fun PyreonFlowDefaultNode(label: String, selected: Boolean) {
    val palette = LocalPyreonFlowPalette.current
    val shape = RoundedCornerShape(6.dp)
    Box(
        Modifier
            .defaultMinSize(minWidth = 80.dp)
            .background(pyreonFlowEdgeColor(palette.nodeBackground), shape)
            .border(2.dp, pyreonFlowEdgeColor(if (selected) palette.nodeSelected else palette.nodeBorder), shape)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        Text(label, color = pyreonFlowEdgeColor(palette.nodeColor), fontSize = 13.sp)
    }
}

/** Controls rendered independently from PyreonFlowView. */
@Composable
fun <T> PyreonStandaloneFlowControls(
    state: PyreonFlowState<T>,
    style: PyreonFlowControlsStyle = PyreonFlowControlsStyle(),
    extraContent: @Composable () -> Unit = {},
) {
    var locked by remember { mutableStateOf(false) }
    PyreonFlowControls(state, style, locked, { locked = it }, extraContent = extraContent)
}

@Composable
fun PyreonFlowBackground(
    style: PyreonFlowBackgroundStyle,
    viewport: PyreonFlowViewport,
    modifier: Modifier = Modifier,
    fallbackColor: String = PyreonFlowPalette.light.backgroundPattern,
) {
    Canvas(modifier) {
        // Viewport and pattern are in dp, like iOS points and web CSS px.
        val step = maxOf(1f, (style.gap * viewport.zoom).toFloat() * density)
        val radius = maxOf(0.5f, (style.size * viewport.zoom).toFloat() * density)
        val x0 = viewport.x.toFloat() * density % step
        val y0 = viewport.y.toFloat() * density % step
        val color = pyreonFlowEdgeColor(style.color ?: fallbackColor)
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
    /** `null` follows the palette's `edge` colour (light `#999999`). */
    edgeColor: String? = null,
    edgeWidth: Double = 1.5,
    background: PyreonFlowBackgroundStyle? = null,
    controls: PyreonFlowControlsStyle? = null,
    controlsContent: @Composable () -> Unit = {},
    miniMap: PyreonFlowMiniMapStyle? = null,
    miniMapNodeColor: (PyreonFlowNode<T>) -> String = { "" },
    ariaLabel: String = "Flow diagram",
    colorMode: String = "light",
    nodeHandles: (PyreonFlowNode<T>) -> List<PyreonFlowHandleConfig> = { emptyList() },
    nodeResizer: (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { null },
    nodeToolbarConfigs: (PyreonFlowNode<T>) -> List<PyreonFlowNodeToolbarConfig> = { emptyList() },
    nodeToolbar: @Composable (PyreonFlowNode<T>, Int, Boolean, Boolean) -> Unit = { _, _, _, _ -> },
    customEdgeTypes: Set<String> = emptySet(),
    customEdge: @Composable (PyreonFlowCustomEdgeContext) -> Unit = {},
    customConnectionLineEnabled: Boolean = false,
    customConnectionLine: @Composable (PyreonFlowConnectionLineContext) -> Unit = {},
    nodeContent: @Composable (PyreonFlowNode<T>) -> Unit,
) = PyreonFlowView(state, modifier, edgeColor, edgeWidth, background, controls, controlsContent, miniMap, miniMapNodeColor, ariaLabel, colorMode, nodeHandles, nodeResizer, nodeToolbarConfigs, nodeToolbar, customEdgeTypes, customEdge, customConnectionLineEnabled, customConnectionLine) { node, _, _ -> nodeContent(node) }

@Composable
fun <T> PyreonFlowView(
    state: PyreonFlowState<T>,
    modifier: Modifier = Modifier,
    /** `null` follows the palette's `edge` colour (light `#999999`). */
    edgeColor: String? = null,
    edgeWidth: Double = 1.5,
    background: PyreonFlowBackgroundStyle? = null,
    controls: PyreonFlowControlsStyle? = null,
    controlsContent: @Composable () -> Unit = {},
    miniMap: PyreonFlowMiniMapStyle? = null,
    miniMapNodeColor: (PyreonFlowNode<T>) -> String = { "" },
    ariaLabel: String = "Flow diagram",
    colorMode: String = "light",
    nodeHandles: (PyreonFlowNode<T>) -> List<PyreonFlowHandleConfig> = { emptyList() },
    nodeResizer: (PyreonFlowNode<T>) -> PyreonFlowNodeResizerConfig? = { null },
    nodeToolbarConfigs: (PyreonFlowNode<T>) -> List<PyreonFlowNodeToolbarConfig> = { emptyList() },
    nodeToolbar: @Composable (PyreonFlowNode<T>, Int, Boolean, Boolean) -> Unit = { _, _, _, _ -> },
    customEdgeTypes: Set<String> = emptySet(),
    customEdge: @Composable (PyreonFlowCustomEdgeContext) -> Unit = {},
    customConnectionLineEnabled: Boolean = false,
    customConnectionLine: @Composable (PyreonFlowConnectionLineContext) -> Unit = {},
    nodeContent: @Composable (PyreonFlowNode<T>, Boolean, Boolean) -> Unit,
) {
    val palette = PyreonFlowPalette.resolve(colorMode, isSystemInDarkTheme())
    val resolvedEdgeColor = edgeColor ?: palette.edge
    val density = LocalDensity.current
    // ONE graph/screen unit is a dp — iOS points, web CSS px. Compose hands this
    // view px, so every value crossing between the two goes through `unit`. A
    // px unit made a 150-unit node ~57dp on a 420dpi phone, and its 48dp
    // resizer targets covered it completely, so a tap on the node never
    // reached it (device-found).
    val unit = density.density.toDouble()
    var interactionsLocked by remember { mutableStateOf(false) }
    var connectionDraft by remember { mutableStateOf<PyreonFlowConnectionDraft?>(null) }
    var hoveredEdgeId by remember { mutableStateOf<String?>(null) }
    // Auto-pan: the dragging pointer in CANVAS dp while a node or connection
    // drag is live. A frame loop pans while it sits in the edge band, shifting
    // the dragged nodes (or the draft's end) so they stay under the finger.
    var dragPointer by remember { mutableStateOf<PyreonXYPosition?>(null) }
    var reconnectDraft by remember { mutableStateOf<PyreonFlowReconnectDraft?>(null) }
    var nodeDragStarts by remember { mutableStateOf<Map<String, PyreonXYPosition>>(emptyMap()) }
    var didInitialFit by remember { mutableStateOf(false) }
    val visibleNodes = state.nodes.filter { it.hidden != true && (!state.onlyRenderVisibleElements || state.isNodeVisible(it.id)) }
    val interactiveHandles = visibleNodes.flatMap { node ->
        if (node.hidden == true || !(node.connectable ?: state.nodesConnectable)) emptyList() else {
            val absolute = state.getAbsolutePosition(node.id)
            val dimensions = state.getNodeDimensions(node.id)
            pyreonFlowInteractiveHandles(
                node.id,
                PyreonFlowNodeBox(absolute.x, absolute.y, dimensions.width, dimensions.height),
                pyreonFlowEffectiveHandles(node, nodeHandles(node)),
            )
        }
    }
    LaunchedEffect(dragPointer != null) {
        while (dragPointer != null) {
            withFrameNanos { }
            val p = dragPointer ?: break
            val v = pyreonFlowAutoPanVelocity(p.x, p.y, state.containerSize.width, state.containerSize.height, state.autoPanSpeed)
            if (v.x == 0.0 && v.y == 0.0) continue
            state.setViewport(x = state.viewport.x + v.x, y = state.viewport.y + v.y)
            val zoom = state.viewport.zoom
            if (nodeDragStarts.isNotEmpty()) {
                nodeDragStarts = nodeDragStarts.mapValues { (id, current) ->
                    PyreonXYPosition(current.x - v.x / zoom, current.y - v.y / zoom).also { state.updateNodePosition(id, it) }
                }
            }
            connectionDraft?.let { draft ->
                connectionDraft = draft.copy(current = PyreonFlowPathPoint((p.x - state.viewport.x) / zoom, (p.y - state.viewport.y) / zoom))
            }
        }
    }
    val edgeStrokes = pyreonFlowEdgeStrokes(state, resolvedEdgeColor, edgeWidth, nodeHandles).filter { !state.onlyRenderVisibleElements || pyreonFlowEdgeStrokeIsVisible(it, state) }.toMutableList().also { strokes ->
        connectionDraft?.let { draft ->
            strokes += PyreonFlowEdgeStroke(
                "__connection-preview",
                pyreonFlowConnectionPreview(state.connectionLineType, draft.source, draft.current),
                resolvedEdgeColor,
                edgeWidth,
            )
        }
        reconnectDraft?.let { draft ->
            strokes += PyreonFlowEdgeStroke(
                "__reconnect-preview",
                listOf(PyreonFlowEdgeSegment.move(draft.fixed.x, draft.fixed.y), PyreonFlowEdgeSegment.line(draft.current.x, draft.current.y)),
                resolvedEdgeColor,
                edgeWidth,
            )
        }
    }
    val canvasBackground = palette.canvasBackground
    val content: @Composable () -> Unit = { Box(
        // The web's `.pyreon-flow` is `width: 100%; height: 100%`: the canvas
        // FILLS the box it is given. Wrapping to content instead measured it
        // to the Controls column (device-found: a 360dp frame held a 110dp
        // canvas with every node under the buttons).
        modifier = Modifier.fillMaxSize().then(modifier)
            .let { if (canvasBackground != null) it.background(pyreonFlowEdgeColor(canvasBackground)) else it }
            .semantics { contentDescription = ariaLabel }
            .focusable(enabled = !state.disableKeyboardA11y)
            .onKeyEvent { event -> state.handleKeyEvent(event) }
            // Pinch belongs to the CANVAS, not the background sibling: a pinch that
            // begins over a node, label or control must still zoom the graph (the
            // iOS renderer found the same gap). Two pressed pointers are observed
            // in the Initial pass and taken over; one-finger taps and drags still
            // reach the content untouched.
            .pointerInput(state, interactionsLocked) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    do {
                        val event = awaitPointerEvent(PointerEventPass.Initial)
                        if (event.changes.count { it.pressed } >= 2 && !interactionsLocked && state.zoomable && state.zoomOnPinch) {
                            val factor = event.calculateZoom()
                            if (factor != 1f) state.zoomTo(state.viewport.zoom * factor)
                            event.changes.forEach { it.consume() }
                        }
                    } while (event.changes.any { it.pressed })
                }
            }
            .onSizeChanged { size ->
            state.containerSize = PyreonFlowContainerSize(size.width / unit, size.height / unit)
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
                            PyreonXYPosition((start.x / unit - state.viewport.x) / state.zoom, (start.y / unit - state.viewport.y) / state.zoom),
                            PyreonXYPosition((end.x / unit - state.viewport.x) / state.zoom, (end.y / unit - state.viewport.y) / state.zoom),
                        ))
                        selectionStart = null; selectionCurrent = null
                    },
                ) { change, _ -> change.consume(); selectionCurrent = change.position }
                else detectTransformGestures { _, pan, zoom, _ ->
                    if (interactionsLocked) return@detectTransformGestures
                    if (state.pannable && state.panOnDrag) state.setViewport(x = state.viewport.x + pan.x / unit, y = state.viewport.y + pan.y / unit)
                    // Zoom is handled once, by the canvas-level pinch above.
                }
            }.pointerInput(state, edgeStrokes, state.viewport) {
                detectTapGestures(onDoubleTap = { screenPx ->
                    val screen = PyreonXYPosition(screenPx.x / unit, screenPx.y / unit)
                    if (!interactionsLocked && state.zoomable && state.zoomOnDoubleClick) {
                        val point = PyreonXYPosition((screen.x - state.viewport.x) / state.zoom, (screen.y - state.viewport.y) / state.zoom)
                        state.zoomTo(state.zoom * 1.2)
                        val next = state.zoom
                        state.setViewport(x = screen.x - point.x * next, y = screen.y - point.y * next, zoom = next)
                    }
                }, onLongPress = { screenPx ->
                    // The canvas's context menu: the edge under the press, else the pane.
                    val point = PyreonFlowPathPoint((screenPx.x / unit - state.viewport.x) / state.viewport.zoom, (screenPx.y / unit - state.viewport.y) / state.viewport.zoom)
                    val edge = pyreonNearestFlowEdge(edgeStrokes.filter { !it.id.startsWith("__") }, point, state.viewport.zoom)
                    if (edge != null) state.emitEdgeContextMenu(edge.id) else state.emitPaneContextMenu(PyreonXYPosition(point.x, point.y))
                }, onTap = { screenPx ->
                    val point = PyreonFlowPathPoint((screenPx.x / unit - state.viewport.x) / state.viewport.zoom, (screenPx.y / unit - state.viewport.y) / state.viewport.zoom)
                    val edge = pyreonNearestFlowEdge(edgeStrokes.filter { it.id != "__connection-preview" }, point, state.viewport.zoom)
                    if (edge != null) { state.selectEdge(edge.id); state.emitEdgeClick(edge.id) }
                    else state.emitPaneClick(PyreonXYPosition(point.x, point.y))
                })
            }.pointerInput(state, edgeStrokes, state.viewport) {
                // Edge hover: a mouse or stylus moving over the canvas enters and
                // leaves edges by the same nearest-edge hit test a tap uses.
                awaitPointerEventScope {
                    while (true) {
                        val event = awaitPointerEvent()
                        val screenPx = event.changes.firstOrNull()?.position ?: continue
                        val id = if (event.type == PointerEventType.Exit) null else {
                            val point = PyreonFlowPathPoint((screenPx.x / unit - state.viewport.x) / state.viewport.zoom, (screenPx.y / unit - state.viewport.y) / state.viewport.zoom)
                            pyreonNearestFlowEdge(edgeStrokes.filter { !it.id.startsWith("__") }, point, state.viewport.zoom)?.id
                        }
                        if (id != hoveredEdgeId) {
                            hoveredEdgeId?.let { state.emitEdgeMouseLeave(it) }
                            id?.let { state.emitEdgeMouseEnter(it) }
                            hoveredEdgeId = id
                        }
                    }
                }
            },
        )

        if (background != null) {
            PyreonFlowBackground(background, state.viewport, Modifier.matchParentSize(), palette.backgroundPattern)
        }

        PyreonFlowEdgeCanvas(
            edges = edgeStrokes.filter { stroke ->
                if (stroke.id == "__connection-preview" && customConnectionLineEnabled) return@filter false
                val edge = state.getEdge(stroke.id)
                edge == null || !customEdgeTypes.contains(edge.type ?: PYREON_FLOW_DEFAULT_EDGE_TYPE)
            },
            viewport = state.viewport,
            modifier = Modifier.matchParentSize(),
        )

        val selectionA = selectionStart
        val selectionB = selectionCurrent
        if (selectionA != null && selectionB != null) Canvas(Modifier.matchParentSize()) {
            val left = minOf(selectionA.x, selectionB.x); val top = minOf(selectionA.y, selectionB.y)
            val size = androidx.compose.ui.geometry.Size(kotlin.math.abs(selectionB.x - selectionA.x), kotlin.math.abs(selectionB.y - selectionA.y))
            drawRect(pyreonFlowEdgeColor(palette.accent).copy(alpha = 0.10f), Offset(left, top), size)
            drawRect(pyreonFlowEdgeColor(palette.accent).copy(alpha = 0.8f), Offset(left, top), size, style = Stroke(width = 1f))
        }

        Box(
            Modifier.matchParentSize().graphicsLayer {
                translationX = (state.viewport.x * unit).toFloat()
                translationY = (state.viewport.y * unit).toFloat()
                scaleX = state.viewport.zoom.toFloat()
                scaleY = state.viewport.zoom.toFloat()
                transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0f, 0f)
            },
        ) {
            connectionDraft?.takeIf { customConnectionLineEnabled }?.let { draft ->
                val result = pyreonEdgePath(
                    state.connectionLineType,
                    draft.source.x, draft.source.y, draft.source.position,
                    draft.current.x, draft.current.y, PyreonFlowPosition.Left,
                )
                Box(Modifier.matchParentSize()) {
                    customConnectionLine(PyreonFlowConnectionLineContext(
                        draft.source.x, draft.source.y, draft.current.x, draft.current.y,
                        draft.source.position, result,
                    ))
                }
            }
            val strokesById = edgeStrokes.associateBy { it.id }
            val labelsById = pyreonFlowEdgeLabels(state, nodeHandles).associateBy { it.id }
            for (edge in pyreonFlowOrderedEdges(state.edges, state.elevateEdgesOnSelect, state::isEdgeSelected)) {
                if (edge.hidden == true || !customEdgeTypes.contains(edge.type ?: PYREON_FLOW_DEFAULT_EDGE_TYPE)) continue
                val stroke = strokesById[edge.id] ?: continue
                val first = stroke.segments.firstOrNull() ?: continue
                val last = stroke.segments.last()
                val label = labelsById[edge.id]
                Box(Modifier.matchParentSize()) {
                    val labelX = label?.x ?: (first.x + last.x) / 2
                    val labelY = label?.y ?: (first.y + last.y) / 2
                    CompositionLocalProvider(LocalPyreonFlowEdgeLabelPoint provides PyreonFlowPathPoint(labelX, labelY)) {
                        customEdge(PyreonFlowCustomEdgeContext(
                            edge, first.x, first.y, last.x, last.y,
                            pyreonFlowSegmentPosition(stroke.segments, true), pyreonFlowSegmentPosition(stroke.segments, false),
                            state.isEdgeSelected(edge.id), labelX, labelY,
                        ))
                    }
                }
            }
            val visibleEdgeIds = edgeStrokes.mapTo(mutableSetOf()) { it.id }
            for (edge in pyreonFlowEdgeLabels(state, nodeHandles).filter { visibleEdgeIds.contains(it.id) }) {
                var edgeModifier = Modifier
                    .offset { IntOffset((edge.x * unit).roundToInt(), (edge.y * unit).roundToInt()) }
                    // CENTRED on the label point like the web's `translate(-50%, -50%)`
                    // and Swift's `.position`; anchored top-left it ran along the
                    // edge onto the target node's resizer and hid the target-end
                    // marker (device-found).
                    .graphicsLayer { translationX = -size.width / 2f; translationY = -size.height / 2f }
                    // A tap gesture, not `clickable`: `clickable` inflates its hit box to
                    // the 48dp minimum, and a label centred on a short edge then covered
                    // neighbouring controls. The semantics action keeps it activatable.
                    .pointerInput(edge.id) { detectTapGestures(onLongPress = { state.emitEdgeContextMenu(edge.id) }) { state.selectEdge(edge.id); state.emitEdgeClick(edge.id) } }
                    .semantics { onClick { state.selectEdge(edge.id); state.emitEdgeClick(edge.id); true } }
                // Hardware-keyboard focus, like the web's `tabindex` on the edge
                // path: Tab reaches the label and Enter/Space selects the edge.
                // It was reachable by TalkBack only.
                edgeModifier = if (edge.focusable) edgeModifier
                    .focusable()
                    .onKeyEvent { event -> state.handleKeyEvent(event, edgeId = edge.id) }
                    .semantics {
                        contentDescription = edge.accessibilityLabel
                        selected = state.isEdgeSelected(edge.id)
                    } else edgeModifier.clearAndSetSemantics { }
                Text(
                    edge.text ?: "",
                    if (edge.text == null) edgeModifier else edgeModifier.background(pyreonFlowEdgeColor(palette.panelBackground).copy(alpha = 0.9f)),
                    color = pyreonFlowEdgeColor(palette.edgeLabel),
                )
            }
            for (node in visibleNodes) {
                val absolute = state.getAbsolutePosition(node.id)
                val inlineStyle = pyreonFlowNodeInlineStyle(node.style)
                var nodeModifier = Modifier
                    .zIndex(pyreonFlowNodeZ(node.zIndex, state.isNodeSelected(node.id), nodeDragStarts.containsKey(node.id), state.elevateNodesOnSelect).toFloat())
                    .offset { IntOffset((absolute.x * unit).roundToInt(), (absolute.y * unit).roundToInt()) }
                val styledWidth = node.width ?: inlineStyle.width
                val styledHeight = node.height ?: inlineStyle.height
                if (styledWidth != null) nodeModifier = nodeModifier.width(styledWidth.toFloat().dp)
                if (styledHeight != null) nodeModifier = nodeModifier.height(styledHeight.toFloat().dp)
                nodeModifier = nodeModifier.defaultMinSize(
                    minWidth = PYREON_FLOW_DEFAULT_NODE_WIDTH.toFloat().dp,
                    minHeight = PYREON_FLOW_DEFAULT_NODE_HEIGHT.toFloat().dp,
                ).onSizeChanged { size ->
                    state.updateNodeMeasurement(node.id, size.width / density.density.toDouble(), size.height / density.density.toDouble())
                }
                if (inlineStyle.padding > 0) nodeModifier = nodeModifier.padding(inlineStyle.padding.toFloat().dp)
                val nodeShape = RoundedCornerShape(inlineStyle.borderRadius.toFloat().dp)
                inlineStyle.backgroundColor?.let { nodeModifier = nodeModifier.background(pyreonFlowEdgeColor(it), nodeShape) }
                if (inlineStyle.borderWidth > 0 && inlineStyle.borderColor != null) nodeModifier = nodeModifier.border(
                    inlineStyle.borderWidth.toFloat().dp,
                    pyreonFlowEdgeColor(inlineStyle.borderColor),
                    nodeShape,
                )
                if (inlineStyle.opacity < 1) nodeModifier = nodeModifier.graphicsLayer { alpha = inlineStyle.opacity.toFloat() }
                // A tap selects (when selectable) and reports a click, as on web;
                // a long-press is the web's right-click. Compose runs onTap OR
                // onLongPress for one press, never both.
                nodeModifier = nodeModifier.pointerInput(node.id, "node-taps") {
                    detectTapGestures(
                        onDoubleTap = { state.emitNodeDoubleClick(node.id) },
                        onLongPress = { state.emitNodeContextMenu(node.id) },
                        onTap = {
                            if (node.selectable ?: state.nodesSelectable) state.selectNode(node.id)
                            state.emitNodeClick(node.id)
                        },
                    )
                }.pointerInput(node.id, "node-hover") {
                    awaitPointerEventScope {
                        while (true) {
                            val event = awaitPointerEvent()
                            when (event.type) {
                                PointerEventType.Enter -> state.emitNodeMouseEnter(node.id)
                                PointerEventType.Exit -> state.emitNodeMouseLeave(node.id)
                                else -> {}
                            }
                        }
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
                            onDragCancel = { dragPointer = null; if (nodeDragStarts.isNotEmpty()) state.emitNodeDragEnd(node.id); nodeDragStarts = emptyMap() },
                            onDragEnd = { dragPointer = null; if (nodeDragStarts.isNotEmpty()) state.emitNodeDragEnd(node.id); nodeDragStarts = emptyMap() },
                        ) { change, _ ->
                            change.consume()
                            if (state.autoPanOnNodeDrag) {
                                // Local px inside the node are graph units × unit; canvas dp = graph × zoom + viewport.
                                val at = state.getAbsolutePosition(node.id)
                                dragPointer = PyreonXYPosition(
                                    (at.x + change.position.x / unit) * state.viewport.zoom + state.viewport.x,
                                    (at.y + change.position.y / unit) * state.viewport.zoom + state.viewport.y,
                                )
                            }
                            val delta = (change.position - change.previousPosition) / unit.toFloat()
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
                }.focusable().onKeyEvent { event -> state.handleKeyEvent(event, node.id) }
                else nodeModifier.clearAndSetSemantics { }
                Box(nodeModifier) { nodeContent(node, state.isNodeSelected(node.id), nodeDragStarts.containsKey(node.id)) }
            }
            for (handle in interactiveHandles) {
                // Graph units ARE dp, so the 48dp platform floor is 48 units at zoom 1.
                val diameter = 12.0 / state.viewport.zoom
                val hitSize = maxOf(diameter, 48.0 / state.viewport.zoom)
                Canvas(
                    Modifier
                        .offset { IntOffset(((handle.x - hitSize / 2) * unit).roundToInt(), ((handle.y - hitSize / 2) * unit).roundToInt()) }
                        .requiredSize(hitSize.toFloat().dp)
                        .semantics {
                            contentDescription = "${handle.type} handle ${handle.handleId ?: "default"}"
                            role = androidx.compose.ui.semantics.Role.Button
                        }
                        .pointerInput(handle, interactionsLocked, state.viewport.zoom) {
                            if (interactionsLocked) return@pointerInput
                            var current = PyreonFlowPathPoint(handle.x, handle.y)
                            detectDragGestures(
                                onDragStart = { state.emitConnectStart(handle.nodeId, handle.handleId); connectionDraft = PyreonFlowConnectionDraft(handle, current) },
                                onDragCancel = { dragPointer = null; state.emitConnectEnd(null); connectionDraft = null },
                                onDragEnd = {
                                    dragPointer = null
                                    // The draft's end, not the last pointer event: auto-pan may have moved the viewport since.
                                    val end = connectionDraft?.current ?: current
                                    val connection = pyreonFlowResolveConnection(handle, interactiveHandles, end, (6.0 + state.connectionRadius) / state.viewport.zoom, state.connectionMode)
                                    var completed: PyreonFlowConnection? = null
                                    if (connection != null && state.connect(connection) != null) completed = connection
                                    state.emitConnectEnd(completed)
                                    connectionDraft = null
                                },
                            ) { change, _ ->
                                change.consume()
                                // The ABSOLUTE pointer, not summed deltas: the first delta
                                // Compose reports excludes the touch slop, so a summed
                                // draft ended one slop short of the finger and a drop
                                // exactly on a target handle missed it (device-found).
                                // Local px inside the zoomed layer are graph units × unit.
                                current = PyreonFlowPathPoint(handle.x - hitSize / 2 + change.position.x / unit, handle.y - hitSize / 2 + change.position.y / unit)
                                connectionDraft = PyreonFlowConnectionDraft(handle, current)
                                if (state.autoPanOnConnect) dragPointer = PyreonXYPosition(current.x * state.viewport.zoom + state.viewport.x, current.y * state.viewport.zoom + state.viewport.y)
                            }
                        },
                ) {
                    drawCircle(pyreonFlowEdgeColor(palette.handleBackground), radius = (diameter / 2 * unit).toFloat())
                    drawCircle(pyreonFlowEdgeColor(palette.handleBorder), radius = (diameter / 2 * unit).toFloat(), style = Stroke(width = 1f))
                }
            }
            for (node in visibleNodes) {
                val config = nodeResizer(node) ?: continue
                val targetId = node.id
                val absolute = state.getAbsolutePosition(targetId)
                val dimensions = state.getNodeDimensions(targetId)
                val width = dimensions.width
                val height = dimensions.height
                for (direction in config.directions) {
                    val x = if ('w' in direction) absolute.x else if ('e' in direction) absolute.x + width else absolute.x + width / 2
                    val y = if ('n' in direction) absolute.y else if ('s' in direction) absolute.y + height else absolute.y + height / 2
                    val diameter = config.handleSize / state.viewport.zoom
                    val hitSize = maxOf(diameter, 48.0 / state.viewport.zoom)
                    Canvas(
                        Modifier
                            .offset { IntOffset(((x - hitSize / 2) * unit).roundToInt(), ((y - hitSize / 2) * unit).roundToInt()) }
                            .requiredSize(hitSize.toFloat().dp)
                            .semantics { contentDescription = "Resize $direction for node ${node.id}" }
                            .pointerInput(node.id, direction, config, state.viewport.zoom, interactionsLocked) {
                                if (interactionsLocked) return@pointerInput
                                var start = PyreonFlowResizeFrame(node.position, width, height)
                                var dx = 0.0; var dy = 0.0
                                detectDragGestures(
                                    onDragStart = { state.pushHistory(); start = PyreonFlowResizeFrame(state.getNode(node.id)?.position ?: node.position, state.getNodeDimensions(node.id).width, state.getNodeDimensions(node.id).height) },
                                ) { change, amount ->
                                    change.consume(); dx += amount.x / unit / state.viewport.zoom; dy += amount.y / unit / state.viewport.zoom
                                    val frame = pyreonFlowResizeFrame(start, direction, dx, dy, config.minWidth, config.minHeight)
                                    state.updateNode(node.id) { current -> current.copy(position = frame.position, width = frame.width, height = frame.height) }
                                }
                            },
                    ) {
                        val topLeft = Offset(((hitSize - diameter) / 2 * unit).toFloat(), ((hitSize - diameter) / 2 * unit).toFloat())
                        val visualSize = androidx.compose.ui.geometry.Size((diameter * unit).toFloat(), (diameter * unit).toFloat())
                        drawRect(pyreonFlowEdgeColor(palette.resizerBackground), topLeft = topLeft, size = visualSize)
                        drawRect(pyreonFlowEdgeColor(palette.accent), topLeft = topLeft, size = visualSize, style = Stroke(width = (1.5 / state.viewport.zoom * unit).toFloat()))
                    }
                }
            }
            for (updater in pyreonFlowEdgeUpdaters(state, edgeStrokes)) {
                val diameter = 12.0 / state.viewport.zoom
                val hitSize = maxOf(diameter, 48.0 / state.viewport.zoom)
                Canvas(
                    Modifier
                        .offset { IntOffset(((updater.x - hitSize / 2) * unit).roundToInt(), ((updater.y - hitSize / 2) * unit).roundToInt()) }
                        .requiredSize(hitSize.toFloat().dp)
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
                                        val target = pyreonNearestFlowHandle(interactiveHandles.filter { it.nodeId != fixedNodeId }, current, if (state.connectionMode == "loose") "any" else if (movingTarget) "target" else "source", (6.0 + state.connectionRadius) / state.viewport.zoom)
                                        if (target != null) {
                                            pyreonFlowReconnectConnection(edge, updater.end, target, state.connectionMode == "loose")?.let { state.reconnectEdge(edge.id, it) }
                                        }
                                    }
                                    reconnectDraft = null
                                },
                            ) { change, _ ->
                                change.consume()
                                // Absolute pointer, as for a new connection (slop-safe).
                                current = PyreonFlowPathPoint(updater.x - hitSize / 2 + change.position.x / unit, updater.y - hitSize / 2 + change.position.y / unit)
                                reconnectDraft = PyreonFlowReconnectDraft(updater, fixed, current)
                            }
                        },
                ) {
                    drawCircle(pyreonFlowEdgeColor(palette.accent).copy(alpha = 0.35f), radius = (diameter / 2 * unit).toFloat())
                    drawCircle(pyreonFlowEdgeColor(palette.accent), radius = (diameter / 2 * unit).toFloat(), style = Stroke(width = (1.5 / state.viewport.zoom * unit).toFloat()))
                }
            }
        }

        // Toolbars live outside the graph transform: their anchor follows the
        // node through pan/zoom, while their controls remain screen-sized.
        for (node in visibleNodes) {
            val selected = state.isNodeSelected(node.id)
            for ((index, config) in nodeToolbarConfigs(node).withIndex()) {
                if (config.showOnSelect && !(config.selectedOverride ?: selected)) continue
                val absolute = state.getAbsolutePosition(node.id)
                val dimensions = state.getNodeDimensions(node.id)
                val placement = pyreonFlowNodeToolbarPlacement(
                    PyreonFlowNodeBox(absolute.x, absolute.y, dimensions.width, dimensions.height),
                    state.viewport,
                    config,
                )
                Box(
                    Modifier
                        .offset { IntOffset((placement.x * unit).roundToInt(), (placement.y * unit).roundToInt()) }
                        .graphicsLayer {
                            translationX = (-placement.anchorX * size.width).toFloat()
                            translationY = (-placement.anchorY * size.height).toFloat()
                        },
                ) {
                    Surface(shape = RoundedCornerShape(6.dp), elevation = 2.dp) {
                        Box(Modifier.padding(4.dp)) { nodeToolbar(node, index, selected, nodeDragStarts.containsKey(node.id)) }
                    }
                }
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
                controlsContent,
            )
        }
        if (miniMap != null) {
            PyreonFlowMiniMap(state, miniMap, miniMapNodeColor, Modifier.align(androidx.compose.ui.Alignment.BottomEnd).padding(10.dp))
        }
    } }
    // Scoped to the canvas, like the web's `data-color-mode` attribute.
    PyreonFlowColorMode(colorMode, content)
}
