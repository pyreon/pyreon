import { writeFileSync } from 'node:fs'
import type { Reporter } from 'vitest/node'

interface ErrorLike {
  name?: unknown
  message?: unknown
  stack?: unknown
  cause?: unknown
}

/**
 * One line per error in the chain: `name: message`, then each `cause`.
 *
 * Vitest reports a dead worker as `[vitest-pool]: Worker forks emitted error.`
 * and puts the real reason (an exit code, an IPC failure, out of memory) in
 * `cause`. The status file kept only the wrapper's message, so a red coverage
 * gate said that a worker died and never why (PR #4752's first Build). The
 * chain is bounded so a self-referencing cause cannot loop.
 */
export function describeRunError(error: unknown): string {
  const parts: string[] = []
  let current: unknown = error
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth++) {
    if (typeof current !== 'object') {
      parts.push(String(current))
      break
    }
    const e = current as ErrorLike
    const name = e.name === undefined ? '' : `${String(e.name)}: `
    const message =
      e.message === undefined ? String(e.stack ?? 'Unknown runtime error') : String(e.message)
    parts.push(depth === 0 ? message : `caused by ${name}${message}`)
    current = e.cause
  }

  return parts.join(' — ')
}

/** Vitest's JSON reporter omits unhandled errors from its success verdict. */
export default class CoverageRunReporter implements Reporter {
  onTestRunEnd(...[_modules, errors, reason]: Parameters<NonNullable<Reporter['onTestRunEnd']>>) {
    const output = process.env.PYREON_COVERAGE_STATUS_FILE
    if (!output) {
      throw new Error(
        '[Pyreon] Coverage requires an owned run-status output path. Run scripts/check-coverage.ts.',
      )
    }
    writeFileSync(
      output,
      JSON.stringify({
        reason,
        errors: errors.map((error) => ({
          name: String(error.name ?? 'Unhandled error'),
          message: describeRunError(error),
        })),
      }),
    )
  }
}
