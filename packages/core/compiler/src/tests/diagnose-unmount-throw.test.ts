// A user teardown callback that threw during unmount (runtime-dom
// `guardTeardown`). The logged messages must be explained by diagnose.
import { describe, expect, it } from 'vitest'
import { diagnoseError } from '../diagnose'

describe('diagnose: an error thrown during unmount', () => {
  it('an onUnmount hook (or an onMount cleanup) of a named component', () => {
    const d = diagnoseError('[Pyreon] Error in onUnmount hook of <Chart>: Error: boom')
    expect(d?.cause).toContain('`onUnmount` hook of `<Chart>`')
    expect(d?.cause).toContain('the teardown continued')
    expect(d?.fix).toContain('stack')
    expect(d?.fixCode).toContain('clearInterval')
  })

  it('an anonymous component', () => {
    expect(diagnoseError('[Pyreon] Error in onUnmount hook of <>: Error: boom')?.cause).toContain('`<Anonymous>`')
  })

  it('a ref callback (or an object ref setter)', () => {
    const d = diagnoseError('[Pyreon] Error in ref callback: TypeError: x is null')
    expect(d?.cause).toContain('ref callback')
    expect(d?.fix).toContain('receives `null` on unmount')
  })

  it('does not swallow the mount-phase hook message', () => {
    expect(diagnoseError('[Pyreon] Error in onMount hook of <Chart>: Error: boom')?.cause ?? '').not.toContain(
      'being unmounted',
    )
  })
})
