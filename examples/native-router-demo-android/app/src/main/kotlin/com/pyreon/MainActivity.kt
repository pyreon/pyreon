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

import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.Modifier
import com.pyreon.generated.RouterApp
import com.pyreon.router.PyreonDeepLink

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // COLD: the activity was launched BY the intent. Forward before
        // setContent so the value is pending when the router is constructed
        // and its initialPath default picks it up.
        PyreonDeepLink.receive(intent?.data)
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
                RouterApp()
            }
        }
    }

    // WARM: the activity is already alive (singleTop) and is handed another
    // link. A router exists, so PyreonDeepLink delivers it straight there.
    // `public` rather than the inherited `protected`: the instrumented deep-link
    // test drives THIS handler, so the assertion covers the host wiring and not
    // just the store->router chain underneath it. Widening an override is
    // allowed and costs nothing — the alternative was a test that calls
    // PyreonDeepLink directly and would still pass with this method deleted.
    public override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        PyreonDeepLink.receive(intent.data)
    }
}
