import type { Writable } from 'node:stream'

/**
 * Exit a command only after its output has left the process.
 *
 * `process.exit()` ends the process at once, and on macOS (Node and Bun) a
 * write to a PIPED stdout or stderr is asynchronous: whatever is still queued
 * is dropped. `pyreon doctor --ci --json | jq` received the first 64 KiB of the
 * report and nothing after it (#4799), while the same run redirected to a file
 * was whole. Setting `process.exitCode` and returning keeps the output, but a
 * command that leaves a handle open (a worker pool, a Vite server, an MCP
 * stdin) then never exits.
 *
 * `exitAfterFlush` does both: it records the code, waits until everything
 * queued on stdout and stderr has been handed to the OS, then exits. How it
 * waits depends on the runtime, because each one breaks the other's method:
 *
 * - Node: an empty `write('', cb)`, whose callback runs after the writes
 *   queued ahead of it. Not `end()`: on a pipe Node's stdout is a socket, and
 *   ending it shuts the socket down for every process that shares it, so a
 *   parent that spawned the command with inherited stdio (`zero create`, a
 *   test runner) gets `EPIPE` on its next write.
 * - Bun: `end()`, whose `finish` waits for the queued data and closes only
 *   this process's descriptor. Not an empty write: Bun calls its callback
 *   before the data queued ahead of it is out.
 *
 * A closed reader (`| head`, `EPIPE`) counts as flushed. The returned promise
 * never settles, so `await exitAfterFlush(code)` stops the caller the way
 * `process.exit` did; nothing may write after calling it.
 *
 * Every Pyreon command that prints and then exits goes through this, never a
 * bare `process.exit(code)` after a write (locked by the CLI's
 * `no-bare-exit-after-output.test.ts`).
 *
 * Print large reports with `writeOut` (`output.ts`), not `console.log`: under
 * Bun a `console.log` larger than the pipe buffer loses its tail once
 * `process.stdout` has been touched, with or without an exit.
 */
export function exitAfterFlush(code: number): Promise<never> {
  process.exitCode = code
  const how = process.versions.bun === undefined ? 'write' : 'end'
  return new Promise<never>(() => {
    afterStreamsFlush([process.stdout, process.stderr], how, () => process.exit(code))
  })
}

/** The part of a `Writable` (`process.stdout`, `process.stderr`) this needs. */
export type FlushableStream = Pick<Writable, 'destroyed' | 'writableFinished' | 'once' | 'write' | 'end'>

/**
 * Call `done` once every stream has flushed what was queued on it (or
 * errored, or was already closed). `how` is the runtime's flush method (see
 * `exitAfterFlush`). Exported for tests.
 * @internal
 */
export function afterStreamsFlush(streams: readonly FlushableStream[], how: 'write' | 'end', done: () => void): void {
  let pending = streams.length
  const one = (): void => {
    pending--
    if (pending === 0) done()
  }
  if (pending === 0) {
    done()
    return
  }
  for (const s of streams) {
    if (s.destroyed || s.writableFinished) {
      one()
      continue
    }
    let settled = false
    const settle = (): void => {
      if (settled) return
      settled = true
      one()
    }
    // `EPIPE` from a reader that closed early: the output has nowhere to go.
    s.once('error', settle)
    if (how === 'write') {
      s.write('', settle)
    } else {
      s.once('finish', settle)
      s.once('close', settle)
      s.end()
    }
  }
}
