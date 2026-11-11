// The cross-target `Int` alias (`type Int = number`) is PMTC's integer: Swift `Int` (64-bit) and Kotlin `Long`.
//
// The compiler reads the names `Double` and `Int` as native types, and the integer-decode warning (#3956 item 1)
// tells authors to type a whole-number field `Int`. On Kotlin the name was emitted verbatim as the 32-bit
// `kotlin.Int`, while every integer literal and `number` value PMTC emits is a `Long` (`1L`), so the most basic use
// failed to compile:
//
//   data class Row(var name: String, var qty: Int)
//   mutableStateOf(Row(name = "a", qty = 1L))          // argument type mismatch: actual type is 'Long'
//   row.copy(qty = row.qty + 1L)                       // argument type mismatch: actual type is 'Long'
//
// It also made the same source hold a narrower value on Android than on iOS (2^31 overflows).
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const SOURCE = `type Int = number
type Row = { name: string; qty: Int }
function twice(n: Int): Int { return n * 2 }
const START: Int = 3
export function App() {
  const row = signal<Row>({ name: 'a', qty: 1 })
  const total = signal(0)
  const big: Int = 30
  const bump = () => { row.set({ ...row(), qty: row().qty + 1 }); total.set(total() + twice(row().qty) + START) }
  return <Stack><Button onPress={bump}>x</Button><Text>{String(total())}{String(big)}</Text></Stack>
}`

const DECODE = `type Int = number
type Place = { name: string; visits: Int }
export function Places() {
  const places = useFetch<Place[]>('https://example.com/places.json')
  return <Text>{places.isPending ? 'loading' : 'ok'}</Text>
}`

describe('the cross-target `Int` alias is a 64-bit integer on both targets', () => {
  it('Kotlin spells it `Long` in a struct field, a parameter, a return and a declaration', () => {
    const k = transform(SOURCE, { target: 'kotlin' }).code
    expect(k).toContain('data class Row(var name: String, var qty: Long)')
    expect(k).toMatch(/fun twice\(n: Long\): Long/)
    expect(k).not.toMatch(/:\s*Int\b/)
  })

  it('Swift keeps `Int`, which is already 64-bit', () => {
    const s = transform(SOURCE, { target: 'swift' }).code
    expect(s).toContain('var qty: Int')
  })

  it('compiles on both toolchains', () => {
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(transform(SOURCE, { target: 'swift' }).code).error ?? '').toBe('')
    if (isKotlincAvailable()) expect(validateKotlin(transform(SOURCE, { target: 'kotlin' }).code).error ?? '').toBe('')
  }, 180_000)

  it('a decoded `Int` field is the documented whole-number declaration: Long on Kotlin, not named, compiles', () => {
    const k = transform(DECODE, { target: 'kotlin' })
    expect(k.code).toContain('var visits: Long')
    expect(k.warnings.filter((w) => w.includes('lowers to an INTEGER'))).toEqual([])
    if (isKotlincAvailable()) expect(validateKotlin(k.code).error ?? '').toBe('')
  }, 180_000)
})
