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

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.runtime.PyreonSecureStorage
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

    // Storage row — useSecureStorage device-proven on Android, THREE claims
    // in one flow:
    //   (1) round trip: the Save Secret click writes through the emitted
    //       `PyreonSecureStorage(ctx)` and the handler reads BACK through the
    //       store (not a signal echo) before rendering "Secret: s3cret".
    //   (2) durability: a COLD PyreonSecureStorage over the app's own
    //       context decrypts what the UI wrote — a fresh instance carries no
    //       in-memory state, so the value demonstrably came off the
    //       device's Keystore-encrypted store (the useDatabase disk-proof
    //       pattern; full process death stays impossible in-process — the
    //       documented AndroidJUnitRunner limitation).
    //   (3) ENCRYPTION AT REST: the raw SharedPreferences value is NOT the
    //       plaintext — it is iv:ciphertext from the AndroidKeyStore AES-GCM
    //       cipher. A backend that "persisted" by writing the secret
    //       straight into prefs would pass (1) and (2) and fail exactly
    //       here.
    // No initial-state assertion: prefs/Keystore legitimately survive
    // between runs on the same emulator.
    @Test
    fun secureStorageWriteRoundTripsAndIsEncryptedAtRest() {
        composeRule.onNodeWithTag("secure-value").assertExists()
        composeRule.onNodeWithTag("secure-save").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("secure-value").assertTextEquals("Secret: s3cret")

        val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        val cold = PyreonSecureStorage(ctx)
        check(cold.read("demo-secret") == "s3cret") {
            "cold PyreonSecureStorage(context) did not read the UI's write — " +
                "the emitted default is not actually Keystore/prefs-backed"
        }
        val raw = ctx
            .getSharedPreferences("pyreon_secure", Context.MODE_PRIVATE)
            .getString("demo-secret", null)
        check(raw != null && !raw.contains("s3cret")) {
            "raw prefs value is the PLAINTEXT ($raw) — the secret was stored " +
                "unencrypted; KeystoreSecureBackend's AES-GCM did not apply"
        }
    }

    // Forms row — useFieldArray device-proven on Android: add + REMOVE-FIRST
    // drive recomposition of the emitted
    // `items(tags.items, key = { it.key })` LazyColumn — append renders the
    // new row, remove-first drops exactly row 0 and the SURVIVOR row is
    // still rendered, and the count text pins length reactivity
    // (`tags.length` over a SnapshotStateList). HONEST SCOPE: text-level
    // assertions prove the mutation→re-render chain, not key IDENTITY (a
    // positional list would render the same texts) — key STABILITY across
    // removals is pinned by the runtime contract suites on both platforms
    // (PyreonFieldArrayTest / PyreonRuntimeTests, survivor keys asserted
    // directly).
    @Test
    fun fieldArrayAddAndRemoveFirstKeepSurvivorRow() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("Go to About").performClick()
        composeRule.onNodeWithTag("about-page").assertIsDisplayed()

        composeRule.onNodeWithTag("tag-count").assertTextEquals("Tags: 1")
        composeRule.onNodeWithText("tag: alpha").assertExists()

        composeRule.onNodeWithTag("tag-add").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("tag-count").assertTextEquals("Tags: 2")
        composeRule.onNodeWithText("tag: beta").assertExists()

        composeRule.onNodeWithTag("tag-remove").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("tag-count").assertTextEquals("Tags: 1")
        composeRule.onNodeWithText("tag: alpha").assertDoesNotExist()
        composeRule.onNodeWithText("tag: beta").assertExists()
    }

    // Animations row — CONFIGURED duration/easing device-proven on the
    // compose rule's VIRTUAL clock (deterministic, no wall-time flake):
    // with autoAdvance off, the slow box (duration=2500ms, linear) still
    // EXISTS 1000ms into its exit — the default ~300ms animation would have
    // removed it (the exact discriminator the duration-flip bisect drives)
    // — and is GONE once the configured duration elapses.
    @Test
    fun transitionDurationConfigDrivesExitTiming() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View motion").performClick()
        composeRule.onNodeWithTag("motion-page").assertIsDisplayed()
        composeRule.onNodeWithTag("slow-box").assertExists()

        composeRule.mainClock.autoAdvance = false
        composeRule.onNodeWithTag("motion-toggle").performClick()
        composeRule.mainClock.advanceTimeBy(1000)
        composeRule.onNodeWithTag("slow-box").assertExists()

        composeRule.mainClock.advanceTimeBy(2500)
        composeRule.mainClock.autoAdvance = true
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("slow-box").assertDoesNotExist()
    }

    // Adaptive row — RESPONSIVE PROP VALUES follow the size class, proven
    // as a live FLIP on ONE device: the A→B gap is measured at the phone
    // width (compact → gap token 2 → 8dp), then `wm size` resizes the
    // display to tablet width (screenWidthDp ≥ 600 → regular → gap token
    // 6 → 24dp) and the SAME nodes re-measure — LocalConfiguration drives
    // recomposition, so the flip is the responsive-prop chain end-to-end.
    // Restored in a finally so a failed assertion can never strand the
    // emulator resized.
    @Test
    fun adaptivePropsFollowSizeClassFlip() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        val aC = composeRule.onNodeWithTag("adaptive-a").getUnclippedBoundsInRoot()
        val bC = composeRule.onNodeWithTag("adaptive-b").getUnclippedBoundsInRoot()
        val gapCompact = bC.top - aC.bottom
        check(gapCompact > 5.dp && gapCompact < 12.dp) {
            "compact gap is $gapCompact, expected the compact token (2 → 8dp)"
        }

        val uiAutomation = InstrumentationRegistry.getInstrumentation().uiAutomation
        try {
            uiAutomation.executeShellCommand("wm size 1600x2560").close()
            composeRule.waitUntil(timeoutMillis = 10_000) {
                val a = composeRule.onNodeWithTag("adaptive-a").getUnclippedBoundsInRoot()
                val b = composeRule.onNodeWithTag("adaptive-b").getUnclippedBoundsInRoot()
                (b.top - a.bottom) > 20.dp
            }
            val aR = composeRule.onNodeWithTag("adaptive-a").getUnclippedBoundsInRoot()
            val bR = composeRule.onNodeWithTag("adaptive-b").getUnclippedBoundsInRoot()
            val gapRegular = bR.top - aR.bottom
            check(gapRegular > 20.dp && gapRegular < 28.dp) {
                "regular gap is $gapRegular, expected the regular token (6 → 24dp)"
            }
        } finally {
            uiAutomation.executeShellCommand("wm size reset").close()
        }
    }

    // Styling row — defineTheme tokens + styled(Prim) device-proven by
    // GEOMETRY (the iOS half's mirror): children of the two token-padded
    // cards differ in left offset by exactly xl−sm = 40−8 = 32dp. Child-vs-
    // child keeps it independent of container-bound semantics; unclipped
    // bounds are pure layout coordinates.
    @Test
    fun themeTokenPaddingDrivesLayout() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View styles").performClick()
        composeRule.onNodeWithTag("styles-page").assertIsDisplayed()

        val sm = composeRule.onNodeWithTag("card-sm-child").getUnclippedBoundsInRoot()
        val xl = composeRule.onNodeWithTag("card-xl-child").getUnclippedBoundsInRoot()
        val delta = xl.left - sm.left
        check(delta > 28.dp && delta < 36.dp) {
            "token padding delta is $delta, expected xl−sm = 40−8 = 32dp — " +
                "the defineTheme literals did not drive the styled() layout"
        }
    }

    // Networking row — useWebSocket device-proven on Android: the same echo
    // round trip as the iOS half, through the REAL OkHttp transport. Needs
    // `adb reverse tcp:8790 tcp:8790` so the DEVICE's localhost reaches the
    // host's echo server (the emulator's own loopback is not the host's) —
    // the shared-source URL stays one literal for all three targets. The
    // echo is the load-bearing assertion (a dead server renders no echo);
    // the connect gate additionally proves OkHttp's onOpen fired
    // (Kotlin's isConnected flips in the real handshake callback).
    @Test
    fun webSocketEchoRoundTripsOnDevice() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View user 42").performClick()
        composeRule.onNodeWithTag("user-page").assertIsDisplayed()

        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodesWithText("WS: open").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithTag("ws-send").performClick()
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule
                .onAllNodesWithText("Echo: echo:ping-42")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onNodeWithTag("ws-last").assertTextEquals("Echo: echo:ping-42")
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

    // Gestures row — the swipe vocabulary, injected as REAL Compose touch
    // gestures (performTouchInput drives the pointer-input pipeline the
    // emitted detectHorizontalDragGestures listens on). Three-way
    // separable like the iOS twin: 'left'/'right' proves the detector +
    // threshold sign; 'tap' after a swipe would mean the drag fell
    // through to .clickable (coexistence failure); the final click must
    // still read 'tap' — the direction-locked detector must not claim taps.
    @Test
    fun swipeGesturesFireDirectionalHandlers() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View motion").performClick()
        composeRule.onNodeWithTag("motion-page").assertIsDisplayed()
        composeRule.onNodeWithTag("swipe-status").assertTextEquals("Swiped: none")

        composeRule.onNodeWithTag("swipe-zone").performTouchInput { swipeLeft() }
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodesWithText("Swiped: left").fetchSemanticsNodes().isNotEmpty()
        }

        composeRule.onNodeWithTag("swipe-zone").performTouchInput { swipeRight() }
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodesWithText("Swiped: right").fetchSemanticsNodes().isNotEmpty()
        }

        composeRule.onNodeWithTag("swipe-zone").performClick()
        composeRule.waitUntil(timeoutMillis = 10_000) {
            composeRule.onAllNodesWithText("Swiped: tap").fetchSemanticsNodes().isNotEmpty()
        }
    }
}
