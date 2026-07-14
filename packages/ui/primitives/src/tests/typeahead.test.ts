import { describe, expect, it } from 'vitest'
import { createTypeahead, typeaheadMatch } from '../keyboard'

// Pure-logic locks for the shared WAI-ARIA typeahead helpers used by both
// ComboboxBase (listbox) and TreeBase (tree). The integration (real key
// dispatch → active/focused signal moves) is covered by the *.browser.test.tsx
// specs; these lock the matcher + buffer semantics without DOM or fake timers.

describe('typeaheadMatch', () => {
  const labels = ['Apple', 'Apricot', 'Banana', 'Cherry']

  it('matches a full multi-char buffer starting AT the current index', () => {
    // "ba" → Banana (index 2). Start at 0.
    expect(typeaheadMatch(labels, 'ba', 0)).toBe(2)
  })

  it('is case-insensitive and prefix-based', () => {
    expect(typeaheadMatch(labels, 'CHER', 0)).toBe(3)
    expect(typeaheadMatch(labels, 'Ap', 0)).toBe(0) // first "Ap*" from index 0
  })

  it('cycles through same-letter matches (single repeated char)', () => {
    // First 'a' from index -1 → Apple (0). Repeating 'a' → buffer "aa" (allSame)
    // cycles to the NEXT "a*" after the current index.
    expect(typeaheadMatch(labels, 'a', -1)).toBe(0) // Apple
    expect(typeaheadMatch(labels, 'aa', 0)).toBe(1) // Apricot (next a*)
    expect(typeaheadMatch(labels, 'aaa', 1)).toBe(0) // wraps back to Apple
  })

  it('multi-char refine keeps the current match when it still matches', () => {
    // current = Apricot (1); typing "apr" should stay on Apricot, not jump.
    expect(typeaheadMatch(labels, 'apr', 1)).toBe(1)
  })

  it('returns -1 when nothing matches (no move)', () => {
    expect(typeaheadMatch(labels, 'z', 0)).toBe(-1)
    expect(typeaheadMatch(labels, '', 0)).toBe(-1)
    expect(typeaheadMatch([], 'a', 0)).toBe(-1)
  })

  it('wraps the search around the end of the list', () => {
    // start past the end via a same-char cycle from the last index
    expect(typeaheadMatch(labels, 'a', 3)).toBe(0) // Cherry → wrap → Apple
  })
})

describe('createTypeahead', () => {
  it('accumulates printable characters into the buffer', () => {
    const t = createTypeahead(1000)
    expect(t.push('b')).toBe('b')
    expect(t.push('a')).toBe('ba')
    expect(t.push('n')).toBe('ban')
  })

  it('ignores non-single-character keys', () => {
    const t = createTypeahead(1000)
    expect(t.push('Enter')).toBeNull()
    expect(t.push('ArrowDown')).toBeNull()
    // buffer untouched by the rejected keys
    expect(t.push('x')).toBe('x')
  })

  it('resets the buffer after the idle timeout (real timer)', async () => {
    const t = createTypeahead(40)
    expect(t.push('a')).toBe('a')
    await new Promise((r) => setTimeout(r, 70))
    // fresh burst starts a new buffer
    expect(t.push('b')).toBe('b')
  })

  it('clear() empties the buffer immediately', () => {
    const t = createTypeahead(1000)
    t.push('a')
    t.push('b')
    t.clear()
    expect(t.push('c')).toBe('c')
  })
})
