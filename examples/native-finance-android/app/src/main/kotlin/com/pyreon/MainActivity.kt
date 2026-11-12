// Root activity for the Pyreon Finance Android reference.
//
// `setContent { FinanceApp() }` mounts the compiler-emitted Composable from
// `generated/FinanceApp.kt`, produced by PMTC from the SHARED
// `../native-finance/src/FinanceApp.tsx` — the same file the iOS host compiles.
//
// Unlike the counter (a single screen), FinanceApp is multi-screen: the emit
// carries its own router, so the host still mounts exactly one composable.

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
import com.pyreon.generated.FinanceApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge on EVERY API level, then pad the content into the
        // safe-drawing area. From Android 15 (API 35) a targetSdk-35+ app is
        // forced edge-to-edge; without the padding the first control of a screen
        // sits under the status bar, where the system takes the tap (#4292).
        // Opting in on older levels too makes the CI emulator (API 33) lay the
        // app out the way API 35+ devices do, so the device tests see it.
        // Light bars (dark icons): the bars sit over the window background, which
        // the light window theme keeps light in dark mode too, so the default
        // white icons would be unreadable there.
        val bars = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        setContent {
            Box(Modifier.safeDrawingPadding()) {
                FinanceApp()
            }
        }
    }
}
