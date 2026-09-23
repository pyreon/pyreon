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

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.swipe
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.printToString
import androidx.compose.ui.test.assertContentDescriptionContains
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.pinch
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import android.os.SystemClock
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assert
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
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
    fun shortenToastAutoDismiss() {
        // NOT 0. `PyreonToast.add` reads `if (ttl > 0)` and 0 documents as
        // "keeps it until dismissed" — so setting 0 to REMOVE the pending
        // dismissal instead makes every toast permanent, and a permanent toast
        // is its own Compose window. I set 0 here on an explicitly unconfirmed
        // theory and it was the opposite of the intent; read the API before
        // configuring it.
        //
        // 1ms keeps the goal (no multi-second `delay` for `waitForIdle` to sit
        // behind) without leaving anything on screen.
        PyreonToast.defaultDurationMillis = 1
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
    /**
     * Tap the hosted flow at the centre of its LAYOUT. `performTouchInput`'s
     * `center` is the centre of the VISIBLE part, so a WebView only partly on
     * screen after `performScrollTo` took the tap in its top strip, missing the
     * fitted graph. Scrolling to the button right below brings the whole WebView
     * on screen first.
     */
    private fun tapFlowWebViewCentre() {
        composeRule.onNodeWithTag("gal-flow-webview-fit").performScrollTo()
        val info = composeRule.onNodeWithTag("gal-flow-webview").fetchSemanticsNode().layoutInfo
        val origin = info.coordinates.positionInRoot()
        val target = Offset(origin.x + info.width / 2f, origin.y + info.height / 2f)
        composeRule.onRoot().performTouchInput { click(target) }
    }

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
    /**
     * The tag set as of the last [snapshotTags] call.
     *
     * A timeout tells you what is on screen NOW. It cannot tell you whether the
     * screen was ever right, and those need opposite investigations: an action
     * that destroyed the page, versus a page that never rendered. Two rounds of
     * this failure were spent inferring between them from the after-state
     * alone.
     */
    private var tagsBefore: List<String> = emptyList()

    private fun snapshotTags() {
        tagsBefore = tagsIn(useUnmergedTree = false)
    }

    /** Every test tag currently in the semantics tree, one flavour of it. */
    private fun tagsIn(useUnmergedTree: Boolean): List<String> =
        try {
            composeRule
                .onAllNodes(
                    SemanticsMatcher.keyIsDefined(SemanticsProperties.TestTag),
                    useUnmergedTree = useUnmergedTree,
                )
                .fetchSemanticsNodes()
                .mapNotNull { n ->
                    try {
                        n.config[SemanticsProperties.TestTag]
                    } catch (_: Throwable) {
                        null
                    }
                }
                .distinct()
                .sorted()
        } catch (_: Throwable) {
            emptyList()
        }

    /**
     * `assertIsDisplayed()` fails with "The component with TestTag = 'x' is not
     * displayed!" and nothing else — not where in the flow, not what was on
     * screen instead. Gradle's console output truncates the stack to the Compose
     * frame, so a CI-only failure cannot even be traced back to a call site:
     * this file has TEN `tasks-page` assertions and the report names none of
     * them. Two rounds were spent not knowing which one fired.
     *
     * So carry the evidence in the message. The decisive part is whatever the
     * ROUTER rendered: "access denied to /tasks" (the guard read isAuthed as
     * false) and "no route for /tasks" (no dispatch branch matched) need
     * opposite fixes, and a bare not-displayed is identical for both — and for
     * a third case where the screen simply never recomposed.
     */
    /** The text a tagged node shows right now — for before/after comparisons. */
    private fun textOf(tag: String): String =
        composeRule.onNodeWithTag(tag).fetchSemanticsNode().config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text } ?: ""

    private fun assertTagDisplayed(tag: String, where: String) {
        try {
            // WAIT first, exactly as the pre-helper assertions did
            // (`waitUntil(15_000) { onAllNodesWithTag(tag)… }`): a route change
            // that crosses the auth guard recomposes one frame later than the
            // click on a loaded emulator, and an INSTANT assertIsDisplayed fires
            // in that gap — reported as "the screen simply never recomposed",
            // which is indistinguishable from the real bug it exists to catch.
            composeRule.waitUntil(timeoutMillis = 15_000) {
                composeRule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()
            }
            composeRule.onNodeWithTag(tag).assertIsDisplayed()
        } catch (e: Throwable) {
            // `n.config.toString()` rather than a typed read: `describeTimeout`
            // above already reads it this way, so this stays on a construct this
            // file has compiled before — the whole point being that a diagnostic
            // must not be the thing that breaks the build. (`getOrNull` DOES
            // exist — `androidx.compose.ui.semantics.getOrNull`, imported above —
            // the earlier claim here that it did not is what caused the
            // router-demo compile error.)
            val routerText =
                try {
                    val nodes =
                        composeRule
                            .onAllNodes(hasText("Pyreon Router:", substring = true))
                            .fetchSemanticsNodes()
                    if (nodes.isEmpty()) {
                        "nothing — the router rendered no fallback"
                    } else {
                        nodes.joinToString(" | ") { n ->
                            try {
                                n.config.toString().take(200)
                            } catch (_: Throwable) {
                                "<unreadable>"
                            }
                        }
                    }
                } catch (_: Throwable) {
                    "<could not read the semantics tree>"
                }
            val tags = tagsIn(useUnmergedTree = false)
            throw AssertionError(
                "AT: " + where +
                    " | tag='" + tag + "' not displayed" +
                    " | ROUTER SAID: " + routerText +
                    " | tags now: " +
                    (if (tags.isEmpty()) "nothing tagged" else tags.joinToString(", ")),
                e,
            )
        }
    }

    private fun describeTimeout(tag: String, expected: String): String {
        val found =
            try {
                val nodes = composeRule.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes()
                when {
                    nodes.isEmpty() -> "NO node with that tag exists (mid-remount, or never rendered)"
                    // The TEXT first: three rounds of this failure could not tell
                    // "the drag did nothing" (0) from "the tap missed" (-1) because
                    // the config dump was truncated before its text entry.
                    else -> "node exists, text=" + nodes.joinToString(" | ") { n ->
                        try {
                            val t = n.config.getOrNull(SemanticsProperties.Text)?.joinToString("") { it.text }
                            val e = n.config.getOrNull(SemanticsProperties.EditableText)?.text
                            "'" + (t ?: e ?: "<none>") + "'"
                        } catch (_: Throwable) {
                            "<unreadable>"
                        }
                    } + " size=" + nodes.joinToString(" | ") { n ->
                        try { n.size.toString() } catch (_: Throwable) { "?" }
                    } + " holding: " + nodes.joinToString(" | ") { n ->
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
        // WHERE we are, not just what is missing.
        //
        // The first version of this probed ONE landmark and, on its absence,
        // reported "navigated away". That claim is not supported by the
        // observation: a landmark is equally absent when the screen crashed
        // during recomposition, and those need opposite fixes. It sent the
        // investigation at the router for a round.
        //
        // So list the tags that ARE on screen instead of inferring from the one
        // that is not. The set names the page directly — a diagnostic should
        // report what it saw, not conclude from what it did not.
        val merged = tagsIn(useUnmergedTree = false)
        val unmerged = tagsIn(useUnmergedTree = true)
        val now =
            if (merged.isEmpty() && unmerged.isEmpty()) "NOW: nothing tagged in EITHER tree"
            else "NOW: merged[" + merged.joinToString(", ") + "] unmerged[" +
                unmerged.joinToString(", ") + "]"
        val before =
            if (tagsBefore.isEmpty()) "BEFORE: (no snapshot taken)"
            else "BEFORE: [" + tagsBefore.joinToString(", ") + "]"
        // The dump goes LAST because it is the longest field and the least
        // decisive, and the runner truncates.
        //
        // The previous version put the before-snapshot after it, and the
        // message was cut at the dump — so a whole device round produced a
        // diagnostic that stopped one line short of its own answer. Order a
        // failure message by decisiveness, not by narrative.
        val dump =
            if (merged.isNotEmpty() || unmerged.isNotEmpty()) ""
            else
                " | dump: " +
                    (try {
                        composeRule.onRoot(useUnmergedTree = true).printToString(maxDepth = 4)
                    } catch (t: Throwable) {
                        "<no root: " + t.javaClass.simpleName + ">"
                    })
                        .replace("\n", " ")
                        .take(600)
        return "waitForTagText timed out: tag='$tag' expected='$expected' | " +
            before + " | " + now + " | node: " + found + dump
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

        assertTagDisplayed("tasks-page", "after login-submit (first entry to /tasks)")

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

        assertTagDisplayed("tasks-page", "after detail-back (/tasks/1 -> /tasks)")

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

        assertTagDisplayed("tasks-page", "after quotes-back (/quotes -> /tasks)")

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
        assertTagDisplayed("tasks-page", "after vocab-back (/vocab -> /tasks)")

        // Phase 5.5: lifecycle (Phase 2 real-semantics proof). The
        // ErrorBoundary wraps a fetch to a MISSING path → rejects →
        // hasError true → fallback renders. waitUntil because the fetch
        // crosses a real network hop.
        // Flow-native proof: createFlow → PyreonFlowState on the device. Value
        // assertions on what the NATIVE engine produced. No performScrollTo: the
        // tasks page and FlowScreen are plain Stacks (no Scroll ancestor), and
        // scrollToNode throws without one — the scroll-first rule is for
        // Column(verticalScroll) pages only.
        composeRule.onNodeWithTag("tasks-flow").performClick()
        assertTagDisplayed("flow-page", "after tasks-flow (/tasks -> /flow)")
        composeRule.onNodeWithTag("flow-node-count").assertTextEquals("2")
        composeRule.onNodeWithTag("flow-edge-count").assertTextEquals("2")
        composeRule.onNodeWithTag("flow-zoom").assertTextEquals("zoom 1.0")
        composeRule.onNodeWithTag("flow-add").performClick()
        composeRule.onNodeWithTag("flow-node-count").assertTextEquals("3")
        composeRule.onNodeWithTag("flow-select").performClick()
        composeRule.onNodeWithTag("flow-selected-count").assertTextEquals("1")
        // The RENDERER half (F3/F4): the <Flow> canvas and its chrome exist, a
        // touch drag moves a node through the native engine, and the Controls
        // drive the same engine the labels read. The drag runs FIRST, at the
        // initial zoom 1 / origin viewport, so the node sits where the seed put
        // it and no reset is needed.
        composeRule.onNodeWithContentDescription("Task flow").assertExists()
        // The default node is the web's DefaultNode box, painted from the
        // palette: the label in --pyreon-flow-node-color (#1a192b, not the
        // platform's default black) and, with node 'a' selected above, a
        // --pyreon-flow-node-selected (#3b82f6) border.
        run {
            fun count(bmp: android.graphics.Bitmap, r: Int, g: Int, b: Int): Int {
                var n = 0
                for (y in 0 until bmp.height) for (x in 0 until bmp.width) {
                    val c = bmp.getPixel(x, y)
                    if (kotlin.math.abs(android.graphics.Color.red(c) - r) <= 6 && kotlin.math.abs(android.graphics.Color.green(c) - g) <= 6 && kotlin.math.abs(android.graphics.Color.blue(c) - b) <= 6) n++
                }
                return n
            }
            val label = composeRule.onNodeWithText("Start").captureToImage().asAndroidBitmap()
            check(count(label, 0x1a, 0x19, 0x2b) > 50) { "the default node label is not --pyreon-flow-node-color (#1a192b)" }
            check(count(label, 0, 0, 0) == 0) { "the default node label painted the platform's default black" }
            val canvas = composeRule.onNodeWithContentDescription("Task flow").captureToImage().asAndroidBitmap()
            check(count(canvas, 0x3b, 0x82, 0xf6) > 500) { "the selected default node has no --pyreon-flow-node-selected (#3b82f6) border" }
        // The `wire` custom edge draws ARBITRARY SVG path data (a template
        // literal), parsed by the native runtime: its #16a34a stroke must paint.
        run {
            val bmp = composeRule.onNodeWithContentDescription("Task flow").captureToImage().asAndroidBitmap()
            var green = 0
            for (y in 0 until bmp.height) for (x in 0 until bmp.width) {
                val c = bmp.getPixel(x, y)
                if (kotlin.math.abs(android.graphics.Color.red(c) - 0x16) <= 6 && kotlin.math.abs(android.graphics.Color.green(c) - 0xa3) <= 6 && kotlin.math.abs(android.graphics.Color.blue(c) - 0x4a) <= 6) green++
            }
            check(green > 50) { "the custom edge's arbitrary SVG path did not paint natively ($green green px)" }
        }
        composeRule.onNodeWithContentDescription("minimap").assertExists()
        composeRule.onNodeWithContentDescription("source handle out").assertExists()
        composeRule.onNodeWithContentDescription("target handle in").assertExists()
        val before = textOf("flow-a-pos")
        composeRule.onNodeWithText("Start").performTouchInput {
            down(center)
            // Past the touch slop first (the drag starts at the slop point), then the move.
            moveBy(Offset(24f, 0f))
            moveBy(Offset(40f, 15f))
            moveBy(Offset(40f, 15f))
            up()
        }
        composeRule.waitUntil(5_000) { textOf("flow-a-pos") != before }
        check(textOf("flow-a-pos") != before) { "dragging node 'Start' did not move it (still ${textOf("flow-a-pos")})" }
        // Tapped past maxZoom (2) so the asserted value is the clamp, not a float product.
        repeat(5) { composeRule.onNodeWithContentDescription("Zoom in").performClick() }
        composeRule.onNodeWithTag("flow-zoom").assertTextEquals("zoom 2.0")
        composeRule.onNodeWithContentDescription("Fit view").performClick()
        composeRule.onNodeWithTag("flow-back").performClick()
        assertTagDisplayed("tasks-page", "after flow-back (/flow -> /tasks)")

        // F6 scale proof: 400 nodes with culling on. Every assertion is a COUNT
        // or an identity, so it is deterministic on any emulator.
        composeRule.onNodeWithTag("tasks-flow-scale").performClick()
        assertTagDisplayed("flow-scale-page", "after tasks-flow-scale (/tasks -> /flow-scale)")
        composeRule.onNodeWithTag("flow-scale-total").assertTextEquals("0")
        composeRule.onNodeWithTag("flow-scale-load").performClick()
        waitForTagText("flow-scale-total", "400")
        fun gridNode(index: Int) = composeRule.onNodeWithContentDescription("grid node $index", useUnmergedTree = true)
        fun mountedGridNodes() = composeRule
            .onAllNodes(hasContentDescription("grid node ", substring = true), useUnmergedTree = true)
            .fetchSemanticsNodes().size
        composeRule.waitUntil(10_000) { mountedGridNodes() > 0 }
        gridNode(0).assertExists()
        // The ceiling: a phone canvas shows a few columns of 200dp-spaced nodes.
        // Mounting all 400 would mean culling is off.
        val mountedAtOrigin = mountedGridNodes()
        check(mountedAtOrigin in 2..40) { "culling mounted $mountedAtOrigin of 400 nodes at the origin viewport" }
        // The grid renders through a CUSTOM node with its own handles, so its
        // renderer is culled too: one target handle per mounted node, no more.
        val targetHandles = composeRule
            .onAllNodes(hasContentDescription("target handle in"), useUnmergedTree = true)
            .fetchSemanticsNodes().size
        check(targetHandles == mountedAtOrigin) { "custom-node handles are not culled with their nodes: $targetHandles handles for $mountedAtOrigin nodes" }
        // Panning swaps WHICH nodes are mounted: node 0 leaves, node 170 (row 8,
        // column 10, placed exactly at the new viewport origin) arrives.
        composeRule.onNodeWithTag("flow-scale-pan").performClick()
        composeRule.waitUntil(10_000) {
            composeRule.onAllNodes(hasContentDescription("grid node 170"), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
        gridNode(0).assertDoesNotExist()
        check(mountedGridNodes() <= 40) { "culling mounted ${mountedGridNodes()} nodes after the pan" }
        // A node that scrolled in is live: dragging it reaches the engine.
        val farBefore = textOf("flow-scale-far-pos")
        gridNode(170).performTouchInput {
            down(center)
            moveBy(Offset(24f, 0f))
            moveBy(Offset(40f, 15f))
            moveBy(Offset(40f, 15f))
            up()
        }
        composeRule.waitUntil(5_000) { textOf("flow-scale-far-pos") != farBefore }
        // Pinching out zooms the engine and widens the culled set, and the set
        // stays bounded rather than falling back to every node.
        val zoomBefore = textOf("flow-scale-zoom")
        composeRule.onNodeWithContentDescription("Scale flow").performTouchInput {
            pinch(
                start0 = center + Offset(-200f, 0f),
                end0 = center + Offset(-60f, 0f),
                start1 = center + Offset(200f, 0f),
                end1 = center + Offset(60f, 0f),
            )
        }
        composeRule.waitUntil(5_000) { textOf("flow-scale-zoom") != zoomBefore }
        check(mountedGridNodes() < 200) { "culling mounted ${mountedGridNodes()} of 400 nodes after zooming out" }
        composeRule.onNodeWithTag("flow-scale-back").performClick()
        assertTagDisplayed("tasks-page", "after flow-scale-back (/flow-scale -> /tasks)")

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
        assertTagDisplayed("tasks-page", "after lifecycle-back (/lifecycle -> /tasks)")

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
        // #3255: the plot engine's native HOST — `<SankeyChart>` lowers to a
        // Compose Canvas (PyreonChartCanvas) walking the generated engine's
        // draw list; the testid rides Modifier.testTag on that canvas.
        composeRule
            .onNodeWithTag("stats-flow")
            .performScrollTo()
            .assertIsDisplayed()
        // #3257: `onSelectIndex` — a tap on the canvas runs hitSankeyIndex over the
        // same layout the canvas painted and binds the node index. The first band
        // (Backlog) is at x 80–96 dp (the host's gutter), nearly full height; the
        // tap position is in px, so the dp offset is scaled by the density.
        composeRule
            .onNodeWithTag("stats-flow-pick")
            .assertTextEquals("-1")
        val flowDensity = composeRule.density.density
        composeRule
            .onNodeWithTag("stats-flow")
            .performTouchInput { click(Offset(88f * flowDensity, 80f * flowDensity)) }
        waitForTagText("stats-flow-pick", "0")
        // #3263: `<PlotChart marks>` natively — a tap on the bars canvas runs
        // plotHitBars over the spec the canvas painted; (90, 100) dp is inside
        // the first bar, with or without the preset strip below the plot.
        composeRule
            .onNodeWithTag("stats-bars")
            .performScrollTo()
            .assertIsDisplayed()
        // The canvas carries the engine's DATA DESCRIPTION as its content
        // description (the web `aria-label`'s sentence), so TalkBack says what
        // the chart shows rather than announcing an unlabelled Canvas. Asserted
        // through the stable `assertContentDescriptionContains` rather than a
        // typed semantics read — this file's own note says an untyped config
        // read is the construct that compiles here, and a diagnostic must not
        // be the thing that breaks the build.
        composeRule
            .onNodeWithTag("stats-bars")
            .assertContentDescriptionContains("Scores by subject", substring = true)
        composeRule
            .onNodeWithTag("stats-bars")
            .assertContentDescriptionContains("3 categories", substring = true)
        composeRule
            .onNodeWithTag("stats-bars-pick")
            .assertTextEquals("-1")
        composeRule
            .onNodeWithTag("stats-bars")
            .performTouchInput { click(Offset(90f * flowDensity, 100f * flowDensity)) }
        waitForTagText("stats-bars-pick", "0")
        // #3268: `<PlotChart dataZoom>` — the pinch itself is asserted on the
        // iOS twin (PyreonTasksUITests), where XCUIElement.pinch(withScale:) is
        // a mature API. It is NOT asserted here: Compose's synthetic
        // `pinch()` has to drive `detectTransformGestures` past touch slop
        // through injected multi-touch, this repo has no working precedent for
        // that, and the assertion shipped un-compiled (its import was missing)
        // so it had never once run. The emit is verified separately:
        // `detectTransformGestures` on Kotlin and `MagnificationGesture` on
        // Swift, each in its OWN pointerInput block so the tap detector cannot
        // swallow the gesture.
        // #3270: the zoomPresets strip is asserted on the iOS twin, not here,
        // for the same reason as the pinch above — and this one is a coordinate
        // problem, not a gesture one. The strip is laid out RIGHT-ALIGNED from
        // MEASURED label widths, and the two targets measure differently:
        // Android's `pyreonChartMeasure` uses android.graphics.Paint (Roboto),
        // the Swift runtime uses its own metric. The hard-coded 72dp/25dp
        // offsets in this test were copied from the iOS twin, where they are
        // correct; on Android the buttons simply are not there, so the tap
        // lands off-button and leaves the window unchanged.
        //
        // Making it target-correct would mean the test re-deriving the layout
        // the engine computed — i.e. reimplementing renderPresets in the
        // assertion. The iOS twin already proves the whole chain end to end
        // (pinch → GLOBAL index 1, 'last 1' → 2, 'all' → 0) on a real
        // simulator, so the behaviour is device-proven; what is missing here
        // is only a second copy of that proof.
        // #3272: the legend tap toggle is asserted on the iOS twin only, for
        // the SAME reason as the preset strip above: the 'Score' entry's box is
        // sized from the MEASURED width of its label, and Android measures
        // through android.graphics.Paint (Roboto) while the Swift runtime uses
        // its own metric. A tap at a hard-coded 20dp is inside the entry on one
        // target and outside it on the other, so the series never hides and the
        // band tap reports 0 rather than -1. Confirmed on the device gate.
        //
        // The navigator (#3274) and brush (#3277) blocks below stay: they are
        // positioned by GEOMETRY (fractions of the strip width, constant strip
        // heights), not by measured text, so they are not subject to this.
        // #3274: the navigator strip (x 8…W-8dp, centred 40dp above the bottom).
        // Left handle dragged right by 55% → rows 1..2 → the first band is the
        // GLOBAL index 1; the band dragged left by 55% → rows 0..1 → 0 again.
        composeRule
            .onNodeWithTag("stats-bars")
            .performTouchInput {
                // A real finger moves in many small steps; one 55%-wide jump is
                // an input no user produces, and the emulator run is the only
                // place this gesture is exercised — so drive it the way a hand does.
                val navY = height - 40f * flowDensity
                val stripW = width - 16f * flowDensity
                down(Offset(10f * flowDensity, navY))
                repeat(10) { moveBy(Offset(stripW * 0.055f, 0f)) }
                up()
            }
        // The window itself, through onZoom: a failure here names what the
        // drag did (or did not) do before any tap is interpreted.
        waitForTagText("stats-zoom", "55-100")
        composeRule
            .onNodeWithTag("stats-bars")
            .performTouchInput { click(Offset(90f * flowDensity, 100f * flowDensity)) }
        waitForTagText("stats-bars-pick", "1")
        composeRule
            .onNodeWithTag("stats-bars")
            .performTouchInput {
                val navY = height - 40f * flowDensity
                val stripW = width - 16f * flowDensity
                down(Offset(8f * flowDensity + stripW * 0.775f, navY))
                repeat(10) { moveBy(Offset(-stripW * 0.055f, 0f)) }
                up()
            }
        composeRule
            .onNodeWithTag("stats-bars")
            .performTouchInput { click(Offset(90f * flowDensity, 100f * flowDensity)) }
        waitForTagText("stats-bars-pick", "0")
        // #3277: the brush-only line chart — a drag across its plot selects every
        // row → '0-2' through the named onBrush; a tap clears → 'none'.
        composeRule
            .onNodeWithTag("stats-brush-sel")
            .assertTextEquals("none")

        // The INDICATOR marks, on the device — mirror of the iOS assertion.
        // `sma` lowers to the crossing `smaValues` and the `bollinger` spread
        // expands to a band plus its middle line; "upper bound" in the content
        // description is true only if the two-channel a11y crossing worked AND
        // the envelope arithmetic produced numbers. `performScrollTo` because a
        // tap is not the only thing a Compose node needs to be reachable for.
        composeRule
            .onNodeWithTag("stats-indicators")
            .performScrollTo()
            .assertIsDisplayed()
        composeRule
            .onNodeWithTag("stats-indicators")
            .assertContentDescriptionContains("Weekly load", substring = true)
        composeRule
            .onNodeWithTag("stats-indicators")
            .assertContentDescriptionContains("upper bound", substring = true)
        composeRule
            .onNodeWithTag("stats-indicators")
            .assertContentDescriptionContains("lower bound", substring = true)
        composeRule
            .onNodeWithTag("stats-brush")
            .performScrollTo()
            .performTouchInput {
                down(Offset(50f * flowDensity, 60f * flowDensity))
                moveTo(Offset(width - 30f * flowDensity, 60f * flowDensity))
                up()
            }
        waitForTagText("stats-brush-sel", "0-2")
        composeRule
            .onNodeWithTag("stats-brush")
            .performTouchInput { click(Offset(60f * flowDensity, 60f * flowDensity)) }
        waitForTagText("stats-brush-sel", "none")
        composeRule
            .onNodeWithTag("stats-back")
            .performScrollTo()
            .performClick()
        assertTagDisplayed("tasks-page", "after stats-back (/stats -> /tasks)")

        // #3279: the DASHBOARD — the native wave's gate: six families on one
        // shared-source page; the funnel repaints from a signal (tap reads
        // 'Leads', drop the stage, the same tap reads 'Qualified'); the gauge
        // reads a signal a button moves (40 → 65).
        // The tasks page is a <For> list (a LazyColumn) with no <Scroll> around
        // it, so there is no scrollable ancestor for performScrollTo() to use —
        // the sibling `tasks-stats` button above is tapped the same way. The
        // first run to reach this line failed on exactly that.
        composeRule
            .onNodeWithTag("tasks-dashboard")
            .performClick()
        assertTagDisplayed("dash-page", "after tasks-dashboard (/tasks -> /dashboard)")
        composeRule
            .onNodeWithTag("dash-stage")
            .assertTextEquals("none")
        composeRule
            .onNodeWithTag("dash-funnel")
            .performTouchInput { click(Offset(width / 2f, 30f * flowDensity)) }
        waitForTagText("dash-stage", "Leads")
        composeRule
            .onNodeWithTag("dash-drop")
            .performScrollTo()
            .performClick()
        composeRule
            .onNodeWithTag("dash-funnel")
            .performTouchInput { click(Offset(width / 2f, 30f * flowDensity)) }
        waitForTagText("dash-stage", "Qualified")
        composeRule
            .onNodeWithTag("dash-load")
            .assertTextEquals("40")
        composeRule
            .onNodeWithTag("dash-load-up")
            .performScrollTo()
            .performClick()
        waitForTagText("dash-load", "65")
        for (id in listOf("dash-gauge", "dash-pie", "dash-radar", "dash-heat", "dash-tree", "dash-box")) {
            composeRule.onNodeWithTag(id).assertExists()
        }
        // The radar's tap (see the iOS twin for the geometry: the first vertex
        // sits at (W/2, 46dp) on a 200dp-tall radar with labels on).
        composeRule.onNodeWithTag("dash-radar-hit").assertTextEquals("none")
        composeRule
            .onNodeWithTag("dash-radar")
            .performScrollTo()
            .performTouchInput { click(Offset(width / 2f, 46f * flowDensity)) }
        waitForTagText("dash-radar-hit", "S0A0")
        // The boxplot host crossed: a tap in the left third is box 0, in the right third box 1.
        composeRule.onNodeWithTag("dash-box-pick").assertTextEquals("-1")
        composeRule
            .onNodeWithTag("dash-box")
            .performScrollTo()
            .performTouchInput { click(Offset(width * 0.35f, height / 2f)) }
        waitForTagText("dash-box-pick", "0")
        composeRule
            .onNodeWithTag("dash-box")
            .performTouchInput { click(Offset(width * 0.8f, height / 2f)) }
        waitForTagText("dash-box-pick", "1")
        composeRule
            .onNodeWithTag("dash-back")
            .performScrollTo()
            .performClick()
        assertTagDisplayed("tasks-page", "after dash-back (/dashboard -> /tasks)")

        // The GALLERY — the ten chart families that had never rendered on a
        // device. Nine of nineteen lowered hosts were device-proven before
        // this; the other ten rested on stub typechecking, which catches a type
        // error and cannot catch a chart that paints nothing.
        //
        // `tasks-gallery` lives on the same LazyColumn-backed tasks page as
        // `tasks-dashboard` above. It has no ancestor exposing Compose's Scroll
        // semantics action, so `performScrollTo()` here fails before the click.
        // Inside the gallery, scroll each chart into view: ten charts do not fit
        // on a phone, and an off-screen assertion is not device render proof.
        composeRule
            .onNodeWithTag("tasks-gallery")
            .performClick()
        assertTagDisplayed("gal-page", "after tasks-gallery (/tasks -> /gallery)")
        for (tag in listOf(
            "gal-calendar", "gal-candlestick", "gal-gantt", "gal-graph", "gal-map",
            "gal-parallel", "gal-polar", "gal-river", "gal-sunburst", "gal-tree",
        )) {
            composeRule.onNodeWithTag(tag).performScrollTo().assertIsDisplayed()
        }
        // The map ROAMS: a horizontal swipe pans it, so its pixels change.
        val roamMap = composeRule.onNodeWithTag("gal-map").performScrollTo()
        val mapBefore = roamMap.captureToImage().asAndroidBitmap()
        roamMap.performTouchInput {
            swipe(start = Offset(width * 0.3f, height * 0.5f), end = Offset(width * 0.3f + 200f, height * 0.5f), durationMillis = 400)
        }
        composeRule.waitForIdle()
        assertFalse("dragging the roaming map did not pan it", mapBefore.sameAs(roamMap.captureToImage().asAndroidBitmap()))
        composeRule.onNodeWithTag("gal-geo-trail").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("gal-decal").performScrollTo().assertIsDisplayed()
        // The calculable visualMap: dragging its high handle (bottom-left strip) left greys the hottest cells.
        val visualMap = composeRule.onNodeWithTag("gal-visualmap").performScrollTo()
        val vmBefore = visualMap.captureToImage().asAndroidBitmap()
        visualMap.performTouchInput {
            val y = height - (41 - 16 - 4).dp.toPx()
            swipe(start = Offset(159.dp.toPx(), y), end = Offset(80.dp.toPx(), y), durationMillis = 600)
        }
        composeRule.waitForIdle()
        // Out-of-range values take the inactive #cccccc: none before the drag, a block of it after.
        fun greyPixels(b: android.graphics.Bitmap): Int {
            var n = 0
            for (y in 0 until b.height) for (x in 0 until b.width) {
                val c = b.getPixel(x, y)
                if (kotlin.math.abs(android.graphics.Color.red(c) - 204) <= 3 && kotlin.math.abs(android.graphics.Color.green(c) - 204) <= 3 && kotlin.math.abs(android.graphics.Color.blue(c) - 204) <= 3) n++
            }
            return n
        }
        assertTrue("the visualMap greyed cells before any drag", greyPixels(vmBefore) < 50)
        val vmGrey = greyPixels(visualMap.captureToImage().asAndroidBitmap())
        assertTrue("dragging the visualMap handle did not grey the out-of-range cells (grey pixels: $vmGrey)", vmGrey > 400)
        // The slider dataZoom opens on the low half; dragging the band right shows the tall bars (y extent pinned).
        fun redPixels(b: android.graphics.Bitmap): Int {
            var n = 0
            for (y in 0 until b.height) for (x in 0 until b.width) {
                val c = b.getPixel(x, y)
                if (android.graphics.Color.red(c) >= 249 && android.graphics.Color.green(c) <= 6 && android.graphics.Color.blue(c) <= 6) n++
            }
            return n
        }
        val zoomChart = composeRule.onNodeWithTag("gal-datazoom").performScrollTo()
        val redBefore = redPixels(zoomChart.captureToImage().asAndroidBitmap())
        zoomChart.performTouchInput {
            val stripW = width - 16.dp.toPx()
            val y = height - 18.dp.toPx()
            swipe(start = Offset(8.dp.toPx() + stripW * 0.25f, y), end = Offset(8.dp.toPx() + stripW * 0.75f, y), durationMillis = 700)
        }
        composeRule.waitForIdle()
        val redAfter = redPixels(zoomChart.captureToImage().asAndroidBitmap())
        assertTrue("dragging the dataZoom band did not move the window to the tall bars (red before $redBefore, after $redAfter)", redAfter > redBefore * 3)
        // The timeline: a tap on the last checkpoint shows that step; next wraps to the first.
        val timeline = composeRule.onNodeWithTag("gal-timeline").performScrollTo()
        timeline.assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "2019"))
        timeline.performTouchInput { click(Offset(width - 48.dp.toPx(), height - (40 - 16).dp.toPx())) }
        composeRule.waitForIdle()
        timeline.assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "2021"))
        timeline.performTouchInput { click(Offset(width - 33.dp.toPx(), height - (40 - 16).dp.toPx())) }
        composeRule.waitForIdle()
        timeline.assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "2019"))
        // dispatchAction: the handle's timelineChange moves the same step a tap does.
        composeRule.onNodeWithTag("gal-tl-last").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-timeline").performScrollTo().assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.StateDescription, "2021"))
        // The toolbox (dataZoom, back, dataView, line, bar, restore — right-aligned, 25dp apart at the top).
        val toolbox = composeRule.onNodeWithTag("gal-toolbox").performScrollTo()
        val tool = { i: Int -> toolbox.performTouchInput { click(Offset(width - (9.5f + 25f * (5 - i)).dp.toPx(), 9.5.dp.toPx())) } }
        tool(0)
        composeRule.waitForIdle()
        toolbox.performTouchInput { swipe(start = Offset(width * 0.5f, height * 0.5f), end = Offset(width * 0.58f, height * 0.5f), durationMillis = 600) }
        composeRule.waitForIdle()
        val zoomText = composeRule.onNodeWithTag("gal-toolbox-zoom").performScrollTo()
        zoomText.assert(androidx.compose.ui.test.SemanticsMatcher("zoomed away from 0-100") { n -> n.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.Text)?.joinToString("") { it.text } != "0-100" })
        composeRule.onNodeWithTag("gal-toolbox").performScrollTo()
        tool(1)
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-toolbox-zoom").performScrollTo().assertTextEquals("0-100")
        composeRule.onNodeWithTag("gal-toolbox").performScrollTo()
        tool(2)
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("pyreon-dataview").assertExists()
        composeRule.onNodeWithTag("pyreon-dataview-close").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("pyreon-dataview").assertDoesNotExist()
        // dispatchAction: the handle's dataZoom and restore move the window the toolbox moves.
        composeRule.onNodeWithTag("gal-h-zoom").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-toolbox-zoom").performScrollTo().assertTextEquals("0-50")
        composeRule.onNodeWithTag("gal-h-reset").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-toolbox-zoom").performScrollTo().assertTextEquals("0-100")
        // saveAsImage on a family chart: the offscreen PNG reaches onSaveImage.
        composeRule.onNodeWithTag("gal-save").performScrollTo()
        composeRule.onNodeWithTag("pyreon-save-image").performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-saved").performScrollTo().assertTextEquals("data:image/png;")
        // The area brush: a lineX drag over the middle bars reports some of them; a tap clears it.
        val brushChart = composeRule.onNodeWithTag("gal-brush").performScrollTo()
        brushChart.performTouchInput { swipe(start = Offset(width * 0.4f, height * 0.5f), end = Offset(width * 0.66f, height * 0.5f), durationMillis = 600) }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-brush-count").performScrollTo().assert(androidx.compose.ui.test.SemanticsMatcher("a partial brush selection") { n -> (n.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.Text)?.joinToString("") { it.text } ?: "") in listOf("1:1", "1:2", "1:3", "1:4", "1:5") })
        composeRule.onNodeWithTag("gal-brush").performScrollTo().performTouchInput { click(Offset(width * 0.5f, height * 0.5f)) }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-brush-count").performScrollTo().assertTextEquals("1:0")
        // selectedMode="series": a tap pins the whole series it lands on and still reports the datum under it.
        val seriesChart = composeRule.onNodeWithTag("gal-series-select").performScrollTo()
        seriesChart.performTouchInput { click(Offset(width * 0.15f, height * 0.82f)) }
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-series-select-datum").performScrollTo().assert(androidx.compose.ui.test.SemanticsMatcher("a series-mode tap reports a datum") { n -> (n.config.getOrNull(androidx.compose.ui.semantics.SemanticsProperties.Text)?.joinToString("") { it.text } ?: "") != "none" })
        // universalTransition: toggling from 3 to 5 rows morphs instead of crashing, and settles on the new count.
        composeRule.onNodeWithTag("gal-growth").performScrollTo().assertIsDisplayed()
        composeRule.onNodeWithTag("gal-growth-toggle").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-growth-count").performScrollTo().assertTextEquals("5")
        composeRule.onNodeWithTag("gal-growth-toggle").performScrollTo().performClick()
        composeRule.waitForIdle()
        composeRule.onNodeWithTag("gal-growth-count").performScrollTo().assertTextEquals("3")
        // `@pyreon/flow/webview` on device — mirror of the iOS assertion: the
        // hosted renderer's `fit-view` posts `viewport-change` back over the
        // bridge into native Text; a second command id moves the count 1→2.
        composeRule.onNodeWithTag("gal-flow-webview").performScrollTo().assertExists()
        waitForTagText("gal-flow-webview-event", "viewport-change")
        waitForTagText("gal-flow-webview-events", "1")
        composeRule.onNodeWithTag("gal-flow-webview-fit").performScrollTo().performClick()
        waitForTagText("gal-flow-webview-events", "2")
        // F5: a node tap INSIDE the WebView reaches native `onSelect`. The graph is
        // one symmetric row, so fit-view centres the middle node and a tap at the
        // WebView's centre hits it; the touch is injected into the Compose root and
        // routed to the embedded WebView like a finger would be.
        waitForTagText("gal-flow-webview-selected", "none")
        // An unsized WebView used to collapse to ~18dp, leaving the fitted graph no
        // room and the centre tap nowhere to land. It now takes the web
        // `<iframe>`'s 150dp default.
        // Semantics size is CLIPPED to what is on screen, so measure the LAYOUT.
        // The View itself is the thing that must be tall: a padded Compose slot
        // around an 18dp WebView looks right here and still misses the tap.
        composeRule.onNodeWithTag("gal-flow-webview").performScrollTo()
        val webHeight = composeRule.onNodeWithTag("gal-flow-webview").fetchSemanticsNode().layoutInfo.height
        check(webHeight >= with(composeRule.density) { 149.dp.roundToPx() }) {
            "an unsized FlowWebView must get the iframe's 150dp default height, measured ${webHeight}px"
        }
        tapFlowWebViewCentre()
        waitForTagText("gal-flow-webview-selected", "transform")
        // Swapping the graph re-renders IN PLACE: the same tap now selects the new
        // middle node.
        composeRule.onNodeWithTag("gal-flow-webview-swap").performScrollTo().performClick()
        composeRule.waitForIdle()
        SystemClock.sleep(500)
        tapFlowWebViewCentre()
        waitForTagText("gal-flow-webview-selected", "enrich")
        // A graph the hosted renderer cannot draw reaches native `onError`.
        composeRule.onNodeWithTag("gal-flow-webview-broken").performScrollTo().assertExists()
        waitForTagText("gal-flow-webview-failure", "error")
        // RELOAD: swapping `html` reloads the hosted page, and the NEW page must
        // receive the graph again and answer over the reverse bridge.
        composeRule.onNodeWithTag("gal-flow-webview-reload-status").performScrollTo()
        waitForTagText("gal-flow-webview-reload-status", "a:3")
        composeRule.onNodeWithTag("gal-flow-webview-reload-swap").performScrollTo().performClick()
        waitForTagText("gal-flow-webview-reload-status", "b:3")
        // The lines trail renders. Its MOTION is proven on the iOS device lane
        // and in real Chromium; here it cannot be: the trail runs on
        // withInfiniteAnimationFrameNanos (a plain frame loop kept this harness
        // busy forever), and the Compose test harness suspends infinite
        // animations by design, so two captures are identical whatever the
        // runtime does.
        composeRule.onNodeWithTag("gal-lines").performScrollTo().assertIsDisplayed()
        composeRule
            .onNodeWithTag("gal-back")
            .performScrollTo()
            .performClick()
        assertTagDisplayed("tasks-page", "after gal-back (/gallery -> /tasks)")

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
        // crash reporting: recorded, then PROVEN persisted by reading the app's
        // own files dir from the test process.
        //
        // `hadCrash` reflects the PREVIOUS session, so it cannot be asserted in
        // the run that records -- and the tempting alternative is worthless
        // here: this repo already has a `todosPersistAcrossActivityRecreation`
        // that passed against an in-memory store, because activity recreation
        // keeps the PROCESS. Reading the file the reporter actually wrote does
        // not have that hole. (iOS proves the same thing across a real
        // terminate + relaunch, which XCUITest can do and Compose cannot.)
        composeRule
            .onNodeWithTag("toolkit-crash-record")
            .performScrollTo()
            .performClick()
        // SURVIVED: the statement after recordError still ran.
        composeRule
            .onNodeWithTag("toolkit-crash-note")
            .performScrollTo()
            .assertTextEquals("survived")
        // FIRED: the report reached disk, with our message in it. Walking the
        // directory rather than naming a file keeps this robust to the
        // backend's filename choice.
        val crashDir = java.io.File(
            InstrumentationRegistry.getInstrumentation().targetContext.filesDir,
            "pyreon-crash",
        )
        val persisted = crashDir.walkTopDown().filter { it.isFile }.toList()
        org.junit.Assert.assertTrue(
            "crash reporter persisted nothing to " + crashDir.absolutePath,
            persisted.isNotEmpty(),
        )
        org.junit.Assert.assertTrue(
            "persisted report did not carry the recorded message",
            persisted.any { it.readText().contains("device-proof") },
        )

        // sync: the CRDT-backed signal was RENDERED but asserted by neither device
        // test until now -- built, shipped, never verified.
        // "0.0", NOT "0" -- a REAL cross-platform divergence this assertion
        // exposed on its first device run, not a formatting nit. The web
        // renders "0" (JS has one number type and prints an integral value
        // without a decimal); both native targets lower a syncedSignal with an
        // integer initial to a DOUBLE, because PyreonScalar.Num carries a
        // Double and Kotlin has no Int case at all. Any app displaying a synced
        // number shows a different string on mobile than on web.
        //
        // Asserted as it behaves rather than as it should, so the divergence is
        // RECORDED rather than hidden by having no assertion -- which is
        // exactly how it survived until now. The real fix is an Int case on the
        // Kotlin scalar, which is a wire-format change of its own.
        composeRule
            .onNodeWithTag("toolkit-synced")
            .performScrollTo()
            .assertTextEquals("0.0")
        // sync: CONVERGENCE through the map handle. The key is written ONLY on
        // the peer doc, so `has` can be true only if applyOps actually merged
        // the peer's ops in. Reading back our own write would pass against a
        // plain Map with no CRDT in it.
        //
        // performScrollTo is not optional here: a Compose <Scroll> keeps every
        // child COMPOSED however far down it sits, so an assertion reads fine
        // off-screen -- but anything that needs the node on-screen does not, and
        // a page that grows past the fold breaks silently without it.
        composeRule
            .onNodeWithTag("toolkit-crdt-map")
            .performScrollTo()
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
        composeRule.onNodeWithTag("toolkit-schema-submit").performClick()
        waitForTagText("toolkit-schema-valid", "false")

        // WebView bridge — mirror of the iOS assertion. The hosted page echoes
        // the host-pushed `__pyreonData` back, so both directions land in a
        // native Text the semantics tree can read; asserting inside the WebView
        // is what Compose testing cannot do.
        // Wait for the TEXT, not just the node: the echo is an async
        // WebView round-trip, so the Text exists (empty) before "ping"
        // lands — asserting on existence raced it on the 2-core emulator
        // (bit on #3160, whose emit diff was elsewhere entirely).
        waitForTagText("toolkit-bridge", "ping")

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
        snapshotTags()
        composeRule
            .onNodeWithTag("toolkit-filter-done")
            .performScrollTo()
            .performClick()
        waitForTagText("toolkit-filter", "done")

        // performScrollTo() FIRST, like every other interaction on this screen
        // (toolkit-hotkey / toolkit-schema-* / toolkit-machine-toggle /
        // toolkit-filter-done all do). `toolkit-back` sits at the bottom of a
        // ~36-node screen and Compose's performClick does NOT scroll — it
        // resolves the node from the semantics tree, which reads fine past the
        // fold, and clicks coordinates that are off-screen. The app then never
        // navigates and `tasks-page` never appears.
        //
        // This was unreachable until the static-route dispatch fix landed: the
        // test died at the `toolkit-filter` wait three lines up, so the bare
        // click below had never once run.
        composeRule
            .onNodeWithTag("toolkit-back")
            .performScrollTo()
            .performClick()
        assertTagDisplayed("tasks-page", "after toolkit-back (/toolkit?filter=done -> /tasks)")

        // Phase 6: logout — flips the store flag back; lands on /login.
        // Returning from the long toolkit page can preserve a scroll position
        // that leaves the header action outside the viewport. Compose still
        // finds that semantics node, but a bare click then targets off-screen
        // coordinates and silently leaves the route unchanged.
        composeRule
            .onNodeWithTag("tasks-logout")
            .performClick()

        assertTagDisplayed("login-page", "after tasks-logout (/tasks -> /login)")
    }
}
