// GesturesInstrumentedTest — the gesture vocabulary the motion page does not
// reach (GES-1) on Android: vertical swipe, rotate, and the live values a
// continuous gesture reports WHILE the pointers are still down. The iOS twin is
// `GesturesUITests.swift`; the page is `src/GesturesPage.tsx`.
//
// Compose's touch injection keeps pointers down between `performTouchInput`
// calls, so the live values are read mid-gesture: put the pointers down, move
// them, assert the readout, then lift. The page writes `Live dx` / `Live scale`
// / `Live deg` only on 'change' samples, so a value read here is one the
// gesture reported while it ran.

package com.pyreon

import android.net.Uri
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.router.PyreonDeepLink
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class GesturesInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Before
    fun openPage() {
        composeRule.waitUntil(timeoutMillis = 30_000) {
            composeRule.onAllNodesWithTag("home-page").fetchSemanticsNodes().isNotEmpty()
        }
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://gestures"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("gestures-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun text(tag: String): String {
        composeRule.waitForIdle()
        return composeRule.onNodeWithTag(tag).fetchSemanticsNode().config[SemanticsProperties.Text].joinToString("")
    }

    private fun number(tag: String, prefix: String): Int {
        val t = text(tag)
        assertTrue("$tag reads '$t', not '$prefix…'", t.startsWith(prefix))
        return t.removePrefix(prefix).toInt()
    }

    private fun waitForText(text: String) {
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    // `<Press onSwipeUp/onSwipeDown>` beside the horizontal pair: each verdict
    // needs its own axis and sign, and the final click proves neither detector
    // claims a tap.
    @Test
    fun verticalSwipeFiresUpAndDown() {
        composeRule.onNodeWithTag("vswipe-status").assertTextEquals("VSwipe: none")
        composeRule.onNodeWithTag("vswipe-zone").performTouchInput { swipeUp() }
        waitForText("VSwipe: up")
        composeRule.onNodeWithTag("vswipe-zone").performTouchInput { swipeDown() }
        waitForText("VSwipe: down")
        composeRule.onNodeWithTag("vswipe-zone").performTouchInput { swipeLeft() }
        waitForText("VSwipe: left")
        composeRule.onNodeWithTag("vswipe-zone").performClick()
        waitForText("VSwipe: tap")
    }

    // `<Gesture onPan>` live dx, read with the finger still down 150 dp to the
    // right of where it started.
    @Test
    fun panReportsLiveTranslationMidGesture() {
        val zone = composeRule.onNodeWithTag("live-zone")
        zone.performTouchInput {
            val start = centerLeft + Offset(20.dp.toPx(), 0f)
            down(start)
            val step = 150.dp.toPx() / 10
            repeat(10) { moveBy(Offset(step, 0f)) }
        }
        val dx = number("live-dx", "Live dx: ")
        val changes = number("live-changes", "Changes: ")
        assertTrue("only $changes change samples arrived before the lift", changes > 1)
        assertTrue("live dx mid-gesture is $dx, not the 150 dp the pointer moved", abs(dx - 150) <= 2)
        zone.performTouchInput { up() }
    }

    // `<Gesture onPinch>` live scale: two pointers 80 dp apart spread to
    // 240 dp — a cumulative scale of 3 while both are still down.
    @Test
    fun pinchReportsLiveScaleMidGesture() {
        val zone = composeRule.onNodeWithTag("live-zone")
        zone.performTouchInput {
            val half = 40.dp.toPx()
            down(0, center - Offset(half, 0f))
            down(1, center + Offset(half, 0f))
            for (i in 1..10) {
                val d = half + (120.dp.toPx() - half) * i / 10
                updatePointerTo(0, center - Offset(d, 0f))
                updatePointerTo(1, center + Offset(d, 0f))
                move()
            }
        }
        val scale = number("live-scale", "Live scale: ")
        assertTrue("live scale mid-pinch is $scale%, not the injected 300%", abs(scale - 300) <= 10)
        zone.performTouchInput {
            up(0)
            up(1)
        }
    }

    // `<Gesture onRotate>`: a 60° clockwise turn of two pointers reads about
    // +60 live and ends 'cw'; the same turn counter-clockwise reads about -60
    // and ends 'ccw' (positive = clockwise, screen y pointing down).
    @Test
    fun rotateReportsLiveDegreesAndDirection() {
        composeRule.onNodeWithTag("rotate-status").assertTextEquals("Rotate: none")
        for ((sign, verdict) in listOf(1 to "Rotate: cw", -1 to "Rotate: ccw")) {
            val zone = composeRule.onNodeWithTag("live-zone")
            zone.performTouchInput {
                val r = 70.dp.toPx()
                down(0, center - Offset(r, 0f))
                down(1, center + Offset(r, 0f))
                for (i in 1..12) {
                    val a = sign * (PI / 3) * i / 12
                    val o = Offset((r * cos(a)).toFloat(), (r * sin(a)).toFloat())
                    updatePointerTo(0, center - o)
                    updatePointerTo(1, center + o)
                    move()
                }
            }
            val deg = number("live-deg", "Live deg: ")
            assertTrue("live degrees mid-rotation are $deg, not ${sign * 60}", abs(deg - sign * 60) <= 3)
            zone.performTouchInput {
                up(0)
                up(1)
            }
            waitForText(verdict)
            assertEquals(verdict, text("rotate-status"))
        }
    }
}
