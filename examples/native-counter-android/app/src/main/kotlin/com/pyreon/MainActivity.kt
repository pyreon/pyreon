// Root activity for the Pyreon Counter Android reference.
//
// `setContent { Counter() }` mounts the compiler-emitted Composable
// from `generated/Counter.kt` — emitted by PMTC from the SHARED
// `../native-counter-ios/src/Counter.tsx` source.
//
// Mirror of `examples/native-todomvc-android/app/src/main/kotlin/
// com/pyreon/MainActivity.kt` — same 5-line wrapper shape, different
// compiler-emitted Composable.

package com.pyreon

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.pyreon.generated.Counter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            Counter()
        }
    }
}
