// PyreonA11y — the Compose side of `@pyreon/a11y`'s `announce()`.
//
// The web `announce("Saved")` writes an `aria-live` region; on Android a
// screen-reader announcement is `View.announceForAccessibility(text)`, which
// needs a View. Rather than pull a Context/View into every emit, the app
// registers an announcer ONCE (typically the root view) — the same
// "Android needs a host" seam as PyreonNetworkStatus / PyreonPush:
//
//     // App setup:
//     PyreonA11y.setAnnouncer { text -> rootView.announceForAccessibility(text) }
//
//     // Anywhere (lowered from `announce("Saved")`):
//     PyreonA11y.announce("Saved")
//
// Until an announcer is registered, `announce` is a no-op (Android has no
// context-free announcement channel). `assertive` is accepted for parity with
// iOS/web but Android's announceForAccessibility has one politeness level, so
// it is not yet distinguished (a follow-up).

package com.pyreon.runtime

public object PyreonA11y {
    private var announcer: ((String) -> Unit)? = null

    /** Wire the platform announcer (typically `rootView::announceForAccessibility`). */
    public fun setAnnouncer(fn: (String) -> Unit) {
        announcer = fn
    }

    /** Announce `message` to screen-reader users via the registered announcer. */
    public fun announce(message: String, assertive: Boolean = false) {
        announcer?.invoke(message)
    }
}
