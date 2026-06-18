// Loud-warning sweep — top-level `interface` / TS `enum` / `class`
// declarations are silently DROPPED by PMTC (they emit nothing, so native
// code referencing them fails to compile on the real swiftc/kotlinc build —
// which the parse-only PR gate can't catch). They now produce an actionable
// `result.warnings` entry redirecting to the supported shape. Supported
// shapes (string-literal union alias → enum, object alias → struct,
// components, stores) must NOT warn.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const wrap = (decl: string, body = 'function C() { return (<Stack><Text>x</Text></Stack>) }') =>
  `import { Stack, Text } from '@pyreon/primitives'\n${decl}\n${body}`

const declWarnings = (src: string) =>
  transform(src, { target: 'swift' }).warnings.filter((w) => w.includes('NOT compiled to native'))

describe('loud warnings for silently-dropped top-level declarations', () => {
  it('`interface` warns + redirects to a `type X = { … }` alias', () => {
    const w = declWarnings(wrap('interface User { id: number }'))
    expect(w.length).toBe(1)
    expect(w[0]).toContain('`interface User`')
    expect(w[0]).toContain("type User = { … }")
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

  it('exported `interface` / `enum` warn too', () => {
    const w = declWarnings(wrap('export interface P { id: number }\nexport enum E { A, B }'))
    expect(w.length).toBe(2)
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
