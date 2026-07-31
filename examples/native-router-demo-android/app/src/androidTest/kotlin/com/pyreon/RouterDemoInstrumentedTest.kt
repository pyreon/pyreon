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

    // Networking row — useWebSocket device-proven on Android: the same echo
    // round trip as the iOS half, through the REAL OkHttp transport. Needs
    // `adb reverse tcp:8787 tcp:8787` so the DEVICE's localhost reaches the
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
}
