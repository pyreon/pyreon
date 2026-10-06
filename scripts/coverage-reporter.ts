import { writeFileSync } from 'node:fs'
import type { Reporter } from 'vitest/node'

/** Vitest's JSON reporter omits unhandled errors from its success verdict. */
export default class CoverageRunReporter implements Reporter {
  onTestRunEnd(...[_modules, errors, reason]: Parameters<NonNullable<Reporter['onTestRunEnd']>>) {
    const output = process.env.PYREON_COVERAGE_STATUS_FILE
    if (!output)
      throw new Error(
        '[Pyreon] Coverage requires an owned run-status output path. Run scripts/check-coverage.ts.',
      )
    writeFileSync(
      output,
      JSON.stringify({
        reason,
        errors: errors.map((error) => ({
          name: String(error.name ?? 'Unhandled error'),
          message: String(error.message ?? error.stack ?? 'Unknown runtime error'),
        })),
      }),
    )
  }
}
