---
'@pyreon/native-router-swift': patch
'@pyreon/native-router-kotlin': patch
'@pyreon/hooks': patch
---

Five defects in the native runtimes — a guard bypass, two crashes, and two threading faults

The Swift/Kotlin sources that ship to devices had never been audited. Four of these five are the same shape: **the correct idiom already exists in this repo and one sibling did not adopt it.**

**A COLD deep link bypassed every navigation guard.** `PyreonRouter.init` assigned the inbound path straight to `path`, and `allowNavigation` runs only from `push`/`replace` — so an app launched BY a URL arrived at that route with no guard run, while a warm link to the same route was gated. A visited web page doing `location.href = "myapp://admin/billing"` opened the app at `/admin/billing` with the auth guard never executed; this repo's own reference host is `exported` + `BROWSABLE`. The asymmetry is what hid it: an app tested by driving links into an already-running app looks correctly gated. A route's `beforeEnter` now runs on the initial path, falling back to root when refused.

**The Swift crash reporter replaced the app's existing handler instead of chaining to it.** `NSSetUncaughtExceptionHandler` replaces, so an app that configures Crashlytics or Sentry first stopped receiving NSException reports the moment a view called `useCrashReporter()` — the dashboard goes quiet and nothing says why, and which handler won was a coin flip on initialisation order. The Kotlin twin has always chained, and its header states the rule: "a crash reporter that swallows the crash changes app behavior".

**`openUrl` terminated the process on Android** for any URL nothing could handle. `startActivity` throws `ActivityNotFoundException`; the call was unguarded, so a `zoommtg://` link on a device without Zoom killed the app. The Swift half degraded gracefully, so one shared source crashed on exactly one target. It returns whether the URL opened, rather than swallowing — a caller that wants to fall back needs to know.

**The debounce/throttle scheduler ran the user's callback off the main thread, on both targets.** `TimerTask.run` executes on the Timer's thread and an unstructured Swift `Task` does not inherit MainActor, so a debounced body — which writes signals — was an off-main Compose state write: `IllegalArgumentException: Detected multithreaded access to SnapshotStateObserver`, the exact crash two neighbouring files each document and each already fix by hopping to the main looper. This one is reachable through the default emit with no unusual host code. Both targets hop now, both guard the task map they were racing, and Kotlin shares one daemon timer instead of starting a thread per debounced callback and never cancelling it.

**The deep-link listener released by position, not identity** (leak class A, both targets). A router that registered earlier and deallocated later cleared the slot belonging to the router that had replaced it — warm deep links then died silently for the session, and the next link was stashed for a router that might never be constructed.

One thing was tried and reverted: re-validating the standing path when a global guard is registered. It closes the cold-link hole for global guards, but it makes adding a guard NAVIGATE — so `beforeEach { false }`, the ordinary "block navigation while saving" pattern, would eject the user from the page they are on. The package's own `testBeforeEachBlocksReplace` caught it. A guard is about transitions; applying it retroactively to the current location is a different and worse semantic. So a guard that must cover a cold deep link belongs on the route's `beforeEnter`, which is now said in the public doc rather than left to be discovered.
