package com.pyreon.runtime

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import java.util.Timer
import java.util.TimerTask

/** Resolve one declaration from Flow's portable inline CSS-string surface. */
fun pyreonFlowStyleValue(style: String?, property: String): String? {
    if (style == null) return null
    val wanted = property.lowercase()
    for (declaration in style.split(';')) {
        val pair = declaration.split(':', limit = 2)
        if (pair.size == 2 && pair[0].trim().lowercase() == wanted) {
            return pair[1].trim().ifEmpty { null }
        }
    }
    return null
}

fun pyreonFlowStyleNumber(style: String?, property: String): Double? =
    pyreonFlowStyleValue(style, property)?.removeSuffix("px")?.removeSuffix("PX")?.trim()?.toDoubleOrNull()

data class PyreonFlowNodeInlineStyle(
    val width: Double?, val height: Double?, val padding: Double,
    val backgroundColor: String?, val borderColor: String?,
    val borderWidth: Double, val borderRadius: Double, val opacity: Double,
)

fun pyreonFlowNodeInlineStyle(style: String?): PyreonFlowNodeInlineStyle {
    val background = pyreonFlowStyleValue(style, "background-color") ?: pyreonFlowStyleValue(style, "background")
    return PyreonFlowNodeInlineStyle(
        pyreonFlowStyleNumber(style, "width"),
        pyreonFlowStyleNumber(style, "height"),
        maxOf(0.0, pyreonFlowStyleNumber(style, "padding") ?: 0.0),
        background?.takeIf { it.startsWith("#") },
        pyreonFlowStyleValue(style, "border-color")?.takeIf { it.startsWith("#") },
        maxOf(0.0, pyreonFlowStyleNumber(style, "border-width") ?: 0.0),
        maxOf(0.0, pyreonFlowStyleNumber(style, "border-radius") ?: 0.0),
        (pyreonFlowStyleNumber(style, "opacity") ?: 1.0).coerceIn(0.0, 1.0),
    )
}

// PyreonFlowState — the Android-native port of @pyreon/flow's dependency-free
// `createFlow`. Same node/edge/viewport/selection behaviour as the
// TypeScript AND Swift engines (`flow.ts` / `PyreonFlowState.swift`), so a
// diagram author gets 1:1 results on web, iOS, and Android from one mental
// model. See `PyreonFlowState.swift`'s header for the full v1 scope note
// (what's covered, what's a documented follow-up) — identical here.
//
// Compose-observable state so a mutation recomposes a reader — but NOT one
// `mutableStateOf(List)` per collection the way v1 (and `PyreonTableState`)
// did. A whole-list replacement per drag frame recomposes every reader of the
// list and allocates an N-reference list per pointer-move event (~80 KB of
// garbage per event at N = 10,000). Nodes live in a `mutableStateMapOf` keyed
// by id (per-KEY snapshot state: a position write recomposes only the readers
// of that key — the web engine's O(1 + deg) fan-out) with a
// `mutableStateListOf` preserving insertion order; `nodes` is derived.
// Selection is an insertion-ordered list PAIRED with a per-key map for O(1)
// membership, so `isNodeSelected(id)` in a node composable subscribes to that
// id alone instead of scanning a K-element list on every recomposition.
// `createFlow({ nodes, edges })` OWNS its data (unlike table, which wraps an
// external source), so — same as Swift — no post-construction wiring dance:
// the constructor is fully self-contained.

/** A 2D point in flow (unscaled diagram) coordinates. */
data class PyreonXYPosition(val x: Double, val y: Double)
data class PyreonFlowDimensions(val width: Double, val height: Double)

/** Pan/zoom state — mirrors the web `Viewport`. */
data class PyreonFlowViewport(val x: Double = 0.0, val y: Double = 0.0, val zoom: Double = 1.0)

/** A node — generic over [T], the user's `data` payload (mirrors `FlowNode<TData>`). */
data class PyreonFlowNode<T>(
    val id: String,
    val type: String? = null,
    val position: PyreonXYPosition,
    val data: T,
    val width: Double? = null,
    val height: Double? = null,
    val draggable: Boolean? = null,
    val selectable: Boolean? = null,
    val connectable: Boolean? = null,
    val focusable: Boolean? = null,
    val ariaLabel: String? = null,
    val hidden: Boolean? = null,
    val deletable: Boolean? = null,
    val className: String? = null,
    val style: String? = null,
    val parentId: String? = null,
    val extent: PyreonFlowNodeExtent? = null,
    val extentParent: Boolean = false,
    val expandParent: Boolean? = null,
    val group: Boolean? = null,
    val sourceHandles: List<PyreonFlowHandleConfig> = emptyList(),
    val targetHandles: List<PyreonFlowHandleConfig> = emptyList(),
)

fun <T> pyreonEffectiveDimensions(node: PyreonFlowNode<T>, measurement: PyreonFlowNodeMeasurement? = null) = PyreonFlowDimensions(
    node.width ?: measurement?.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH,
    node.height ?: measurement?.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT,
)

data class PyreonFlowMarker(
    val type: String,
    val color: String? = null,
    val width: Double = 10.0,
    val height: Double = 7.0,
    val strokeWidth: Double = 1.0,
)

data class PyreonFlowResolvedMarkers(val start: PyreonFlowMarker?, val end: PyreonFlowMarker?)

val pyreonFlowDefaultMarkerEnd = PyreonFlowMarker("arrowclosed")

fun pyreonResolveFlowMarker(marker: PyreonFlowMarker?): PyreonFlowMarker? = marker?.copy(color = marker.color ?: "#999999")

private fun pyreonFlowMarkerNumber(value: Double): String = if (value % 1.0 == 0.0) value.toLong().toString() else value.toString()

fun pyreonFlowMarkerId(marker: PyreonFlowMarker): String {
    val color = (marker.color ?: "#999999").lowercase().replace(Regex("[^a-z0-9]"), "")
    return "pyreon-flow-marker-${marker.type}-$color-${pyreonFlowMarkerNumber(marker.width)}x${pyreonFlowMarkerNumber(marker.height)}-${pyreonFlowMarkerNumber(marker.strokeWidth)}"
}

fun pyreonResolveFlowEdgeMarkers(edge: PyreonFlowEdge, defaultMarkerEnd: PyreonFlowMarker?): PyreonFlowResolvedMarkers =
    PyreonFlowResolvedMarkers(pyreonResolveFlowMarker(edge.markerStart), pyreonResolveFlowMarker(if (edge.markerEndSpecified) edge.markerEnd else defaultMarkerEnd))

fun pyreonCollectFlowEdgeMarkers(edges: List<PyreonFlowEdge>, defaultMarkerEnd: PyreonFlowMarker?): Map<String, PyreonFlowMarker> = buildMap {
    for (edge in edges) {
        val markers = pyreonResolveFlowEdgeMarkers(edge, defaultMarkerEnd)
        markers.start?.let { put(pyreonFlowMarkerId(it), it) }
        markers.end?.let { put(pyreonFlowMarkerId(it), it) }
    }
}

/** An edge — mirrors `FlowEdge`'s core fields, including editable waypoints. */
sealed interface PyreonFlowDataValue {
    data class StringValue(val value: String) : PyreonFlowDataValue { override fun toString() = value }
    data class NumberValue(val value: Double) : PyreonFlowDataValue { override fun toString() = if (value % 1.0 == 0.0) value.toLong().toString() else value.toString() }
    data class BoolValue(val value: Boolean) : PyreonFlowDataValue { override fun toString() = value.toString() }
    data class ObjectValue(val value: PyreonFlowData) : PyreonFlowDataValue
    data class ArrayValue(val value: List<PyreonFlowDataValue>) : PyreonFlowDataValue
    data object NullValue : PyreonFlowDataValue { override fun toString() = "null" }
}

data class PyreonFlowData(val values: Map<String, PyreonFlowDataValue> = emptyMap()) {
    operator fun get(key: String): PyreonFlowDataValue? = values[key]
}

data class PyreonFlowEdge(
    val id: String,
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
    val type: String? = null,
    val label: String? = null,
    val animated: Boolean = false,
    val animatedSpecified: Boolean = animated,
    val focusable: Boolean? = null,
    val ariaLabel: String? = null,
    val hidden: Boolean? = null,
    val deletable: Boolean? = null,
    val reconnectable: Boolean? = null,
    val interactionWidth: Double? = null,
    val className: String? = null,
    val style: String? = null,
    val data: PyreonFlowData? = null,
    val curvature: Double? = null,
    val borderRadius: Double? = null,
    val pathOffset: Double? = null,
    val markerStart: PyreonFlowMarker? = null,
    val markerEnd: PyreonFlowMarker? = null,
    val markerEndSpecified: Boolean = false,
    val waypoints: List<PyreonXYPosition> = emptyList(),
)

/** Deterministic missing-id fallback used by the web Flow engine. */
fun pyreonFlowEdgeId(source: String, target: String, sourceHandle: String? = null, targetHandle: String? = null): String =
    "e-$source${sourceHandle?.let { "-$it" } ?: ""}-$target${targetHandle?.let { "-$it" } ?: ""}"

data class PyreonFlowDefaultEdgeOptions(
    val type: String? = null, val label: String? = null, val animated: Boolean? = null,
    val focusable: Boolean? = null, val ariaLabel: String? = null, val hidden: Boolean? = null,
    val deletable: Boolean? = null, val reconnectable: Boolean? = null, val interactionWidth: Double? = null,
    val curvature: Double? = null, val borderRadius: Double? = null, val pathOffset: Double? = null,
    val markerStart: PyreonFlowMarker? = null, val markerEnd: PyreonFlowMarker? = null, val markerEndSpecified: Boolean = false,
)

data class PyreonFlowConnection(
    val source: String,
    val target: String,
    val sourceHandle: String? = null,
    val targetHandle: String? = null,
)

/** Default node box when a node declares no explicit width/height — the SAME
 *  `150x40` fallback `DEFAULT_NODE_WIDTH`/`DEFAULT_NODE_HEIGHT` use on web. */
const val PYREON_FLOW_DEFAULT_NODE_WIDTH: Double = 150.0
const val PYREON_FLOW_DEFAULT_NODE_HEIGHT: Double = 40.0

/** The web `normalizeEdge` default — `type ?? 'bezier'` (`flow.ts`). */
const val PYREON_FLOW_DEFAULT_EDGE_TYPE: String = "bezier"

/** A container's measured pixel size — written by the hosting composable's
 *  own `onSizeChanged`, mirroring the web `containerSize` signal. */
data class PyreonFlowContainerSize(val width: Double = 0.0, val height: Double = 0.0)
data class PyreonFlowNodeExtent(val minX: Double, val minY: Double, val maxX: Double, val maxY: Double)
data class PyreonFlowSelection<T>(val nodes: List<PyreonFlowNode<T>>, val edges: List<PyreonFlowEdge>)
data class PyreonFlowNodeChange(val type: String, val id: String, val position: PyreonXYPosition? = null)
data class PyreonFlowEdgeChange(val type: String, val id: String? = null, val edge: PyreonFlowEdge? = null)
data class PyreonFlowConnectStart(val nodeId: String, val handleId: String)
data class PyreonFlowPaneEvent(val position: PyreonXYPosition)
data class PyreonFlowSnapshot<T>(
    val nodes: List<PyreonFlowNode<T>>,
    val edges: List<PyreonFlowEdge>,
    val viewport: PyreonFlowViewport? = null,
)
data class PyreonFlowSnapLines(val x: Double?, val y: Double?, val snappedPosition: PyreonXYPosition)
data class PyreonFlowLayoutPosition(val id: String, val position: PyreonXYPosition)
data class PyreonFlowLayoutOptions(
    val direction: String = "DOWN",
    val nodeSpacing: Double = 20.0,
    val layerSpacing: Double = 40.0,
    val animate: Boolean = true,
    val animationDuration: Double = 300.0,
)

/** Native twin of the public suspendable `computeLayout` helper. */
suspend fun <T> pyreonComputeFlowLayout(
    nodes: List<PyreonFlowNode<T>>,
    edges: List<PyreonFlowEdge>,
    algorithm: String = "layered",
    options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions(),
): List<PyreonFlowLayoutPosition> {
    var positions = when (algorithm) {
        "tree" -> pyreonFlowTreeLayout(nodes, edges, options.direction, options.nodeSpacing, options.layerSpacing)
        "force" -> pyreonFlowForceLayout(nodes, edges, options.nodeSpacing)
        "stress" -> pyreonFlowStressLayout(nodes, edges, options.nodeSpacing)
        "radial" -> pyreonFlowRadialLayout(nodes, edges, options.nodeSpacing)
        "box" -> pyreonFlowPackingLayout(nodes, options.nodeSpacing)
        "rectpacking" -> pyreonFlowPackingLayout(nodes, options.nodeSpacing, true)
        else -> pyreonFlowLayeredLayout(nodes, edges, options.direction, options.nodeSpacing, options.layerSpacing)
    }
    val minimumX = positions.minOfOrNull { it.position.x } ?: 0.0
    val minimumY = positions.minOfOrNull { it.position.y } ?: 0.0
    if (minimumX < 0.0 || minimumY < 0.0) positions = positions.map { item ->
        item.copy(position = PyreonXYPosition(
            item.position.x - kotlin.math.min(0.0, minimumX),
            item.position.y - kotlin.math.min(0.0, minimumY),
        ))
    }
    return positions
}

fun <T> pyreonFlowPackingLayout(nodes: List<PyreonFlowNode<T>>, spacing: Double = 20.0, sortByHeight: Boolean = false): List<PyreonFlowLayoutPosition> {
    val items = if (sortByHeight) nodes.withIndex().sortedWith(
        compareByDescending<IndexedValue<PyreonFlowNode<T>>> { it.value.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT }
            .thenByDescending { it.value.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH }
            .thenBy { it.index },
    ) else nodes.withIndex().toList()
    if (items.isEmpty()) return emptyList()
    val columns = kotlin.math.ceil(kotlin.math.sqrt(items.size.toDouble())).toInt().coerceAtLeast(1)
    val widest = items.maxOf { it.value.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH }
    val target = widest * columns + spacing * (columns - 1)
    var x = 0.0
    var y = 0.0
    var rowHeight = 0.0
    return items.map { item ->
        val node = item.value
        val width = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
        val height = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
        if (x > 0.0 && x + width > target) { x = 0.0; y += rowHeight + spacing; rowHeight = 0.0 }
        val result = PyreonFlowLayoutPosition(node.id, PyreonXYPosition(x, y))
        x += width + spacing
        rowHeight = kotlin.math.max(rowHeight, height)
        result
    }
}

fun <T> pyreonFlowTreeLayout(
    nodes: List<PyreonFlowNode<T>>,
    edges: List<PyreonFlowEdge>,
    direction: String = "DOWN",
    nodeSpacing: Double = 20.0,
    layerSpacing: Double = 40.0,
): List<PyreonFlowLayoutPosition> {
    if (nodes.isEmpty()) return emptyList()
    val ids = nodes.map { it.id }
    val known = ids.toSet()
    val boxes = nodes.associate { it.id to Pair(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) }
    val adjacency = ids.associateWith { mutableListOf<String>() }
    edges.filter { it.source in known && it.target in known && it.source != it.target }
        .forEach { adjacency.getValue(it.source).add(it.target) }
    val indegree = ids.associateWith { 0 }.toMutableMap()
    adjacency.values.flatten().forEach { indegree[it] = (indegree[it] ?: 0) + 1 }
    val children = ids.associateWith { mutableListOf<String>() }
    val depth = mutableMapOf<String, Int>()
    val queue = ids.filter { indegree[it] == 0 }.toMutableList().also { if (it.isEmpty()) it.add(ids.first()) }
    queue.forEach { depth[it] = 0 }
    var cursor = 0
    while (cursor < queue.size) {
        val id = queue[cursor++]
        adjacency.getValue(id).forEach { child ->
            if (child !in depth) {
                depth[child] = (depth[id] ?: 0) + 1
                children.getValue(id).add(child)
                queue.add(child)
            }
        }
    }
    ids.filter { it !in depth }.forEach { depth[it] = 0 }
    val maxDepth = ids.maxOf { depth[it] ?: 0 }
    val layers = List(maxDepth + 1) { mutableListOf<String>() }
    ids.forEach { layers[depth[it] ?: 0].add(it) }
    val horizontal = direction == "LEFT" || direction == "RIGHT"
    fun cross(id: String) = if (horizontal) boxes.getValue(id).second else boxes.getValue(id).first
    fun main(id: String) = if (horizontal) boxes.getValue(id).first else boxes.getValue(id).second
    val extents = layers.map { layer -> layer.withIndex().sumOf { cross(it.value) + if (it.index > 0) nodeSpacing else 0.0 } }
    val widest = extents.maxOrNull() ?: 0.0
    val positions = mutableMapOf<String, PyreonXYPosition>()
    var mainOffset = 0.0
    layers.forEachIndexed { layerIndex, layer ->
        val layerDepth = layer.maxOfOrNull(::main) ?: 0.0
        var crossOffset = (widest - extents[layerIndex]) / 2.0
        layer.forEach { id ->
            val along = mainOffset + (layerDepth - main(id)) / 2.0
            positions[id] = if (horizontal) PyreonXYPosition(along, crossOffset) else PyreonXYPosition(crossOffset, along)
            crossOffset += cross(id) + nodeSpacing
        }
        mainOffset += layerDepth + layerSpacing
    }
    for (layerIndex in maxDepth - 1 downTo 0) {
        layers[layerIndex].forEach { id ->
            val kids = children.getValue(id)
            if (kids.isNotEmpty()) {
                val centres = kids.map { child ->
                    val point = positions.getValue(child)
                    if (horizontal) point.y + boxes.getValue(child).second / 2.0 else point.x + boxes.getValue(child).first / 2.0
                }
                val middle = (centres.minOrNull()!! + centres.maxOrNull()!!) / 2.0
                val point = positions.getValue(id)
                positions[id] = if (horizontal) PyreonXYPosition(point.x, middle - boxes.getValue(id).second / 2.0)
                else PyreonXYPosition(middle - boxes.getValue(id).first / 2.0, point.y)
            }
        }
    }
    layers.forEach { layer ->
        val sorted = layer.sortedBy { if (horizontal) positions.getValue(it).y else positions.getValue(it).x }
        var edge = Double.NEGATIVE_INFINITY
        sorted.forEach { id ->
            val point = positions.getValue(id)
            val start = if (horizontal) point.y else point.x
            val next = kotlin.math.max(start, edge)
            positions[id] = if (horizontal) PyreonXYPosition(point.x, next) else PyreonXYPosition(next, point.y)
            edge = next + cross(id) + nodeSpacing
        }
    }
    if (direction == "UP" || direction == "LEFT") {
        val maximum = ids.maxOf { id ->
            val point = positions.getValue(id)
            if (horizontal) point.x + boxes.getValue(id).first else point.y + boxes.getValue(id).second
        }
        ids.forEach { id ->
            val point = positions.getValue(id)
            positions[id] = if (horizontal) PyreonXYPosition(maximum - point.x - boxes.getValue(id).first, point.y)
            else PyreonXYPosition(point.x, maximum - point.y - boxes.getValue(id).second)
        }
    }
    return ids.map { PyreonFlowLayoutPosition(it, positions.getValue(it)) }
}

private fun <T> pyreonFlowRelaxOverlaps(nodes: List<PyreonFlowNode<T>>, positions: MutableMap<String, PyreonXYPosition>, spacing: Double, passes: Int = 10) {
    if (nodes.isEmpty()) return
    val half = 1 shl 15; val span = half * 2
    fun key(x: Int, y: Int) = (x + half) * span + (y + half)
    val boxes = nodes.associate { it.id to Pair(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) }
    val cell = kotlin.math.max(1.0, nodes.maxOf { kotlin.math.max(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) } + spacing)
    repeat(passes) {
        val buckets = linkedMapOf<Int, MutableList<String>>()
        nodes.forEach { node ->
            val point = positions.getValue(node.id)
            buckets.getOrPut(key(kotlin.math.floor(point.x / cell).toInt(), kotlin.math.floor(point.y / cell).toInt())) { mutableListOf() }.add(node.id)
        }
        var moved = false
        buckets.forEach { (bucketKey, bucket) ->
            val cx = bucketKey / span - half; val cy = bucketKey % span - half
            val near = mutableListOf<String>()
            for (ox in -1..1) for (oy in -1..1) buckets[key(cx + ox, cy + oy)]?.let(near::addAll)
            bucket.forEach { id -> near.filter { it != id }.forEach { otherID ->
                var a = positions.getValue(id); var b = positions.getValue(otherID)
                val ba = boxes.getValue(id); val bb = boxes.getValue(otherID)
                val overlapX = (ba.first + bb.first) / 2.0 + spacing - kotlin.math.abs(a.x + ba.first / 2.0 - (b.x + bb.first / 2.0))
                val overlapY = (ba.second + bb.second) / 2.0 + spacing - kotlin.math.abs(a.y + ba.second / 2.0 - (b.y + bb.second / 2.0))
                if (overlapX > 0.0 && overlapY > 0.0) {
                    moved = true
                    if (overlapX < overlapY) {
                        val direction = if (a.x <= b.x) -1.0 else 1.0
                        a = a.copy(x = a.x + direction * overlapX / 2.0); b = b.copy(x = b.x - direction * overlapX / 2.0)
                    } else {
                        val direction = if (a.y <= b.y) -1.0 else 1.0
                        a = a.copy(y = a.y + direction * overlapY / 2.0); b = b.copy(y = b.y - direction * overlapY / 2.0)
                    }
                    positions[id] = a; positions[otherID] = b
                }
            } }
        }
        if (!moved) return
    }
}

private class PyreonFlowRandom(seed: Int = 0x02f6e2b1) {
    private var state = seed
    fun next(): Double {
        state = state xor (state shl 13)
        state = state xor (state shr 17)
        state = state xor (state shl 5)
        return state.toUInt().toDouble() / UInt.MAX_VALUE.toDouble()
    }
}

fun <T> pyreonFlowForceLayout(nodes: List<PyreonFlowNode<T>>, edges: List<PyreonFlowEdge>, nodeSpacing: Double = 20.0): List<PyreonFlowLayoutPosition> {
    if (nodes.isEmpty()) return emptyList()
    val ids = nodes.map { it.id }; val count = ids.size
    val average = nodes.sumOf { kotlin.math.max(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) } / count
    val ideal = (average + nodeSpacing) * 1.4
    val area = ideal * kotlin.math.sqrt(count.toDouble())
    val iterations = when { count <= 100 -> 300; count <= 400 -> 120; else -> 60 }
    val cell = ideal * 2.0; val half = 1 shl 15; val span = half * 2; val maxPartners = 24
    fun keyExact(x: Int, y: Int) = (x + half) * span + (y + half)
    fun key(x: Double, y: Double) = keyExact(kotlin.math.floor(x).toInt(), kotlin.math.floor(y).toInt())
    val random = PyreonFlowRandom()
    val x = DoubleArray(count); val y = DoubleArray(count); val index = ids.withIndex().associate { it.value to it.index }
    repeat(count) { i ->
        val angle = i.toDouble() / count * Math.PI * 2.0
        x[i] = kotlin.math.cos(angle) * area + random.next() * ideal * 0.1
        y[i] = kotlin.math.sin(angle) * area + random.next() * ideal * 0.1
    }
    val known = ids.toSet()
    val links = edges.filter { it.source in known && it.target in known && it.source != it.target }.map { index.getValue(it.source) to index.getValue(it.target) }
    val dx = DoubleArray(count); val dy = DoubleArray(count); var temperature = area / 4.0
    repeat(iterations) {
        dx.fill(0.0); dy.fill(0.0)
        val buckets = linkedMapOf<Int, MutableList<Int>>()
        repeat(count) { i -> buckets.getOrPut(key(x[i] / cell, y[i] / cell)) { mutableListOf() }.add(i) }
        buckets.forEach { (bucketKey, bucket) ->
            val cx = bucketKey / span - half; val cy = bucketKey % span - half
            val partners = mutableListOf<Int>()
            loop@ for (ox in -1..1) for (oy in -1..1) {
                for (value in buckets[keyExact(cx + ox, cy + oy)] ?: emptyList()) {
                    partners.add(value)
                    if (partners.size >= maxPartners) break@loop
                }
            }
            bucket.forEach { i -> partners.forEach { j ->
                if (i != j) {
                    var ux = x[i] - x[j]; var uy = y[i] - y[j]
                    var distance = kotlin.math.sqrt(ux * ux + uy * uy)
                    if (distance < 0.01) {
                        ux = (random.next() - 0.5) * 0.1; uy = (random.next() - 0.5) * 0.1
                        distance = kotlin.math.sqrt(ux * ux + uy * uy).takeIf { it != 0.0 } ?: 0.01
                    }
                    val repulsion = ideal * ideal / distance
                    dx[i] += ux / distance * repulsion; dy[i] += uy / distance * repulsion
                }
            } }
        }
        links.forEach { (a, b) ->
            val ux = x[a] - x[b]; val uy = y[a] - y[b]
            val distance = kotlin.math.sqrt(ux * ux + uy * uy).takeIf { it != 0.0 } ?: 0.01
            val attraction = distance * distance / ideal
            dx[a] -= ux / distance * attraction; dy[a] -= uy / distance * attraction
            dx[b] += ux / distance * attraction; dy[b] += uy / distance * attraction
        }
        repeat(count) { i ->
            val magnitude = kotlin.math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]).takeIf { it != 0.0 } ?: 1.0
            x[i] += dx[i] / magnitude * kotlin.math.min(magnitude, temperature)
            y[i] += dy[i] / magnitude * kotlin.math.min(magnitude, temperature)
        }
        temperature *= 0.975
    }
    val minX = x.minOrNull() ?: 0.0; val minY = y.minOrNull() ?: 0.0
    val positions = ids.withIndex().associateTo(mutableMapOf()) { it.value to PyreonXYPosition(x[it.index] - minX, y[it.index] - minY) }
    pyreonFlowRelaxOverlaps(nodes, positions, nodeSpacing)
    return ids.map { PyreonFlowLayoutPosition(it, positions.getValue(it)) }
}

fun <T> pyreonFlowStressLayout(nodes: List<PyreonFlowNode<T>>, edges: List<PyreonFlowEdge>, nodeSpacing: Double = 20.0): List<PyreonFlowLayoutPosition> {
    if (nodes.isEmpty()) return emptyList()
    val ids = nodes.map { it.id }; val count = ids.size
    val index = ids.withIndex().associate { it.value to it.index }
    val average = nodes.sumOf { kotlin.math.max(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) } / count
    val unit = average + nodeSpacing
    val adjacency = List(count) { mutableListOf<Int>() }; val known = ids.toSet()
    edges.filter { it.source in known && it.target in known && it.source != it.target }.forEach {
        val source = index.getValue(it.source); val target = index.getValue(it.target)
        adjacency[source].add(target); adjacency[target].add(source)
    }
    fun bfs(source: Int): DoubleArray {
        val row = DoubleArray(count) { Double.POSITIVE_INFINITY }; row[source] = 0.0
        val queue = mutableListOf(source); var cursor = 0
        while (cursor < queue.size) {
            val current = queue[cursor++]
            adjacency[current].forEach { next -> if (row[next] == Double.POSITIVE_INFINITY) { row[next] = row[current] + 1.0; queue.add(next) } }
        }
        return row
    }
    val pivotCount = kotlin.math.min(count, 64)
    val pivots = mutableListOf(0); val rows = mutableListOf(bfs(0)); val best = rows[0].copyOf()
    while (pivots.size < pivotCount) {
        var far = 0; var farDistance = -1.0
        repeat(count) { i ->
            val distance = best[i]
            if (distance != Double.POSITIVE_INFINITY && distance > farDistance) { farDistance = distance; far = i }
        }
        if (far in pivots) far = (0..<count).firstOrNull { it !in pivots } ?: break
        pivots.add(far)
        val row = bfs(far); rows.add(row)
        repeat(count) { i -> if (row[i] < best[i]) best[i] = row[i] }
    }
    var diameter = 1.0
    rows.forEach { row -> row.forEach { distance -> if (distance != Double.POSITIVE_INFINITY) diameter = kotlin.math.max(diameter, distance) } }
    rows.forEach { row -> repeat(count) { i -> if (row[i] == Double.POSITIVE_INFINITY) row[i] = diameter + 1.0 } }
    val pivotTotal = pivots.size; val flat = DoubleArray(pivotTotal * count)
    rows.forEachIndexed { pivotIndex, row -> row.copyInto(flat, pivotIndex * count) }
    val random = PyreonFlowRandom(0x51f3a7); val radius = unit * kotlin.math.sqrt(count.toDouble())
    val x = DoubleArray(count); val y = DoubleArray(count)
    repeat(count) { i ->
        val angle = i.toDouble() / count * Math.PI * 2.0
        x[i] = kotlin.math.cos(angle) * radius + random.next() * 0.01
        y[i] = kotlin.math.sin(angle) * radius + random.next() * 0.01
    }
    val iterations = when { count <= 200 -> 150; count <= 600 -> 60; else -> 30 }
    repeat(iterations) {
        repeat(count) { i ->
            var nextX = 0.0; var nextY = 0.0; var weightSum = 0.0
            repeat(pivotTotal) { pivotIndex ->
                val other = pivots[pivotIndex]
                if (i != other) {
                    val target = flat[pivotIndex * count + i] * unit
                    if (target > 0.0) {
                        val weight = 1.0 / (target * target)
                        val deltaX = x[i] - x[other]; val deltaY = y[i] - y[other]
                        val distance = kotlin.math.sqrt(deltaX * deltaX + deltaY * deltaY).takeIf { it != 0.0 } ?: 0.01
                        nextX += weight * (x[other] + target * deltaX / distance)
                        nextY += weight * (y[other] + target * deltaY / distance)
                        weightSum += weight
                    }
                }
            }
            if (weightSum > 0.0) { x[i] = nextX / weightSum; y[i] = nextY / weightSum }
        }
    }
    val minX = x.minOrNull() ?: 0.0; val minY = y.minOrNull() ?: 0.0
    val positions = ids.withIndex().associateTo(mutableMapOf()) { it.value to PyreonXYPosition(x[it.index] - minX, y[it.index] - minY) }
    pyreonFlowRelaxOverlaps(nodes, positions, nodeSpacing)
    return ids.map { PyreonFlowLayoutPosition(it, positions.getValue(it)) }
}

fun <T> pyreonFlowLayeredLayout(
    nodes: List<PyreonFlowNode<T>>, edges: List<PyreonFlowEdge>, direction: String = "DOWN",
    nodeSpacing: Double = 20.0, layerSpacing: Double = 40.0,
): List<PyreonFlowLayoutPosition> {
    if (nodes.isEmpty()) return emptyList()
    val ids = nodes.map { it.id }; val known = ids.toSet()
    val boxes = nodes.associate { it.id to Pair(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) }
    val adjacency = ids.associateWith { mutableListOf<String>() }
    edges.filter { it.source in known && it.target in known && it.source != it.target }.forEach { adjacency.getValue(it.source).add(it.target) }
    val state = ids.associateWith { 0 }.toMutableMap(); val dag = ids.associateWith { mutableListOf<String>() }
    fun visit(id: String) {
        state[id] = 1
        adjacency.getValue(id).forEach { next ->
            when (state[next] ?: 0) {
                1 -> dag.getValue(next).add(id)
                else -> { dag.getValue(id).add(next); if ((state[next] ?: 0) == 0) visit(next) }
            }
        }
        state[id] = 2
    }
    ids.forEach { if (state[it] == 0) visit(it) }
    val indegree = ids.associateWith { 0 }.toMutableMap()
    dag.values.flatten().forEach { indegree[it] = (indegree[it] ?: 0) + 1 }
    val depth = ids.associateWith { 0 }.toMutableMap()
    val queue = ids.filter { indegree[it] == 0 }.toMutableList(); val seen = queue.toMutableSet(); var cursor = 0
    while (cursor < queue.size) {
        val id = queue[cursor++]
        dag.getValue(id).forEach { target ->
            depth[target] = kotlin.math.max(depth[target] ?: 0, (depth[id] ?: 0) + 1)
            val left = (indegree[target] ?: 0) - 1; indegree[target] = left
            if (left == 0 && seen.add(target)) queue.add(target)
        }
    }
    val maxDepth = ids.maxOf { depth[it] ?: 0 }
    var layers = List(maxDepth + 1) { mutableListOf<String>() }
    ids.forEach { layers[depth[it] ?: 0].add(it) }
    val predecessors = ids.associateWith { mutableListOf<String>() }
    dag.forEach { (source, outgoing) -> outgoing.forEach { predecessors.getValue(it).add(source) } }
    repeat(4) { sweep ->
        val downward = sweep % 2 == 0
        val layerIndices = if (downward) (1..<layers.size).toList() else (0..<layers.size - 1).reversed()
        layerIndices.forEach { layerIndex ->
            val fixed = if (downward) layers[layerIndex - 1] else layers[layerIndex + 1]
            val fixedPosition = fixed.withIndex().associate { it.value to it.index }
            fun neighbours(id: String) = if (downward) predecessors.getValue(id) else dag.getValue(id)
            fun median(id: String): Int {
                val values = neighbours(id).mapNotNull(fixedPosition::get).sorted()
                return if (values.isEmpty()) -1 else values[values.size / 2]
            }
            val stable = layers[layerIndex].withIndex().associate { it.value to it.index }
            layers[layerIndex].sortWith(Comparator { a, b ->
                val left = median(a); val right = median(b)
                if (left == -1 || right == -1) stable.getValue(a) - stable.getValue(b)
                else (left - right).takeIf { it != 0 } ?: (stable.getValue(a) - stable.getValue(b))
            })
            fun crossings(left: String, right: String): Int {
                val a = neighbours(left).mapNotNull(fixedPosition::get); val b = neighbours(right).mapNotNull(fixedPosition::get)
                return a.sumOf { x -> b.count { y -> x > y } }
            }
            repeat(2) {
                var swapped = false; var i = 0
                while (i + 1 < layers[layerIndex].size) {
                    val a = layers[layerIndex][i]; val b = layers[layerIndex][i + 1]
                    if (crossings(b, a) < crossings(a, b)) {
                        layers[layerIndex][i] = b; layers[layerIndex][i + 1] = a; swapped = true
                    }
                    i++
                }
                if (!swapped) return@repeat
            }
        }
    }
    val horizontal = direction == "LEFT" || direction == "RIGHT"
    fun cross(id: String) = if (horizontal) boxes.getValue(id).second else boxes.getValue(id).first
    fun main(id: String) = if (horizontal) boxes.getValue(id).first else boxes.getValue(id).second
    val extents = layers.map { layer -> layer.withIndex().sumOf { cross(it.value) + if (it.index > 0) nodeSpacing else 0.0 } }
    val widest = extents.maxOrNull() ?: 0.0; var mainOffset = 0.0
    val positions = mutableMapOf<String, PyreonXYPosition>()
    layers.forEachIndexed { layerIndex, layer ->
        val layerDepth = layer.maxOfOrNull(::main) ?: 0.0; var crossOffset = (widest - extents[layerIndex]) / 2.0
        layer.forEach { id ->
            val along = mainOffset + (layerDepth - main(id)) / 2.0
            positions[id] = if (horizontal) PyreonXYPosition(along, crossOffset) else PyreonXYPosition(crossOffset, along)
            crossOffset += cross(id) + nodeSpacing
        }
        mainOffset += layerDepth + layerSpacing
    }
    if (direction == "UP" || direction == "LEFT") {
        val maximum = ids.maxOf { id -> val p = positions.getValue(id); if (horizontal) p.x + boxes.getValue(id).first else p.y + boxes.getValue(id).second }
        ids.forEach { id -> val p = positions.getValue(id); positions[id] = if (horizontal) PyreonXYPosition(maximum - p.x - boxes.getValue(id).first, p.y) else PyreonXYPosition(p.x, maximum - p.y - boxes.getValue(id).second) }
    }
    return ids.map { PyreonFlowLayoutPosition(it, positions.getValue(it)) }
}

fun <T> pyreonFlowRadialLayout(nodes: List<PyreonFlowNode<T>>, edges: List<PyreonFlowEdge>, nodeSpacing: Double = 20.0): List<PyreonFlowLayoutPosition> {
    if (nodes.isEmpty()) return emptyList()
    val ids = nodes.map { it.id }; val known = ids.toSet()
    val boxes = nodes.associate { it.id to Pair(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) }
    val adjacency = ids.associateWith { mutableListOf<String>() }
    edges.filter { it.source in known && it.target in known && it.source != it.target }.forEach { adjacency.getValue(it.source).add(it.target) }
    val indegree = ids.associateWith { 0 }.toMutableMap()
    adjacency.values.flatten().forEach { indegree[it] = (indegree[it] ?: 0) + 1 }
    val roots = ids.filter { indegree[it] == 0 }
    val queue = mutableListOf(roots.firstOrNull() ?: ids.first())
    val depth = mutableMapOf(queue.first() to 0)
    var cursor = 0
    while (cursor < queue.size) {
        val id = queue[cursor++]
        adjacency.getValue(id).forEach { child -> if (child !in depth) { depth[child] = (depth[id] ?: 0) + 1; queue.add(child) } }
    }
    ids.filter { it !in depth }.forEach { depth[it] = 1 }
    val average = nodes.sumOf { kotlin.math.max(it.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, it.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) } / nodes.size
    val ring = average + nodeSpacing * 2.0
    val byDepth = linkedMapOf<Int, MutableList<String>>()
    ids.forEach { byDepth.getOrPut(depth[it] ?: 0) { mutableListOf() }.add(it) }
    val raw = mutableMapOf<String, PyreonXYPosition>()
    var previousRadius = 0.0
    byDepth.keys.sorted().forEach { level ->
        val layer = byDepth.getValue(level)
        if (level == 0) layer.forEachIndexed { index, id ->
            val box = boxes.getValue(id); raw[id] = PyreonXYPosition(index * (average + nodeSpacing) - box.first / 2.0, -box.second / 2.0)
        } else {
            val rootCount = byDepth[0]?.size ?: 1
            val centreClear = rootCount * (average + nodeSpacing) / 2.0 + average / 2.0 + nodeSpacing
            val radius = maxOf(level * ring, centreClear, layer.size * (average + nodeSpacing) / (2.0 * Math.PI), previousRadius + average + nodeSpacing)
            previousRadius = radius
            layer.forEachIndexed { index, id ->
                val angle = index.toDouble() / layer.size * Math.PI * 2.0; val box = boxes.getValue(id)
                raw[id] = PyreonXYPosition(kotlin.math.cos(angle) * radius - box.first / 2.0, kotlin.math.sin(angle) * radius - box.second / 2.0)
            }
        }
    }
    val minX = ids.minOf { raw[it]?.x ?: 0.0 }; val minY = ids.minOf { raw[it]?.y ?: 0.0 }
    val positions = ids.associateWithTo(mutableMapOf()) { id -> val point = raw[id] ?: PyreonXYPosition(0.0, 0.0); PyreonXYPosition(point.x - minX, point.y - minY) }
    pyreonFlowRelaxOverlaps(nodes, positions, nodeSpacing)
    return ids.map { PyreonFlowLayoutPosition(it, positions.getValue(it)) }
}
private data class PyreonFlowHistorySnapshot<T>(val nodes: List<PyreonFlowNode<T>>, val edges: List<PyreonFlowEdge>)

/** Reactive flow-diagram state: nodes, edges, viewport, selection. Behaviour-
 *  identical to the TS/Swift engines for the v1 surface. See the file header
 *  for the storage/observation contract. */
class PyreonFlowState<T>(
    nodes: List<PyreonFlowNode<T>> = emptyList(),
    edges: List<PyreonFlowEdge> = emptyList(),
    viewport: PyreonFlowViewport = PyreonFlowViewport(),
    private val minZoom: Double = 0.1,
    private val maxZoom: Double = 4.0,
    private val snapToGrid: Boolean = false,
    private val snapGrid: Double = 15.0,
    nodeExtent: PyreonFlowNodeExtent? = null,
    private val connectionRules: Map<String, List<String>>? = null,
    val defaultMarkerEnd: PyreonFlowMarker? = PyreonFlowMarker("arrowclosed"),
    val nodesDraggable: Boolean = true,
    val nodesConnectable: Boolean = true,
    val nodesSelectable: Boolean = true,
    val nodesFocusable: Boolean = true,
    val edgesFocusable: Boolean = true,
    val disableKeyboardA11y: Boolean = false,
    val nodesDeletable: Boolean = true,
    val edgesDeletable: Boolean = true,
    val edgesReconnectable: Boolean = true,
    val edgeInteractionWidth: Double = 20.0,
    connectionRadius: Double = 0.0,
    val pannable: Boolean = true,
    val panOnDrag: Boolean = true,
    val panOnScroll: Boolean = false,
    val panOnScrollSpeed: Double = 0.5,
    val zoomable: Boolean = true,
    val zoomOnScroll: Boolean = true,
    val zoomOnPinch: Boolean = true,
    val zoomOnDoubleClick: Boolean = false,
    val selectionOnDrag: Boolean = false,
    selectionMode: String = "partial",
    val multiSelect: Boolean = true,
    val onlyRenderVisibleElements: Boolean = false,
    val snapToObjects: Boolean = true,
    val defaultEdgeType: String = PYREON_FLOW_DEFAULT_EDGE_TYPE,
    val connectionLineType: String = PYREON_FLOW_DEFAULT_EDGE_TYPE,
    val defaultEdgeOptions: PyreonFlowDefaultEdgeOptions = PyreonFlowDefaultEdgeOptions(),
    val fitViewOnLoad: Boolean = false,
    fitViewPadding: Double = 0.1,
    val autoHistory: Boolean = true,
    val deleteKeys: List<String>? = listOf("Delete", "Backspace"),
    val multiSelectionKey: String? = "shift",
    val selectionKey: String? = "shift",
    val zoomActivationKey: String? = "ctrl",
    val preventScrolling: Boolean = true,
    private val connectionValidator: ((PyreonFlowConnection) -> Boolean)? = null,
    private val searchText: ((T) -> String?)? = null,
    private val reducedMotion: Boolean? = null,
) {
    private fun shouldReduceMotion(): Boolean {
        reducedMotion?.let { return it }
        return try {
            val enabled = Class.forName("android.animation.ValueAnimator")
                .getMethod("areAnimatorsEnabled").invoke(null) as? Boolean
            enabled == false
        } catch (_: ReflectiveOperationException) { false }
    }
    val selectionMode: String = if (selectionMode == "full") "full" else "partial"
    fun batch(operation: () -> Unit) { Snapshot.withMutableSnapshot(operation) }
    fun dispose() {
        viewportAnimationGeneration++; layoutAnimationGeneration++
        undoStack.clear(); redoStack.clear(); clipboard = null
        connectListeners.clear(); viewportListeners.clear()
        nodeClickListeners.clear(); nodeDoubleClickListeners.clear()
        nodeDragStartListeners.clear(); nodeDragListeners.clear(); nodeDragEndListeners.clear()
        edgeClickListeners.clear(); selectionListeners.clear()
        nodesDeleteListeners.clear(); edgesDeleteListeners.clear()
        nodesChangeListeners.clear(); edgesChangeListeners.clear()
        connectStartListeners.clear(); connectEndListeners.clear(); paneClickListeners.clear()
    }
    private companion object {
        val viewportAnimationTimer = Timer("PyreonFlowViewport", true)
    }
    @Volatile private var viewportAnimationGeneration = 0
    @Volatile private var layoutAnimationGeneration = 0
    private val undoStack = ArrayList<PyreonFlowHistorySnapshot<T>>()
    private val redoStack = ArrayList<PyreonFlowHistorySnapshot<T>>()
    private var mutationVersion = 0
    private var checkpointVersion = -1
    private var clipboard: PyreonFlowHistorySnapshot<T>? = null
    private var pasteCounter = 0
    private var nextListenerId = 0
    private val connectListeners = LinkedHashMap<Int, (PyreonFlowConnection) -> Unit>()
    private val viewportListeners = LinkedHashMap<Int, (PyreonFlowViewport) -> Unit>()
    private val nodeClickListeners = LinkedHashMap<Int, (PyreonFlowNode<T>) -> Unit>()
    private val nodeDoubleClickListeners = LinkedHashMap<Int, (PyreonFlowNode<T>) -> Unit>()
    private val nodeDragStartListeners = LinkedHashMap<Int, (PyreonFlowNode<T>) -> Unit>()
    private val nodeDragListeners = LinkedHashMap<Int, (PyreonFlowNode<T>) -> Unit>()
    private val nodeDragEndListeners = LinkedHashMap<Int, (PyreonFlowNode<T>) -> Unit>()
    private val edgeClickListeners = LinkedHashMap<Int, (PyreonFlowEdge) -> Unit>()
    private val selectionListeners = LinkedHashMap<Int, (PyreonFlowSelection<T>) -> Unit>()
    private val nodesDeleteListeners = LinkedHashMap<Int, (List<PyreonFlowNode<T>>) -> Unit>()
    private val edgesDeleteListeners = LinkedHashMap<Int, (List<PyreonFlowEdge>) -> Unit>()
    private val nodesChangeListeners = LinkedHashMap<Int, (List<PyreonFlowNodeChange>) -> Unit>()
    private val edgesChangeListeners = LinkedHashMap<Int, (List<PyreonFlowEdgeChange>) -> Unit>()
    private val connectStartListeners = LinkedHashMap<Int, (PyreonFlowConnectStart) -> Unit>()
    private val connectEndListeners = LinkedHashMap<Int, (PyreonFlowConnection?) -> Unit>()
    private val paneClickListeners = LinkedHashMap<Int, (PyreonFlowPaneEvent) -> Unit>()
    val connectionRadius: Double = maxOf(0.0, connectionRadius)
    val fitViewPadding: Double = maxOf(0.0, fitViewPadding)
    private var nodeExtent: PyreonFlowNodeExtent? = nodeExtent
    private val order = mutableStateListOf<String>()
    private val nodeMap = mutableStateMapOf<String, PyreonFlowNode<T>>()
    private val measurementStore = mutableStateMapOf<String, PyreonFlowNodeMeasurement>()
    /** Intrinsic node sizes reported by the Compose host. Explicit node
     * width/height still win, matching the web engine's effective dimensions. */
    val measurements: Map<String, PyreonFlowNodeMeasurement>
        get() = measurementStore
    /** Every node in insertion order. Derived from the per-id map — reading it
     *  subscribes to EVERY node (use [getNode] in per-node composables). */
    val nodes: List<PyreonFlowNode<T>>
        get() = order.map { nodeMap.getValue(it) }
    /** Reactive O(1) lookup view matching the web FlowInstance computed. */
    val nodeLookup: Map<String, PyreonFlowNode<T>>
        get() = nodeMap

    private var _edges by mutableStateOf<List<PyreonFlowEdge>>(emptyList())
    val edges: List<PyreonFlowEdge>
        get() = _edges
    val edgeLookup: Map<String, PyreonFlowEdge>
        get() = _edges.associateBy { it.id }
    private val edgeIds = mutableStateMapOf<String, Unit>()

    private var _viewport by mutableStateOf(viewport)
    val viewport: PyreonFlowViewport
        get() = _viewport

    /** Written by the hosting composable's own size measurement — see the file header. */
    var containerSize: PyreonFlowContainerSize by mutableStateOf(PyreonFlowContainerSize())

    private val selectedNodeIdList = mutableStateListOf<String>()
    private val selectedNodeIdSet = mutableStateMapOf<String, Unit>()
    private val selectedEdgeIdList = mutableStateListOf<String>()
    private val selectedEdgeIdSet = mutableStateMapOf<String, Unit>()

    init {
        for (node in nodes) insertNode(node)
        for (edge in edges) insertEdge(edge)
        mutationVersion = 0
    }

    private fun markMutation() { mutationVersion++ }
    fun layout(algorithm: String = "layered", options: PyreonFlowLayoutOptions = PyreonFlowLayoutOptions()) {
        val startNodes = nodes
        var targets = when (algorithm) {
            "tree" -> pyreonFlowTreeLayout(startNodes, edges, options.direction, options.nodeSpacing, options.layerSpacing)
            "force" -> pyreonFlowForceLayout(startNodes, edges, options.nodeSpacing)
            "stress" -> pyreonFlowStressLayout(startNodes, edges, options.nodeSpacing)
            "radial" -> pyreonFlowRadialLayout(startNodes, edges, options.nodeSpacing)
            "box" -> pyreonFlowPackingLayout(startNodes, options.nodeSpacing)
            "rectpacking" -> pyreonFlowPackingLayout(startNodes, options.nodeSpacing, true)
            else -> pyreonFlowLayeredLayout(startNodes, edges, options.direction, options.nodeSpacing, options.layerSpacing)
        }
        val minimumX = targets.minOfOrNull { it.position.x } ?: 0.0; val minimumY = targets.minOfOrNull { it.position.y } ?: 0.0
        if (minimumX < 0.0 || minimumY < 0.0) targets = targets.map { it.copy(position = PyreonXYPosition(it.position.x - kotlin.math.min(0.0, minimumX), it.position.y - kotlin.math.min(0.0, minimumY))) }
        checkpoint(); val generation = ++layoutAnimationGeneration
        val targetMap = targets.associate { it.id to it.position }
        if (!options.animate || shouldReduceMotion() || options.animationDuration <= 0.0) { applyLayoutPositions(targetMap); return }
        val starts = startNodes.associate { it.id to it.position }
        scheduleLayoutFrame(generation, starts, targetMap, System.nanoTime(), options.animationDuration * 1_000_000.0)
    }
    private fun applyLayoutPositions(positions: Map<String, PyreonXYPosition>) {
        val changes = mutableListOf<PyreonFlowNodeChange>()
        Snapshot.withMutableSnapshot {
            order.forEach { id -> positions[id]?.let { position -> nodeMap[id]?.let { node -> nodeMap[id] = node.copy(position = position); changes.add(PyreonFlowNodeChange("position", id, position)) } } }
        }
        if (changes.isNotEmpty()) { markMutation(); emitNodeChanges(changes) }
    }
    private fun scheduleLayoutFrame(generation: Int, starts: Map<String, PyreonXYPosition>, targets: Map<String, PyreonXYPosition>, startNanos: Long, durationNanos: Double) {
        viewportAnimationTimer.schedule(object : TimerTask() {
            override fun run() {
                if (layoutAnimationGeneration != generation) return
                val t = ((System.nanoTime() - startNanos) / durationNanos).coerceIn(0.0, 1.0); val eased = 1.0 - Math.pow(1.0 - t, 3.0)
                applyLayoutPositions(targets.mapNotNull { (id, target) -> starts[id]?.let { start -> id to PyreonXYPosition(start.x + (target.x - start.x) * eased, start.y + (target.y - start.y) * eased) } }.toMap())
                if (t < 1.0) scheduleLayoutFrame(generation, starts, targets, startNanos, durationNanos)
            }
        }, 16L)
    }
    fun onConnect(callback: (PyreonFlowConnection) -> Unit): () -> Unit {
        val id = nextListenerId++; connectListeners[id] = callback
        return { connectListeners.remove(id) }
    }
    fun onViewportChange(callback: (PyreonFlowViewport) -> Unit): () -> Unit {
        val id = nextListenerId++; viewportListeners[id] = callback
        return { viewportListeners.remove(id) }
    }
    private fun addNodeListener(listeners: MutableMap<Int, (PyreonFlowNode<T>) -> Unit>, callback: (PyreonFlowNode<T>) -> Unit): () -> Unit {
        val id = nextListenerId++; listeners[id] = callback
        return { listeners.remove(id) }
    }
    fun onNodeClick(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = addNodeListener(nodeClickListeners, callback)
    fun onNodeDoubleClick(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = addNodeListener(nodeDoubleClickListeners, callback)
    fun onNodeDragStart(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = addNodeListener(nodeDragStartListeners, callback)
    fun onNodeDrag(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = addNodeListener(nodeDragListeners, callback)
    fun onNodeDragEnd(callback: (PyreonFlowNode<T>) -> Unit): () -> Unit = addNodeListener(nodeDragEndListeners, callback)
    fun emitNodeClick(id: String) { nodeMap[id]?.let { node -> nodeClickListeners.values.forEach { it(node) } } }
    fun emitNodeDoubleClick(id: String) { nodeMap[id]?.let { node -> nodeDoubleClickListeners.values.forEach { it(node) } } }
    fun emitNodeDragStart(id: String) { nodeMap[id]?.let { node -> nodeDragStartListeners.values.forEach { it(node) } } }
    fun emitNodeDrag(id: String) { nodeMap[id]?.let { node -> nodeDragListeners.values.forEach { it(node) } } }
    fun emitNodeDragEnd(id: String) { nodeMap[id]?.let { node -> nodeDragEndListeners.values.forEach { it(node) } } }
    fun onEdgeClick(callback: (PyreonFlowEdge) -> Unit): () -> Unit {
        val id = nextListenerId++; edgeClickListeners[id] = callback
        return { edgeClickListeners.remove(id) }
    }
    fun onSelectionChange(callback: (PyreonFlowSelection<T>) -> Unit): () -> Unit {
        val id = nextListenerId++; selectionListeners[id] = callback
        return { selectionListeners.remove(id) }
    }
    fun onNodesDelete(callback: (List<PyreonFlowNode<T>>) -> Unit): () -> Unit {
        val id = nextListenerId++; nodesDeleteListeners[id] = callback
        return { nodesDeleteListeners.remove(id) }
    }
    fun onEdgesDelete(callback: (List<PyreonFlowEdge>) -> Unit): () -> Unit {
        val id = nextListenerId++; edgesDeleteListeners[id] = callback
        return { edgesDeleteListeners.remove(id) }
    }
    fun onNodesChange(callback: (List<PyreonFlowNodeChange>) -> Unit): () -> Unit {
        val id = nextListenerId++; nodesChangeListeners[id] = callback
        return { nodesChangeListeners.remove(id) }
    }
    fun onEdgesChange(callback: (List<PyreonFlowEdgeChange>) -> Unit): () -> Unit {
        val id = nextListenerId++; edgesChangeListeners[id] = callback
        return { edgesChangeListeners.remove(id) }
    }
    fun onConnectStart(callback: (PyreonFlowConnectStart) -> Unit): () -> Unit {
        val id = nextListenerId++; connectStartListeners[id] = callback
        return { connectStartListeners.remove(id) }
    }
    fun onConnectEnd(callback: (PyreonFlowConnection?) -> Unit): () -> Unit {
        val id = nextListenerId++; connectEndListeners[id] = callback
        return { connectEndListeners.remove(id) }
    }
    fun onPaneClick(callback: (PyreonFlowPaneEvent) -> Unit): () -> Unit {
        val id = nextListenerId++; paneClickListeners[id] = callback
        return { paneClickListeners.remove(id) }
    }
    fun emitConnectStart(nodeId: String, handleId: String?) { val event = PyreonFlowConnectStart(nodeId, handleId ?: ""); connectStartListeners.values.forEach { it(event) } }
    fun emitConnectEnd(connection: PyreonFlowConnection?) { connectEndListeners.values.forEach { it(connection) } }
    fun emitPaneClick(position: PyreonXYPosition) { val event = PyreonFlowPaneEvent(position); paneClickListeners.values.forEach { it(event) } }
    private fun emitNodeChanges(changes: List<PyreonFlowNodeChange>) { if (changes.isNotEmpty()) nodesChangeListeners.values.forEach { it(changes) } }
    private fun emitEdgeChanges(changes: List<PyreonFlowEdgeChange>) { if (changes.isNotEmpty()) edgesChangeListeners.values.forEach { it(changes) } }
    private fun emitDeleted(nodes: List<PyreonFlowNode<T>>, edges: List<PyreonFlowEdge>) {
        emitNodeChanges(nodes.map { PyreonFlowNodeChange("remove", it.id) })
        emitEdgeChanges(edges.map { PyreonFlowEdgeChange("remove", id = it.id) })
        if (nodes.isNotEmpty()) nodesDeleteListeners.values.forEach { it(nodes) }
        if (edges.isNotEmpty()) edgesDeleteListeners.values.forEach { it(edges) }
    }
    fun emitEdgeClick(id: String) { getEdge(id)?.let { edge -> edgeClickListeners.values.forEach { it(edge) } } }
    private fun emitSelectionChange() {
        val selection = PyreonFlowSelection(selectedNodeIdList.mapNotNull { nodeMap[it] }, selectedEdgeIdList.mapNotNull(::getEdge))
        selectionListeners.values.forEach { it(selection) }
    }
    private fun emitSelectionChangeIfChanged(nodes: List<String>, edges: List<String>) {
        if (nodes != selectedNodeIdList || edges != selectedEdgeIdList) emitSelectionChange()
    }
    private fun emitViewportChange() { for (callback in viewportListeners.values) callback(_viewport) }
    private fun checkpoint() { if (autoHistory) pushHistory() }
    fun pushHistory() {
        if (mutationVersion == checkpointVersion) return
        checkpointVersion = mutationVersion
        undoStack.add(PyreonFlowHistorySnapshot(nodes.toList(), _edges.toList()))
        if (undoStack.size > 50) undoStack.removeAt(0)
        redoStack.clear()
    }
    private fun restore(snapshot: PyreonFlowHistorySnapshot<T>) {
        order.clear(); nodeMap.clear(); measurementStore.clear(); _edges = emptyList(); edgeIds.clear()
        for (node in snapshot.nodes) insertNode(node)
        for (edge in snapshot.edges) insertEdge(edge)
        clearSelection()
    }
    fun undo() {
        if (undoStack.isEmpty()) return
        val previous = undoStack.removeAt(undoStack.lastIndex)
        redoStack.add(PyreonFlowHistorySnapshot(nodes.toList(), _edges.toList()))
        restore(previous)
    }
    fun redo() {
        if (redoStack.isEmpty()) return
        val next = redoStack.removeAt(redoStack.lastIndex)
        undoStack.add(PyreonFlowHistorySnapshot(nodes.toList(), _edges.toList()))
        restore(next)
    }
    fun toJSON(): PyreonFlowSnapshot<T> = PyreonFlowSnapshot(nodes.toList(), _edges.toList(), _viewport)
    fun fromJSON(snapshot: PyreonFlowSnapshot<T>) {
        checkpoint()
        val oldSelectedNodes = selectedNodeIdList.toList()
        val oldSelectedEdges = selectedEdgeIdList.toList()
        order.clear(); nodeMap.clear(); measurementStore.clear(); _edges = emptyList(); edgeIds.clear()
        for (node in snapshot.nodes) insertNode(node)
        for (edge in snapshot.edges) insertEdge(edge)
        selectedNodeIdList.clear(); selectedNodeIdSet.clear()
        selectedEdgeIdList.clear(); selectedEdgeIdSet.clear()
        snapshot.viewport?.let {
            _viewport = it
            emitViewportChange()
        }
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
    }

    /** Current zoom factor — `viewport.zoom`, exposed the same way the web
     *  `zoom: Computed<number>` is: a derived read, no independent storage. */
    val zoom: Double
        get() = _viewport.zoom

    // ── storage primitives (the web engine's `nodeMap`/`edgeMap`, kept in sync) ──
    private fun insertNode(node: PyreonFlowNode<T>) {
        if (nodeMap.containsKey(node.id)) return
        nodeMap[node.id] = node
        order.add(node.id)
        markMutation()
    }
    /** Applies the web `normalizeEdge` default (`type ?: "bezier"`); dedupes by id. */
    private fun insertEdge(edge: PyreonFlowEdge) {
        if (edgeIds.containsKey(edge.id)) return
        val e = edge.copy(
            type = edge.type ?: defaultEdgeOptions.type ?: defaultEdgeType,
            label = edge.label ?: defaultEdgeOptions.label,
            animated = if (edge.animatedSpecified) edge.animated else defaultEdgeOptions.animated ?: edge.animated,
            focusable = edge.focusable ?: defaultEdgeOptions.focusable,
            ariaLabel = edge.ariaLabel ?: defaultEdgeOptions.ariaLabel,
            hidden = edge.hidden ?: defaultEdgeOptions.hidden,
            deletable = edge.deletable ?: defaultEdgeOptions.deletable,
            reconnectable = edge.reconnectable ?: defaultEdgeOptions.reconnectable,
            interactionWidth = edge.interactionWidth ?: defaultEdgeOptions.interactionWidth,
            curvature = edge.curvature ?: defaultEdgeOptions.curvature,
            borderRadius = edge.borderRadius ?: defaultEdgeOptions.borderRadius,
            pathOffset = edge.pathOffset ?: defaultEdgeOptions.pathOffset,
            markerStart = edge.markerStart ?: defaultEdgeOptions.markerStart,
            markerEnd = if (edge.markerEndSpecified) edge.markerEnd else defaultEdgeOptions.markerEnd,
            markerEndSpecified = edge.markerEndSpecified || defaultEdgeOptions.markerEndSpecified,
        )
        _edges = _edges + e
        edgeIds[e.id] = Unit
        markMutation()
    }
    private fun removeEdges(shouldRemove: (PyreonFlowEdge) -> Boolean) {
        val keep = ArrayList<PyreonFlowEdge>(_edges.size)
        var removedAny = false
        for (edge in _edges) {
            if (shouldRemove(edge)) {
                removedAny = true
                edgeIds.remove(edge.id)
                if (selectedEdgeIdSet.remove(edge.id) != null) selectedEdgeIdList.remove(edge.id)
            } else {
                keep.add(edge)
            }
        }
        if (removedAny) { _edges = keep; markMutation() }
    }
    private fun removeNodes(ids: Set<String>) {
        if (ids.isEmpty()) return
        order.removeAll { ids.contains(it) }
        for (id in ids) { nodeMap.remove(id); measurementStore.remove(id) }
        markMutation()
        var touchedSelection = false
        for (id in ids) if (selectedNodeIdSet.remove(id) != null) touchedSelection = true
        if (touchedSelection) selectedNodeIdList.removeAll { ids.contains(it) }
        removeEdges { ids.contains(it.source) || ids.contains(it.target) }
    }

    // ── node operations ─────────────────────────────────────────────────────
    /** O(1). Reading it in a composable subscribes to THIS node only. */
    fun getNode(id: String): PyreonFlowNode<T>? = nodeMap[id]
    fun getNodeDimensions(id: String): PyreonFlowDimensions {
        val node = nodeMap[id] ?: return PyreonFlowDimensions(PYREON_FLOW_DEFAULT_NODE_WIDTH, PYREON_FLOW_DEFAULT_NODE_HEIGHT)
        return pyreonEffectiveDimensions(node, measurementStore[id])
    }
    fun updateNodeMeasurement(id: String, width: Double, height: Double) {
        if (!nodeMap.containsKey(id) || width <= 0.0 || height <= 0.0) return
        val previous = measurementStore[id]
        val next = PyreonFlowNodeMeasurement(width, height, previous?.handles ?: emptyList())
        if (previous != next) measurementStore[id] = next
    }
    fun addNode(node: PyreonFlowNode<T>) {
        if (nodeMap.containsKey(node.id)) return
        checkpoint()
        insertNode(node)
    }
    fun addNodes(nodes: List<PyreonFlowNode<T>>) {
        if (nodes.isEmpty()) return
        checkpoint()
        for (node in nodes) insertNode(node)
    }
    fun setNodes(nodes: List<PyreonFlowNode<T>>) {
        val oldSelectedNodes = selectedNodeIdList.toList(); val oldSelectedEdges = selectedEdgeIdList.toList()
        checkpoint()
        val nextIds = nodes.mapTo(HashSet()) { it.id }
        order.clear()
        nodeMap.clear()
        for (node in nodes) insertNode(node)
        measurementStore.keys.retainAll(nextIds)
        setNodeSelection(selectedNodeIdList.filter { nextIds.contains(it) })
        removeEdges { !nextIds.contains(it.source) || !nextIds.contains(it.target) }
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
    }
    /** Removes the node AND every edge connected to it (source or target). */
    fun removeNode(id: String) {
        if (!nodeMap.containsKey(id)) return
        val removedNodes = listOf(nodeMap.getValue(id))
        val removedEdges = _edges.filter { it.source == id || it.target == id }
        checkpoint()
        val oldSelectedNodes = selectedNodeIdList.toList(); val oldSelectedEdges = selectedEdgeIdList.toList()
        removeNodes(setOf(id))
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
        emitDeleted(removedNodes, removedEdges)
    }
    fun removeNodes(ids: List<String>) {
        val gone = ids.filterTo(HashSet()) { nodeMap.containsKey(it) }
        if (gone.isEmpty()) return
        val removedNodes = nodes.filter { gone.contains(it.id) }
        val removedEdges = _edges.filter { gone.contains(it.source) || gone.contains(it.target) }
        checkpoint()
        val oldSelectedNodes = selectedNodeIdList.toList(); val oldSelectedEdges = selectedEdgeIdList.toList()
        removeNodes(gone)
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
        emitDeleted(removedNodes, removedEdges)
    }
    /** O(1); recomposes only the readers of this node. */
    fun updateNodePosition(id: String, position: PyreonXYPosition) {
        val node = nodeMap[id] ?: return
        val snapped = if (snapToGrid && snapGrid != 0.0) PyreonXYPosition(
            kotlin.math.floor(position.x / snapGrid + 0.5) * snapGrid,
            kotlin.math.floor(position.y / snapGrid + 0.5) * snapGrid,
        ) else position
        val width = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
        val height = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
        val parent = node.parentId?.let(nodeMap::get)
        val effectiveExtent = if (node.extentParent && parent != null) PyreonFlowNodeExtent(
            0.0, 0.0,
            parent.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH,
            parent.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT,
        ) else node.extent ?: nodeExtent
        var clamped = clamp(snapped, effectiveExtent, width, height)
        if (node.expandParent == true && parent != null && node.parentId != null) {
            clamped = PyreonXYPosition(kotlin.math.max(0.0, clamped.x), kotlin.math.max(0.0, clamped.y))
            nodeMap[node.parentId] = parent.copy(
                width = kotlin.math.max(parent.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH, clamped.x + width),
                height = kotlin.math.max(parent.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT, clamped.y + height),
            )
        }
        nodeMap[id] = node.copy(position = clamped)
        markMutation()
        emitNodeChanges(listOf(PyreonFlowNodeChange("position", id, nodeMap.getValue(id).position)))
    }
    fun updateNodeData(id: String, update: (T) -> T) {
        val node = nodeMap[id] ?: return
        checkpoint()
        nodeMap[id] = node.copy(data = update(node.data))
        markMutation()
    }
    /** Callback form of the web API: computes data from the complete current node. */
    fun updateNodeDataFromNode(id: String, update: (PyreonFlowNode<T>) -> T) {
        val node = nodeMap[id] ?: return
        checkpoint()
        val changed = node.copy(data = update(node))
        nodeMap[id] = changed
        markMutation()
    }
    fun updateNode(id: String, update: (PyreonFlowNode<T>) -> PyreonFlowNode<T>) {
        val node = nodeMap[id] ?: return
        nodeMap[id] = update(node).copy(id = id)
        markMutation()
    }
    fun setNodeExtent(minX: Double, minY: Double, maxX: Double, maxY: Double) {
        nodeExtent = PyreonFlowNodeExtent(minX, minY, maxX, maxY)
    }
    fun clearNodeExtent() { nodeExtent = null }
    @JvmOverloads
    fun clampToExtent(position: PyreonXYPosition, nodeWidth: Double = PYREON_FLOW_DEFAULT_NODE_WIDTH, nodeHeight: Double = PYREON_FLOW_DEFAULT_NODE_HEIGHT): PyreonXYPosition {
        return clamp(position, nodeExtent, nodeWidth, nodeHeight)
    }
    private fun clamp(position: PyreonXYPosition, extent: PyreonFlowNodeExtent?, nodeWidth: Double, nodeHeight: Double): PyreonXYPosition {
        extent ?: return position
        return PyreonXYPosition(
            x = kotlin.math.min(kotlin.math.max(position.x, extent.minX), kotlin.math.max(extent.minX, extent.maxX - nodeWidth)),
            y = kotlin.math.min(kotlin.math.max(position.y, extent.minY), kotlin.math.max(extent.minY, extent.maxY - nodeHeight)),
        )
    }
    @JvmOverloads
    fun snappedNodePosition(id: String, position: PyreonXYPosition, excluding: Set<String> = emptySet(), threshold: Double = 5.0): PyreonXYPosition {
        if (!snapToObjects) return position
        return getSnapLines(id, position, threshold, excluding).snappedPosition
    }
    @JvmOverloads
    fun getSnapLines(id: String, position: PyreonXYPosition, threshold: Double = 5.0, excluding: Set<String> = emptySet()): PyreonFlowSnapLines {
        val dragged = nodeMap[id] ?: return PyreonFlowSnapLines(null, null, position)
        val width = dragged.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
        val height = dragged.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
        var x = position.x
        var y = position.y
        var snapX: Double? = null
        var snapY: Double? = null
        for (candidate in nodes) {
            if (candidate.id == id || excluding.contains(candidate.id)) continue
            val candidateWidth = candidate.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
            val candidateHeight = candidate.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
            val xPairs = arrayOf(Triple(position.x + width / 2, candidate.position.x + candidateWidth / 2, candidate.position.x + candidateWidth / 2 - width / 2), Triple(position.x, candidate.position.x, candidate.position.x), Triple(position.x + width, candidate.position.x + candidateWidth, candidate.position.x + candidateWidth - width))
            for ((actual, guide, target) in xPairs) if (kotlin.math.abs(actual - guide) < threshold) { snapX = guide; x = target }
            val yPairs = arrayOf(Triple(position.y + height / 2, candidate.position.y + candidateHeight / 2, candidate.position.y + candidateHeight / 2 - height / 2), Triple(position.y, candidate.position.y, candidate.position.y), Triple(position.y + height, candidate.position.y + candidateHeight, candidate.position.y + candidateHeight - height))
            for ((actual, guide, target) in yPairs) if (kotlin.math.abs(actual - guide) < threshold) { snapY = guide; y = target }
        }
        return PyreonFlowSnapLines(snapX, snapY, PyreonXYPosition(x, y))
    }

    // ── edge operations ─────────────────────────────────────────────────────
    fun getEdge(id: String): PyreonFlowEdge? =
        if (edgeIds.containsKey(id)) _edges.firstOrNull { it.id == id } else null
    fun resolvedMarkers(edge: PyreonFlowEdge): Pair<PyreonFlowMarker?, PyreonFlowMarker?> =
        edge.markerStart to if (edge.markerEndSpecified) edge.markerEnd else defaultMarkerEnd
    fun isValidConnection(connection: PyreonFlowConnection): Boolean {
        if (connectionValidator?.invoke(connection) == false) return false
        val rules = connectionRules ?: return true
        val source = nodeMap[connection.source] ?: return false
        val outputs = rules[source.type ?: "default"] ?: return true
        val target = nodeMap[connection.target] ?: return false
        return outputs.contains(target.type ?: "default")
    }
    fun connect(connection: PyreonFlowConnection, id: String? = null): PyreonFlowEdge? {
        if (!isValidConnection(connection)) return null
        val edge = PyreonFlowEdge(
            id = id ?: "edge-${java.util.UUID.randomUUID().toString().lowercase()}",
            source = connection.source,
            target = connection.target,
            sourceHandle = connection.sourceHandle,
            targetHandle = connection.targetHandle,
        )
        if (edgeIds.containsKey(edge.id)) return null
        checkpoint()
        insertEdge(edge)
        emitEdgeChanges(listOf(PyreonFlowEdgeChange("add", edge = getEdge(edge.id))))
        for (callback in connectListeners.values) callback(connection)
        return getEdge(edge.id)
    }
    /** Adds the edge unless an edge with the same `id` already exists — same
     *  dedupe-by-id contract as the web `addEdge`; applies `type ?: "bezier"`. */
    fun addEdge(edge: PyreonFlowEdge) {
        if (edgeIds.containsKey(edge.id)) return
        checkpoint()
        insertEdge(edge)
        emitEdgeChanges(listOf(PyreonFlowEdgeChange("add", edge = getEdge(edge.id))))
        val connection = PyreonFlowConnection(edge.source, edge.target, edge.sourceHandle, edge.targetHandle)
        for (callback in connectListeners.values) callback(connection)
    }
    fun addEdges(edges: List<PyreonFlowEdge>) {
        val fresh = edges.filterNot { edgeIds.containsKey(it.id) }
        if (fresh.isEmpty()) return
        checkpoint()
        val added = ArrayList<PyreonFlowEdge>()
        val connections = ArrayList<PyreonFlowConnection>()
        for (edge in fresh) {
            insertEdge(edge)
            getEdge(edge.id)?.let(added::add)
            connections.add(PyreonFlowConnection(edge.source, edge.target, edge.sourceHandle, edge.targetHandle))
        }
        emitEdgeChanges(added.map { PyreonFlowEdgeChange("add", edge = it) })
        for (connection in connections) for (callback in connectListeners.values) callback(connection)
    }
    fun setEdges(edges: List<PyreonFlowEdge>) {
        val oldSelectedNodes = selectedNodeIdList.toList(); val oldSelectedEdges = selectedEdgeIdList.toList()
        checkpoint()
        _edges = emptyList()
        edgeIds.clear()
        for (edge in edges) insertEdge(edge)
        setEdgeSelection(selectedEdgeIdList.filter { edgeIds.containsKey(it) })
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
    }
    fun removeEdge(id: String) {
        if (!edgeIds.containsKey(id)) return
        val removedEdge = getEdge(id)!!
        checkpoint()
        val oldSelectedNodes = selectedNodeIdList.toList(); val oldSelectedEdges = selectedEdgeIdList.toList()
        removeEdges { it.id == id }
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
        emitDeleted(emptyList(), listOf(removedEdge))
    }
    fun updateEdge(id: String, update: (PyreonFlowEdge) -> PyreonFlowEdge) {
        val index = _edges.indexOfFirst { it.id == id }
        if (index < 0) return
        _edges = _edges.toMutableList().also { it[index] = update(it[index]).copy(id = id) }
        markMutation()
    }
    fun reconnectEdge(id: String, source: String? = null, target: String? = null, sourceHandle: String? = null, targetHandle: String? = null) {
        val i = _edges.indexOfFirst { it.id == id }
        if (i < 0) return
        val edge = _edges[i]
        _edges = _edges.toMutableList().also { it[i] = edge.copy(
            source = source ?: edge.source,
            target = target ?: edge.target,
            sourceHandle = sourceHandle ?: edge.sourceHandle,
            targetHandle = targetHandle ?: edge.targetHandle,
        ) }
        markMutation()
    }
    fun reconnectEdge(id: String, connection: PyreonFlowConnection): Boolean {
        if (!isValidConnection(connection)) return false
        val i = _edges.indexOfFirst { it.id == id }
        if (i < 0) return false
        val edge = _edges[i]
        _edges = _edges.toMutableList().also { it[i] = edge.copy(source = connection.source, target = connection.target, sourceHandle = connection.sourceHandle, targetHandle = connection.targetHandle) }
        markMutation()
        return true
    }
    @JvmOverloads
    fun addEdgeWaypoint(edgeId: String, point: PyreonXYPosition, index: Int? = null) {
        val i = _edges.indexOfFirst { it.id == edgeId }
        if (i < 0) return
        val points = _edges[i].waypoints.toMutableList()
        val insertionIndex = when {
            index == null -> points.size
            index < 0 -> (points.size + index).coerceAtLeast(0)
            else -> index.coerceAtMost(points.size)
        }
        points.add(insertionIndex, point)
        _edges = _edges.toMutableList().also { it[i] = it[i].copy(waypoints = points) }
        markMutation()
    }
    fun removeEdgeWaypoint(edgeId: String, index: Int) {
        val i = _edges.indexOfFirst { it.id == edgeId }
        if (i < 0) return
        val removalIndex = if (index < 0) (_edges[i].waypoints.size + index).coerceAtLeast(0) else index
        if (removalIndex !in _edges[i].waypoints.indices) return
        val points = _edges[i].waypoints.toMutableList().also { it.removeAt(removalIndex) }
        _edges = _edges.toMutableList().also { it[i] = it[i].copy(waypoints = points) }
        markMutation()
    }
    fun updateEdgeWaypoint(edgeId: String, index: Int, point: PyreonXYPosition) {
        val i = _edges.indexOfFirst { it.id == edgeId }
        if (i < 0 || index !in _edges[i].waypoints.indices) return
        val points = _edges[i].waypoints.toMutableList().also { it[index] = point }
        _edges = _edges.toMutableList().also { it[i] = it[i].copy(waypoints = points) }
        markMutation()
    }
    fun removeEdges(ids: List<String>) {
        val gone = ids.filterTo(HashSet()) { edgeIds.containsKey(it) }
        if (gone.isEmpty()) return
        val removedEdges = _edges.filter { gone.contains(it.id) }
        checkpoint()
        val oldSelectedNodes = selectedNodeIdList.toList(); val oldSelectedEdges = selectedEdgeIdList.toList()
        removeEdges { gone.contains(it.id) }
        emitSelectionChangeIfChanged(oldSelectedNodes, oldSelectedEdges)
        emitDeleted(emptyList(), removedEdges)
    }

    // ── selection ────────────────────────────────────────────────────────────
    // Selecting a node NON-additively clears edge selection, and vice versa.
    fun isNodeSelected(id: String): Boolean = selectedNodeIdSet.containsKey(id)
    fun isEdgeSelected(id: String): Boolean = selectedEdgeIdSet.containsKey(id)
    /** Insertion order — the same order the web `Set` iterates. */
    fun selectedNodes(): List<String> = selectedNodeIdList.toList()
    fun selectedEdges(): List<String> = selectedEdgeIdList.toList()

    private fun setNodeSelection(ids: List<String>) {
        selectedNodeIdList.clear()
        selectedNodeIdSet.clear()
        for (id in ids) {
            if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        }
    }
    private fun setEdgeSelection(ids: List<String>) {
        selectedEdgeIdList.clear()
        selectedEdgeIdSet.clear()
        for (id in ids) {
            if (selectedEdgeIdSet.put(id, Unit) == null) selectedEdgeIdList.add(id)
        }
    }

    @JvmOverloads
    fun selectNode(id: String, additive: Boolean = false) {
        if (additive && multiSelect) {
            if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        } else {
            setNodeSelection(listOf(id))
            setEdgeSelection(emptyList())
        }
        emitSelectionChange()
    }
    @JvmOverloads
    fun selectNodes(ids: List<String>, additive: Boolean = false) {
        if (additive && multiSelect) {
            for (id in ids) if (selectedNodeIdSet.put(id, Unit) == null) selectedNodeIdList.add(id)
        } else {
            setNodeSelection(ids.distinct())
            setEdgeSelection(emptyList())
        }
        emitSelectionChange()
    }
    fun nodesInSelection(start: PyreonXYPosition, end: PyreonXYPosition): List<String> {
        val minX = minOf(start.x, end.x); val minY = minOf(start.y, end.y)
        val maxX = maxOf(start.x, end.x); val maxY = maxOf(start.y, end.y)
        return nodes.mapNotNull { node ->
            if (node.hidden == true) return@mapNotNull null
            val p = if (node.parentId == null) node.position else getAbsolutePosition(node.id)
            val width = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH; val height = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
            val hit = if (selectionMode == "full") p.x >= minX && p.x + width <= maxX && p.y >= minY && p.y + height <= maxY
            else p.x + width > minX && p.x < maxX && p.y + height > minY && p.y < maxY
            if (hit) node.id else null
        }
    }
    fun deselectNode(id: String) {
        if (selectedNodeIdSet.remove(id) != null) selectedNodeIdList.remove(id)
        emitSelectionChange()
    }
    @JvmOverloads
    fun selectEdge(id: String, additive: Boolean = false) {
        if (additive && multiSelect) {
            if (selectedEdgeIdSet.put(id, Unit) == null) selectedEdgeIdList.add(id)
        } else {
            setEdgeSelection(listOf(id))
            setNodeSelection(emptyList())
        }
        emitSelectionChange()
    }
    fun clearSelection() {
        setNodeSelection(emptyList())
        setEdgeSelection(emptyList())
        emitSelectionChange()
    }
    /** Selects every node. Edge selection is LEFT ALONE — the web `selectAll`
     *  (`flow.ts`) only replaces the node set; v1 of both native ports also
     *  cleared the edge set, a divergence the tests locked in by omission. */
    fun selectAll() {
        setNodeSelection(order.toList())
        emitSelectionChange()
    }
    /** Removes every currently-selected node (and its connected edges) and
     *  every currently-selected edge — the SAME net effect AND the same
     *  single-pass shape as the web `deleteSelected` (`flow.ts`): selection
     *  sets are built ONCE and each collection scanned ONCE, O(N + E). */
    fun deleteSelected() {
        val nodeIdsToRemove = selectedNodeIdList.filterTo(mutableSetOf()) { id -> nodeMap[id]?.let { it.deletable ?: nodesDeletable } == true }
        val edgeIdsToRemove = selectedEdgeIdList.filterTo(mutableSetOf()) { id -> _edges.firstOrNull { it.id == id }?.let { it.deletable ?: edgesDeletable } == true }
        if (nodeIdsToRemove.isEmpty() && edgeIdsToRemove.isEmpty()) return
        val removedNodes = nodes.filter { nodeIdsToRemove.contains(it.id) }
        val removedEdges = _edges.filter { edgeIdsToRemove.contains(it.id) || nodeIdsToRemove.contains(it.source) || nodeIdsToRemove.contains(it.target) }
        checkpoint()
        if (nodeIdsToRemove.isNotEmpty()) {
            removeNodes(nodeIdsToRemove)
            if (edgeIdsToRemove.isNotEmpty()) removeEdges { edgeIdsToRemove.contains(it.id) }
        } else if (edgeIdsToRemove.isNotEmpty()) {
            removeEdges { edgeIdsToRemove.contains(it.id) }
        }
        setNodeSelection(emptyList())
        setEdgeSelection(emptyList())
        emitSelectionChange()
        emitDeleted(removedNodes, removedEdges)
    }

    // ── copy / paste ────────────────────────────────────────────────────────
    fun copySelected() {
        if (selectedNodeIdSet.isEmpty()) return
        val copiedNodes = nodes.filter { selectedNodeIdSet.containsKey(it.id) }
        val copiedIds = copiedNodes.mapTo(HashSet()) { it.id }
        clipboard = PyreonFlowHistorySnapshot(copiedNodes, _edges.filter { copiedIds.contains(it.source) && copiedIds.contains(it.target) })
    }
    @JvmOverloads
    fun paste(offset: PyreonXYPosition = PyreonXYPosition(50.0, 50.0)) {
        val copied = clipboard ?: return
        checkpoint()
        val idMap = HashMap<String, String>()
        val pastedIds = ArrayList<String>()
        for (node in copied.nodes) {
            val newId = "${node.id}-copy-${++pasteCounter}"
            idMap[node.id] = newId
            insertNode(node.copy(id = newId, position = PyreonXYPosition(node.position.x + offset.x, node.position.y + offset.y)))
            pastedIds.add(newId)
        }
        for (edge in copied.edges) {
            val source = idMap[edge.source] ?: edge.source
            val target = idMap[edge.target] ?: edge.target
            val sourceHandle = edge.sourceHandle?.let { "-$it" } ?: ""
            val targetHandle = edge.targetHandle?.let { "-$it" } ?: ""
            insertEdge(edge.copy(id = "e-$source$sourceHandle-$target$targetHandle", source = source, target = target))
        }
        setNodeSelection(pastedIds)
        setEdgeSelection(emptyList())
        emitSelectionChange()
    }

    // ── viewport ─────────────────────────────────────────────────────────────
    fun zoomTo(z: Double, duration: Double = 0.0) {
        val target = z.coerceIn(minZoom, maxZoom)
        setViewport(zoom = target, duration = duration)
    }
    fun zoomIn(duration: Double = 0.0) = zoomTo(_viewport.zoom * 1.2, duration)
    fun zoomOut(duration: Double = 0.0) = zoomTo(_viewport.zoom / 1.2, duration)
    /** Pans so [position] (in flow coordinates) lands at the viewport origin —
     *  an ABSOLUTE pan-to-point, not a relative nudge. Matches the web `panTo`. */
    fun panTo(position: PyreonXYPosition) {
        setViewport(x = -position.x * _viewport.zoom, y = -position.y * _viewport.zoom)
    }
    @JvmOverloads
    fun setViewport(x: Double? = null, y: Double? = null, zoom: Double? = null, duration: Double = 0.0) {
        if (duration > 0.0 && !shouldReduceMotion()) { animateViewport(x, y, zoom, duration); return }
        viewportAnimationGeneration++
        _viewport = PyreonFlowViewport(
            x = x ?: _viewport.x,
            y = y ?: _viewport.y,
            zoom = zoom ?: _viewport.zoom,
        )
        emitViewportChange()
    }
    @JvmOverloads
    fun setCenter(x: Double, y: Double, zoom: Double? = null, duration: Double = 0.0) {
        val z = (zoom ?: _viewport.zoom).coerceIn(minZoom, maxZoom)
        setViewport(x = -x * z + containerSize.width / 2, y = -y * z + containerSize.height / 2, zoom = z, duration = duration)
    }
    @JvmOverloads
    fun animateViewport(x: Double? = null, y: Double? = null, zoom: Double? = null, duration: Double = 300.0) {
        val generation = ++viewportAnimationGeneration
        val start = _viewport
        val end = PyreonFlowViewport(x ?: start.x, y ?: start.y, zoom ?: start.zoom)
        if (duration <= 0.0 || shouldReduceMotion()) { _viewport = end; emitViewportChange(); return }
        scheduleViewportFrame(generation, start, end, System.nanoTime(), duration * 1_000_000.0)
    }
    private fun scheduleViewportFrame(generation: Int, start: PyreonFlowViewport, end: PyreonFlowViewport, startNanos: Long, durationNanos: Double) {
        viewportAnimationTimer.schedule(object : TimerTask() {
            override fun run() {
                if (viewportAnimationGeneration != generation) return
                val t = ((System.nanoTime() - startNanos) / durationNanos).coerceIn(0.0, 1.0)
                val eased = 1.0 - Math.pow(1.0 - t, 3.0)
                Snapshot.withMutableSnapshot {
                    _viewport = PyreonFlowViewport(
                        start.x + (end.x - start.x) * eased,
                        start.y + (end.y - start.y) * eased,
                        start.zoom + (end.zoom - start.zoom) * eased,
                    )
                }
                emitViewportChange()
                if (t < 1.0) scheduleViewportFrame(generation, start, end, startNanos, durationNanos)
            }
        }, 16L)
    }
    fun screenToFlowPosition(position: PyreonXYPosition): PyreonXYPosition = PyreonXYPosition(
        x = (position.x - _viewport.x) / _viewport.zoom,
        y = (position.y - _viewport.y) / _viewport.zoom,
    )
    fun flowToScreenPosition(position: PyreonXYPosition): PyreonXYPosition = PyreonXYPosition(
        x = position.x * _viewport.zoom + _viewport.x,
        y = position.y * _viewport.zoom + _viewport.y,
    )
    fun isNodeVisible(id: String): Boolean {
        val node = nodeMap[id] ?: return false
        val absolute = getAbsolutePosition(id)
        val x = absolute.x * _viewport.zoom + _viewport.x
        val y = absolute.y * _viewport.zoom + _viewport.y
        val width = (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) * _viewport.zoom
        val height = (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) * _viewport.zoom
        return x + width > 0 && x < containerSize.width && y + height > 0 && y < containerSize.height
    }
    /** Frames every node (or just [nodeIds], when given) inside the current
     *  `containerSize`, with [padding] as a fraction of the graph's extent on
     *  each axis (default `0.1`, matching the web `fitViewPadding` default). */
    @JvmOverloads
    fun fitView(nodeIds: List<String>? = null, padding: Double? = null, duration: Double = 0.0) {
        val cw = containerSize.width
        val ch = containerSize.height
        if (cw <= 0 || ch <= 0) return
        val padding = maxOf(0.0, padding ?: fitViewPadding)
        // A bounding box needs no order: walk the map's values directly (no
        // per-node key lookup) unless a subset was named.
        val target: Collection<PyreonFlowNode<T>> =
            if (nodeIds != null) nodeIds.mapNotNull { nodeMap[it] } else nodeMap.values
        if (target.isEmpty()) return

        var minX = Double.POSITIVE_INFINITY
        var minY = Double.POSITIVE_INFINITY
        var maxX = Double.NEGATIVE_INFINITY
        var maxY = Double.NEGATIVE_INFINITY
        for (node in target) {
            val w = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
            val h = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
            val position = if (node.parentId == null) node.position else getAbsolutePosition(node.id)
            minX = minOf(minX, position.x)
            minY = minOf(minY, position.y)
            maxX = maxOf(maxX, position.x + w)
            maxY = maxOf(maxY, position.y + h)
        }

        val graphWidth = maxX - minX
        val graphHeight = maxY - minY
        if (graphWidth <= 0 && graphHeight <= 0) return

        val zoomX = if (graphWidth > 0) cw / (graphWidth * (1 + padding * 2)) else Double.POSITIVE_INFINITY
        val zoomY = if (graphHeight > 0) ch / (graphHeight * (1 + padding * 2)) else Double.POSITIVE_INFINITY
        val newZoom = minOf(zoomX, zoomY).coerceIn(minZoom, maxZoom)

        val centerX = (minX + maxX) / 2
        val centerY = (minY + maxY) / 2

        setViewport(x = cw / 2 - centerX * newZoom, y = ch / 2 - centerY * newZoom, zoom = newZoom, duration = duration)
    }

    // ── graph queries ────────────────────────────────────────────────────────
    fun getConnectedEdges(nodeId: String): List<PyreonFlowEdge> =
        _edges.filter { it.source == nodeId || it.target == nodeId }
    /** Nodes with an edge INTO [nodeId], in node insertion order (web parity). */
    fun getIncomers(nodeId: String): List<PyreonFlowNode<T>> {
        val sourceIds = _edges.filter { it.target == nodeId }.map { it.source }.toSet()
        return order.filter { sourceIds.contains(it) }.map { nodeMap.getValue(it) }
    }
    fun getOutgoers(nodeId: String): List<PyreonFlowNode<T>> {
        val targetIds = _edges.filter { it.source == nodeId }.map { it.target }.toSet()
        return order.filter { targetIds.contains(it) }.map { nodeMap.getValue(it) }
    }
    fun findNodes(predicate: (PyreonFlowNode<T>) -> Boolean): List<PyreonFlowNode<T>> = nodes.filter(predicate)
    fun searchNodes(query: String): List<PyreonFlowNode<T>> {
        val needle = query.lowercase()
        return nodes.filter { node -> (searchText?.invoke(node.data) ?: node.id).lowercase().contains(needle) }
    }
    fun getChildNodes(parentId: String): List<PyreonFlowNode<T>> =
        order.mapNotNull { nodeMap[it] }.filter { it.parentId == parentId }
    fun getAbsolutePosition(nodeId: String): PyreonXYPosition {
        fun walk(id: String, seen: MutableSet<String>): PyreonXYPosition {
            val node = nodeMap[id] ?: return PyreonXYPosition(0.0, 0.0)
            val parentId = node.parentId
            if (parentId == null || parentId == id) return node.position
            if (!seen.add(id)) return node.position
            val parent = walk(parentId, seen)
            return PyreonXYPosition(parent.x + node.position.x, parent.y + node.position.y)
        }
        return walk(nodeId, mutableSetOf())
    }
    @JvmOverloads
    fun getProximityConnection(nodeId: String, threshold: Double = 50.0): PyreonFlowConnection? {
        val node = nodeMap[nodeId] ?: return null
        val centerX = node.position.x + (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) / 2
        val centerY = node.position.y + (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) / 2
        var closestId: String? = null
        var closestDistance = Double.POSITIVE_INFINITY
        for (other in nodes) {
            if (other.id == nodeId || _edges.any { (it.source == nodeId && it.target == other.id) || (it.source == other.id && it.target == nodeId) }) continue
            val dx = centerX - other.position.x - (other.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) / 2
            val dy = centerY - other.position.y - (other.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) / 2
            val distance = kotlin.math.hypot(dx, dy)
            if (distance < threshold && distance < closestDistance) { closestId = other.id; closestDistance = distance }
        }
        val target = closestId ?: return null
        return PyreonFlowConnection(nodeId, target).takeIf(::isValidConnection)
    }
    fun getOverlappingNodes(nodeId: String): List<PyreonFlowNode<T>> {
        val node = nodeMap[nodeId] ?: return emptyList()
        val right = node.position.x + (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH)
        val bottom = node.position.y + (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT)
        return nodes.filter { other ->
            other.id != nodeId && node.position.x < other.position.x + (other.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) && right > other.position.x && node.position.y < other.position.y + (other.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) && bottom > other.position.y
        }
    }
    @JvmOverloads
    fun resolveCollisions(nodeId: String, spacing: Double = 10.0) {
        val node = nodeMap[nodeId] ?: return
        val width = node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
        val height = node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
        for (other in getOverlappingNodes(nodeId)) {
            val otherWidth = other.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH
            val otherHeight = other.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT
            val overlapX = minOf(node.position.x + width - other.position.x, other.position.x + otherWidth - node.position.x)
            val overlapY = minOf(node.position.y + height - other.position.y, other.position.y + otherHeight - node.position.y)
            if (overlapX < overlapY) {
                val dx = if (node.position.x < other.position.x) -(overlapX + spacing) / 2 else (overlapX + spacing) / 2
                updateNodePosition(other.id, PyreonXYPosition(other.position.x - dx, other.position.y))
            } else {
                val dy = if (node.position.y < other.position.y) -(overlapY + spacing) / 2 else (overlapY + spacing) / 2
                updateNodePosition(other.id, PyreonXYPosition(other.position.x, other.position.y - dy))
            }
        }
    }
    fun moveSelectedNodes(dx: Double, dy: Double) {
        for (id in selectedNodeIdList.toList()) {
            val node = nodeMap[id] ?: continue
            updateNodePosition(id, PyreonXYPosition(node.position.x + dx, node.position.y + dy))
        }
    }

    /** Shared hardware-keyboard contract used by the Compose host. */
    fun handleKeyboardCommand(
        key: String,
        nodeId: String? = null,
        shift: Boolean = false,
        command: Boolean = false,
        repeatKey: Boolean = false,
    ): Boolean {
        if (disableKeyboardA11y) return false
        if (nodeId != null) {
            val node = nodeMap[nodeId]
            if (node != null && (key == "Enter" || key == " ")) {
                if (!(node.selectable ?: nodesSelectable)) return false
                selectNode(nodeId, shift)
                return true
            }
            val delta = when (key) {
                "ArrowLeft" -> -1.0 to 0.0
                "ArrowRight" -> 1.0 to 0.0
                "ArrowUp" -> 0.0 to -1.0
                "ArrowDown" -> 0.0 to 1.0
                else -> null
            }
            if (node != null && delta != null) {
                if (!(node.draggable ?: nodesDraggable)) return false
                if (!repeatKey) pushHistory()
                if (!isNodeSelected(nodeId)) selectNode(nodeId)
                val step = if (shift) 100.0 else 10.0
                moveSelectedNodes(delta.first * step, delta.second * step)
                return true
            }
        }
        if (deleteKeys?.contains(key) == true) {
            pushHistory(); deleteSelected(); return true
        }
        if (key == "Escape") { clearSelection(); return true }
        if (!command) return false
        return when (key.lowercase()) {
            "a" -> { selectAll(); true }
            "c" -> { copySelected(); true }
            "v" -> { paste(); true }
            "z" -> { if (shift) redo() else undo(); true }
            else -> false
        }
    }
    @JvmOverloads
    fun focusNode(nodeId: String, focusZoom: Double? = null) {
        val node = nodeMap[nodeId] ?: return
        val position = if (node.parentId == null) node.position else getAbsolutePosition(nodeId)
        val z = (focusZoom ?: _viewport.zoom).coerceIn(minZoom, maxZoom)
        val centerX = position.x + (node.width ?: PYREON_FLOW_DEFAULT_NODE_WIDTH) / 2
        val centerY = position.y + (node.height ?: PYREON_FLOW_DEFAULT_NODE_HEIGHT) / 2
        _viewport = PyreonFlowViewport(-centerX * z + containerSize.width / 2, -centerY * z + containerSize.height / 2, z)
        emitViewportChange()
        selectNode(nodeId)
    }
}
