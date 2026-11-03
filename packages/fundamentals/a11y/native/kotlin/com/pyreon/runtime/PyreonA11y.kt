// PyreonA11y — the Compose side of `@pyreon/a11y`'s `announce()`.
//
// The web `announce("Saved")` writes an `aria-live` region. Android has no
// context-free announcement channel, so an announcement needs a host on
// screen. The compiler provides one: a component that calls `announce(...)`
// is wrapped in `PyreonA11yHost` (PyreonA11yAndroid.kt), which registers an
// announcer here for as long as it is composed. Its announcer writes the
// message into a polite or an assertive live region, which is how Android
// (like the web) distinguishes politeness — `View.announceForAccessibility`
// has one level and is deprecated from API 33.
//
//     // Lowered from `announce("Saved")` / `announce("Error", { politeness: 'assertive' })`:
//     PyreonA11y.announce("Saved", false)
//     PyreonA11y.announce("Error", true)
//
// An app can still register its own announcer (a custom TalkBack bridge) with
// `addAnnouncer`; the most recently added live one receives each message.
//
// This file imports nothing from Android so the Kotlin test gate can run it.

package com.pyreon.runtime

public object PyreonA11y {
    // A STACK, not a single slot: hosts nest (a screen inside a screen), and
    // they are removed in whatever order Compose disposes them. Removal is by
    // identity, so disposing an outer host never unregisters an inner one.
    private val announcers = mutableListOf<(String, Boolean) -> Unit>()

    /** Register `fn` as the active announcer; it receives `(message, assertive)`. */
    public fun addAnnouncer(fn: (String, Boolean) -> Unit) {
        announcers.add(fn)
    }

    /** Unregister exactly `fn` (by identity); the previously added announcer becomes active again. */
    public fun removeAnnouncer(fn: (String, Boolean) -> Unit) {
        val i = announcers.indexOfLast { it === fn }
        if (i >= 0) announcers.removeAt(i)
    }

    /**
     * Announce `message` to screen-reader users. `assertive` interrupts;
     * otherwise the announcement is polite. A no-op while no announcer is
     * registered (no host on screen).
     */
    public fun announce(message: String, assertive: Boolean = false) {
        announcers.lastOrNull()?.invoke(message, assertive)
    }
}
