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
import androidx.compose.foundation.layout.displayCutoutPadding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.ui.Modifier
import com.pyreon.generated.FinanceApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // System bars, as the create-multiplatform scaffold's MainActivity does it,
        // minus the soft-keyboard inset:
        //  - enableEdgeToEdge(light bars): dark system-bar icons. The bars sit over
        //    the window background, which the light window theme keeps light in
        //    dark mode too; without this the icons are white on that light strip;
        //  - systemBarsPadding().displayCutoutPadding(): this app targets SDK 35+, so
        //    Android 15+ draws it edge-to-edge and the top of the screen would sit
        //    UNDER the status bar. Not safeDrawingPadding(): that also pads for the
        //    keyboard (ime), so every keyboard show/hide re-lays the page out. A fixed
        //    page taller than what is left (the tasks page) is re-centred and slides
        //    while the keyboard animates, and a tap in that window lands on the wrong
        //    spot (the instrumented tests tap right after typing the login name).
        val bars = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
        setContent {
            Box(Modifier.systemBarsPadding().displayCutoutPadding()) {
                FinanceApp()
            }
        }
    }
}
