package com.pyreon.runtime

import android.os.Handler
import android.os.Looper

/**
 * JavaScript's `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` for emitted code — the mirror of
 * the Swift runtime's `PyreonTimers`, with the same contract: the callback runs on the main thread after at least
 * `ms` milliseconds (a negative or non-finite delay is 0); ids are positive and never reused; clearing an unknown,
 * fired or cleared id (or `null`) does nothing, and the two clear functions are interchangeable; a timeout forgets
 * itself once it has run, an interval lives until it is cleared.
 *
 * The scheduling itself goes through [scheduler], which defaults to the main looper's `Handler`. It is replaceable
 * so the contract can be exercised on a plain JVM, where no looper exists.
 */
object PyreonTimers {
    /** Posts and cancels delayed work on the thread callbacks must run on. */
    interface Scheduler {
        fun post(delayMs: Long, task: Runnable)
        fun cancel(task: Runnable)
    }

    private object MainLooperScheduler : Scheduler {
        private val handler by lazy { Handler(Looper.getMainLooper()) }
        override fun post(delayMs: Long, task: Runnable) {
            handler.postDelayed(task, delayMs)
        }
        override fun cancel(task: Runnable) {
            handler.removeCallbacks(task)
        }
    }

    @Volatile
    var scheduler: Scheduler = MainLooperScheduler

    private var nextId = 0L
    private val tasks = HashMap<Long, Runnable>()

    fun setTimeout(ms: Number, fn: () -> Unit): Long = schedule(ms, repeats = false, fn)

    fun setInterval(ms: Number, fn: () -> Unit): Long = schedule(ms, repeats = true, fn)

    /** `clearTimeout(id)` / `clearInterval(id)`. */
    fun clear(id: Long?) {
        if (id == null) return
        val task = synchronized(this) { tasks.remove(id) } ?: return
        scheduler.cancel(task)
    }

    /** The number of timers still scheduled — pending timeouts plus live intervals. */
    val pendingCount: Int
        get() = synchronized(this) { tasks.size }

    private fun schedule(ms: Number, repeats: Boolean, fn: () -> Unit): Long {
        val d = ms.toDouble()
        val delay = if (d.isFinite() && d > 0) d.toLong() else 0L
        val id = synchronized(this) { ++nextId }
        val task = object : Runnable {
            override fun run() {
                if (repeats) {
                    // Re-arm first, unless the callback (or another) cleared it in the meantime.
                    val live = synchronized(this@PyreonTimers) { tasks[id] === this }
                    if (!live) return
                    scheduler.post(maxOf(delay, 1L), this)
                } else {
                    synchronized(this@PyreonTimers) { tasks.remove(id) }
                }
                fn()
            }
        }
        synchronized(this) { tasks[id] = task }
        scheduler.post(if (repeats) maxOf(delay, 1L) else delay, task)
        return id
    }
}
