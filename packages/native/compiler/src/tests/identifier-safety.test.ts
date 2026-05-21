// Tests for the identifier-safety helper + its end-to-end impact on
// the Swift / Kotlin emit when hyphenated HTML attrs flow through.
//
// Coverage-gate analysis (2026-05-21, 525 real-world `.tsx` files):
// hyphenated attrs caused 19 of 30 swiftc-parse failures. This file
// locks in the fix at three layers: the helper itself, the Swift
// emit, and the Kotlin emit.

import { describe, expect, it } from 'vitest'
import { kotlinIdent, safeIdent, swiftIdent } from '../identifier-safety'
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

describe('swiftIdent — reserved-keyword escape', () => {
  it('backtick-wraps Swift-reserved identifiers', () => {
    expect(swiftIdent('guard')).toBe('`guard`')
    expect(swiftIdent('class')).toBe('`class`')
    expect(swiftIdent('let')).toBe('`let`')
    expect(swiftIdent('func')).toBe('`func`')
    expect(swiftIdent('return')).toBe('`return`')
    expect(swiftIdent('Any')).toBe('`Any`')
  })

  it('passes through non-keywords unchanged', () => {
    expect(swiftIdent('Counter')).toBe('Counter')
    expect(swiftIdent('count')).toBe('count')
    expect(swiftIdent('title')).toBe('title')
    expect(swiftIdent('myGuard')).toBe('myGuard') // contains 'guard' substring, not the exact keyword
  })
})

describe('kotlinIdent — reserved-keyword escape', () => {
  it('backtick-wraps Kotlin-reserved identifiers', () => {
    expect(kotlinIdent('class')).toBe('`class`')
    expect(kotlinIdent('fun')).toBe('`fun`')
    expect(kotlinIdent('val')).toBe('`val`')
    expect(kotlinIdent('var')).toBe('`var`')
    expect(kotlinIdent('object')).toBe('`object`')
    expect(kotlinIdent('when')).toBe('`when`')
  })

  it('does NOT escape Swift-only keywords like `guard`', () => {
    // `guard` is reserved in Swift but a valid Kotlin identifier.
    expect(kotlinIdent('guard')).toBe('guard')
  })

  it('passes through non-keywords unchanged', () => {
    expect(kotlinIdent('Counter')).toBe('Counter')
    expect(kotlinIdent('count')).toBe('count')
  })
})

describe('Swift emit — reserved-keyword component/prop/var names', () => {
  it('backtick-escapes a component named `guard` (route-guard convention)', () => {
    const src = `export function guard() { return <Text>protected</Text>; }`
    const out = transform(src, { target: 'swift' })
    // Pre-fix: \`struct guard: View\` (swiftc rejects: keyword can't be identifier)
    // Post-fix: \`struct \`guard\`: View\` (swiftc parses)
    expect(out.code).toContain('struct `guard`: View')
  })

  it('backtick-escapes a `class` prop name', () => {
    const src = `export function Card(props: { class: string }) { return <Text>{props.class}</Text>; }`
    const out = transform(src, { target: 'swift' })
    expect(out.code).toContain('let `class`: String')
    // The member-access rewrite \`props.class\` → \`class\` also escapes:
    expect(out.code).toContain('\\(`class`)')
  })

  it('preserves non-colliding names', () => {
    const src = `export function Counter() { const count = signal<number>(0); return <Text>{count}</Text>; }`
    const out = transform(src, { target: 'swift' })
    expect(out.code).toContain('struct Counter: View')
    expect(out.code).toContain('@State private var count')
    expect(out.code).not.toContain('`Counter`')
    expect(out.code).not.toContain('`count`')
  })
})

describe('Kotlin emit — reserved-keyword component/prop/var names', () => {
  it('backtick-escapes a `class` prop name', () => {
    const src = `export function Card(props: { class: string }) { return <Text>{props.class}</Text>; }`
    const out = transform(src, { target: 'kotlin' })
    expect(out.code).toContain('`class`: String')
  })

  it('does NOT escape `guard` on Kotlin (not a Kotlin keyword)', () => {
    const src = `export function guard() { return <Text>protected</Text>; }`
    const out = transform(src, { target: 'kotlin' })
    // \`guard\` is NOT a Kotlin keyword — bare identifier is fine.
    expect(out.code).toContain('fun guard()')
    expect(out.code).not.toContain('`guard`')
  })
})
