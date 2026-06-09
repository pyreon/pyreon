// Root activity for the Pyreon Tasks Android host.
//
// `setContent { TasksApp() }` mounts the compiler-emitted Composable
// from `generated/TasksApp.kt` — emitted by PMTC from the SHARED
// `../native-tasks/src/TasksApp.tsx` source (introduced by #1449).

package com.pyreon

import android.app.Activity
import android.os.Bundle
import androidx.activity.compose.setContent
import com.pyreon.generated.TasksApp

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TasksApp()
        }
    }
}
