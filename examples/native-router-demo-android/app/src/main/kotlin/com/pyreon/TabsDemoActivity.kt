// Host for the tab-bar router demo (#4060): `setContent { TabsApp() }` mounts
// the compiler-emitted Composable from the SHARED RouterApp.tsx source — a
// `createRouter({ tabs })` app whose every tab keeps its own back stack.
// A separate activity (not a mode of MainActivity) so the per-tab-stack device
// test launches straight into it and RouterApp's screens stay untouched.

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
import com.pyreon.generated.TabsApp

class TabsDemoActivity : ComponentActivity() {
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
                TabsApp()
            }
        }
    }
}
