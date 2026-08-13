// PyreonRateLimit — the Compose side of `@pyreon/hooks`'
// useDebouncedCallback / useThrottledCallback. Mirror of
// PyreonRateLimit.swift; see that file's header for why these two need a
// runtime where useDebouncedValue did not, and why throttle is modelled as a
// window rather than a clock.
//
// The edges were measured on the WEB before either port existed:
//
//   debounce → NO leading edge; nothing fires until the caller goes quiet.
//   throttle → leading edge AND a trailing one, carrying the LATEST args.

package com.pyreon.runtime

/** The delay half of a rate limiter, injected so the machines are testable. */
public interface PyreonScheduler {
    /** Run [work] after [milliseconds] unless cancelled; returns a token. */
    public fun schedule(milliseconds: Int, work: () -> Unit): Int
    public fun cancel(token: Int)
}

/**
 * Default scheduler — a java.util.Timer task per pending call.
 *
 * Deliberately NOT a CoroutineScope: a scope handed to a long-lived limiter
 * either outlives the composable that made it (a leak) or is cancelled under
 * it (a silently dead limiter). A Timer task is cancellable by token with
 * neither hazard, and keeps this runtime free of a kotlinx dependency, as
 * PyreonFetch already is.
 */
public class PyreonTaskScheduler : PyreonScheduler {
    private val timer = java.util.Timer(true)
    private var next = 0
    private val tasks = HashMap<Int, java.util.TimerTask>()

    override fun schedule(milliseconds: Int, work: () -> Unit): Int {
        next++
        val token = next
        val task = object : java.util.TimerTask() {
            override fun run() {
                tasks.remove(token)
                work()
            }
        }
        tasks[token] = task
        timer.schedule(task, milliseconds.toLong())
        return token
    }

    override fun cancel(token: Int) {
        tasks.remove(token)?.cancel()
    }
}

/**
 * Trailing-edge debounce over a single-argument callback.
 *
 * Single-argument by design: the web hook is variadic, but a variadic native
 * port would need a boxed args tuple whose type the emit cannot know. One
 * argument covers the shapes that actually appear, and the compiler declines
 * anything else BY NAME rather than silently dropping arguments.
 */
public class PyreonDebounced<A>(
    private val delayMs: Int,
    private val scheduler: PyreonScheduler,
    private val action: (A) -> Unit,
) {
    private var token: Int? = null
    private var pending: A? = null

    /** Schedule a call, replacing any pending one — a burst collapses to the LAST args. */
    public operator fun invoke(arg: A) {
        token?.let { scheduler.cancel(it) }
        pending = arg
        token = scheduler.schedule(delayMs) {
            val p = pending
            token = null
            pending = null
            if (p != null) action(p)
        }
    }

    /** Drop the pending call entirely. */
    public fun cancel() {
        token?.let { scheduler.cancel(it) }
        token = null
        pending = null
    }

    /**
     * Fire the pending call NOW. A no-op when nothing is pending, and it
     * clears the timer so the call cannot also land when the delay elapses.
     */
    public fun flush() {
        val p = pending ?: return
        token?.let { scheduler.cancel(it) }
        token = null
        pending = null
        action(p)
    }
}

/**
 * Leading-edge-plus-trailing throttle over a single-argument callback.
 *
 * Modelled as a WINDOW rather than a clock — observably identical to the
 * web's `Date.now()` comparison, and testable without real waiting:
 *
 *   no window open → invoke now (leading), open one
 *   window open    → remember the LATEST args
 *   window closes  → if args pending, invoke them (trailing) and open a
 *                    fresh window, as the web version's post-invoke
 *                    lastCallTime update does
 */
public class PyreonThrottled<A>(
    private val waitMs: Int,
    private val scheduler: PyreonScheduler,
    private val action: (A) -> Unit,
) {
    private var token: Int? = null
    private var pending: A? = null

    public operator fun invoke(arg: A) {
        if (token == null) {
            action(arg)
            openWindow()
            return
        }
        pending = arg
    }

    /** Drop the trailing call AND close the window, re-arming the leading edge. */
    public fun cancel() {
        token?.let { scheduler.cancel(it) }
        token = null
        pending = null
    }

    private fun openWindow() {
        token = scheduler.schedule(waitMs) {
            token = null
            val p = pending
            if (p != null) {
                pending = null
                action(p)
                openWindow()
            }
        }
    }
}
