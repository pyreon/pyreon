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
     * The route is the URI's path, with a custom scheme's HOST folded in as the
     * first segment: `myapp://item/42` and `https://example.com/item/42` both
     * route to `/item/42` (a web link's host is its domain, a custom scheme's is
     * part of the route — see [pathFor]). A URI that yields nothing routes to `/`
     * rather than being dropped — landing on home is the right degradation for a
     * malformed link.
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

    /** The route path a URI denotes (see [pathFor]). */
    internal fun normalizedPath(uri: Uri): String = pathFor(uri.scheme, uri.host, uri.path)

    /**
     * The rule, on plain strings so it is testable without constructing a `Uri`.
     *
     * - A CUSTOM scheme (`myapp://item/42`) puts the first route segment in the HOST position, so the
     *   route is `/` + host + path → `/item/42`. A host-only link (`myapp://about`) is the same rule with an
     *   empty path → `/about`. An empty host (`myapp:///item/42`) contributes nothing.
     * - A WEB link (`https://example.com/users/42`) has the domain in the host position; that identifies
     *   the app, not the destination, so only the path is used → `/users/42`.
     *
     * Query and fragment are dropped (the router owns its own search params), and a URI that yields
     * nothing routes to `/` rather than being dropped.
     */
    internal fun pathFor(scheme: String?, host: String?, path: String?): String {
        val isWeb = scheme.equals("http", ignoreCase = true) || scheme.equals("https", ignoreCase = true)
        val head = if (!isWeb && !host.isNullOrEmpty()) "/$host" else ""
        val tail = when {
            path.isNullOrEmpty() || path == "/" -> ""
            path.startsWith("/") -> path
            else -> "/$path"
        }
        val full = head + tail
        return if (full.isEmpty()) "/" else full
    }
}
