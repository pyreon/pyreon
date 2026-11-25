// A `<Defer>` whose chunk failed to load with no enclosing <ErrorBoundary>
// (core `defer.ts`). The logged message must be explained by diagnose.
import { describe, expect, it } from 'vitest'
import { diagnoseError } from '../diagnose'

const LOGGED =
  '[Pyreon] <Defer> failed to load and no <ErrorBoundary> encloses it, so nothing is rendered. ' +
  'Wrap the <Defer> in an <ErrorBoundary> to show a fallback:'

describe('diagnose: a <Defer> chunk that failed to load outside any boundary', () => {
  it('explains the empty slot and points at an ErrorBoundary with reset()', () => {
    const d = diagnoseError(LOGGED)
    expect(d?.cause).toContain('`<Defer>`')
    expect(d?.cause).toContain('no `<ErrorBoundary>` encloses')
    expect(d?.fix).toContain('reset()')
    expect(d?.fixCode).toContain('<ErrorBoundary')
    expect(d?.fixCode).toContain('<Defer')
  })

  it('wins over the generic chunk-load entry when the browser error is on the same line', () => {
    const d = diagnoseError(`${LOGGED} TypeError: Failed to fetch dynamically imported module: /assets/Chart-1a2b.js`)
    expect(d?.cause).toContain('`<Defer>`')
  })
})
