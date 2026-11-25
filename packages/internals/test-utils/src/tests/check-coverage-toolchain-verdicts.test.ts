import { describe, expect, it } from 'vitest'
import { TOOLCHAIN_VERDICT_ONLY, toolchainVerdictEnv } from '../../../../../scripts/check-coverage'

/**
 * `@pyreon/lathe`'s coverage run crossed the 600 s deadline on a commit that
 * did not touch it: its native suites spawned a cold kotlinc JVM per file on a
 * shared four-core runner, for compile verdicts that cover none of lathe's own
 * source. Those packages' coverage runs skip the toolchain; their Test cells
 * still run it.
 */
describe('check-coverage — toolchain-verdict-only packages', () => {
  it('skips the real swiftc/kotlinc in @pyreon/lathe coverage', () => {
    expect(toolchainVerdictEnv('@pyreon/lathe')).toEqual({ PYREON_SKIP_NATIVE_VALIDATE: '1' })
  })

  it('leaves every other package with the toolchain', () => {
    expect(toolchainVerdictEnv('@pyreon/reactivity')).toEqual({})
    expect(toolchainVerdictEnv('@pyreon/native-cli')).toEqual({})
  })

  it('never lists @pyreon/native-compiler, whose source IS the validators', () => {
    expect(TOOLCHAIN_VERDICT_ONLY).not.toHaveProperty('@pyreon/native-compiler')
    expect(toolchainVerdictEnv('@pyreon/native-compiler')).toEqual({})
  })

  it('records the measured with/without proof for every entry', () => {
    for (const [name, proof] of Object.entries(TOOLCHAIN_VERDICT_ONLY)) {
      expect(proof, name).toMatch(/statements/)
      expect(proof, name).toMatch(/branches/)
    }
  })
})
