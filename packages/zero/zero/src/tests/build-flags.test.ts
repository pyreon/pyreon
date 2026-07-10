import { afterEach, describe, expect, it } from 'vitest'
import {
  SSG_BUILD_FLAG,
  SSR_BUILD_FLAG,
  _enterInnerBuild,
  _exitInnerBuild,
  innerBuildActiveInProcess,
  innerBuildFlagSet,
} from '../build-flags'

describe('build-flags — shared inner-build gate registry', () => {
  afterEach(() => {
    delete process.env[SSR_BUILD_FLAG]
    delete process.env[SSG_BUILD_FLAG]
    // Drain any depth a failing test left behind.
    while (innerBuildActiveInProcess()) _exitInnerBuild()
  })

  it('owns the canonical per-mode flag names (single source of truth)', () => {
    // These literals are the recursion contract `buildSsrBundle` +
    // both plugins share — renaming either is a breaking change to any
    // orchestration that sets/reads them.
    expect(SSR_BUILD_FLAG).toBe('PYREON_ZERO_SSR_INNER_BUILD')
    expect(SSG_BUILD_FLAG).toBe('PYREON_ZERO_SSG_INNER_BUILD')
    expect(SSR_BUILD_FLAG).not.toBe(SSG_BUILD_FLAG)
  })

  it('innerBuildFlagSet reads either flag', () => {
    expect(innerBuildFlagSet()).toBe(false)
    process.env[SSR_BUILD_FLAG] = '1'
    expect(innerBuildFlagSet()).toBe(true)
    delete process.env[SSR_BUILD_FLAG]
    process.env[SSG_BUILD_FLAG] = '1'
    expect(innerBuildFlagSet()).toBe(true)
  })

  it('innerBuildFlagSet accepts an injected env record', () => {
    expect(innerBuildFlagSet({})).toBe(false)
    expect(innerBuildFlagSet({ [SSG_BUILD_FLAG]: '1' })).toBe(true)
    // Only the literal '1' arms the gate (matches the historical checks).
    expect(innerBuildFlagSet({ [SSG_BUILD_FLAG]: 'true' })).toBe(false)
  })

  it('in-process marker: enter/exit nest and drain to inactive', () => {
    expect(innerBuildActiveInProcess()).toBe(false)
    _enterInnerBuild()
    expect(innerBuildActiveInProcess()).toBe(true)
    _enterInnerBuild()
    _exitInnerBuild()
    expect(innerBuildActiveInProcess()).toBe(true)
    _exitInnerBuild()
    expect(innerBuildActiveInProcess()).toBe(false)
    // Underflow-safe: an extra exit can't go negative.
    _exitInnerBuild()
    expect(innerBuildActiveInProcess()).toBe(false)
    _enterInnerBuild()
    expect(innerBuildActiveInProcess()).toBe(true)
    _exitInnerBuild()
  })
})
