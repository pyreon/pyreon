// More JS string/array method → native idiom mappings:
//   str.replaceAll(a,b) → Swift `replacingOccurrences(of:with:)` /
//                         Kotlin `replace(a,b)` (both replace-ALL —
//                         faithful, unlike JS `replace` which is first-only)
//   arr.flat()          → Swift `flatMap { $0 }` / Kotlin `flatten()` (depth-1)
//   arr.reverse()       → Swift `Array(reversed())` / Kotlin `reversed()`
//                         (non-mutating, render-safe; mirrors rx.reverse)

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const s = signal('banana')
  const xs = signal<string[]>(['a', 'b', 'c'])
  const xss = signal<string[][]>([['a'], ['b', 'c']])
  return (<Stack>${body}</Stack>)
}`

const ALL =
  '<Text>{s().replaceAll("a", "o")}</Text>' +
  '<Text>{xss().flat().join(",")}</Text>' +
  '<Text>{xs().reverse().join(",")}</Text>'

describe('JS string/array method → native idiom (replaceAll / flat / reverse)', () => {
  it('Swift: replacingOccurrences / flatMap { $0 } / Array(reversed())', () => {
    const out = transform(SRC(ALL), { target: 'swift' }).code
    expect(out).toContain('s.replacingOccurrences(of: "a", with: "o")')
    expect(out).toContain('xss.flatMap { $0 }.joined(separator: ",")')
    expect(out).toContain('Array(xs.reversed()).joined(separator: ",")')
  })

  it('Kotlin: replace / flatten / reversed', () => {
    const out = transform(SRC(ALL), { target: 'kotlin' }).code
    expect(out).toContain('s.replace("a", "o")')
    expect(out).toContain('xss.flatten().joinToString(",")')
    expect(out).toContain('xs.reversed().joinToString(",")')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift compiles on real swiftc', () => {
    const out = transform(SRC(ALL), { target: 'swift' }).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(SRC(ALL), { target: 'kotlin' }).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
