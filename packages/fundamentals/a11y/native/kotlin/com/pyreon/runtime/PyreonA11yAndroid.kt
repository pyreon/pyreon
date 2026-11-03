// PyreonA11yHost — the on-screen host `announce(...)` needs on Android.
//
// The compiler wraps every component that calls `announce(...)` in this
// composable. While composed, it registers an announcer with `PyreonA11y`
// that writes each message into one of two invisible live regions: one
// polite, one assertive. TalkBack speaks a live region when its content
// changes, interrupting for an assertive one — the same model as the web's
// `aria-live`, and the replacement Android recommends for the deprecated
// `View.announceForAccessibility`.
//
// The regions are 1dp, not 0: a zero-size node can be left out of the
// accessibility tree, and then nothing is spoken.

package com.pyreon.runtime

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

// A live region is spoken when its text CHANGES, so announcing the same
// message twice in a row would be silent. Alternating a trailing zero-width
// space makes every announcement a change; screen readers do not voice it.
private const val ZWSP = "​"

@Composable
public fun PyreonA11yHost(content: @Composable () -> Unit) {
    var polite by remember { mutableStateOf("") }
    var assertive by remember { mutableStateOf("") }
    DisposableEffect(Unit) {
        val announcer: (String, Boolean) -> Unit = { message, isAssertive ->
            if (isAssertive) {
                assertive = if (assertive == message) message + ZWSP else message
            } else {
                polite = if (polite == message) message + ZWSP else message
            }
        }
        PyreonA11y.addAnnouncer(announcer)
        onDispose { PyreonA11y.removeAnnouncer(announcer) }
    }
    Box {
        content()
        Box(
            Modifier.size(1.dp).semantics {
                liveRegion = LiveRegionMode.Polite
                contentDescription = polite
            },
        )
        Box(
            Modifier.size(1.dp).semantics {
                liveRegion = LiveRegionMode.Assertive
                contentDescription = assertive
            },
        )
    }
}
