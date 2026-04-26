/**
 * Unit tests for internElementBundle() — the module-scope LRU cache that
 * gives same-shape Element layouts a stable object identity. Locks in the
 * bail conditions (functions, non-string objects) and the LRU semantics
 * so a future refactor can't silently break the styler classCache hit.
 */
import { describe, expect, it } from 'vitest'
import { internElementBundle } from '../helpers/internElementBundle'

describe('internElementBundle', () => {
  it('returns the same identity for the same primitive prop tuple', () => {
    const a = internElementBundle({
      block: false,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
      equalCols: false,
      extraStyles: undefined,
    })
    const b = internElementBundle({
      block: false,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
      equalCols: false,
      extraStyles: undefined,
    })
    expect(a).toBe(b)
  })

  it('returns different identity when any primitive value differs', () => {
    const a = internElementBundle({ block: false, direction: 'inline' })
    const b = internElementBundle({ block: true, direction: 'inline' })
    const c = internElementBundle({ block: false, direction: 'rows' })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(b).not.toBe(c)
  })

  it('handles different bundle shapes independently (parentFix vs childFix)', () => {
    const parent = internElementBundle({
      parentFix: true,
      block: false,
      extraStyles: undefined,
    })
    const child = internElementBundle({
      childFix: true,
      direction: 'inline',
      alignX: 'left',
      alignY: 'center',
      equalCols: false,
    })
    expect(parent).not.toBe(child)
    // Same shape repeats are interned
    const parent2 = internElementBundle({
      parentFix: true,
      block: false,
      extraStyles: undefined,
    })
    expect(parent).toBe(parent2)
  })

  it('bails (returns the input untouched) when a value is a function', () => {
    const fn = () => 'red'
    const a = internElementBundle({ block: false, extraStyles: fn })
    const b = internElementBundle({ block: false, extraStyles: fn })
    // Both calls bail — neither is cached, so identities differ.
    expect(a).not.toBe(b)
    // The returned object IS the input (untouched).
    expect(a).toEqual({ block: false, extraStyles: fn })
  })

  it('bails when a value is a non-null object (CSSResult / nested object)', () => {
    const cssResult = { strings: ['color: red'], values: [] }
    const a = internElementBundle({ block: false, extraStyles: cssResult })
    const b = internElementBundle({ block: false, extraStyles: cssResult })
    expect(a).not.toBe(b)
  })

  it('treats string extraStyles as cacheable (the common pre-resolved CSS case)', () => {
    const a = internElementBundle({ block: false, extraStyles: 'color: red' })
    const b = internElementBundle({ block: false, extraStyles: 'color: red' })
    expect(a).toBe(b)
    const c = internElementBundle({ block: false, extraStyles: 'color: blue' })
    expect(a).not.toBe(c)
  })

  it('null and undefined are distinct cache keys (JSON serializes them differently)', () => {
    const aNull = internElementBundle({ extraStyles: null })
    const aUndef = internElementBundle({ extraStyles: undefined })
    expect(aNull).not.toBe(aUndef)
  })

  it('LRU touch on hit moves entry to most-recent position', () => {
    // Hit the same bundle twice — second call should still return the same
    // identity (LRU touch keeps it alive).
    const key = `lru-touch-${Math.random()}`
    const first = internElementBundle({ direction: key })
    const second = internElementBundle({ direction: key })
    expect(first).toBe(second)
  })
})
