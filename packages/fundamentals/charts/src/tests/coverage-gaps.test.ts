/**
 * Coverage-gap closers for the small pure branches in loader.ts that the
 * existing suites don't reach. Each test targets one specific uncovered arm
 * and is annotated with the source line it closes.
 *
 * (vite.ts's no-tslib fallback lives in vite-no-tslib.test.ts — it drives
 * `resolveTslibEs6(fromDir)` with a tmp directory.)
 */
import { describe, expect, it } from 'vitest'

describe('loader.ts — _wrapTslibError stack-preservation branch', () => {
  it('does NOT set hint.stack when the throwable is a tslib-shaped non-Error (loader.ts:133 false arm)', async () => {
    // loader.ts:133 is `if (err instanceof Error && err.stack) hint.stack = err.stack`.
    // The existing tslib-alias tests always pass an Error (with a stack), so
    // only the TRUE arm runs. A tslib-shaped STRING still matches the helper
    // regex (so the hint is produced) but `err instanceof Error` is false →
    // the false arm: hint keeps its OWN freshly-generated stack.
    const { _wrapTslibError } = await import('../loader')
    const wrapped = _wrapTslibError('__extends is undefined (raw string throw)')
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toContain('tslib alias is missing')
    // The hint's stack is its own (mentions _wrapTslibError / this test),
    // NOT copied from a source Error — there was no source Error.
    expect(wrapped.stack).toBeDefined()
    expect(wrapped.message).toContain('__extends is undefined (raw string throw)')
  })

  it('does NOT set hint.stack when a tslib-shaped Error has no stack (loader.ts:133 false arm, second shape)', async () => {
    // Belt-and-suspenders: an Error instance whose `.stack` is undefined also
    // takes the false arm (the `&& err.stack` short-circuits). Confirms the
    // branch is about stack presence, not just instanceof.
    const { _wrapTslibError } = await import('../loader')
    const err = new TypeError('__assign helper missing')
    Object.defineProperty(err, 'stack', { value: undefined, configurable: true })
    const wrapped = _wrapTslibError(err)
    expect(wrapped.message).toContain('tslib alias is missing')
    // No source stack to copy → hint retains its own (truthy) stack.
    expect(wrapped.stack).not.toBe(undefined)
  })
})
