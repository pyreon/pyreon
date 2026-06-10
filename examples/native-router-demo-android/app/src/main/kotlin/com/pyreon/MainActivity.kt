// Root activity for the Pyreon Router Demo Android reference.
//
// `setContent { RouterApp() }` mounts the compiler-emitted Composable
// from `generated/RouterApp.kt` — emitted by PMTC from the SHARED
// `../native-router-demo-ios/src/RouterApp.tsx` source.
//
// Mirror of `native-counter-android/app/src/main/kotlin/com/pyreon/
// MainActivity.kt` — same 5-line wrapper shape, different
// compiler-emitted entry composable.

package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pyreon.generated.RouterApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            RouterApp()
        }
    }
}
