package com.pyreon.router

import android.net.Uri
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Inbound deep links — the path an app is OPENED at, and the paths it is sent
 * to while already running. Mirror of the Swift `PyreonDeepLink`.
 *
 * ## Why this exists
 *
 * `useLinking()` is OUTBOUND only (`openUrl`). Nothing carried a URL the other
 * way, so an app could not be opened at a route — the capability every real app
 * needs for app links, notification taps and share targets. Both routers already
 * accept an `initialPath`; the only missing piece was a channel from the
 * platform's intent to the router. This is that channel, and it is deliberately
 * runtime-only: no compiler change is needed, because [PyreonRouter]'s
 * constructor consumes it through a default argument.
 *
 * ## Two arrival shapes
 *
 *  - COLD: the activity is launched by the intent, so the value is held as
 *    [pending] and the next router to be constructed consumes it.
 *  - WARM: the activity is already alive and receives `onNewIntent`, so a
 *    router exists and the link is delivered straight to it.
 *
 * ## Listener lifecycle
 *
 * Exactly ONE listener slot, not a list. Registering replaces whatever was
 * there, and the router releases on dispose. An append-only listener list on a
 * global object is the classic unbounded-growth shape — every screen that ever
 * built a router would leak a lambda, and stale routers would keep navigating.
 * One slot encodes "the newest live router owns inbound links", which is also
 * the correct semantic.
 */
public object PyreonDeepLink {
    private val lock = ReentrantLock()
    private var pending: String? = null
    private var listener: ((String) -> Unit)? = null

    /**
     * Forward an inbound intent URI. The host calls this from `onCreate`
     * (cold) and `onNewIntent` (warm).
     *
     * Only the PATH is used: a deep link's scheme/host identify the app, not
     * the destination, so `pyreon://app/users/42` and
     * `https://example.com/users/42` both route to `/users/42`. A URI with no
     * usable path routes to `/` rather than being dropped — landing on home is
     * the right degradation for a malformed link.
     */
    public fun receive(uri: Uri?) {
        if (uri == null) return
        receive(normalizedPath(uri))
    }

    /** Path-level entry point (tests, and hosts that already resolved a path). */
    public fun receive(path: String) {
        val live = lock.withLock {
            val current = listener
            if (current == null) pending = path
            current
        }
        // Deliver OUTSIDE the lock: the listener navigates, which can
        // recompose and re-enter this object.
        live?.invoke(path)
    }

    /**
     * Consume a link that arrived before any router existed — as a
     * single-element stack, the shape `PyreonRouter(initialPath = …)` wants so
     * it can be a default argument. Consuming CLEARS it: a deep link opens the
     * app once, and leaving it set would re-navigate every later router.
     */
    public fun takePendingPath(): List<String> = lock.withLock {
        val path = pending ?: return@withLock emptyList()
        pending = null
        listOf(path)
    }

    /** Register the live router; returns a release handle. */
    public fun setListener(onLink: (String) -> Unit): () -> Unit {
        val token = lock.withLock {
            listenerToken += 1
            listener = onLink
            listenerToken
        }
        // Release by IDENTITY, not by position — the Swift mirror's fix, and
        // for the same reason: a router that registered EARLIER and released
        // LATER would clear the slot belonging to the router that replaced it,
        // killing warm deep links for the rest of the session and stashing the
        // next one to `pending` for a router that may never be constructed.
        return { lock.withLock { if (listenerToken == token) listener = null } }
    }

    /** Identifies the CURRENT registration, so a stale disposer is a no-op. */
    private var listenerToken: Long = 0

    /** Test seam — one test's link must not leak into the next. */
    public fun reset(): Unit = lock.withLock {
        pending = null
        listener = null
    }

    /** The route path a URI denotes. */
    internal fun normalizedPath(uri: Uri): String {
        val path = uri.path
        if (path.isNullOrEmpty() || path == "/") {
            val host = uri.host
            return if (!host.isNullOrEmpty()) "/$host" else "/"
        }
        return if (path.startsWith("/")) path else "/$path"
    }
}
