/**
 * Coverage-focused tests for small node-side gaps.
 *
 * Targets:
 * - Portal SSR branch (`typeof document === 'undefined'` → null) — line 34
 * - Text styled.ts extraStyles branch variants — 1 uncov stmt
 */
import { afterEach, describe, expect, it } from 'vitest'
import { Portal } from '../Portal'

describe('Portal SSR branch', () => {
  const originalDocument = globalThis.document

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
      writable: true,
    })
  })

  it('returns null when document is undefined (line 34 SSR branch)', () => {
    Object.defineProperty(globalThis, 'document', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    // Portal is a PyreonComponent — calling it directly returns its render
    // output. In SSR mode (document undefined) it bails to null.
    const result = (Portal as unknown as (props: { children?: unknown }) => unknown)({
      children: null,
    })
    expect(result).toBeNull()
  })
})
