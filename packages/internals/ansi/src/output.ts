import type { Writable } from 'node:stream'

/** The part of a `Writable` (`process.stdout`) `writeOut` needs. */
export type OutputStream = Pick<Writable, 'write' | 'once' | 'off' | 'destroyed' | 'writable' | 'errored'>

const errors = new WeakMap<object, Error>()

/** Remember a write error on `stream`, so the exit can tell a lost report from a closed reader. */
export function recordOutputError(stream: object, err: Error): void {
  if (!errors.has(stream)) errors.set(stream, err)
}

/** The first write error seen on `stream` by `writeOut` / `exitAfterFlush`. */
export function outputError(stream: object): Error | undefined {
  return errors.get(stream)
}

/**
 * The stream can take no more output: destroyed, errored (Bun's stdout after
 * `EPIPE` is errored and not writable, yet not destroyed), or ended.
 */
export function isClosed(stream: Pick<Writable, 'destroyed' | 'writable' | 'errored'>): boolean {
  return stream.destroyed || stream.errored != null || stream.writable === false
}

/**
 * Print a command's report: `text` plus a newline, the way `console.log` would,
 * but through `stream.write` (default `process.stdout`), waiting for `drain`
 * when the write reports a full buffer.
 *
 * Not `console.log`: under Bun, once `process.stdout` has been touched, a
 * `console.log` larger than a pipe's buffer loses everything the pipe does not
 * take at once, even if the process stays alive (`bun pyreon doctor --json |
 * jq` got 64 KiB). Bun and Node both queue a `stream.write` in full. Waiting
 * for `drain` keeps a command that prints several large blocks from piling
 * them all into memory ahead of a slow reader.
 *
 * Every large or structured report (`--json`, `--format json`, doctor, check,
 * lint) goes through this; exit after it with `exitAfterFlush`, never a bare
 * `process.exit`. A closed reader (`EPIPE`) resolves instead of hanging, and
 * the error is recorded (`outputError`) rather than dropped; a write to a
 * stream that is already closed is skipped.
 */
export function writeOut(text: string, stream: OutputStream = process.stdout): Promise<void> {
  if (isClosed(stream)) return Promise.resolve()
  if (stream.write(`${text}\n`)) return Promise.resolve()

  return new Promise((resolve) => {
    const done = (err?: Error): void => {
      stream.off('drain', done)
      stream.off('error', done)
      stream.off('close', done)
      if (err instanceof Error) recordOutputError(stream, err)
      resolve()
    }
    stream.once('drain', done)
    stream.once('error', done)
    stream.once('close', done)
  })
}
