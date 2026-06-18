// JS string/array data-shaping methods → native idioms.
//   arr.join(sep?)  → Swift `joined(separator:)` / Kotlin `joinToString(sep)`
//   str.split(sep)  → Swift `components(separatedBy:)` (Foundation);
//                     Kotlin `split` already matches JS as-is.
// JS's default join separator is "," (emitted explicitly — Kotlin's
// joinToString default is ", ", which differs). Pre-fix these fell through
// to the generic member-call emit (`xs.join(...)` / `s.split(...)`), which
// is not valid Swift.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const SRC = (body: string) =>
  `import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function C() {
  const tags = signal<string[]>(['a', 'b', 'c'])
  const csv = signal('x,y,z')
  return (<Stack>${body}</Stack>)
}`

describe('JS string/array method → native idiom', () => {
  it('Swift: arr.join(sep) → joined(separator:); join() → joined(separator: ",")', () => {
    const out = transform(SRC('<Text>{tags().join(", ")}</Text><Text>{tags().join()}</Text>'), {
      target: 'swift',
    }).code
    expect(out).toContain('tags.joined(separator: ", ")')
    expect(out).toContain('tags.joined(separator: ",")')
  })

  it('Kotlin: arr.join(sep) → joinToString(sep); join() → joinToString(",")', () => {
    const out = transform(SRC('<Text>{tags().join(", ")}</Text><Text>{tags().join()}</Text>'), {
      target: 'kotlin',
    }).code
    expect(out).toContain('tags.joinToString(", ")')
    expect(out).toContain('tags.joinToString(",")')
  })

  it('Swift: str.split(sep) → components(separatedBy:)', () => {
    const out = transform(SRC('<Text>{csv().split(",").join(" / ")}</Text>'), {
      target: 'swift',
    }).code
    expect(out).toContain('csv.components(separatedBy: ",").joined(separator: " / ")')
  })

  it('Kotlin: str.split stays native split; join → joinToString', () => {
    const out = transform(SRC('<Text>{csv().split(",").join(" / ")}</Text>'), {
      target: 'kotlin',
    }).code
    expect(out).toContain('csv.split(",").joinToString(" / ")')
  })

  it.skipIf(!isSwiftcAvailable())('emitted Swift compiles on real swiftc', () => {
    const out = transform(
      SRC('<Text>{tags().join(", ")}</Text><Text>{csv().split(",").join(" / ")}</Text>'),
      { target: 'swift' },
    ).code
    const r = validateSwift(out)
    if (!r.ok) throw new Error(`swiftc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('emitted Kotlin compiles on real kotlinc', () => {
    const out = transform(
      SRC('<Text>{tags().join(", ")}</Text><Text>{csv().split(",").join(" / ")}</Text>'),
      { target: 'kotlin' },
    ).code
    const r = validateKotlin(out)
    if (!r.ok) throw new Error(`kotlinc rejected:\n${r.error}\n---\n${out}`)
    expect(r.ok).toBe(true)
  })
})
