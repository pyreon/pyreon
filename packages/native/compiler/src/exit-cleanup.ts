// Run a cleanup however the process ends.
//
// `process.once('exit', …)` alone misses a kill: SIGINT (Ctrl-C), SIGTERM (a
// CI step timeout, a test runner stopping a worker) and SIGHUP end the process
// without an `exit` event, leaving the Kotlin daemon's spool directory (and its
// JVM) behind. This is the package-local equivalent of the repository's
// `scripts/remove-on-exit.ts`, which a published package cannot import.
//
// The cleanup runs at most once: on `exit`, or on the first of SIGINT /
// SIGTERM / SIGHUP. After a signal it re-raises the signal so the process still
// dies from it, unless another listener for that signal exists; that listener
// then owns the shutdown, and the cleanup has already run.

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const

/** Register `cleanup` for process exit and termination signals. Returns an unregister function. */
export function onProcessEnd(cleanup: () => void): () => void {
  let done = false
  const run = (): void => {
    if (done) return
    done = true
    unregister()
    cleanup()
  }
  const onSignal = (signal: NodeJS.Signals): void => {
    run()
    if (process.listenerCount(signal) === 0) process.kill(process.pid, signal)
  }
  const unregister = (): void => {
    process.off('exit', run)
    for (const s of SIGNALS) process.off(s, onSignal)
  }
  process.on('exit', run)
  for (const s of SIGNALS) process.on(s, onSignal)
  return () => {
    done = true
    unregister()
  }
}
