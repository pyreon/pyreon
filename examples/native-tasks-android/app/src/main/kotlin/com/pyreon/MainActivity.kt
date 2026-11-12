// Root activity for the Pyreon Tasks Android host.
//
// `setContent { TasksApp() }` mounts the compiler-emitted Composable
// from `generated/TasksApp.kt` — emitted by PMTC from the SHARED
// `../native-tasks/src/TasksApp.tsx` source (introduced by #1449).

package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.Modifier
import com.pyreon.generated.TasksApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge on EVERY API level, then pad the content into the
        // safe-drawing area. From Android 15 (API 35) a targetSdk-35+ app is
        // forced edge-to-edge; without the padding the first control of a screen
        // sits under the status bar, where the system takes the tap (#4292).
        // Opting in on older levels too makes the CI emulator (API 33) lay the
        // app out the way API 35+ devices do, so the device tests see it.
        enableEdgeToEdge()
        setContent {
            Box(Modifier.safeDrawingPadding()) {
                TasksApp()
            }
        }
    }
}
