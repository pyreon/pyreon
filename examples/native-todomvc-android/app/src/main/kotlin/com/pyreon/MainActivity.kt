// Root activity for the Pyreon Android TodoMVC reference.
//
// `setContent { TodoApp() }` mounts the compiler-emitted Composable
// from `generated/TodoApp.kt`. The emit also produces:
//   - `enum class Filter { all, active, completed }`
//   - `@Serializable data class Todo(var id: Int, var text: String, var done: Boolean)`
//   - `private var nextId: Int = 1`
//   - `@Composable fun TodoRow(...)`
// all in the same generated file under `com.pyreon.generated`.
//
// Mirrors `examples/native-todomvc-ios/ios/ContentView.swift`:
//   - iOS:     SwiftUI ContentView body returns TodoApp()
//   - Android: setContent block calls TodoApp()
//
// Both hosts are intentionally ~5-line wrappers — the entire app
// surface lives in the compiler-emitted file, proving the PMTC arc.

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
import com.pyreon.generated.TodoApp

// ComponentActivity (NOT android.app.Activity): `setContent {}` from
// androidx.activity.compose is an extension on ComponentActivity, so a
// plain-Activity host fails compile with "Unresolved reference. None of
// the following candidates is applicable because of a receiver type
// mismatch" — the error that kept the native-device nightly red.
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
                TodoApp()
            }
        }
    }
}
