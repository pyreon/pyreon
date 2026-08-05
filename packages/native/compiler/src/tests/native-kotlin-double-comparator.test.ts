// Sorting a ledger by amount — ordinary app code — did not compile on Android.
//
//   items().slice().sort((a, b) => a.price - b.price)
//
// A JS comparator returns any NUMBER and only its SIGN matters. Kotlin's
// `Comparator.compare` must return Int, so over a Double column this emitted a
// Double where Int was required:
//
//   argument type mismatch: actual type is 'Double', but 'Int' was expected
//
// KOTLIN ONLY. Swift converts the difference to the Bool its `sorted(by:)`
// wants (`(a.price - b.price) < 0`), so the Swift path never sees the
// comparator's own type and compiled the whole time — the one-target
// asymmetry that lets a shape ship half-broken.
//
// Sorting by an INT column was always fine, which is what kept this hidden:
// `sort((a, b) => a.id - b.id)` is the example everyone writes first.
//
// The fix converts the sign explicitly when the body is fractional
// (`Double.compareTo(0.0)` IS the Int sign), and is gated on inferred float
// rather than applied everywhere — a comparator body need not be numeric at
// all (`a.name > b.name ? 1 : -1`), and the conversion would be wrong there.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (field: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
function App() {
  const items = signal([{ id: 1, price: 2.5 }, { id: 2, price: 1.5 }])
  const sorted = () => items().slice().sort((a, b) => a.${field} - b.${field})
  return (<Stack><Text>{String(sorted().length)}</Text></Stack>)
}`

const kt = (field: string) =>
  transform(app(field), { target: 'kotlin' }).code.split('\n').find((l) => l.includes('sortedWith')) ??
  ''

describe('a comparator over a DOUBLE column returns an Int sign on Kotlin', () => {
  it('wraps the fractional difference in compareTo(0.0)', () => {
    expect(kt('price')).toContain('.compareTo(0.0)')
  })

  // The gate: an Int comparator must be BYTE-IDENTICAL to before. The sign
  // conversion is correct there too, but emitting it would be noise, and this
  // spec is what keeps the change from quietly applying everywhere.
  it('an INT column keeps the raw difference, unchanged', () => {
    expect(kt('id')).toContain('Comparator { a, b -> a.id - b.id }')
    expect(kt('id')).not.toContain('compareTo')
  })

  // Swift is unaffected in both directions — it converts to a Bool, so the
  // comparator's own numeric type never reaches its signature.
  it('Swift is untouched (it compares to a Bool)', () => {
    const s = transform(app('price'), { target: 'swift' }).code
    expect(s).toContain('< 0')
    expect(s).not.toContain('compareTo')
  })
})

describe('the Double comparator survives the real toolchains', () => {
  it.skipIf(!isKotlincAvailable())('Kotlin: compiles on kotlinc', () => {
    const r = validateKotlin(transform(app('price'), { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('Swift: still type-checks', () => {
    const r = validateSwiftWithStubs(transform(app('price'), { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
