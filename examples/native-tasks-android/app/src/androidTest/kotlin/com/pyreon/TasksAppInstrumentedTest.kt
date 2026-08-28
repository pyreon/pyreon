// TasksAppInstrumentedTest — launch + auth-gate + store mutation +
// typed-params smoke for the Android tasks showcase. Mirror of:
//   - iOS:     `native-tasks-ios/iosUITests/PyreonTasksUITests.swift`
//   - Counter: `native-counter-android/.../CounterInstrumentedTest.kt` (#1454)
//   - Router:  `native-router-demo-android/.../RouterDemoInstrumentedTest.kt` (#1455)
//
// Proves at real-Emulator scope, against the STORE-BACKED TasksApp
// source (Gap 4 closure — see the header of
// `../native-tasks/src/TasksApp.tsx`):
//
//   - App launches → login page renders
//   - Typing a username + Continue flips the store's auth flag and
//     navigates to /tasks — the per-route `beforeEnter` guard reads
//     the SAME `mutableStateOf`-backed store object and admits the route
//   - Typing a title + Add appends to the STORE's task list (cross-
//     screen state — the exact thing `rememberPyreonStorage` could NOT
//     provide, being per-composable) and the keyed list re-renders
//   - "Open task 1" navigates to /tasks/:id — typed-params route:
//     the dispatcher constructs `TaskDetailPageParam(id = ...)` from
//     the matched segment (also auth-gated)
//   - "Back to tasks" returns, "Logout" flips the flag back and lands
//     on /login — the gate re-engages
//
// data-testid attrs in the SHARED `../native-tasks/src/TasksApp.tsx`
// compile to `Modifier.testTag(...)` on the Compose node; this test
// queries via `onNodeWithTag(...)`.
//
// Status: advisory CI gate. Runs on the `native-device`-labelled PR
// path + nightly schedule via the Android Emulator runner action.

package com.pyreon

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.pyreon.runtime.PyreonToast
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TasksAppInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    /**
     * Turn OFF the toast auto-dismiss for the duration of the test.
     *
     * `PyreonToast.add` schedules its dismissal as `scope.launch { delay(ttl) }`
     * on `Dispatchers.Main` — a pending main-thread coroutine, which is exactly
     * what Compose's `waitForIdle` waits on. Every action after a toast
     * (`performClick`, `performScrollTo`, `assertTextEquals` — they all sync on
     * idle) therefore blocks until that delay resolves. This screen toasts on
     * schema-submit and on save, in the middle of a long interaction sequence.
     *
     * `0` means "keep until dismissed", which the runtime already supports and
     * which is a TEST-ENVIRONMENT control rather than a product change: a 4s
     * auto-dismiss is correct for a user and is only a hazard against a harness
     * that synchronises on main-thread quiescence.
     *
     * Stated honestly: this removes a known hazard of exactly the shape that
     * produced `ComposeTimeoutException after 10000 ms` (Compose's default
     * `waitForIdle` budget — every explicit wait in this file is 15s or 20s, so
     * the timeout was an internal idle-sync, not one of ours). It is NOT
     * confirmed to be that failure's cause; the diagnostic below exists so the
     * next occurrence says which node and what the tree looked like, instead of
     * costing another round of guessing.
     */
    @Before
    fun disableToastAutoDismiss() {
        PyreonToast.defaultDurationMillis = 0
    }

    /**
     * Post-click text assertions on the toolkit screen race state that
     * crosses an async boundary Compose's idle-sync does not track — the
     * Pyreon runtime's dispatch, the router-driven url-state write (which
     * briefly remounts the page, so the node can be ABSENT, not just
     * stale), and the live WebView on this same screen keeping the frame
     * clock busy. Poll tag+text the same way the fetch/bridge waits above
     * do, then assert once so a real failure still reads well.
     *
     * Round-5 lesson: the first CI run raced the machine toggle
     * ("on"), the rerun got further and raced the url-state write
     * ("done", toolkit-filter not found mid-remount) — one class, two
     * lines. Fix the class, not the line.
     */
    private fun waitForTagText(tag: String, text: String) {
        try {
            composeRule.waitUntil(timeoutMillis = 20_000) {
                composeRule
                    .onAllNodes(hasTestTag(tag) and hasText(text))
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
        } catch (e: Throwable) {
            // A CI-only failure's MESSAGE is the whole artifact. Compose gives
            // `ComposeTimeoutException: Condition still not satisfied after N ms`
            // and nothing else — not which tag, not what the node held instead,
            // not whether it existed at all. That is one round of guessing per
            // occurrence, and this screen has already spent several.
            throw AssertionError(describeTimeout(tag, text), e)
        }
        composeRule.onNodeWithTag(tag).assertTextEquals(text)
    }

    /**
     * What the tree actually looked like when a wait gave up. Built ONLY on the
     * failure path — the polling path runs every few milliseconds and a snapshot
     * there would cost something for nothing.
     *
     * Every read is individually guarded: a describe that throws while building
     * a failure message replaces a diagnosable timeout with an opaque one, which
     * is the exact failure being fixed.
     */
    private fun describeTimeout(tag: String, expected: String): String {
        val found =
            try {
                val nodes = composeRule.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes()
                when {
                    nodes.isEmpty() -> "NO node with that tag exists (mid-remount, or never rendered)"
                    else -> "node exists, holding: " + nodes.joinToString(" | ") { n ->
                        try {
                            n.config.toString().take(160)
                        } catch (_: Throwable) {
                            "<unreadable>"
                        }
                    }
                }
            } catch (_: Throwable) {
                "<could not read the semantics tree>"
            }
        // WHERE we are, not just what is missing. "NO node with that tag" has two
        // very different causes — the page is mid-remount, or we are not on that
        // page at all — and they need opposite fixes. A landmark tag from the
        // same screen separates them in one line, which is one CI round instead
        // of a guess.
        val onPage =
            try {
                val n = composeRule.onAllNodesWithTag("toolkit-page").fetchSemanticsNodes().size
                if (n > 0) "still on the toolkit page" else "NOT on the toolkit page — navigated away"
            } catch (_: Throwable) {
                "<could not probe the page landmark>"
            }
        return "waitForTagText timed out: tag='$tag' expected='$expected' — $found ($onPage)"
    }

    @Test
    fun appLaunchesOnLoginPage() {
        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()

        // Asset-pipeline arc: the branded header resolves through
        // pyreonDrawable("pyreon-logo") → res/drawable-*/pyreon_logo.png
        // (materialized by scripts/build.sh). A missing resource throws
        // inside pyreonDrawable with an actionable message, which fails
        // this assert via the composition error.
        composeRule
            .onNodeWithTag("brand-logo")
            .assertIsDisplayed()

        // Font-pipeline arc (PR-1.4): the title uses the bundled Brand
        // font via pyreonFont("brand") → res/font/brand.ttf. pyreonFont
        // THROWS when the resource is missing, so a rendered node proves
        // the font materialized + loaded.
        composeRule
            .onNodeWithTag("brand-title")
            .assertIsDisplayed()
    }

    @Test
    fun authGateStoreMutationAndTypedParamsDetail() {
        // Phase 1: login — flips the store's auth flag; the beforeEnter
        // guard on /tasks reads it and admits the navigation.
        composeRule
            .onNodeWithTag("login-username")
            .performTextInput("ab")

        // Phase 1a: the ERROR path — "ab" fails the min-3 validator:
        // the error renders, navigation is blocked (device-scope proof
        // of the form-binding arc).
        composeRule
            .onNodeWithTag("login-submit")
            .performClick()

        composeRule
            .onNodeWithTag("login-error")
            .assertIsDisplayed()

        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()

        // Phase 1b: more characters fix the field (setValue
        // re-validates after an error) and submit passes the gate.
        composeRule
            .onNodeWithTag("login-username")
            .performTextInput("cde")

        composeRule
            .onNodeWithTag("login-submit")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Icon-mapping arc (PR-1.3): the header's canonical
        // <Icon name="star"> references Icons.Filled.Star at compile
        // time (material-icons-core).
        composeRule
            .onNodeWithTag("header-icon")
            .assertIsDisplayed()

        // Phase 2: add a task — proves the STORE list mutation
        // (.set spread-append on the mutableStateOf-backed object)
        // re-renders the keyed list.
        composeRule
            .onNodeWithTag("new-task-title")
            .performTextInput("Verify on the emulator")

        composeRule
            .onNodeWithTag("new-task-add")
            .performClick()

        composeRule
            .onNodeWithText("Verify on the emulator")
            .assertIsDisplayed()

        // Phase 3: typed-params route — /tasks/1 constructs
        // TaskDetailPageParam(id = "1") in the dispatcher (auth-gated).
        composeRule
            .onNodeWithTag("tasks-open-first")
            .performClick()

        composeRule
            .onNodeWithTag("task-detail-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithText("Viewing task 1")
            .assertIsDisplayed()

        // Phase 4: back to the list.
        composeRule
            .onNodeWithTag("detail-back")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 5: networked fetch (the fetch-arc device proof) — the
        // quotes screen runs useFetch<Quote[]> through the emitted
        // LaunchedEffect + kotlinx-serialization harness against the
        // CI fixture server (http://127.0.0.1:8787, reverse-forwarded
        // into the emulator via `adb reverse`; cleartext allowed for
        // loopback only by the network security config). Asserted BY
        // CONTENT so a 200-with-wrong-body can't pass. waitUntil
        // because the request crosses a real network hop — Compose's
        // idle-sync does NOT cover URLSession-style background work.
        composeRule
            .onNodeWithTag("tasks-quotes")
            .performClick()

        composeRule
            .onNodeWithTag("quotes-page")
            .assertIsDisplayed()

        try {
            composeRule.waitUntil(timeoutMillis = 20_000) {
                composeRule
                    .onAllNodesWithText("Make it work, make it right, make it fast.")
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
        } catch (t: androidx.compose.ui.test.ComposeTimeoutException) {
            // Surface the APP-SIDE failure: the quotes screen renders its
            // fetch error (quotes-error testid), so a reject()-ed request
            // names its exception in the test failure instead of an
            // opaque 20s timeout (round-4 lesson: server + adb reverse
            // were both fine and the failure was invisible from outside).
            val errNodes = composeRule
                .onAllNodesWithTag("quotes-error")
                .fetchSemanticsNodes()
            val detail = if (errNodes.isEmpty()) {
                "no quotes-error node — fetch still pending (request never settled)"
            } else {
                errNodes[0].config.toString()
            }
            throw AssertionError(
                "Quotes fetch did not render within 20s — app-side state: " + detail,
                t,
            )
        }

        composeRule
            .onNodeWithTag("quotes-back")
            .performClick()

        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Vocabulary-completion proof: Scroll (verticalScroll) + remote
        // Image (Coil AsyncImage over the fixture server) + Modal
        // (Dialog) — the three primitives whose androidx imports were
        // stub-masked until this screen. A missing import fails the
        // gradle build (this test can't run); a rendered node proves the
        // import + render.
        composeRule
            .onNodeWithTag("tasks-vocab")
            .performClick()

        composeRule
            .onNodeWithTag("vocab-page")
            .assertIsDisplayed()

        composeRule
            .onNodeWithTag("vocab-remote-img")
            .assertIsDisplayed()

        composeRule
            .onNodeWithTag("vocab-open-modal")
            .performClick()

        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule
                .onAllNodesWithTag("vocab-modal-text")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Dismiss the Dialog (it's modal — leaving it open blocks every
        // tap behind it, incl. the logout below) and return to tasks.
        composeRule
            .onNodeWithTag("vocab-close-modal")
            .performClick()
        composeRule
            .onNodeWithTag("vocab-back")
            .performClick()
        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 5.5: lifecycle (Phase 2 real-semantics proof). The
        // ErrorBoundary wraps a fetch to a MISSING path → rejects →
        // hasError true → fallback renders. waitUntil because the fetch
        // crosses a real network hop.
        composeRule
            .onNodeWithTag("tasks-lifecycle")
            .performClick()
        composeRule
            .onNodeWithTag("lifecycle-page")
            .assertIsDisplayed()
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule
                .onAllNodesWithTag("lc-error")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule
            .onNodeWithTag("lifecycle-back")
            .performClick()
        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 5.6: stats — the 2026-07 P1-sprint vocabulary in one page
        // (Object.keys/values over a declared struct, seeded reduce, Double
        // division, the filter-map flatMap idiom, a 2-param indexed filter
        // with Int×Double coercion, an identity-keyed <For> over strings —
        // key = { it }, the For-by fix this page surfaced). Int-derived
        // texts asserted exactly; Double TEXT deliberately not (Swift and
        // Kotlin stringify Doubles differently) — the average node
        // existing at all proves the Double pipeline.
        composeRule
            .onNodeWithTag("tasks-stats")
            .performClick()
        composeRule
            .onNodeWithTag("stats-page")
            .assertIsDisplayed()
        composeRule
            .onNodeWithTag("stats-total")
            .assertTextEquals("247")
        composeRule
            .onNodeWithTag("stats-high")
            .assertTextEquals("2")
        composeRule
            .onNodeWithTag("stats-average")
            .assertIsDisplayed()
        composeRule
            .onNodeWithTag("stats-back")
            .performClick()
        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 5b: the TOOLKIT screen — where eleven previously snippet-only
        // packages actually run. The web e2e asserts the same values in a
        // browser; this is the Android half. Until it existed the screen was
        // COMPILE-proven on device and nothing more.
        //
        // Values, not existence: a permissions container that wrongly denies
        // renders "false", which is displayed just as happily as "true".
        composeRule
            .onNodeWithTag("tasks-toolkit")
            .performClick()

        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule
                .onAllNodesWithTag("toolkit-page")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule
            .onNodeWithTag("toolkit-page")
            .assertIsDisplayed()

        // i18n: the TRANSLATED title. A missing catalogue renders the key.
        composeRule
            .onNodeWithTag("toolkit-title")
            .assertTextEquals("Toolkit")
        // url-state: the default reaches the view through the router's query.
        composeRule
            .onNodeWithTag("toolkit-filter")
            .assertTextEquals("all")
        // permissions: seeded with tasks.write, so the check GRANTS.
        composeRule
            .onNodeWithTag("toolkit-perm")
            .assertTextEquals("true")
        // table: one row at pageSize 10 is exactly one page.
        composeRule
            .onNodeWithTag("toolkit-tablepages")
            .assertTextEquals("1")
        // rx: [1,2,3,4] -> evens -> doubled, so a length of 2.
        composeRule
            .onNodeWithTag("toolkit-evens")
            .assertTextEquals("2")
        // state-tree: the model's declared default.
        composeRule
            .onNodeWithTag("toolkit-pagesize")
            .assertTextEquals("20")

        // ui-system: styler + elements lower to native view modifiers. The
        // styling is not assertable through the semantics tree, so assert what
        // is — that each styled wrapper renders its CHILDREN. The web e2e
        // asserts the computed CSS, which only a browser can see.
        composeRule.onNodeWithTag("toolkit-card-text").assertIsDisplayed()
        composeRule.onNodeWithTag("toolkit-rocket-text").assertIsDisplayed()
        composeRule.onNodeWithTag("toolkit-el-a").assertIsDisplayed()
        composeRule.onNodeWithTag("toolkit-el-b").assertIsDisplayed()

        // attrs + coolgrid: structural wrappers, so what the semantics tree can
        // see is that each renders its leaf. The web e2e asserts attrs' baked
        // `gap` default, which needs a computed style.
        composeRule.onNodeWithTag("toolkit-attrs-text").assertIsDisplayed()
        composeRule.onNodeWithTag("toolkit-grid-cell").assertIsDisplayed()
        // hotkeys: the counter renders at its initial value. The PRESS is not
        // asserted here — the focused key handler needs a hardware keyboard the
        // emulator has no reliable way to drive, so the web e2e owns that half.
        composeRule.onNodeWithTag("toolkit-hotkey").assertTextEquals("0")

        // validation: the schema-driven form. `isValid` derives from errors and
        // an untouched field has none, so submit is what runs the schema.
        composeRule.onNodeWithTag("toolkit-schema-name").performScrollTo().performTextInput("ab")
        composeRule.onNodeWithTag("toolkit-schema-submit").performScrollTo().performClick()
        waitForTagText("toolkit-schema-valid", "false")

        // WebView bridge — mirror of the iOS assertion. The hosted page echoes
        // the host-pushed `__pyreonData` back, so both directions land in a
        // native Text the semantics tree can read; asserting inside the WebView
        // is what Compose testing cannot do.
        composeRule.waitUntil(timeoutMillis = 20_000) {
            composeRule
                .onAllNodesWithTag("toolkit-bridge")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule.onNodeWithTag("toolkit-bridge").assertTextEquals("ping")

        // machine: the declared initial state, then a transition that must
        // actually MOVE it — the initial value alone would pass against a
        // machine that ignores every event.
        composeRule
            .onNodeWithTag("toolkit-machine")
            .assertTextEquals("off")
        composeRule
            .onNodeWithTag("toolkit-machine-toggle")
            .performScrollTo()
            .performClick()
        waitForTagText("toolkit-machine", "on")
        // storage: the default, since nothing has persisted a value yet.
        composeRule
            .onNodeWithTag("toolkit-storage")
            .assertTextEquals("light")

        // url-state WRITE: flipping it must move the value, which a
        // default-only assertion cannot see.
        composeRule
            .onNodeWithTag("toolkit-filter-done")
            .performScrollTo()
            .performClick()
        waitForTagText("toolkit-filter", "done")

        composeRule
            .onNodeWithTag("toolkit-back")
            .performClick()
        composeRule
            .onNodeWithTag("tasks-page")
            .assertIsDisplayed()

        // Phase 6: logout — flips the store flag back; lands on /login.
        composeRule
            .onNodeWithTag("tasks-logout")
            .performClick()

        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule
                .onAllNodesWithTag("login-page")
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeRule
            .onNodeWithTag("login-page")
            .assertIsDisplayed()
    }
}
