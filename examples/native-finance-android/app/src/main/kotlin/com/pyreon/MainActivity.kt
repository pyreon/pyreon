// Root activity for the Pyreon Finance Android reference.
//
// `setContent { FinanceApp() }` mounts the compiler-emitted Composable from
// `generated/FinanceApp.kt`, produced by PMTC from the SHARED
// `../native-finance/src/FinanceApp.tsx` — the same file the iOS host compiles.
//
// Unlike the counter (a single screen), FinanceApp is multi-screen: the emit
// carries its own router, so the host still mounts exactly one composable.

package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pyreon.generated.FinanceApp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FinanceApp()
        }
    }
}
