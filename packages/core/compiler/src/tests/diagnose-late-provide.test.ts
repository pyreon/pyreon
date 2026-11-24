// A provide() after the component's children mounted is invisible to them
// (lazy context owner). The dev warning must be explained by diagnose.
import { describe, expect, it } from 'vitest'
import { diagnoseError } from '../diagnose'

describe('diagnose: late provide()', () => {
  it.each([
    [
      'provide',
      "[Pyreon] provide() ran after this component had already mounted children (late in the setup body, after a child component, or in onMount). Those children resolve context through the parent's owner and will not see this value. Call it before the component builds or returns its children.",
    ],
    ['withContext', '[Pyreon] withContext() ran after this component had already mounted children (late in the setup body'],
  ])('%s', (_name, message) => {
    const d = diagnoseError(message)
    expect(d?.cause).toContain('FIRST `provide()`')
    expect(d?.fix).toContain('before it builds or returns any children')
  })

  it('does not match an unrelated message', () => {
    expect(diagnoseError('[Pyreon] provide() called with an undefined context')?.cause ?? '').not.toContain(
      'FIRST `provide()`',
    )
  })
})
