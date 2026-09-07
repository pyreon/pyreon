package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pyreon.generated.TasksApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TasksApp()
        }
    }
}

import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pyreon.runtime.PyreonFlowEdgeCanvas
import com.pyreon.runtime.PyreonFlowEdgeSegment
import com.pyreon.runtime.PyreonFlowEdgeStroke
import com.pyreon.runtime.PyreonFlowViewport

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
