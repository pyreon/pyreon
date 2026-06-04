/**
 * Component-reference validation — known/unknown name resolution +
 * Levenshtein "did you mean" suggestions + import-binding extraction.
 */
import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_COMPONENTS,
  editDistance,
  extractImportBindings,
  formatValidationError,
  validateComponentRefs,
} from '../mdx-scan/validate'

describe('editDistance', () => {
  it.each([
    ['', '', 0],
    ['hello', 'hello', 0],
    ['hello', '', 5],
    ['', 'hello', 5],
    ['kitten', 'sitting', 3],
    ['Callout', 'Calout', 1],
    ['CodeGroup', 'CodeGruop', 2],
    ['abc', 'xyz', 3],
  ])('editDistance(%j, %j) === %j', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected)
  })

  it('is case-insensitive', () => {
    expect(editDistance('Foo', 'foo')).toBe(0)
    expect(editDistance('CALLOUT', 'callout')).toBe(0)
  })
})

describe('validateComponentRefs', () => {
  it('accepts built-in component references', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['Callout', 'CodeGroup', 'CodeBlock'],
    })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('accepts scanned components', () => {
    const result = validateComponentRefs({
      scannedNames: ['Playground', 'CustomCard'],
      hoistedNames: [],
      referencedNames: ['Playground', 'CustomCard'],
    })
    expect(result.ok).toBe(true)
  })

  it('accepts hoisted-import bindings', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: ['Local', 'External'],
      referencedNames: ['Local', 'External'],
    })
    expect(result.ok).toBe(true)
  })

  it('reports unknown references with a "did you mean" suggestion', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['Calout'], // typo
    })
    expect(result.ok).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]!.name).toBe('Calout')
    expect(result.issues[0]!.suggestion).toBe('Callout')
  })

  it('reports null suggestion when no candidate is within distance 3', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['CompletelyDifferent'],
    })
    expect(result.ok).toBe(false)
    expect(result.issues[0]!.suggestion).toBeNull()
    expect(result.issues[0]!.candidates).toEqual([])
  })

  it('honours extraBuiltIns for plugin-side overrides', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['MyCustom'],
      extraBuiltIns: ['MyCustom'],
    })
    expect(result.ok).toBe(true)
  })

  it('reports multiple issues at once', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['Calout', 'Codegroup', 'TotallyMade'],
    })
    expect(result.issues).toHaveLength(3)
  })

  it('breaks distance ties with alphabetical order', () => {
    // Two same-distance matches → comparator falls through to the
    // localeCompare branch, picking the alphabetically smaller name.
    const result = validateComponentRefs({
      scannedNames: ['Zigzag', 'Aigzag'],
      hoistedNames: [],
      // distance 1 to both `Zigzag` and `Aigzag` (substitute first char)
      referencedNames: ['Bigzag'],
    })
    expect(result.issues[0]!.candidates[0]).toBe('Aigzag')
  })
})

describe('formatValidationError', () => {
  it('returns empty string when validation is ok', () => {
    expect(
      formatValidationError({ ok: true, issues: [] }, '/abs/x.md'),
    ).toBe('')
  })

  it('formats a single-issue error with suggestion', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['Calout'],
    })
    const msg = formatValidationError(result, 'src/content/x.md')
    expect(msg).toContain('1 unknown component reference')
    expect(msg).toContain('<Calout />')
    expect(msg).toContain('Did you mean <Callout />?')
    expect(msg).toContain('src/content/x.md')
  })

  it('formats a no-suggestion error', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['CompletelyDifferent'],
    })
    const msg = formatValidationError(result, 'x.md')
    expect(msg).toContain('Unknown component <CompletelyDifferent />')
    expect(msg).toContain('No close match found')
  })

  it('lists every available built-in component in the help line', () => {
    const result = validateComponentRefs({
      scannedNames: [],
      hoistedNames: [],
      referencedNames: ['Unknown'],
    })
    const msg = formatValidationError(result, 'x.md')
    for (const builtin of BUILT_IN_COMPONENTS) {
      expect(msg).toContain(builtin)
    }
  })
})

describe('extractImportBindings', () => {
  it.each([
    [`import Foo from './x'`, ['Foo']],
    [`import { A, B } from './x'`, ['A', 'B']],
    [`import { A as B } from './x'`, ['B']],
    [`import { A, B as C } from './x'`, ['A', 'C']],
    [`import D, { A, B } from './x'`, ['D', 'A', 'B']],
    [`import * as Ns from './x'`, ['Ns']],
    [`import type Foo from './x'`, ['Foo']],
    [`import './side-effect'`, []],
  ])('extractImportBindings(%j) === %j', (input, expected) => {
    const actual = extractImportBindings(input).sort()
    expect(actual).toEqual([...expected].sort())
  })

  it('handles multiple imports on separate lines', () => {
    const esm = `import A from './A'
import { B, C } from './B'
import * as D from './D'`
    expect(extractImportBindings(esm).sort()).toEqual(['A', 'B', 'C', 'D'])
  })
})
