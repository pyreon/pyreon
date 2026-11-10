// Root activity for the Pyreon Counter Android reference.
//
// `setContent { Counter() }` mounts the compiler-emitted Composable
// from `generated/Counter.kt` — emitted by PMTC from the SHARED
// `../native-counter-ios/src/Counter.tsx` source.
//
// Mirror of `examples/native-todomvc-android/app/src/main/kotlin/
// com/pyreon/MainActivity.kt` — same 5-line wrapper shape, different
// compiler-emitted Composable.

package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.Modifier
import com.pyreon.generated.Counter

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
                Counter()
            }
        }
    }
}
