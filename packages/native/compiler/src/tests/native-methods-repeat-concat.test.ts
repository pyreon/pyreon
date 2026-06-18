// More JS string/array method → native idiom mappings (follow-on to
// join/split):
//   str.repeat(n)     → Swift `String(repeating:count:)`; Kotlin `repeat(n)` (as-is)
//   arr.concat(other) → Swift / Kotlin `(arr + other)` (immutable concat)
//   arr.findIndex(p)  → Swift `(firstIndex(where:) ?? -1)`; Kotlin `indexOfFirst(p)`
// findIndex preserves JS's `-1`-not-found sentinel (Swift's firstIndex
// returns `Int?`; the `?? -1` keeps the result a plain Int so a downstream
// `=== -1` compiles; Kotlin's indexOfFirst already returns -1).

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const tags = signal<string[]>(['a', 'b', 'c'])
  const s = signal('ab')
  return (<Stack>${body}</Stack>)
}`

describe('JS string/array method → native idiom (repeat / concat / findIndex)', () => {
  it('Swift: repeat → String(repeating:count:); concat → (arr + other); findIndex → (firstIndex ?? -1)', () => {
    const out = transform(
      SRC(
        '<Text>{s().repeat(3)}</Text>' +
          '<Text>{tags().concat(["z"]).join("-")}</Text>' +
          '<Text>{String(tags().findIndex((t) => t === "b"))}</Text>',
      ),
      { target: 'swift' },
    ).code
    expect(out).toContain('String(repeating: s, count: 3)')
    expect(out).toContain('(tags + ["z"]).joined(separator: "-")')
    expect(out).toContain('(tags.firstIndex(where: { t in t == "b" }) ?? -1)')
  })

  it('Kotlin: repeat stays native; concat → (arr + other); findIndex → indexOfFirst', () => {
    const out = transform(
      SRC(
        '<Text>{s().repeat(3)}</Text>' +
          '<Text>{tags().concat(["z"]).join("-")}</Text>' +
          '<Text>{String(tags().findIndex((t) => t === "b"))}</Text>',
      ),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('s.repeat(3)')
    expect(out).toContain('(tags + listOf("z")).joinToString("-")')
    expect(out).toContain('tags.indexOfFirst({ t -> t == "b" })')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift compiles on real swiftc', () => {
    const out = transform(
      SRC(
        '<Text>{s().repeat(3)}</Text>' +
          '<Text>{tags().concat(["z"]).join("-")}</Text>' +
          '<Text>{String(tags().findIndex((t) => t === "b"))}</Text>',
      ),
      { target: 'swift' },
    ).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(
      SRC(
        '<Text>{s().repeat(3)}</Text>' +
          '<Text>{tags().concat(["z"]).join("-")}</Text>' +
          '<Text>{String(tags().findIndex((t) => t === "b"))}</Text>',
      ),
      { target: 'kotlin' },
    ).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
