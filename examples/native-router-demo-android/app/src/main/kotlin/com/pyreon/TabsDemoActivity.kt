// Host for the tab-bar router demo (#4060): `setContent { TabsApp() }` mounts
// the compiler-emitted Composable from the SHARED RouterApp.tsx source — a
// `createRouter({ tabs })` app whose every tab keeps its own back stack.
// A separate activity (not a mode of MainActivity) so the per-tab-stack device
// test launches straight into it and RouterApp's screens stay untouched.

package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pyreon.generated.TabsApp

class TabsDemoActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TabsApp()
        }
    }
}
