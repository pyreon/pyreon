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

import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.Modifier
import com.pyreon.generated.Counter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // System bars, as the create-multiplatform scaffold's MainActivity does it:
        //  - enableEdgeToEdge(light bars): dark system-bar icons. The bars sit over
        //    the window background, which the light window theme keeps light in
        //    dark mode too; without this the icons are white on that light strip;
        //  - safeDrawingPadding(): this app targets SDK 35+, so Android 15+ draws it
        //    edge-to-edge and the top of the screen would sit UNDER the status bar.
        val bars = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        setContent {
            Box(Modifier.safeDrawingPadding()) {
                Counter()
            }
        }
    }
}
