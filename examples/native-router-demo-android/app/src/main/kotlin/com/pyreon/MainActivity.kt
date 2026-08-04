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
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pyreon.generated.RouterApp
import com.pyreon.router.PyreonDeepLink
import com.pyreon.runtime.PyreonHttp
import com.pyreon.runtime.PyreonHttpOkHttp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // COLD: the activity was launched BY the intent. Forward before
        // setContent so the value is pending when the router is constructed
        // and its initialPath default picks it up.
        PyreonDeepLink.receive(intent?.data)
        // Install the HTTP edge before any composable can run a `useFetch`
        // with a verb. `PyreonHttp` is deliberately dependency-free so every
        // consumer can compile it without OkHttp on the classpath; the real
        // executor lives in its own file and is wired here. Without this,
        // `PyreonHttp.send` throws `NoExecutor` — LOUDLY, by design, rather
        // than silently doing nothing.
        PyreonHttp.install(PyreonHttpOkHttp)
        setContent {
            RouterApp()
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
