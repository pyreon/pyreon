// `x === null` / `x !== null` on an optional STRUCT parameter narrows in TS
// and in Kotlin (smart cast) but never in Swift, which needs a binding: the
// else-body of `if (r === null) … else { r.start }` read `r.start` on `Range?`
// and did not compile — the shape every `onBrush(range | null)` handler has.
// The classifier now names the operand for the comparison forms; the Swift
// `if` binds on both polarities (bodies swapped for `=== null`), and a
// narrowing ternary lowers to `r.map { r in … } ?? …`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const SRC = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface Range { start: number; end: number }
export function Brushed() {
  const sel = signal('')
  const count = signal(0)
  const onAbsentElse = (r: Range | null) => {
    if (r === null) {
      sel.set('')
    } else {
      sel.set(String(r.start) + '-' + String(r.end))
    }
  }
  const onPresent = (r: Range | null) => {
    if (r !== null) count.set(r.end - r.start + 1)
  }
  const onAbsentOnly = (r: Range | null) => {
    if (r === null) sel.set('none')
  }
  const label = (r: Range | null) => (r === null ? 'none' : String(r.start))
  const width = (r: Range | null) => (r !== null ? r.end - r.start : 0)
  return (
    <Stack>
      <Text>{sel()}</Text>
      <Text>{String(count())}</Text>
    </Stack>
  )
}`

const swift = transform(SRC, { target: 'swift' })
const kotlin = transform(SRC, { target: 'kotlin' })

describe('nullable-struct narrowing through null compares', () => {
  it('emits no warnings on either target', () => {
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
  })
  it('Swift: `if (r === null) … else …` binds with the bodies swapped — the narrowed else runs under `if let r`', () => {
    expect(swift.code).toContain('private func onAbsentElse(_ r: Range?) {\n    if let r {\n      sel = String(r.start) + "-" + String(r.end)\n    } else {\n      sel = ""\n    }')
  })
  it('Swift: `if (r !== null) …` binds directly', () => {
    expect(swift.code).toContain('private func onPresent(_ r: Range?) {\n    if let r {\n      count = r.end - r.start + 1\n    }')
  })
  it('Swift: a lone `=== null` (no else) keeps the plain nil test — nothing to narrow', () => {
    expect(swift.code).toContain('private func onAbsentOnly(_ r: Range?) {\n    if r == nil {\n      sel = "none"\n    }')
  })
  it('Swift: a ternary that reads the operand in its narrowed branch lowers to `.map { r in … } ?? …`, either polarity', () => {
    expect(swift.code).toContain('(r.map { r in String(r.start) } ?? "none")')
    expect(swift.code).toContain('(r.map { r in r.end - r.start } ?? 0)')
  })
  it('Kotlin: the compares stay compares — a val param smart-casts', () => {
    expect(kotlin.code).toContain('if (r == null) {\n      sel = ""\n    } else {\n      sel = (r.start).toString() + "-" + (r.end).toString()\n    }')
    expect(kotlin.code).toContain('if (r != null) {\n      count = r.end - r.start + 1\n    }')
    expect(kotlin.code).toContain('if (r == null) "none" else (r.start).toString()')
  })
  it.skipIf(!isSwiftcAvailable())('swiftc accepts every shape', () => {
    const r = validateSwiftWithStubs(swift.code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlinc accepts every shape', () => {
    const r = validateKotlin(kotlin.code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})

describe('the narrowing never fires where it must not', () => {
  it('a non-optional operand compared to null keeps the plain compare on both targets', () => {
    const src = `import { Stack, Text } from '@pyreon/primitives'
interface Range { start: number; end: number }
export function Plain() {
  const pick = (r: Range) => (r.start > 0 ? r.start : 0)
  return (<Stack><Text>{String(pick({ start: 1, end: 2 }))}</Text></Stack>)
}`
    const s = transform(src, { target: 'swift' })
    expect(s.warnings).toEqual([])
    expect(s.code).not.toContain('.map { r in')
    expect(s.code).not.toContain('if let r')
  })
})
