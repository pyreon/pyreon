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
                TodoApp()
            }
        }
    }
}
