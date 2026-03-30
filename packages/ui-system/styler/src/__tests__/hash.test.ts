import { describe, expect, it } from 'vitest'
import { hash } from '../hash'

describe('hash', () => {
  it('returns a string', () => {
    expect(typeof hash('test')).toBe('string')
  })

  it('is deterministic — same input always produces same output', () => {
    const input = 'display: flex; color: red;'
    expect(hash(input)).toBe(hash(input))
  })

  it('produces different hashes for different inputs', () => {
    expect(hash('color: red')).not.toBe(hash('color: blue'))
  })

  it('returns base-36 string (compact)', () => {
    const result = hash('some css')
    expect(result).toMatch(/^[0-9a-z]+$/)
  })

  it('handles empty string', () => {
    const result = hash('')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles long CSS strings', () => {
    const longCSS = 'display: flex; '.repeat(100)
    const result = hash(longCSS)
    expect(typeof result).toBe('string')
    // base-36 uint32 is at most 7 chars
    expect(result.length).toBeLessThan(10)
  })

  it('handles special characters in CSS', () => {
    const css = `@media (min-width: 48em) { .foo { content: "hello"; } }`
    const result = hash(css)
    expect(typeof result).toBe('string')
  })

  it('produces consistent hash for FNV-1a offset basis on empty string', () => {
    // Empty string: h stays at FNV_OFFSET = 2166136261, base36 = "zzzzzz" range
    const result = hash('')
    // Just verify it is stable
    expect(result).toBe(hash(''))
  })

  it('handles unicode characters', () => {
    const result = hash('content: "🎉";')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('single character inputs produce distinct hashes', () => {
    const hashes = new Set<string>()
    for (let i = 0; i < 26; i++) {
      hashes.add(hash(String.fromCharCode(97 + i)))
    }
    // All 26 lowercase letters should hash to unique values
    expect(hashes.size).toBe(26)
  })

  it('hash is unsigned 32-bit (no negative values)', () => {
    // base-36 of a uint32 is always positive
    const result = hash('test negative')
    expect(Number.parseInt(result, 36)).toBeGreaterThanOrEqual(0)
  })
})
