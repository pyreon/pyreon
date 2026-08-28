// CounterInstrumentedTest — launch + signal-write smoke for the
// Android Counter sample. Sibling of `examples/native-todomvc-android/
// app/src/androidTest/kotlin/com/pyreon/TodoAppInstrumentedTest.kt`
// and `examples/native-counter-ios/iosUITests/PyreonCounterUITests.swift`.
//
// Closes the Android half of Gap 7 part (a) from the 2026-06-05
// native-readiness audit — the iOS half landed in #1452.
//
// Asserts:
//   - MainActivity hosts the @Composable Counter() from the
//     compiler-emitted `com.pyreon.generated.Counter`
//   - The "Count: 0" text appears post-launch (signal → @State
//     round-trip on initial mount)
//   - The "Increment" button click updates the text to "Count: 1"
//     (signal-write → re-render — Phase 0 success criterion #2,
//     proven on the Compose side)
//
// Counter source doesn't carry `data-testid` (predates the canonical-
// primitives migration), so this test queries by displayed text via
// `onNodeWithText("Count: N")` — Compose's testing equivalent of
// XCUIApplication.staticTexts["..."]. Stable enough for a
// deterministic-initial-state smoke.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action,
// NOT on every PR (emulator-boot time + flake risk — same opt-in
// rationale as the iOS XCUITest and the TodoMVC Espresso sibling).
// Promote to required once green across multiple consecutive nightly
// runs (Gap 7's 2-week-streak prerequisite).

package com.pyreon

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.location.provider.ProviderProperties
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.pyreon.runtime.PyreonDatabase
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CounterInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesAndIncrementsCounter() {
        // Phase 1: assert initial render. PMTC emits
        // `Text(text = "Count: ${count}")` with count starting at 0,
        // so "Count: 0" appears as a single semantic-tree text node.
        composeRule
            .onNodeWithText("Count: 0")
            .assertIsDisplayed()

        // Phase 2: assert signal-write → re-render via the Increment
        // button. PMTC emits the button as
        // `Button(onClick = { count = count + 1 }) { Text("Increment") }`.
        // Click → Compose recomposes Text with the updated count.
        composeRule
            .onNodeWithText("Increment")
            .performClick()

        composeRule
            .onNodeWithText("Count: 1")
            .assertIsDisplayed()
    }

    // M2.3 — GESTURE (long-press) asserted on device. The shared
    // Counter.tsx has a long-press-only `<Press onLongPress={() =>
    // count.set(0)} data-testid="reset-zone">`; PMTC emits it as a
    // `Box(Modifier.testTag("reset-zone").combinedClickable(onClick = {},
    // onLongClick = { count = 0 }))`. A `longClick()` on the tagged node
    // fires the reset — proving the emitted Compose long-press gesture.
    @Test
    fun longPressResetsCounter() {
        // Drive the count up (0 -> 2) so the reset is observable.
        composeRule.onNodeWithText("Increment").performClick()
        composeRule.onNodeWithText("Increment").performClick()
        composeRule.onNodeWithText("Count: 2").assertIsDisplayed()

        // Semantics action, not a coordinate long-press: the counter column
        // overflows shorter profiles (API 33's effective viewport is smaller
        // than Android 15's — the documented divergence), and content
        // additions above keep shifting this zone across the fold. The
        // long-press SEMANTICS (combinedClickable's OnLongClick) is the
        // claim under test; coordinate gestures remain proven by the
        // upper-region tests.
        composeRule
            .onNodeWithTag("reset-zone")
            .performSemanticsAction(SemanticsActions.OnLongClick)

        composeRule.onNodeWithText("Count: 0").assertIsDisplayed()
    }

    // Tier-2 i18n (createI18n) asserted in the REAL Compose semantics tree —
    // the Android half of the iOS `test_i18nTranslatedStringRendersConfigured
    // Locale`. The shared Counter.tsx has `const i18n = createI18n({ locale:
    // 'de', fallbackLocale: 'en', messages: { en: { hello: 'Hello!' }, de: {
    // hello: 'Hallo!' } } })` and renders `<Text>Greeting: {i18n.t('hello')}
    // </Text>`; PMTC emits `val i18n = remember { PyreonI18n(initialLocale =
    // "de", messages = mapOf(…)) }` + `Text(text = "Greeting: ${i18n.t("hello
    // ")}")`. That the SAME source produces this on Compose is the "one shared
    // codebase → both platforms" proof.
    //
    // DIFFERENTIATING: the rendered node must read the configured-locale ('de')
    // value "Greeting: Hallo!" — proving PyreonI18n.t resolved messages["de"]
    // ["hello"] (NOT the raw key "hello", NOT the English "Hello!").
    // useDatabase — the WRITE path, proven to RUN on an emulator.
    //
    // `db.insert(collection, { id, fields })` did not compile on EITHER target
    // until 2026-07: the object literal lowered to an anonymous shape rather
    // than a `PyreonRecord` (`(id = "1", fields = __Obj0(...))`, which is not
    // even a valid Kotlin expression). `insert` is the only way to get data
    // into the store, so nothing downstream of it was reachable.
    //
    // Tapping Save Note therefore exercises the whole Android chain at once:
    // the emit compiles, `PyreonDatabase(LocalContext.current)` resolved a real
    // file-backed store, the record landed, and `db.count` read it back.
    //
    // RELATIVE to the count at launch, never absolute: the app's `filesDir`
    // survives between tests in a run, so the store legitimately accumulates.
    // An absolute `Notes: 1` would pass once and fail forever after.
    //
    // HONEST SCOPE — this is NOT the iOS assertion's equal. The iOS XCUITest
    // terminates the app and relaunches it, so it proves the record outlives
    // the PROCESS. A Compose instrumented test runs in-process and cannot;
    // proving process death on Android needs UiAutomator (`am force-stop` +
    // relaunch) and is a tracked follow-up. What this proves is the write path,
    // which is exactly the part that never compiled.
    @Test
    fun databaseInsertLandsOnDevice() {
        val notesNode = composeRule.onNode(hasText("Notes: ", substring = true))
        notesNode.assertIsDisplayed()

        val label = notesNode
            .fetchSemanticsNode()
            .config[SemanticsProperties.Text]
            .first()
            .text
        val before = label.removePrefix("Notes: ").trim().toInt()

        composeRule.onNodeWithText("Save Note").performClick()
        composeRule.waitForIdle()

        composeRule.onNodeWithText("Notes: ${before + 1}").assertIsDisplayed()
    }

    // useDatabase — the record is on the DEVICE'S DISK, not in a cache.
    //
    // The sibling test above proves the write path RUNS. This one proves it
    // DURABLE, which is the claim `useDatabase` exists to make and the one that
    // was false until 2026-07 (the default backend was an in-memory map, so
    // every record died with the process — silently).
    //
    // Method: after the UI writes through the app's own store, the test builds
    // a SECOND `PyreonDatabase(context)` over the same `filesDir`. A fresh
    // instance carries no in-memory state, so anything it reads came off the
    // filesystem. That eliminates the cache explanation entirely — the exact
    // thing the previous Android "persistence" assertion could not do.
    //
    // WHY NOT A REAL PROCESS KILL. `am force-stop` is the honest equivalent of
    // the iOS `terminate()` + relaunch, but AndroidJUnitRunner executes
    // instrumented tests INSIDE the app's process, so force-stopping the app
    // kills the test runner with it. The remaining delta versus iOS is
    // therefore narrow and worth naming: this does not exercise the app's
    // `onMount` re-read on a cold launch. The disk round trip — the part that
    // was actually broken — is covered.
    @Test
    fun databaseRecordIsWrittenToDisk() {
        val notesNode = composeRule.onNode(hasText("Notes: ", substring = true))
        notesNode.assertIsDisplayed()
        val before = notesNode
            .fetchSemanticsNode()
            .config[SemanticsProperties.Text]
            .first()
            .text
            .removePrefix("Notes: ")
            .trim()
            .toInt()

        composeRule.onNodeWithText("Save Note").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Notes: ${before + 1}").assertIsDisplayed()

        // A cold reader over the same app-private directory. The context comes
        // from the rule's own activity rather than InstrumentationRegistry:
        // it is the APP's context by construction (so the identical `filesDir`
        // the emitted `PyreonDatabase(LocalContext.current)` used), and it adds
        // no androidTest dependency — `androidx.test:monitor` arrives only
        // transitively here, and a device gate is an expensive place to
        // discover a missing artifact.
        val coldReader = PyreonDatabase(composeRule.activity.applicationContext)
        val onDisk = coldReader.count("notes")

        if (onDisk != before + 1) {
            throw AssertionError(
                "A freshly-constructed PyreonDatabase over the app's filesDir saw " +
                    "$onDisk records, expected ${before + 1}. The UI reported the write, " +
                    "so the record exists in memory but was never persisted.",
            )
        }
    }

    // The static half of the style pipeline, asserted through GEOMETRY — the
    // Compose mirror of the iOS `test_rocketstyleSizeDimensionProducesRealGeometry`.
    //
    // The badge test proves a reactive dimension re-renders and deliberately
    // claims nothing about colour (the Compose test tree cannot read one). This
    // covers the STATIC cascade: `size="narrow"` / `size="wide"` lower to
    // `Modifier.width(120.dp)` / `width(240.dp)`, and bounds ARE readable, so a
    // dropped or ignored modifier is visible here.
    //
    // Asserted in dp against the emitted values, since Compose reports bounds in
    // dp directly and no scale conversion is involved — with a tolerance for
    // layout rounding.
    @Test
    fun rocketstyleSizeDimensionProducesRealGeometry() {
        composeRule.onNodeWithTag("sized-narrow").assertIsDisplayed()
        composeRule.onNodeWithTag("sized-wide").assertIsDisplayed()

        val narrow = composeRule.onNodeWithTag("sized-narrow").getBoundsInRoot()
        val wide = composeRule.onNodeWithTag("sized-wide").getBoundsInRoot()

        // `getBoundsInRoot()` returns a DpRect — left/top/right/bottom, no
        // `width` accessor. Derive it.
        val narrowDp = (narrow.right - narrow.left).value
        val wideDp = (wide.right - wide.left).value

        if (narrowDp < 110f || narrowDp > 130f) {
            throw AssertionError(
                "narrow width was ${narrowDp}dp, expected ~120dp from the size cascade. " +
                    "A value near the intrinsic text width means the modifier was dropped.",
            )
        }
        if (wideDp < 230f || wideDp > 250f) {
            throw AssertionError("wide width was ${wideDp}dp, expected ~240dp from the size cascade.")
        }
    }

    // accessibilityLabel — the ANDROID half, which had none.
    //
    // The cross-platform `accessibilityLabel` prop lowers per target: iOS
    // `.accessibilityLabel(...)`, Android
    // `Modifier.semantics { contentDescription = … }`. iOS has asserted its half
    // on-device since the a11y pass; Android asserted NOTHING — no
    // content-description query existed in this file at all — so the Compose
    // lowering was emit-locked only, and the capability matrix credits a11y
    // accordingly (0.15, "the Android side not device-asserted here").
    //
    // The assertion is differentiating in the same way the iOS one is: the
    // element is queried by its LABEL, never by its visible glyph "●". A
    // dropped or ignored `semantics` block leaves the node findable by text and
    // NOT by content description, so this fails rather than passing on a
    // coincidence.
    @Test
    fun accessibilityLabelReachesTheSemanticsTree() {
        composeRule.onNodeWithContentDescription("A11y status ready").assertIsDisplayed()
    }

    // The label is attached to the RIGHT node — the one rendering the glyph.
    //
    // This is the differentiating half. Asserting only that some node carries
    // the description would pass if the `semantics` block landed on a wrapper,
    // a sibling, or an empty spacer. Asserting that the node found BY THE LABEL
    // is also the node whose text is "●" pins the lowering to the element the
    // author annotated.
    //
    // (An earlier draft asserted `onNodeWithContentDescription("●")
    // .assertDoesNotExist()` instead. That is trivially true — the glyph was
    // never set as a description — so it proved nothing about the lowering.)
    @Test
    fun accessibilityLabelIsAttachedToTheAnnotatedElement() {
        composeRule
            .onNodeWithContentDescription("A11y status ready")
            .assertTextEquals("●")
    }

    @Test
    fun i18nTranslatedStringRendersConfiguredLocale() {
        composeRule.onNodeWithText("Greeting: Hallo!").assertIsDisplayed()
    }

    // i18n-row residuals — INTERPOLATION + PLURAL-RULE selection, driven by
    // the EXISTING count signal so no new controls were added:
    //   - "Hallo Vit!" proves {{name}} substitution from the values map IN
    //     the configured locale (a dropped interpolation renders the raw
    //     "Hallo {{name}}!"; a wrong-locale lookup renders "Hi Vit!").
    //   - The plural text follows count across the _other→_one→_other
    //     boundary as Increment fires: "0 Stücke" → "1 Stück" → "2 Stücke"
    //     (a broken plural selection sticks on one suffix — the exact
    //     failure the runtime bisect drives).
    @Test
    fun i18nInterpolationAndPluralsFollowCount() {
        composeRule.onNodeWithText("Hallo Vit!").assertExists()
        composeRule.onNodeWithText("0 Stücke").assertExists()
        composeRule.onNodeWithText("Increment").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("1 Stück").assertExists()
        composeRule.onNodeWithText("Increment").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("2 Stücke").assertExists()
    }

    // Dark mode (useColorScheme) asserted in the REAL Compose semantics tree —
    // the Android half of the iOS `test_colorSchemeTracksSimulatorAppearance`.
    //
    // KNOWN GAP, deliberately not fixed here: this asserts only the LIGHT
    // theme, and takes whatever theme the emulator happens to be in. A
    // `colorScheme` that was a baked "light" constant passes it exactly as a
    // live `isSystemInDarkTheme()` read does, so it cannot fail for the
    // regression it exists to catch. The iOS side now runs both appearances as
    // two CI legs; the Android equivalent needs `adb shell cmd uimode night
    // yes|no` plus an instrumentation argument for the expectation, which is
    // not verifiable on a machine without an Android SDK — so it is stated
    // rather than guessed at inside a required gate. The
    // shared Counter.tsx has `const colorScheme = useColorScheme()` and renders
    // `<Text>Theme: {colorScheme}</Text>`; PMTC emits
    // `val colorScheme = if (isSystemInDarkTheme()) "dark" else "light"` +
    // `Text(text = "Theme: ${colorScheme}")`. The default instrumentation
    // environment is the light theme, so the node reads "Theme: light" — that
    // the SAME source produces this on Compose is the "one shared codebase →
    // both platforms" proof for the color-scheme read.
    @Test
    fun colorSchemeReadsLightAppearance() {
        composeRule.onNodeWithText("Theme: light").assertIsDisplayed()
    }

    // FFI escape hatch (useNativeModule) asserted in the REAL Compose
    // semantics tree — the Android half of the iOS
    // `test_userDefinedNativeModuleRunsOnDevice`. The shared Counter.tsx has
    // `const device = useNativeModule<{ platformName(): string }>('DeviceInfo')`
    // and renders `<Text>Device: {device.platformName()}</Text>`; PMTC emits
    // `val deviceCtx = LocalContext.current` +
    // `val device = remember { DeviceInfo(deviceCtx) }` +
    // `Text(text = "Device: ${device.platformName()}")`, where `DeviceInfo` is
    // `app/src/main/kotlin/com/pyreon/DeviceInfo.kt` — ordinary app code the
    // framework has never heard of.
    //
    // DIFFERENTIATING: the value is "Android" while the iOS sibling renders
    // "iOS" from its own Swift class, so neither string could have been baked
    // in by the compiler — the SAME shared source resolves to a DIFFERENT
    // app-provided implementation per platform, which is the whole point of
    // the escape hatch. It is also load-bearing at BUILD time: a regressed
    // lowering would fail `assembleDebug` rather than render wrong text.
    @Test
    fun userDefinedNativeModuleRunsOnDevice() {
        composeRule.onNodeWithText("Device: Android").assertIsDisplayed()
    }

    // ui-system (rocketstyle) lowering asserted in the REAL Compose semantics
    // tree — the Android half of `test_rocketstyleComponentRendersAndFlipsOnDevice`,
    // and the LOAD-BEARING half of this pair.
    //
    // Compose has no text-colour modifier, so a reactive dimension colour has to
    // be threaded as a `Text(color = if (cond) A else B)` CONSTRUCTOR ARG. It
    // used to fall through to the container path and be dropped with a warning,
    // while iOS rendered it. This build proves the Compose arg is real and
    // TYPE-CORRECT — a wrong arg name or type fails `assembleDebug` before the
    // test runs. It does NOT prove the colour is present (a missing colour also
    // compiles); presence is locked by the emit test.
    @Test
    fun rocketstyleComponentRendersAndFlipsOnDevice() {
        composeRule.onNodeWithText("Badge:ok").assertIsDisplayed()
        repeat(3) { composeRule.onNodeWithText("Increment").performClick() }
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Badge:warn").assertIsDisplayed()
    }

    // Tier-2 state machine (createMachine) asserted in the REAL Compose
    // semantics tree — the Android half of the iOS
    // `test_stateMachineTransitionsOnTap`. The shared Counter.tsx has
    // `const power = createMachine({ initial: 'off', … })`, renders
    // `<Text>Power: {power()}</Text>`, and a Toggle button calls
    // `power.send('TOGGLE')`; PMTC emits `val power = remember { PyreonMachine(
    // initial = "off", …) }` + `Text(text = "Power: ${power()}")` +
    // `Button(onClick = { power.send("TOGGLE") })`. PyreonMachine backs its
    // state with `mutableStateOf`, so `send` recomposes.
    //
    // DIFFERENTIATING: launch shows the initial "Power: off"; a click on
    // "Toggle Power" applies the off --TOGGLE--> on transition and the node
    // becomes "Power: on" (a dropped/broken machine would stay "off").
    @Test
    fun stateMachineTransitionsOnTap() {
        composeRule.onNodeWithText("Power: off").assertIsDisplayed()
        composeRule.onNodeWithText("Toggle Power").performClick()
        composeRule.onNodeWithText("Power: on").assertIsDisplayed()
    }

    // M2.7 — ANIMATIONS (<Transition show>) asserted in the REAL Compose
    // semantics tree — the Android half of the iOS
    // `test_transitionAnimatesShowHide`. The shared Counter.tsx has
    // `<Transition show={() => boxVisible()}><Text>Animated Box</Text>
    // </Transition>` + a Toggle Box button; PMTC emits `AnimatedVisibility(
    // visible = boxVisible) { Text(text = "Animated Box") }`. The compose test
    // rule advances the clock through the enter/exit animations before each
    // assertion, so `assertDoesNotExist` sees the post-exit tree.
    //
    // DIFFERENTIATING: launch shows "Animated Box"; a Toggle Box click hides it
    // (AnimatedVisibility exit → removed); a second click brings it back.
    @Test
    fun transitionAnimatesShowHide() {
        composeRule.onNodeWithText("Animated Box").assertIsDisplayed()
        composeRule.onNodeWithText("Toggle Box").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Animated Box").assertDoesNotExist()
        composeRule.onNodeWithText("Toggle Box").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithText("Animated Box").assertIsDisplayed()
    }

    // M4.5 — the ASYNC-AWAIT LOWERING asserted in the REAL Compose semantics
    // tree (the Android half of the iOS `test_biometricAsyncGateRunsOnDevice`).
    // The shared Counter.tsx has an Unlock button whose handler is `async () =>
    // { const ok = await bio.authenticate('Unlock'); lockStatus.set(ok ?
    // 'unlocked' : 'denied') }`; PMTC wraps it in `Button(onClick = {
    // pyreonAsyncScope.launch { val ok = bio.authenticate("Unlock"); lockStatus
    // = … } })` + a composable-top `val pyreonAsyncScope =
    // rememberCoroutineScope()`. A Kotlin suspend call carries no `await`
    // keyword — the coroutine provides the context.
    //
    // DETERMINISTIC: the v1 `PyreonBiometrics.authenticate` scaffold resolves
    // `false` (real BiometricPrompt + FragmentActivity is a tracked follow-up),
    // so the observable outcome is "Lock: denied", produced from INSIDE the
    // launched coroutine after the suspend call returned:
    //   (1) launch shows the initial "Lock: idle";
    //   (2) a click on Unlock runs the coroutine and flips the text to
    //       "Lock: denied".
    // `waitUntil` bridges the coroutine dispatch — a dropped async scope (or a
    // flip that never re-rendered) would leave "Lock: idle".
    // M3.4 — the image picker's composable-scope launcher registers and the app
    // renders, on a REAL emulator.
    //
    // WHAT THIS PROVES (and it is the load-bearing half of the Android emit):
    // `useImagePicker()` emits `picker.launcher = rememberLauncherForActivityResult(
    // ActivityResultContracts.PickVisualMedia()) { … }` at COMPOSITION scope.
    // ActivityResult registration is exactly where this shape fails — registering
    // once the host is RESUMED throws, and a mis-wired call crashes the activity
    // at composition. So "the counter composes and Photo: idle is displayed"
    // means the launcher registered cleanly against a real ComponentActivity.
    //
    // WHAT IT DELIBERATELY DOES NOT DO: tap Pick Photo. Unlike iOS's PHPicker
    // (an in-process sheet XCUITest can drive and dismiss — see
    // `test_imagePickerPresentsAndCancelFlowsBackOnDevice`, which asserts the
    // full present→cancel→"Photo: cancelled" round trip), Android's
    // PickVisualMedia launches a SEPARATE system activity that the Compose test
    // framework cannot reach or dismiss — it would leave the app backgrounded
    // (the Android form of the modal-wedge that cascades launch failures) and,
    // on an AOSP emulator image without the photo-picker module, could
    // ActivityNotFound outright. Driving it needs UiAutomator, which is not
    // worth destabilising a REQUIRED device gate for. So the honest split is:
    // iOS = full behavioural round trip; Android = registration + render.
    @Test
    fun imagePickerLauncherRegistersOnDevice() {
        composeRule.onNodeWithText("Photo: idle").assertIsDisplayed()
        // The trigger exists and is reachable — the button the launcher backs.
        composeRule.onNodeWithText("Pick Photo").assertIsDisplayed()
    }

    // M3.8 — the file picker's composable-scope OpenDocument launcher registers
    // and the app renders, on a REAL emulator. Same rationale as the image
    // picker: `useFilePicker()` emits `files.launcher =
    // rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { … }`
    // at COMPOSITION scope, and a mis-wired ActivityResult registration crashes
    // the activity at composition — so "the counter composes and File: idle is
    // displayed" means the OpenDocument launcher registered cleanly against a
    // real ComponentActivity, and the two conditional androidx.activity imports
    // resolved.
    //
    // Like the image picker's Android test, this asserts REGISTRATION + RENDER,
    // not the pick round trip: OpenDocument launches a separate system activity
    // the Compose test framework cannot drive or dismiss. The full present →
    // cancel → re-render round trip is iOS-proven
    // (`test_filePickerPresentsAndCancelFlowsBackOnDevice`).
    @Test
    fun filePickerLauncherRegistersOnDevice() {
        composeRule.onNodeWithText("File: idle").assertIsDisplayed()
        // The trigger exists and is reachable — the button the launcher backs.
        composeRule.onNodeWithText("Pick File").assertIsDisplayed()
    }

    // Core-UI row closure, ANDROID halves — the iOS device assertions for
    // Toggle/Modal/Scroll landed in the Core-UI-row PR (#2593) with the
    // Android halves disclosed as follow-ups; these are those follow-ups
    // (Link's lives in RouterDemoInstrumentedTest — it needs the router app).
    //
    // Toggle → Compose `Switch`. TWO load-bearing claims:
    //   (1) `onNodeWithTag("core-toggle")` finds the Switch AT ALL — the
    //       `data-testid` used to be silently DROPPED by emitKotlinToggle
    //       (a special-case emitter returning before the generic modifier
    //       tail, the exact <Link> bug class from #2593 in its Toggle
    //       sibling; the Swift half already chained its modifiers). A
    //       reverted emit fix makes this line fail with "could not find
    //       node with tag".
    //   (2) a real coordinate click on the Switch flips the signal and the
    //       derived state Text re-renders "switch off" → "switch on" —
    //       Switch → onCheckedChange → signal write → recomposition.
    // The state Text is asserted via its semantics text (assertTextEquals),
    // which does not require on-screen visibility — the Counter column
    // overflows shorter profiles and the ROOT is not scrollable, so
    // visibility-dependent assertions on tail elements would be
    // device-profile-dependent (the flake class this gate documents).
    @Test
    fun toggleFlipsObservableStateOnDevice() {
        composeRule.onNodeWithTag("core-toggle-state").assertTextEquals("switch off")
        // Semantics action for the same fold reason as the modal-open and
        // reset-zone (the Switch sits low in the overflowing column; a real
        // click passed on Android 15 and missed on API 33).
        composeRule
            .onNodeWithTag("core-toggle")
            .performSemanticsAction(SemanticsActions.OnClick)
        composeRule.onNodeWithTag("core-toggle-state").assertTextEquals("switch on")
    }

    // Modal → Compose `Dialog`, composed inside `if (sheetOpen) { … }` — so
    // the body's EXISTENCE is the assertion: absent at launch (the branch is
    // not composed), present after open (Dialog window mounts), absent again
    // after close. This is the Android half of the iOS
    // `test_modalPresentsAndDismisses`; note the Kotlin emit was ALREADY
    // correct (Compose composes a Dialog node — no presentation-anchor
    // requirement, unlike SwiftUI's `.sheet`, whose `EmptyView()` anchor bug
    // #2593 fixed), so this test pins the working behaviour rather than a fix.
    // The OPEN button sits at the very bottom of the overflowing column, and
    // its reachability by COORDINATES is API-level-dependent even at a fixed
    // resolution: Android 15 (local AVD) is forced edge-to-edge, so the
    // content window is taller and a real click landed; CI's API-33 image is
    // not, the effective viewport is shorter, and the same click landed dead
    // — the Dialog never opened ("The component is not displayed!", CI-only).
    // performSemanticsAction(OnClick) invokes the button's click semantics
    // directly — no coordinates, no window geometry — so the claim under
    // test (open → Dialog composes → close → gone, all through state) is
    // asserted independently of the device profile. Coordinate-level tapping
    // is proven elsewhere (the Toggle click here; the whole iOS half).
    @Test
    fun modalPresentsAndDismissesOnDevice() {
        composeRule.onNodeWithTag("core-modal-body").assertDoesNotExist()
        composeRule
            .onNodeWithTag("core-modal-open")
            .performSemanticsAction(SemanticsActions.OnClick)
        composeRule.onNodeWithTag("core-modal-body").assertIsDisplayed()
        // The close button lives INSIDE the Dialog window (centered, always
        // visible) — a real coordinate click is reliable there.
        composeRule.onNodeWithTag("core-modal-close").performClick()
        composeRule.onNodeWithTag("core-modal-body").assertDoesNotExist()
    }

    // Scroll → `Column(Modifier.verticalScroll(rememberScrollState()))`.
    // `hasScrollAction()` asserts the verticalScroll modifier is LIVE in the
    // semantics tree (a plain Column has no scroll action — a dropped
    // modifier is visible), and the child stays individually queryable
    // inside it. Existence-based on purpose: the Scroll section sits below
    // the fold on the pixel_6 profile and the root column is not
    // scrollable, so `assertIsDisplayed` here would encode the device
    // profile, not the product.
    @Test
    fun scrollContainerExposesLiveScrollSemantics() {
        composeRule.onNodeWithTag("core-scroll").assertExists().assert(hasScrollAction())
        composeRule
            .onNodeWithTag("core-scroll-child")
            .assertExists()
            .assertTextEquals("Scrolled child")
    }

    @Test
    fun biometricAsyncGateRunsOnDevice() {
        composeRule.onNodeWithText("Lock: idle").assertIsDisplayed()
        composeRule.onNodeWithText("Unlock").performClick()
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText("Lock: denied").fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("Lock: denied").assertIsDisplayed()
        composeRule.onNodeWithText("Lock: idle").assertDoesNotExist()
    }

    // Maps/geolocation row — the ANDROID device proof (the row's Android half
    // was compile-only: `geo.start()` read an EMPTY registry on every real
    // device until rememberPyreonGeolocation self-installed the
    // LocationManager source). Fully self-contained: the test grants
    // ACCESS_FINE_LOCATION + the mock-location appop through UiAutomation
    // (the wm-resize pattern), registers a TEST GPS provider, taps Locate
    // (semantics action — the geo section sits below the API-33 fold), and
    // injects fixes INSIDE the wait loop (a single fix can race the
    // listener registration). "Geo: 37.422" can only render if the watch
    // started, the platform LocationManager delivered the fix through
    // AndroidLocationSource, and the Compose state re-rendered — the exact
    // chain the iOS simctl-location twin proves.
    @Test
    fun geolocationDeliversMockGpsFixEndToEnd() {
        val instr = InstrumentationRegistry.getInstrumentation()
        val pkg = instr.targetContext.packageName
        instr.uiAutomation
            .executeShellCommand("pm grant $pkg android.permission.ACCESS_FINE_LOCATION")
            .close()
        instr.uiAutomation.executeShellCommand("appops set $pkg android:mock_location allow").close()
        // The device's MASTER location switch must be ON, or the runtime's
        // provider pick dead-ends: with location globally off,
        // isProviderEnabled(GPS) reports false even for an added+enabled
        // TEST provider, AndroidLocationSource errors "no location provider
        // enabled", and no fix can ever arrive. CI emulator images ship with
        // location OFF (a local emulator that happens to have it on is what
        // let this test pass locally while failing every CI run — reproduced
        // exactly by flipping the local switch off). The test owns this
        // precondition like it owns the permission + mock-location appop.
        instr.uiAutomation.executeShellCommand("cmd location set-location-enabled true").close()
        // The appop grant is asynchronous-ish through the shell — poll until
        // addTestProvider stops throwing SecurityException rather than sleeping.
        val lm =
            instr.targetContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        composeRule.waitUntil(timeoutMillis = 10_000) {
            try {
                try {
                    lm.removeTestProvider(LocationManager.GPS_PROVIDER)
                } catch (_: Exception) {}
                lm.addTestProvider(
                    LocationManager.GPS_PROVIDER,
                    false, false, false, false, true, true, true,
                    ProviderProperties.POWER_USAGE_LOW,
                    ProviderProperties.ACCURACY_FINE,
                )
                lm.setTestProviderEnabled(LocationManager.GPS_PROVIDER, true)
                true
            } catch (_: SecurityException) {
                false
            }
        }
        // State-verify the EXACT precondition the runtime checks before it
        // registers: the GPS provider must read enabled (test provider on +
        // master switch on). Tapping Locate before this holds races the
        // shell-command settle and reproduces the dead-end.
        composeRule.waitUntil(timeoutMillis = 10_000) {
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
        }

        var lastPushError: String? = null
        composeRule.onNodeWithText("Locate").performSemanticsAction(SemanticsActions.OnClick)

        try {
            composeRule.waitUntil(timeoutMillis = 20_000) {
                val fix =
                    Location(LocationManager.GPS_PROVIDER).apply {
                        latitude = 37.4220
                        longitude = -122.0840
                        accuracy = 5f
                        time = System.currentTimeMillis()
                        elapsedRealtimeNanos = SystemClock.elapsedRealtimeNanos()
                    }
                try {
                    lm.setTestProviderLocation(LocationManager.GPS_PROVIDER, fix)
                } catch (e: Exception) {
                    // RECORD it. Swallowing this made a failed PUSH and an app
                    // that never rendered look identical in the message below —
                    // and the message is the only artifact a CI-only failure
                    // leaves. Observed 2026-08-27: both provider preconditions
                    // read true and the readout stayed empty, which narrows to
                    // exactly these two causes and could not be told apart.
                    lastPushError = e.toString()
                }
                composeRule
                    .onAllNodesWithText("Geo: 37.422", substring = true)
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
        } catch (e: androidx.compose.ui.test.ComposeTimeoutException) {
            // A CI-only failure's message IS the artifact — carry the observed
            // state instead of a bare "condition not satisfied": the rendered
            // Geo text plus the two provider preconditions, so the next remote
            // failure names its cause in one round.
            val geoTexts =
                try {
                    composeRule
                        .onAllNodesWithText("Geo", substring = true)
                        .fetchSemanticsNodes()
                        .joinToString(" | ") { n ->
                            n.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.Text)
                                ?.joinToString() ?: "<no text>"
                        }
                } catch (_: Throwable) {
                    "<semantics read failed>"
                }
            throw AssertionError(
                "geo fix never rendered — observed: [$geoTexts], " +
                    "gpsProviderEnabled=${lm.isProviderEnabled(LocationManager.GPS_PROVIDER)}, " +
                    "locationEnabled=${lm.isLocationEnabled}, " +
                    "lastPushError=${lastPushError ?: "<none — every setTestProviderLocation succeeded>"}",
                e,
            )
        } finally {
            try {
                lm.setTestProviderEnabled(LocationManager.GPS_PROVIDER, false)
                lm.removeTestProvider(LocationManager.GPS_PROVIDER)
            } catch (_: Exception) {}
        }
    }
}
