import { describe, expect, it } from 'vitest'
import {
  parseCompileRequest,
  unmetCompileRequest,
} from '../../../../../scripts/check-native-coverage'

/**
 * `PYREON_COVERAGE_COMPILE` used to mean "compile whatever toolchain happens to
 * be installed". The only CI job that set it runs on macOS, which has no
 * kotlinc — so the Kotlin half of the compile gate printed a skip line into a
 * green log and compiled nothing, for as long as that was the only caller.
 *
 * The gate exists to stop a warning-free UNCOMPILABLE emit from reading as
 * "crosses", and half of it was doing exactly that. The Kotlin failure found in
 * `examples/native-viz` would not have been caught by it.
 *
 * So targets are named, and a REQUESTED target whose toolchain is absent FAILS
 * rather than logs. These lock that policy, which is the part a green CI log
 * cannot show you.
 */
describe('parseCompileRequest', () => {
  it.each([
    ['1', true, true],
    ['all', true, true],
    ['swift', true, false],
    ['kotlin', false, true],
    ['  SWIFT  ', true, false], // trimmed + case-insensitive
  ])('%s → swift=%s kotlin=%s', (raw, swift, kotlin) => {
    expect(parseCompileRequest(raw as string)).toEqual({ kind: 'run', swift, kotlin })
  })

  it('unset or empty asks for nothing', () => {
    expect(parseCompileRequest(undefined).kind).toBe('none')
    expect(parseCompileRequest('  ').kind).toBe('none')
  })

  it('anything else is INVALID, not silently ignored', () => {
    // A typo that quietly means "compile nothing" is the failure this whole
    // policy exists to prevent — it would read as a passing compile gate.
    expect(parseCompileRequest('true')).toEqual({ kind: 'invalid', value: 'true' })
    expect(parseCompileRequest('yes')).toEqual({ kind: 'invalid', value: 'yes' })
    expect(parseCompileRequest('0')).toEqual({ kind: 'invalid', value: '0' })
  })
})

describe('unmetCompileRequest', () => {
  const both = { swift: true, kotlin: true }
  const neither = { swift: false, kotlin: false }

  it('is met when the requested toolchains are present', () => {
    expect(unmetCompileRequest(parseCompileRequest('1'), both)).toBeNull()
    expect(unmetCompileRequest(parseCompileRequest('swift'), { swift: true, kotlin: false })).toBeNull()
    expect(unmetCompileRequest(parseCompileRequest('kotlin'), { swift: false, kotlin: true })).toBeNull()
  })

  it('asking for nothing is always met', () => {
    expect(unmetCompileRequest(parseCompileRequest(undefined), neither)).toBeNull()
  })

  it('a REQUESTED target with no toolchain is unmet — the whole point', () => {
    // This is the case that used to print a skip line and return success.
    expect(unmetCompileRequest(parseCompileRequest('kotlin'), { swift: true, kotlin: false }))
      .toContain('kotlinc is unavailable')
    expect(unmetCompileRequest(parseCompileRequest('swift'), { swift: false, kotlin: true }))
      .toContain('swiftc is unavailable')
    // and `1` requires both, so either missing is unmet
    expect(unmetCompileRequest(parseCompileRequest('1'), { swift: true, kotlin: false })).not.toBeNull()
    expect(unmetCompileRequest(parseCompileRequest('1'), { swift: false, kotlin: true })).not.toBeNull()
  })

  it('an UNREQUESTED missing toolchain is fine', () => {
    // Asking for swift on a runner with no kotlinc must not fail — that is the
    // macOS job, and the split is deliberate.
    expect(unmetCompileRequest(parseCompileRequest('swift'), { swift: true, kotlin: false })).toBeNull()
  })

  it('every unmet message names a way forward', () => {
    for (const [req, have] of [
      ['kotlin', { swift: true, kotlin: false }],
      ['swift', { swift: false, kotlin: true }],
      ['bogus', neither],
    ] as const) {
      const msg = unmetCompileRequest(parseCompileRequest(req), have)
      expect(msg, `${req} should be unmet`).not.toBeNull()
      expect(msg).toMatch(/Install|refusing/)
    }
  })
})
