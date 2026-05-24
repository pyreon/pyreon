/**
 * Sentinel test — validates the singleton sentinel (Candidate α component).
 *
 * Asserts the sentinel produces FAIL-LOUD behavior on duplicate module
 * instances, replacing the previous SILENT corruption.
 *
 * ## Three assertions
 *
 * 1. **Throws on duplicate load (default mode)** — `PYREON_SINGLE_INSTANCE`
 *    unset → loading the same package twice throws an Error containing
 *    the package name + actionable fix advice.
 *
 * 2. **Warns under PYREON_SINGLE_INSTANCE=warn** — graceful path for users
 *    who need time to fix their bundler. Logs to console.error but
 *    continues execution.
 *
 * 3. **Silent under PYREON_SINGLE_INSTANCE=silent** — escape hatch for
 *    intentional dual-loading (browser extensions, micro-frontends).
 *
 * The first assertion is THE one that matters for the bug class: silent
 * failure becomes a loud throw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPyreonGlobalKeys, loadDualReactivityInstances } from './harness'

describe('Singleton sentinel (Candidate α component)', () => {
  beforeEach(() => {
    clearPyreonGlobalKeys()
    delete process.env.PYREON_SINGLE_INSTANCE
  })

  afterEach(() => {
    clearPyreonGlobalKeys()
    delete process.env.PYREON_SINGLE_INSTANCE
  })

  it('throws on duplicate load (default mode)', async () => {
    // No env var set → default is 'throw'.
    await expect(loadDualReactivityInstances()).rejects.toThrow(
      /Multiple instances of @pyreon\/reactivity detected/,
    )
  })

  it('error message names actionable fixes (Vite dedupe, npm ls, bun ls)', async () => {
    try {
      await loadDualReactivityInstances()
      // Should never get here.
      expect.fail('Expected sentinel to throw on duplicate load')
    } catch (err) {
      const msg = String((err as Error).message)
      expect(msg).toContain('resolve.dedupe')
      expect(msg).toContain('@pyreon/*')
      expect(msg).toContain('PYREON_SINGLE_INSTANCE=warn')
      expect(msg).toContain('PYREON_SINGLE_INSTANCE=silent')
    }
  })

  it('warns instead of throwing under PYREON_SINGLE_INSTANCE=warn', async () => {
    process.env.PYREON_SINGLE_INSTANCE = 'warn'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const handle = await loadDualReactivityInstances()
      // Did not throw — duplicate was allowed but logged.
      expect(errorSpy).toHaveBeenCalled()
      const firstCall = String(errorSpy.mock.calls[0]?.[0] ?? '')
      expect(firstCall).toContain('Multiple instances of @pyreon/reactivity detected')
      handle.cleanup()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('silent under PYREON_SINGLE_INSTANCE=silent (no throw, no log)', async () => {
    process.env.PYREON_SINGLE_INSTANCE = 'silent'
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const handle = await loadDualReactivityInstances()
      expect(errorSpy).not.toHaveBeenCalled()
      handle.cleanup()
    } finally {
      errorSpy.mockRestore()
    }
  })
})
