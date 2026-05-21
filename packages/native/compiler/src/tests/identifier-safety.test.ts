// Tests for the identifier-safety helper + its end-to-end impact on
// the Swift / Kotlin emit when hyphenated HTML attrs flow through.
//
// Coverage-gate analysis (2026-05-21, 525 real-world `.tsx` files):
// hyphenated attrs caused 19 of 30 swiftc-parse failures. This file
// locks in the fix at three layers: the helper itself, the Swift
// emit, and the Kotlin emit.

import { describe, expect, it } from 'vitest'
import { safeIdent } from '../identifier-safety'
import { transform } from '../index'

describe('safeIdent', () => {
  it('passes through names without hyphens', () => {
    expect(safeIdent('background')).toBe('background')
    expect(safeIdent('Counter')).toBe('Counter')
    expect(safeIdent('count')).toBe('count')
    expect(safeIdent('')).toBe('')
  })

  it('converts kebab-case to camelCase', () => {
    expect(safeIdent('data-test')).toBe('dataTest')
    expect(safeIdent('aria-label')).toBe('ariaLabel')
    expect(safeIdent('on-mount-once')).toBe('onMountOnce')
  })

  it('handles multi-segment hyphens', () => {
    expect(safeIdent('a-b-c-d-e')).toBe('aBCDE')
  })

  it('strips leading + trailing hyphens defensively', () => {
    // Neither HTML nor JSX attr names start/end with `-`, but the
    // emitter shouldn't crash if a malformed fixture provides one.
    expect(safeIdent('-data-test')).toBe('dataTest')
    expect(safeIdent('data-test-')).toBe('dataTest')
    expect(safeIdent('-')).toBe('-')
  })
})

describe('Swift emit — hyphenated HTML attrs', () => {
  it('camelCases data-* and aria-* attrs in the generic JSX emit path', () => {
    const src = `export function Card() { return <div data-test="ok" aria-label="card">x</div>; }`
    const out = transform(src, { target: 'swift' })
    // Pre-fix: \`div(data-test: "ok", aria-label: "card")\` (swiftc-invalid)
    // Post-fix: \`div(dataTest: "ok", ariaLabel: "card")\` (parses)
    expect(out.code).toContain('dataTest:')
    expect(out.code).toContain('ariaLabel:')
    expect(out.code).not.toContain('data-test')
    expect(out.code).not.toContain('aria-label')
  })

  it('preserves attrs without hyphens unchanged', () => {
    const src = `export function Bare() { return <div background="red">x</div>; }`
    const out = transform(src, { target: 'swift' })
    expect(out.code).toContain('background:')
  })
})

describe('Kotlin emit — hyphenated HTML attrs', () => {
  it('camelCases data-* and aria-* attrs in the generic JSX emit path', () => {
    const src = `export function Card() { return <div data-test="ok" aria-label="card">x</div>; }`
    const out = transform(src, { target: 'kotlin' })
    expect(out.code).toContain('dataTest =')
    expect(out.code).toContain('ariaLabel =')
    expect(out.code).not.toContain('data-test')
    expect(out.code).not.toContain('aria-label')
  })
})
