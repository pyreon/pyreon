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

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.test.ext.junit.runners.AndroidJUnit4
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

        composeRule.onNodeWithTag("reset-zone").performTouchInput { longClick() }

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
    @Test
    fun i18nTranslatedStringRendersConfiguredLocale() {
        composeRule.onNodeWithText("Greeting: Hallo!").assertIsDisplayed()
    }

    // Dark mode (useColorScheme) asserted in the REAL Compose semantics tree —
    // the Android half of the iOS `test_colorSchemeReadsLightAppearance`. The
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
}
