// RouterDemoInstrumentedTest — launch + multi-route navigation smoke
// for the Android router demo. Mirror of:
//   - iOS:     `native-router-demo-ios/iosUITests/PyreonRouterDemoUITests.swift` (#1452)
//   - TodoMVC: `native-todomvc-android/.../TodoAppInstrumentedTest.kt`
//
// Closes the Android router-demo half of Gap 5 (Espresso parity
// beyond TodoMVC + Counter) from the 2026-06-05 audit. Counter
// Android half landed in #1454; iOS UITest (both counter +
// router-demo) landed in #1452.
//
// Asserts the R1.3 contract end-to-end:
//   - Home page renders post-launch (testTag = "home-page",
//     emitted from `<Stack data-testid="home-page">` in the SHARED
//     RouterApp.tsx)
//   - Click "Go to About" → about page renders (testTag = "about-page")
//   - Click "Back to Home" → home page renders again (round-trip)
//   - Click "View user 42" → user page renders (testTag = "user-page")
//     AND useParams() populates `id="42"` (the dynamic `:id` route
//     segment)
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action,
// NOT on every PR. Promote to required once green across multiple
// consecutive nightly runs (Gap 7's 2-week-streak prerequisite).

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RouterDemoInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesOnHomeRoute() {
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()
    }

    @Test
    fun navigatesHomeToAboutAndBack() {
        // Wait for home, then click "Go to About"
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithText("Go to About")
            .performClick()

        composeRule
            .onNodeWithTag("about-page")
            .assertIsDisplayed()

        // Round-trip back to home
        composeRule
            .onNodeWithText("Back to Home")
            .performClick()

        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()
    }

    // Core-UI row closure, ANDROID half of the iOS `test_linkNavigatesToAbout`
    // (#2593). `<Link to="/about" data-testid="home-link-about">` emits
    // `PyreonLink("/about") { navigate -> Box(Modifier.clickable { navigate() }
    // .testTag("home-link-about")) { … } }`. The testTag on that Box is the
    // #2593 Kotlin-half fix — <Link> is a special-case emitter that returned
    // BEFORE the generic modifier tail, so the tag was dropped and the element
    // was unselectable by onNodeWithTag at all (structurally unassertable).
    // A reverted emit fix makes the tag query fail; the click then proves the
    // clickable → navigate() → route-swap chain runs on-device.
    @Test
    fun linkNavigatesToAboutViaPyreonLink() {
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithTag("home-link-about")
            .performClick()

        composeRule
            .onNodeWithTag("about-page")
            .assertIsDisplayed()
    }

    // Core-UI residual closure — Layer / Spacer / Heading, the last three
    // canonical primitives without a dedicated behavioural assertion. Each
    // asserted by GEOMETRY (getUnclippedBoundsInRoot — pure layout
    // coordinates; the clipped variant reads a zero rect for any
    // below-the-fold node) so a mis-emit is visible, mirroring the iOS
    // frame-based halves. They live in THIS app because the router home
    // screen holds everything in the first screenful; the counter's
    // non-scrollable overflowing column measures tail children at ZERO
    // height, which makes vertical geometry unassertable there.

    // <Heading level={2}> → `Text(style = MaterialTheme.typography.h5)`. A
    // typography style is not readable from semantics — but the glyph-box
    // HEIGHT is: an h5 heading is measurably taller than a body-size Text.
    // A Heading mis-emitted as plain body text collapses the difference.
    @Test
    fun headingRendersLargerThanBodyText() {
        composeRule.onNodeWithTag("core-heading").assertIsDisplayed().assertTextEquals("Core heading")
        val heading = composeRule.onNodeWithTag("core-heading").getUnclippedBoundsInRoot()
        val body = composeRule.onNodeWithTag("spacer-left").getUnclippedBoundsInRoot()
        val headingHeight = heading.bottom - heading.top
        val bodyHeight = body.bottom - body.top
        check(headingHeight > bodyHeight + 2.dp) {
            "Heading glyph box ($headingHeight) is not taller than body text " +
                "($bodyHeight) — the level→typography lowering did not apply"
        }
    }

    // <Spacer /> inside an <Inline> (Row) → `Spacer(Modifier.weight(1f))`:
    // the weighted gap PUSHES the siblings to the row's edges. A dropped
    // Spacer leaves the two texts adjacent, so the measured gap IS the
    // assertion.
    @Test
    fun spacerPushesInlineSiblingsApart() {
        val left = composeRule.onNodeWithTag("spacer-left").getUnclippedBoundsInRoot()
        val right = composeRule.onNodeWithTag("spacer-right").getUnclippedBoundsInRoot()
        val gap = right.left - left.right
        check(gap > 100.dp) {
            "Spacer did not push the Inline siblings apart (gap $gap) — " +
                "adjacent texts mean the weighted Spacer was dropped from the emit"
        }
    }

    // <Layer> → Compose `Box`: children stack on the Z axis, so their bounds
    // INTERSECT. A mis-emit to a linear container (Column) lays them out
    // disjoint — bounds intersection is the discriminator.
    @Test
    fun layerChildrenOverlapOnZAxis() {
        val under = composeRule.onNodeWithTag("layer-under").getUnclippedBoundsInRoot()
        val over = composeRule.onNodeWithTag("layer-over").getUnclippedBoundsInRoot()
        val overlaps = under.left < over.right && over.left < under.right &&
            under.top < over.bottom && over.top < under.bottom
        check(overlaps) {
            "Layer children do not overlap (under $under, over $over) — " +
                "Box (ZStack) lowering did not apply"
        }
    }

    @Test
    fun navigatesToUserDetailWithParam() {
        // Tap "View user 42" → assert user-page renders + the
        // `:id` dynamic segment populates useParams() so the
        // `Profile for user ${params.id}` text appears with id=42.
        composeRule
            .onNodeWithTag("home-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithText("View user 42")
            .performClick()

        composeRule
            .onNodeWithTag("user-page")
            .assertIsDisplayed()

        // The interpolated text proves useParams() resolved id="42"
        // from the route segment. PMTC emits the JSX
        // `<Text>Profile for user {params.id}</Text>` as
        // `Text(text = "Profile for user ${params.id}")`.
        composeRule
            .onNodeWithText("Profile for user 42")
            .assertIsDisplayed()
    }
}
