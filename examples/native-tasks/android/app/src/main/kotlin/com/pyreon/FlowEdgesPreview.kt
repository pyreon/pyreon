package com.pyreon

import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pyreon.runtime.PyreonFlowEdgeCanvas
import com.pyreon.runtime.PyreonFlowEdgeSegment
import com.pyreon.runtime.PyreonFlowEdgeStroke
import com.pyreon.runtime.PyreonFlowViewport
import com.pyreon.runtime.PyreonFlowEdge
import com.pyreon.runtime.PyreonFlowNode
import com.pyreon.runtime.PyreonFlowState
import com.pyreon.runtime.PyreonFlowView
import com.pyreon.runtime.PyreonXYPosition

// Compiles PyreonFlowEdgeCanvas into the real app module — the first time any
// Gradle build has compiled the Kotlin canvas composable (it was declared
// kotlinSdkOnly and referenced by no device app). Not routed to; the build is
// the point. See FlowEdgesPreview.swift for the iOS twin.
@Composable
fun FlowEdgesPreview() {
    val strokes = listOf(
        PyreonFlowEdgeStroke(
            id = "e1",
            segments = listOf(
                PyreonFlowEdgeSegment.move(150.0, 20.0),
                PyreonFlowEdgeSegment.cubic(200.0, 20.0, c1x = 175.0, c1y = 20.0, c2x = 175.0, c2y = 20.0),
            ),
            color = "#0a8f7c",
            width = 2.0,
        ),
    )
    PyreonFlowEdgeCanvas(edges = strokes, viewport = PyreonFlowViewport(), modifier = Modifier.height(80.dp))
}

// Compiles the complete interactive host as part of the real Android app,
// including state-driven edge derivation and node content.
@Composable
fun FlowHostPreview() {
    val state = remember { PyreonFlowState(
        nodes = listOf(
            PyreonFlowNode("start", position = PyreonXYPosition(0.0, 0.0), data = "Start"),
            PyreonFlowNode("end", position = PyreonXYPosition(200.0, 80.0), data = "End"),
        ),
        edges = listOf(PyreonFlowEdge("edge", source = "start", target = "end")),
    ) }
    PyreonFlowView(
        state = state,
        modifier = Modifier.width(400.dp).height(240.dp),
    ) { node ->
        Text(node.data)
    }
}
