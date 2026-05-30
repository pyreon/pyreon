// TodoAppInstrumentedTest — the Phase-2.2 launch-and-render smoke for
// Android. Sibling of `examples/native-todomvc-ios/iosUITests/
// PyreonTodoMVCUITests.swift`; same shape, different platform.
//
// Beyond `gradle assembleDebug` (which proves the emitted Kotlin
// compiles + links against real Compose), this asserts the app
// actually LAUNCHES on a real Android Emulator and the root Composable
// RENDERS. The structural proof for the Android arc of "one .tsx →
// runs on Android".
//
// What it asserts:
//   - MainActivity hosts the @Composable TodoApp() (from the emitted
//     `com.pyreon.generated`).
//   - The node tagged "todo-app" exists in the composition tree.
//     PMTC emits that testTag from the canonical
//     `<Stack data-testid="todo-app">` in the SHARED `src/TodoApp.tsx`
//     (see emit-kotlin.ts: `data-testid` → `Modifier.testTag(...)`).
//
// `createAndroidComposeRule<MainActivity>()` boots the activity and
// drives the composition; `onNodeWithTag` queries the test tag.
// `useUnmergedTree = true` is intentionally NOT set — `todo-app` is
// on the ROOT Stack, which always survives Compose's semantic
// tree-merging.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action,
// NOT on every PR (emulator-boot time + flake risk — same opt-in
// rationale as the iOS XCUITest). Promote to required once green
// across a few consecutive nightly runs.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TodoAppInstrumentedTest {
    // Activity-based rule — boots MainActivity (real lifecycle, real
    // Compose) instead of `setContent {}` inside the test. This proves
    // the app's ACTUAL entry point works end-to-end, not just the
    // composable in isolation.
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun appLaunchesAndRendersRootView() {
        // `assertIsDisplayed` is stronger than `assertExists` — proves
        // the node is reachable AND visually drawn on the screen, not
        // just present in the semantic tree.
        composeRule
            .onNodeWithTag("todo-app")
            .assertIsDisplayed()
    }
}
