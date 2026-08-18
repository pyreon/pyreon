import { describe, expect, it } from 'vitest'
import { countCodeLines } from '../../../../../scripts/check-app-loc'

/**
 * The ratchet is only trustworthy if its counting rule is. Two properties
 * matter more than precision:
 *
 *  - deleting a COMMENT must not lower the count (otherwise the cheapest way
 *    to "win" the metric is to delete documentation);
 *  - reformatting must not change it.
 */
describe('countCodeLines', () => {
  it('counts ordinary statements', () => {
    expect(countCodeLines('const a = 1\nconst b = 2\n')).toBe(2)
  })

  it('ignores blank lines and whitespace-only lines', () => {
    expect(countCodeLines('const a = 1\n\n   \n\t\nconst b = 2\n')).toBe(2)
  })

  it('ignores line comments — deleting docs must not lower the count', () => {
    const withDocs = '// explains why\nconst a = 1\n// and more\nconst b = 2\n'
    const without = 'const a = 1\nconst b = 2\n'
    expect(countCodeLines(withDocs)).toBe(countCodeLines(without))
  })

  it('ignores block comments, including multi-line ones', () => {
    const src = ['/**', ' * A long', ' * explanation.', ' */', 'const a = 1'].join('\n')
    expect(countCodeLines(src)).toBe(1)
  })

  it('ignores a single-line block comment without leaving the block open', () => {
    // The bug this guards: treating `/* x */` as opening a block would swallow
    // every following line and silently report a near-zero count.
    expect(countCodeLines('/* short */\nconst a = 1\nconst b = 2\n')).toBe(2)
  })

  it('does NOT count commented-out code', () => {
    const src = ['/*', 'const dead = 1', 'const alsoDead = 2', '*/', 'const live = 3'].join('\n')
    expect(countCodeLines(src)).toBe(1)
  })

  it('counts imports — one lever targets them, so hiding them would hide it', () => {
    expect(countCodeLines("import { a } from 'x'\nimport { b } from 'y'\n")).toBe(2)
  })

  it('counts a trailing-comment line as code', () => {
    expect(countCodeLines('const a = 1 // why\n')).toBe(1)
  })

  it('is stable across an empty file', () => {
    expect(countCodeLines('')).toBe(0)
    expect(countCodeLines('\n\n')).toBe(0)
  })
})
