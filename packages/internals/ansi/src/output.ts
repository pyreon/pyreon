import type { Writable } from 'node:stream'

/** The part of a `Writable` (`process.stdout`) `writeOut` needs. */
export type OutputStream = Pick<Writable, 'write' | 'once' | 'off' | 'destroyed'>

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
 * `process.exit`. A closed reader (`EPIPE`) resolves instead of hanging.
 */
export function writeOut(text: string, stream: OutputStream = process.stdout): Promise<void> {
  if (stream.destroyed) return Promise.resolve()
  if (stream.write(`${text}\n`)) return Promise.resolve()

  return new Promise((resolve) => {
    const done = (): void => {
      stream.off('drain', done)
      stream.off('error', done)
      stream.off('close', done)
      resolve()
    }
    stream.once('drain', done)
    stream.once('error', done)
    stream.once('close', done)
  })
}
