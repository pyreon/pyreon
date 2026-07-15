// Loud-warning sweep — top-level TS `enum` / `class` (and GENERIC-or-`extends`
// `interface`) declarations are silently DROPPED by PMTC (they emit nothing, so
// native code referencing them fails to compile on the real swiftc/kotlinc build
// — which the parse-only PR gate can't catch). They produce an actionable
// `result.warnings` entry redirecting to the supported shape. Supported shapes
// (string-literal union alias → enum, object alias OR object-shape `interface`
// → struct, components, stores) must NOT warn.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const wrap = (decl: string, body = 'function C() { return (<Stack><Text>x</Text></Stack>) }') =>
  `import { Stack, Text } from '@pyreon/primitives'\n${decl}\n${body}`

const declWarnings = (src: string) =>
  transform(src, { target: 'swift' }).warnings.filter((w) => w.includes('NOT compiled to native'))

describe('loud warnings for silently-dropped top-level declarations', () => {
  it('object-shape `interface` is SYNTHESIZED into a struct (no unsupported-decl warning)', () => {
    // parse.ts:tryStructFromInterface — a top-level object-shape interface now
    // emits a struct/data-class, same as a `type X = { … }` alias.
    const src = wrap('interface User { id: number }')
    expect(declWarnings(src).length).toBe(0)
    expect(transform(src, { target: 'swift' }).code).toContain('struct User')
    expect(transform(src, { target: 'kotlin' }).code).toContain('data class User')
  })

  it('GENERIC `interface` still warns (out of the synthesizable subset)', () => {
    const w = declWarnings(wrap('interface Box<T> { value: T }'))
    expect(w.length).toBe(1)
    expect(w[0]).toContain('`interface Box`')
  })

  it('TS `enum` warns + redirects to a string-literal union alias', () => {
    const w = declWarnings(wrap('enum Color { Red, Green }'))
    expect(w.length).toBe(1)
    expect(w[0]).toContain('enum Color')
    expect(w[0]).toContain("type Color = 'a' | 'b'")
  })

  it('`class` warns + redirects to functions + signals', () => {
    const w = declWarnings(wrap('class Pt { x = 1 }'))
    expect(w.length).toBe(1)
    expect(w[0]).toContain('`class Pt`')
    expect(w[0]).toContain('functions + signals')
  })

  it('exported object-shape `interface` SYNTHESIZES; exported `enum` still warns', () => {
    const w = declWarnings(wrap('export interface P { id: number }\nexport enum E { A, B }'))
    expect(w.length).toBe(1)
    expect(w[0]).toContain('enum E')
    expect(transform(wrap('export interface P { id: number }'), { target: 'swift' }).code).toContain(
      'struct P',
    )
  })

  it('NO false positive: string-union alias, object alias, component, signal', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
type Filter = 'all' | 'active' | 'done'
type Item = { id: number; label: string }
function Row() { return (<Stack><Text>row</Text></Stack>) }
function C() {
  const f = signal<Filter>('all')
  return (<Stack><Row /><Text>{f()}</Text></Stack>)
}`
    expect(declWarnings(src).length).toBe(0)
    // and Kotlin path is equally clean
    expect(transform(src, { target: 'kotlin' }).warnings.filter((w) => w.includes('NOT compiled to native')).length).toBe(0)
  })
})
