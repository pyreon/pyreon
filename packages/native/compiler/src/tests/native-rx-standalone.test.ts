// `@pyreon/rx`'s STANDALONE transforms did not lower — only the `rx.*`
// namespace form did. rx's own manifest reaches for the standalone form 43
// times and the namespace form 5, so the documented, dominant idiom was the
// one that emitted itself verbatim and failed the native build with
// `cannot find 'map' in scope`.
//
// The two are structurally identical — both source-first, `map(src, fn)` vs
// `rx.map(src, fn)` — so the recognizer only had to accept the second callee
// shape. What it must NOT do is accept it by NAME: `map`, `filter` and
// `first` are names a user is overwhelmingly likely to have of their own, so
// resolution goes through the import, the rule `@pyreon/validate`'s `s`
// already follows.
//
// `pipe()` is deliberately NOT lowered — see the decline spec. That is a
// measured decision (the closure emit fails BOTH toolchains), not an
// oversight.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { filter, map, take, unique } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1, 2, 3, 4])
  const evens = filter(nums, (n) => n % 2 === 0)
  const doubled = map(nums, (n) => n * 2)
  const first2 = take(nums, 2)
  const uniq = unique(nums)
  return <Text>{evens().length + doubled().length + first2().length + uniq().length}</Text>
}`

describe('the standalone transforms lower', () => {
  it('Swift: each becomes a computed over the collection', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('nums.filter({ n in n % 2 == 0 })')
    expect(out).toContain('nums.map({ n in n * 2 })')
    // The verbatim passthrough — the whole bug in one string.
    expect(out).not.toContain('filter(nums')
  })

  it('Kotlin: each becomes a derivedStateOf', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('nums.filter({ n -> n % 2 == 0 })')
    expect(out).toContain('nums.map({ n -> n * 2 })')
    expect(out).not.toContain('filter(nums')
  })

  it('lowering is silent — the import no longer claims it is web-only', () => {
    expect(transform(APP, { target: 'swift' }).warnings).toEqual([])
    expect(transform(APP, { target: 'kotlin' }).warnings).toEqual([])
  })
})

describe('resolution goes through the IMPORT, never the bare name', () => {
  const OWN = `import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
function map(xs: number[], f: (n: number) => number): number[] { return xs }
export function App() {
  const s = signal<number[]>([1])
  const r = map(s(), (x) => x)
  return <Text>{r.length}</Text>
}`

  it("a user's OWN `map` is left alone", () => {
    const r = transform(OWN, { target: 'swift' })
    expect(r.warnings.join('\n')).not.toContain('@pyreon/rx')
    // …and the call is NOT rewritten into a collection transform.
    expect(r.code).not.toContain('s.map(')
  })

  it('an ALIASED import still resolves to the transform', () => {
    const src = `import { map as project } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1])
  const out = project(nums, (n) => n * 2)
  return <Text>{out().length}</Text>
}`
    expect(transform(src, { target: 'swift' }).code).toContain('nums.map({ n in n * 2 })')
  })
})

describe('what does not lower declines BY NAME', () => {
  const decline = (imports: string, body: string) =>
    transform(
      `import { ${imports} } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([1])
  ${body}
  return <Text>{out().length}</Text>
}`,
      { target: 'swift' },
    ).warnings.join('\n')

  it('pipe() declines and names the alternative that does lower', () => {
    const w = decline('pipe', 'const out = pipe(nums, (xs) => xs.filter((n) => n > 1))')
    expect(w).toContain('pipe()')
    expect(w).toContain('fails to compile on both targets')
    expect(w).toContain('filter(src, p)')
  })

  it('a transform outside the lowered set names itself', () => {
    expect(decline('groupBy', 'const out = groupBy(nums, (n) => n)')).toContain('groupBy')
  })
})

describe('unique() preserves FIRST-occurrence order on both targets', () => {
  // Swift emitted `Array(Set(_:))`, whose comment claimed it matched rx's
  // "set of unique values" semantic. Measured, rx returns first-occurrence
  // order ([3,1,2,3,4] → [3,1,2,4]) and Kotlin's distinct() preserves it —
  // so Swift was the only one of the three that did not, and a <For> over
  // unique(...) rendered in an arbitrary order on iOS alone.
  const src = `import { unique } from '@pyreon/rx'
import { signal } from '@pyreon/reactivity'
import { Text } from '@pyreon/primitives'
export function App() {
  const nums = signal<number[]>([3, 1, 2, 3, 4])
  const u = unique(nums)
  return <Text>{u().length}</Text>
}`

  it('Swift no longer routes through an UNORDERED Set', () => {
    const out = transform(src, { target: 'swift' }).code
    expect(out).not.toContain('Array(Set(nums))')
    expect(out).toContain('firstIndex(of:')
  })

  it('Kotlin keeps distinct(), which already preserved order', () => {
    expect(transform(src, { target: 'kotlin' }).code).toContain('nums.distinct()')
  })

  it.skipIf(!isSwiftcAvailable())('the ordered form type-checks', () => {
    const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('the emitted transforms survive the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
