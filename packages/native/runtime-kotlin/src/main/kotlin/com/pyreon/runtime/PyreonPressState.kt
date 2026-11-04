package com.pyreon.runtime

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember

// A pressable's PRESSED style — rocketstyle's `active:` block on a Button or
// Press base.
//
// The compiler emits
//   PyreonPressState { __pyPressed, __pySrc ->
//     Box(modifier = Modifier.background(if (__pyPressed) A else B)
//       .clickable(interactionSource = __pySrc, indication = null, onClick = …)) { … }
//   }
// The source is HOISTED here and handed to the clickable / Button, so the
// collected `isPressed` is that element's own press — it ends on release and
// on a scroll that cancels the touch, which is the platform's press state.

@Composable
fun PyreonPressState(content: @Composable (pressed: Boolean, source: MutableInteractionSource) -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    content(pressed, source)
}
