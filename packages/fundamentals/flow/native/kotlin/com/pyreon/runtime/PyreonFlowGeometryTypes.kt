package com.pyreon.runtime

enum class PyreonFlowPosition { Top, Right, Bottom, Left }

data class PyreonFlowPathPoint(val x: Double, val y: Double)

data class PyreonFlowHandleConfig(
    val id: String? = null,
    val type: String,
    val position: PyreonFlowPosition,
    val offset: Double = 50.0,
)

data class PyreonFlowMeasuredHandle(
    val id: String,
    val type: String,
    val position: PyreonFlowPosition,
    val x: Double,
    val y: Double,
)

data class PyreonFlowNodeMeasurement(
    val width: Double,
    val height: Double,
    val handles: List<PyreonFlowMeasuredHandle> = emptyList(),
)

data class PyreonFlowInteractiveHandle(
    val nodeId: String,
    val handleId: String? = null,
    val type: String,
    val position: PyreonFlowPosition,
    val x: Double,
    val y: Double,
)

data class PyreonFlowSmartPositions(val source: PyreonFlowPosition, val target: PyreonFlowPosition) {
    val sourcePosition: PyreonFlowPosition get() = source
    val targetPosition: PyreonFlowPosition get() = target
}
data class PyreonFlowNodeBoxDimensions(val sourceW: Double, val sourceH: Double, val targetW: Double, val targetH: Double)

/** An axis-aligned rect in flow coordinates: the web `Rect` (`x`, `y`, `width`, `height`). */
data class PyreonFlowRect(val x: Double, val y: Double, val width: Double, val height: Double)
