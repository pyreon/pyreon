import { describe, expect, it } from 'vitest'
import {
  NATIVE_BINARY_REQUIREMENTS,
  missingNativeBinaries,
} from '../../../../../scripts/check-coverage'

/**
 * `@pyreon/compiler`'s coverage floor is measured with its native binary
 * loaded. `build-native.ts` skips silently without cargo, so before this
 * preflight the floor verdict depended on whether the runner had cargo on
 * PATH (96.77% without, 97.11% with, on the same tree). A missing required
 * binary must fail the run once with the fix, never shrink the suite.
 */
describe('check-coverage — required native binaries', () => {
  const BIN = 'packages/core/compiler/native/pyreon-compiler.node'

  it('fails a run that selects @pyreon/compiler without its binary, naming the fix', () => {
    const problems = missingNativeBinaries(['@pyreon/reactivity', '@pyreon/compiler'], () => false)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('@pyreon/compiler')
    expect(problems[0]).toContain(BIN)
    expect(problems[0]).toContain("bun run --filter='@pyreon/compiler' build:native")
    expect(problems[0]).toContain('--skip=@pyreon/compiler')
  })

  it('passes when the binary is present', () => {
    expect(missingNativeBinaries(['@pyreon/compiler'], (p) => p === BIN)).toEqual([])
  })

  it('does not require the binary for a run that does not measure the compiler', () => {
    expect(missingNativeBinaries(['@pyreon/reactivity', '@pyreon/router'], () => false)).toEqual([])
  })

  it('tells the measured suite to fail when the binary exists but does not load', () => {
    // The compiler's specs assert `nativeTransform !== null` under this flag.
    expect(NATIVE_BINARY_REQUIREMENTS['@pyreon/compiler']?.env).toEqual({
      PYREON_REQUIRE_NATIVE_COMPILER: '1',
    })
  })
})
