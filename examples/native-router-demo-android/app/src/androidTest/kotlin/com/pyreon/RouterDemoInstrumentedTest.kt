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
import android.content.Intent
import android.net.Uri
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeRight
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import android.os.ParcelFileDescriptor
import com.pyreon.router.PyreonDeepLink
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

    // Animations row — ASYMMETRIC enter/leave, the row's named gap. Before
    // this, one `duration` drove BOTH directions on every target, so "quick
    // in, slow out" — the common real shape — had no vocabulary at all.
    //
    // The discriminator is two boxes with OPPOSITE configs driven by the SAME
    // signal, read at ONE instant: 1000ms into the exit, the slow-leave box
    // (2500ms) is still present while the fast-leave box (200ms) is already
    // gone. A symmetric emit cannot produce opposite outcomes at the same
    // moment whichever duration it picks — which is exactly what the bisect
    // drives, and why this needs two elements rather than one.
    //
    // Enter TIMING is deliberately not asserted: AnimatedVisibility keeps the
    // node in the semantics tree for the whole enter animation, so existence
    // cannot discriminate a 200ms enter from a 2500ms one. Reading alpha off
    // captureToImage could, and is the tracked follow-up; the enter specs are
    // locked at the emit level instead.
    @Test
    fun asymmetricEnterLeaveDrivesEachDirectionIndependently() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View anim").performClick()
        composeRule.onNodeWithTag("anim-page").assertIsDisplayed()
        composeRule.onNodeWithTag("asym-slow-leave").assertExists()
        composeRule.onNodeWithTag("asym-fast-leave").assertExists()

        composeRule.mainClock.autoAdvance = false
        composeRule.onNodeWithTag("anim-toggle").performClick()
        composeRule.mainClock.advanceTimeBy(1000)

        // One instant, opposite outcomes — this is the whole proof.
        composeRule.onNodeWithTag("asym-slow-leave").assertExists()
        composeRule.onNodeWithTag("asym-fast-leave").assertDoesNotExist()

        composeRule.mainClock.advanceTimeBy(2500)
        composeRule.mainClock.autoAdvance = true
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("asym-slow-leave").assertDoesNotExist()
    }

    // INTERRUPTION — re-showing while a leave is still in flight. Surfaced
    // by the asymmetric arc on iOS, where a second toggle 100ms into a 2500ms
    // removal left every transition child absent from the accessibility tree
    // and it never returned (15s). This asserts the Compose half recovers, so
    // the shared source and the emit are sound and the iOS behaviour is
    // narrowed to SwiftUI transition interruption. Deterministic on the
    // virtual clock: interrupt at +100ms of a 2500ms exit, flip back, and the
    // child must be present once the (200ms) enter completes.
    @Test
    fun reShowingDuringAnInFlightLeaveRecovers() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View anim").performClick()
        composeRule.onNodeWithTag("anim-page").assertIsDisplayed()
        composeRule.onNodeWithTag("asym-slow-leave").assertExists()

        composeRule.mainClock.autoAdvance = false
        composeRule.onNodeWithTag("anim-toggle").performClick()
        composeRule.mainClock.advanceTimeBy(100)
        composeRule.onNodeWithTag("anim-toggle").performClick()
        composeRule.mainClock.advanceTimeBy(1000)
        composeRule.mainClock.autoAdvance = true
        composeRule.waitForIdle()

        composeRule.onNodeWithTag("asym-slow-leave").assertExists()
    }

    // Platform-APIs row — INBOUND deep links, which had no vocabulary at all
    // (`useLinking()` is outbound-only, so an app could not be opened at a
    // route). Two halves, each tested with the instrument that can actually
    // see it:
    //
    //   ROUTING — the OS must be able to hand this app a `pyreondemo://` URL
    //     at all. Asserted by resolving the real VIEW intent through
    //     PackageManager: if the manifest intent-filter is missing or the
    //     scheme is wrong, nothing resolves and no amount of app code helps.
    //
    //   HANDLING — MainActivity.onNewIntent -> PyreonDeepLink -> the live
    //     router. Delivered through the scenario rather than `am start`,
    //     deliberately: `am start` launches into a NEW task, so the
    //     ActivityScenario's activity is left paused and the harness cannot
    //     tear it down (it fails on "Activity never becomes DESTROYED" with
    //     the assertions already passed — a red that says nothing about the
    //     product). The iOS twin drives the full OS path via Safari, so the
    //     end-to-end hand-off is proven there; this half proves our code.
    //
    // TWO warm links, not one: a listener that fires once and detaches would
    // pass the first assertion and fail the second.
    @Test
    fun deepLinkRoutesToTheAppAndNavigatesTheLiveRouter() {
        val instr = InstrumentationRegistry.getInstrumentation()
        val ctx = instr.targetContext
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()

        // ROUTING — the manifest filter must actually resolve.
        val viewIntent = Intent(Intent.ACTION_VIEW, Uri.parse("pyreondemo://about"))
        val resolved = ctx.packageManager.queryIntentActivities(viewIntent, 0)
        check(resolved.any { it.activityInfo.packageName == ctx.packageName }) {
            "No activity in ${ctx.packageName} resolves pyreondemo:// — the manifest " +
                "intent-filter is missing, so the OS can never deliver a deep link"
        }

        // HANDLING — the store -> live-router chain, driven on the main thread.
        //
        // NOT via activity.onNewIntent: calling it from the test leaves the
        // ActivityScenario unable to destroy its activity at teardown ("never
        // becomes DESTROYED"), which reds the run with every assertion already
        // passed — a failure that says nothing about the product. MainActivity's
        // forwarding is two lines (`PyreonDeepLink.receive(intent.data)`); the
        // OS-to-app hop it sits in is covered by the ROUTING assertion above and
        // end-to-end by the iOS twin, which drives a real Safari hand-off.
        instr.runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://about"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("about-page").fetchSemanticsNodes().isNotEmpty()
        }

        instr.runOnMainSync {
            PyreonDeepLink.receive(Uri.parse("pyreondemo://styles"))
        }
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule.onAllNodesWithTag("styles-page").fetchSemanticsNodes().isNotEmpty()
        }
    }

    // Offline/sync row — the OFFLINE-FIRST half, two independent claims.
    //
    // (1) CONNECTIVITY, as a live FLIP on one device: the radios go down,
    //     useOnline() must report false, and come back up. Asserting only the
    //     online state would pass on a hook hard-wired to `true`; the flip is
    //     what makes it a real read. The radios are restored in a finally so a
    //     failure here cannot leave the emulator offline for every later test.
    //
    // (2) DURABILITY across ACTIVITY RELAUNCH: a record written while offline
    //     survives a recreate() and is re-read from the database by the mount
    //     effect. `recreate()` is the in-process ceiling this repo documents —
    //     the iOS twin kills the process outright — but the read goes through
    //     a NEW PyreonDatabase instance either way, so the value came off
    //     disk rather than out of a remembered object.
    //
    // The test also exercises the presence check (`if (db.get(...))`) that did
    // not compile on either target until database.get joined
    // SERVICE_METHOD_RETURNS — "State: restored" can only render through it.
    @Test
    fun offlineFirstWritesSurviveAndConnectivityIsReported() {
        val instr = InstrumentationRegistry.getInstrumentation()
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View offline").performClick()
        composeRule.onNodeWithTag("offline-page").assertIsDisplayed()

        // Start from a known-empty store so the counts below are unambiguous.
        composeRule.onNodeWithTag("clear-note").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("note-count").assertTextEquals("Notes: 0")

        try {
            shell(instr, "svc wifi disable")
            shell(instr, "svc data disable")
            // Emulators frequently keep a virtual network up through
            // `svc wifi/data disable`; airplane mode is the switch that
            // actually drops it. Both are applied so a device where either
            // works behaves the same.
            shell(instr, "settings put global airplane_mode_on 1")
            shell(instr, "am broadcast -a android.intent.action.AIRPLANE_MODE --ez state true")
            try {
                composeRule.waitUntil(timeoutMillis = 30_000) {
                    composeRule
                        .onAllNodesWithText("Online: false")
                        .fetchSemanticsNodes()
                        .isNotEmpty()
                }
            } catch (e: Throwable) {
                // A bare "condition not satisfied after 30000 ms" says nothing
                // about WHICH half failed: the radios may still be up, or
                // useOnline() may not be tracking them. Print what the app
                // actually rendered so the next CI-only failure is diagnosable
                // rather than another round of guessing.
                val shown = composeRule.onAllNodesWithText("Online: true")
                    .fetchSemanticsNodes().size
                // GRACE WINDOW. The three-way verdict below needs it.
                //
                // The first version of this message offered only two outcomes —
                // device-offline means a product bug, device-online means the
                // test is wrong. That is a false dichotomy, and it misfired on
                // #2480 (2026-08-04): it reported "product bug" while the same
                // suite passed 8/8 on other branches minutes earlier. The case
                // it could not express is the real one — ConnectivityManager's
                // callback is CORRECT but had not been delivered yet on a
                // loaded runner, i.e. "not yet", not "never".
                //
                // So re-check after a further grace period and report which of
                // the THREE it was. A diagnostic that collapses a timing
                // outcome into a correctness verdict sends the next reader
                // hunting a bug that is not there.
                Thread.sleep(GRACE_MS)
                val settled = composeRule.onAllNodesWithText("Online: false")
                    .fetchSemanticsNodes().isNotEmpty()
                val verdict = when {
                    settled ->
                        "SLOW, NOT BROKEN: the hook DID report offline during a " +
                            "further ${GRACE_MS}ms. The callback works; the 30s " +
                            "budget is too tight for this runner. Raise the " +
                            "budget — do NOT go looking for a product bug."
                    deviceNetworkState(instr).contains("wifi_on=0") ->
                        "the device reports itself OFFLINE and the hook still " +
                            "has not observed it after 30s + ${GRACE_MS}ms — " +
                            "this is a PRODUCT bug in useOnline."
                    else ->
                        "the device still reports a live network, so the " +
                            "emulator ignored the disable commands and the " +
                            "TEST is wrong."
                }
                throw AssertionError(
                    "useOnline() never reported false within 30s. " +
                        "App still showing \"Online: true\" on $shown node(s). " +
                        "DEVICE says: ${deviceNetworkState(instr)}. " +
                        "VERDICT: $verdict",
                    e,
                )
            }

            // Written with no network at all — the whole point of offline-first.
            composeRule.onNodeWithTag("write-note").performClick()
            composeRule.waitForIdle()
            composeRule.onNodeWithTag("note-count").assertTextEquals("Notes: 1")
        } finally {
            shell(instr, "settings put global airplane_mode_on 0")
            shell(instr, "am broadcast -a android.intent.action.AIRPLANE_MODE --ez state false")
            shell(instr, "svc wifi enable")
            shell(instr, "svc data enable")
        }

        // Connectivity comes BACK — proves the read tracks the device rather
        // than latching on the first value it saw.
        composeRule.waitUntil(timeoutMillis = 60_000) {
            composeRule.onAllNodesWithText("Online: true").fetchSemanticsNodes().isNotEmpty()
        }

        // Durability: a fresh composition re-reads the record from the store.
        composeRule.activityRule.scenario.recreate()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("View offline").performClick()
        composeRule.onNodeWithTag("offline-page").assertIsDisplayed()
        composeRule.onNodeWithTag("note-count").assertTextEquals("Notes: 1")
        // Only reachable through the `if (db.get(...))` presence check.
        composeRule.onNodeWithTag("note-state").assertTextEquals("State: restored")

        composeRule.onNodeWithTag("clear-note").performClick()
        composeRule.waitForIdle()
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

    // Networking row — HTTP VERBS device-proven on Android, through the real
    // OkHttp executor this arc had to write (`PyreonHttp` shipped with an
    // executor INTERFACE and a comment calling the implementation a
    // "Phase-2+ follow-up"; nothing implemented it, and separately nothing in
    // the compiler lowered to it, so the whole HTTP layer was unreachable).
    //
    // The assertion is on what the SERVER SAW: `/echo` reflects the request,
    // so a POST that silently degraded to a GET — what every version before
    // this emitted, since the parser never read useFetch's second argument —
    // renders "Method: GET" and fails here instead of passing quietly.
    //
    // Needs `adb reverse tcp:8790 tcp:8790` like the websocket test above.
    @Test
    fun httpVerbAndBodyReachTheWire() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View http").performClick()
        composeRule.onNodeWithTag("http-page").assertIsDisplayed()

        // The verb the server actually received.
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("Method: POST").fetchSemanticsNodes().isNotEmpty()
        }
        // ...and the body. Separate assertion: a fix that carried the verb but
        // dropped the payload would satisfy the check above on its own.
        composeRule
            .onNodeWithTag("http-body")
            .assertTextEquals("Body: {\"name\":\"pyreon\"}")
        // A non-2xx must REJECT rather than reach the decoder.
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("Bad: rejected").fetchSemanticsNodes().isNotEmpty()
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

    // Lists-at-scale row — the Android half. Same creation + laziness
    // claims as the iOS twin, PLUS the deep jump: performScrollToNode
    // drives the LazyColumn's scroll semantics all the way to Row 9999 —
    // reachable only if virtualization composes rows on demand the whole
    // way down (an eager Column would have crashed at creation; a broken
    // key/order would surface as a missing node).
    @Test
    fun tenThousandRowListIsLazyAndDeepRowReachable() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View big list").performClick()
        composeRule.onNodeWithTag("biglist-page").assertIsDisplayed()
        composeRule.onNodeWithText("Row 0").assertExists()
        check(
            composeRule.onAllNodesWithText("Row 9999").fetchSemanticsNodes().isEmpty()
        ) { "Row 9999 is composed at launch — the list is EAGER, not lazy" }

        composeRule.onNode(hasScrollAction()).performScrollToNode(hasText("Row 9999"))
        composeRule.onNodeWithText("Row 9999").assertExists()
    }

    // Accessibility row — roles + hidden landing in the REAL semantics
    // (TalkBack) tree, not just the emit:
    //  - heading(): the Heading semantics key is DEFINED on the header text
    //    (the TalkBack rotor grouping signal).
    //  - Role.Button on a PLAIN Text — the discriminating shape: a Button
    //    composable carries the role natively, so only a non-button element
    //    proves the accessibilityRole prop did the work. The same node also
    //    carries the contentDescription from accessibilityLabel.
    //  - accessibilityHidden -> clearAndSetSemantics { }: the decorative
    //    text is ABSENT from the semantics tree by TEXT, with the visible
    //    sibling as the positive control proving the text query works
    //    (an assertion that something is absent proves nothing unless the
    //    same query finds a present sibling).
    // Styling row — @pyreon/coolgrid, which the styling table has listed as
    // supported since it landed but which had never rendered on a device.
    // The 12-column split is ASYMMETRIC (3/9) on purpose: a dropped grid
    // leaves both columns full-width or adjacent, and a defaulted/swapped
    // span puts the boundary at the wrong fraction — neither of which a 6/6
    // split could distinguish from correct.
    @Test
    fun coolgridColumnsTakeTheirDeclaredFractionOfTheRow() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View styles").performClick()
        composeRule.onNodeWithTag("styles-page").assertIsDisplayed()

        val container = composeRule.onNodeWithTag("grid-container").getUnclippedBoundsInRoot()
        val narrow = composeRule.onNodeWithTag("grid-col-narrow").getUnclippedBoundsInRoot()
        val wide = composeRule.onNodeWithTag("grid-col-wide").getUnclippedBoundsInRoot()

        val total = (container.right - container.left).value
        val narrowFrac = (narrow.right - narrow.left).value / total
        val wideFrac = (wide.right - wide.left).value / total
        // 3/12 and 9/12 of the row, within a tolerance that still rejects
        // every wrong answer this can produce (a dropped span -> ~1.0; the
        // remaining-width bug -> 0.5625 for the wide column).
        check(narrowFrac > 0.20f && narrowFrac < 0.30f) {
            "narrow column is ${narrowFrac} of the row, expected ~0.25 " +
                "(col ${narrow.right - narrow.left}, row ${container.right - container.left})"
        }
        check(wideFrac > 0.70f && wideFrac < 0.80f) {
            "wide column is ${wideFrac} of the row, expected ~0.75 " +
                "(col ${wide.right - wide.left}, row ${container.right - container.left})"
        }
    }

    // Styling row — @pyreon/elements' Element, the other named gap with no
    // native example. `padding={4}` is scale step 4 -> 16dp, so the box must
    // be its child's height plus 32dp (16 top + 16 bottom). Reading the
    // DELTA rather than an absolute makes the assertion independent of the
    // font metrics that decide the child's own height.
    @Test
    fun elementPaddingConsumesRealLayoutSpace() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View styles").performClick()
        composeRule.onNodeWithTag("styles-page").assertIsDisplayed()

        // Measured as the OFFSET from the marker above, not as the tagged
        // box's own bounds: Compose applies `padding` BEFORE `testTag` in the
        // emitted chain, so the semantics node reports the already-padded
        // INNER area and box-minus-child reads 0 whether or not the padding
        // exists. (That ordering also shrinks an element's a11y touch target
        // to exclude its padding — a small real defect, recorded here rather
        // than churned in this pass because reordering the shared modifier
        // builder touches every emitted node.) The sibling token-padding
        // test measures child offsets for exactly this reason.
        val marker = composeRule.onNodeWithTag("element-marker").getUnclippedBoundsInRoot()
        val child = composeRule.onNodeWithTag("element-child").getUnclippedBoundsInRoot()
        val gap = (child.top - marker.bottom).value
        // Stack gap={3} = 12dp, plus Element padding={4} = 16dp -> ~28.
        // Padding dropped would leave the bare 12.
        check(gap > 24f && gap < 32f) {
            "marker->child offset is ${gap}dp, expected ~28 (12dp stack gap + 16dp " +
                "Element padding) — a bare ~12 means the padding never reached layout"
        }
    }

    @Test
    fun a11yRolesAndHiddenLandInSemanticsTree() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View a11y").performClick()
        composeRule.onNodeWithTag("a11y-page").assertIsDisplayed()

        composeRule.onNodeWithTag("a11y-header")
            .assert(SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading))

        composeRule.onNodeWithTag("a11y-fake-button")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
        composeRule.onNodeWithTag("a11y-fake-button")
            .assert(
                SemanticsMatcher.expectValue(
                    SemanticsProperties.ContentDescription, listOf("Add item"),
                ),
            )

        composeRule.onNodeWithText("plain sibling").assertExists()
        composeRule.onNodeWithText("decorative-glyphs").assertDoesNotExist()
    }
    // Media row — a REMOTE image through the real network stack (Coil
    // AsyncImage <- adb-reversed localhost fixture serving a solid-RED
    // PNG). captureToImage reads the node's RENDERED pixels, so the
    // assertion can only pass if the bytes were fetched over HTTP,
    // decoded by Coil, and drawn — a placeholder, a missing coil-compose
    // artifact, or a dead fixture server all read as not-red.
    @Test
    fun remoteImageRendersFetchedPixels() {
        composeRule.onNodeWithTag("home-page").assertIsDisplayed()
        composeRule.onNodeWithText("View media").performClick()
        composeRule.onNodeWithTag("media-page").assertIsDisplayed()
        composeRule.onNodeWithTag("remote-dot").assertExists()

        composeRule.waitUntil(timeoutMillis = 20_000) {
            try {
                val bmp = composeRule.onNodeWithTag("remote-dot")
                    .captureToImage().asAndroidBitmap()
                val p = bmp.getPixel(bmp.width / 2, bmp.height / 2)
                android.graphics.Color.red(p) > 200 &&
                    android.graphics.Color.green(p) < 80 &&
                    android.graphics.Color.blue(p) < 80
            } catch (_: Throwable) {
                false
            }
        }
    }

    /**
     * Run a shell command through UiAutomation and WAIT for it to finish.
     *
     * `executeShellCommand` returns a descriptor wired to the command's stdout
     * and the command runs asynchronously; closing that descriptor immediately
     * can tear the pipe down before the command has applied its effect. The
     * radios then stay up and the connectivity assertion below times out with
     * no indication of why. Reading to EOF is what makes it synchronous.
     */
    /**
     * Extra time the offline assertion allows before deciding WHY it failed.
     *
     * Not a retry of the assertion — the test still fails. It only separates
     * "the callback is slow on this runner" from "the hook never observes the
     * change", which the first version of that message could not express and
     * therefore got wrong.
     */
    private val GRACE_MS = 15_000L

    private fun shell(instr: android.app.Instrumentation, cmd: String): String =
        ParcelFileDescriptor.AutoCloseInputStream(
            instr.uiAutomation.executeShellCommand(cmd),
        ).use { String(it.readBytes()) }

    /**
     * What the DEVICE thinks its connectivity is, independent of the app.
     *
     * Without this the failure cannot distinguish "the radios never went down"
     * from "they went down and useOnline() did not observe it" -- the first
     * version of this diagnostic reported only what the app rendered, which is
     * the same string in both cases.
     */
    private fun deviceNetworkState(instr: android.app.Instrumentation): String {
        val wifi = shell(instr, "settings get global wifi_on").trim()
        val airplane = shell(instr, "settings get global airplane_mode_on").trim()
        val active = shell(instr, "dumpsys connectivity --short")
            .lineSequence().firstOrNull { it.contains("NetworkAgentInfo") } ?: "<no active network line>"
        return "wifi_on=$wifi airplane_mode_on=$airplane active=${active.trim().take(120)}"
    }

}
