package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Surface
import androidx.compose.material.darkColors
import androidx.compose.material.lightColors
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import com.pyreon.generated.TodayApp

// The host's only job: fill the window with the app's page colour, keep the
// content inside the safe area, and give the Material controls (switch, text
// field) the app's accent, the way any Compose app sets its theme. Both follow
// the system light/dark setting, as TodayApp itself does.
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Edge-to-edge on every API level, then pad the content into the
        // safe-drawing area. From Android 15 (API 35) a targetSdk-35+ app is
        // forced edge-to-edge; without the padding the first control sits under
        // the status bar, where the system takes the tap (#4292).
        enableEdgeToEdge()
        setContent {
            val dark = isSystemInDarkTheme()
            val page = if (dark) Color(0xFF0A0A0E) else Color(0xFFF4EFE6)
            val accent = if (dark) Color(0xFFFF5E1A) else Color(0xFFA8380A)
            val colors = if (dark) {
                darkColors(primary = accent, primaryVariant = accent, secondary = accent, secondaryVariant = accent, background = page, surface = Color(0xFF181822))
            } else {
                lightColors(primary = accent, primaryVariant = accent, secondary = accent, secondaryVariant = accent, background = page, surface = Color(0xFFFFFCF5))
            }
            MaterialTheme(colors = colors) {
                // The Surface also sets the content colour (light text in dark mode)
                // that the Material text field reads for what the user types.
                Surface(Modifier.fillMaxSize(), color = page) {
                    Box(Modifier.safeDrawingPadding()) {
                        TodayApp()
                    }
                }
            }
        }
    }
}
