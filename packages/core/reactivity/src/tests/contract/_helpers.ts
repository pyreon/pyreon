/**
 * Shared helpers for the contract suite. Public API only — nothing here may
 * read a field or helper the package does not export as a contract.
 */
import { setErrorHandler } from '../../index'

/**
 * Route effect / cleanup / computed errors into an array for the duration of
 * a test. Call the returned `restore` in `afterEach` (or a `finally`).
 * `setErrorHandler` has no "reset to default" API, so restore installs a
 * handler equivalent to the default one (console.error).
 */
export function captureErrors(): { errors: unknown[]; restore: () => void } {
  const errors: unknown[] = []
  setErrorHandler((err) => {
    errors.push(err)
  })
  return {
    errors,
    restore: () => {
      setErrorHandler((err) => {
        // oxlint-disable-next-line no-console
        console.error('[pyreon] Unhandled effect error:', err)
      })
    },
  }
}

/** A tagged error, so a test can tell its own throws from anything else. */
export class ContractError extends Error {
  constructor(public readonly tag: string) {
    super(`contract:${tag}`)
  }
}
