// PyreonToaster — the overlay `<Toaster />` lowers to on Android.
//
// The web `<Toaster>` is a `position: fixed` portal: it takes no layout space,
// sits at a screen corner, and stays put across navigation. The emit used to
// lower it to an inline `Column` of `Text`s, which is none of those — it pushed
// the layout and sat wherever the source happened to place the tag.
//
// A Compose `Popup` is a separate window, so it takes no space in the tree it
// is called from. Its position provider below ignores the anchor and places the
// stack against the WINDOW, which makes the toaster screen-anchored no matter
// where `<Toaster />` sits. The popup is composed only while toasts exist, so
// an idle toaster puts no window over the app. Unlike the iOS overlay (which
// passes every touch through), a popup window receives touches inside its own
// bounds — Android does not forward them to the window beneath — so a visible
// card covers what is under it, as the web's cards do.
//
// Mirrors the web stylesheet: a white card, 8dp corners, a 4dp accent strip in
// the toast type's color, 14sp medium text; `max` most-recent toasts, `gap`
// between them, `offset` from the screen edge. Error and warning toasts are
// announced assertively, info and success politely — the web's alert/status
// split. Enter is animated; a dismissed toast is removed without a leave
// animation.
//
// Imports the real Compose UI, so it sits outside the stub harness
// (`kotlinSdkOnly` in package.json); the Android device gate compiles it.

package com.pyreon.runtime

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties

/** `"bottom-left"` → (bottom = true, horizontal = "left"); an unknown value is the web default, top-right. */
internal fun parseToastPosition(position: String): Pair<Boolean, String> {
    val parts = position.split("-")
    val bottom = parts.getOrNull(0) == "bottom"
    val horizontal = when (parts.getOrNull(1)) {
        "left" -> "left"
        "center" -> "center"
        else -> "right"
    }
    return bottom to horizontal
}

/** The web stylesheet's accent (left border) color per toast type. */
internal fun toastAccent(type: String): Color = when (type) {
    "success" -> Color(0xFF22C55E)
    "warning" -> Color(0xFFF59E0B)
    "error" -> Color(0xFFEF4444)
    else -> Color(0xFF3B82F6)
}

/**
 * Places the popup against the window, not its anchor, so the stack sits at a
 * screen corner wherever `<Toaster />` was composed. `offsetPx` is the gap from
 * the screen edges.
 */
internal class PyreonToastPositionProvider(
    private val bottom: Boolean,
    private val horizontal: String,
    private val offsetPx: Int,
) : PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: IntRect,
        windowSize: IntSize,
        layoutDirection: LayoutDirection,
        popupContentSize: IntSize,
    ): IntOffset {
        val x = when (horizontal) {
            "left" -> offsetPx
            "center" -> (windowSize.width - popupContentSize.width) / 2
            else -> windowSize.width - popupContentSize.width - offsetPx
        }
        val y = if (bottom) windowSize.height - popupContentSize.height - offsetPx else offsetPx
        return IntOffset(x.coerceAtLeast(0), y.coerceAtLeast(0))
    }
}

/**
 * The `<Toaster />` overlay. Defaults are the web `ToasterProps` defaults;
 * `duration` (ms) sets the queue's default auto-dismiss, null keeps it.
 */
@Composable
public fun PyreonToaster(
    position: String = "top-right",
    max: Long = 5L,
    gap: Double = 8.0,
    offset: Double = 16.0,
    duration: Long? = null,
) {
    // The web prop: the default auto-dismiss (ms) for toasts that set none.
    // Applied before the empty-queue return, so it is in place for the first toast.
    LaunchedEffect(duration) {
        if (duration != null) PyreonToast.defaultDurationMillis = duration
    }
    // Reading the MutableState subscribes this composable: it recomposes as
    // toasts are added and expire.
    val visible = PyreonToast.toasts.value.takeLast(max.coerceAtLeast(0L).toInt())
    if (visible.isEmpty()) return
    val (bottom, horizontal) = parseToastPosition(position)
    val offsetPx = with(LocalDensity.current) { offset.dp.roundToPx() }
    val provider = remember(bottom, horizontal, offsetPx) {
        PyreonToastPositionProvider(bottom, horizontal, offsetPx)
    }
    Popup(popupPositionProvider = provider, properties = PopupProperties(focusable = false)) {
        Column(
            verticalArrangement = Arrangement.spacedBy(gap.dp),
            horizontalAlignment = when (horizontal) {
                "left" -> Alignment.Start
                "center" -> Alignment.CenterHorizontally
                else -> Alignment.End
            },
        ) {
            visible.forEach { item -> key(item.id) { PyreonToastCard(item) } }
        }
    }
}

@Composable
private fun PyreonToastCard(item: PyreonToastItem) {
    // Enter: fade in and settle 8dp, the web's `--entering` → visible transition.
    val progress = remember { Animatable(0f) }
    LaunchedEffect(Unit) { progress.animateTo(1f, tween(durationMillis = 200)) }
    val shift = with(LocalDensity.current) { 8.dp.toPx() }
    val shape = RoundedCornerShape(8.dp)
    Row(
        modifier = Modifier
            .graphicsLayer {
                alpha = progress.value
                translationY = (1f - progress.value) * -shift
            }
            .widthIn(max = 360.dp)
            .shadow(6.dp, shape)
            .clip(shape)
            .background(Color.White)
            .height(IntrinsicSize.Min)
            .testTag("pyreon-toast")
            .semantics {
                liveRegion = if (item.type == "error" || item.type == "warning") {
                    LiveRegionMode.Assertive
                } else {
                    LiveRegionMode.Polite
                }
            },
    ) {
        Box(modifier = Modifier.width(4.dp).fillMaxHeight().background(toastAccent(item.type)))
        BasicText(
            text = item.message,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            style = TextStyle(color = Color(0xFF1A1A1A), fontSize = 14.sp, fontWeight = FontWeight.Medium),
        )
    }
}
