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
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
}
