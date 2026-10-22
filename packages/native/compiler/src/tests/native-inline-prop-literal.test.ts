// An object literal passed to a prop whose type is an INLINE object resolves to the prop's own struct, in either
// declaration order.
//
// THE BUG: `function Card(props: { user?: { name: string } })` + `<Card user={{ name: 'a' }} />`. The prop's struct
// (`CardUser`) was created only WHILE `Card` was emitted, so a call site emitted earlier synthesized its own
// structurally identical `__ObjN` and the parameter typed `CardUser` rejected it. Swift worked only when `Card` came
// first in the file; Kotlin, whose per-component struct was never indexed for literals at all, failed in both orders.
// No warning either way. A named type (`type CardUser = { … }`) always worked — that is the behaviour this restores
// for the inline spelling.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const CARD = [
  'function Card(props: { user?: { name: string }; tags: { label: string }[] }) {',
  "  return <Text>{props.user?.name ?? 'anon'} {String(props.tags.length)}</Text>",
  '}',
]
const APP = [
  'export function App() {',
  "  return <Card user={{ name: 'a' }} tags={[{ label: 'x' }]} />",
  '}',
]
const HEAD = ["import { Text } from '@pyreon/primitives'"]

const ORDERS = {
  'callee first': [...HEAD, ...CARD, ...APP].join('\n'),
  'caller first': [...HEAD, ...APP, ...CARD].join('\n'),
} as const

describe.each(Object.entries(ORDERS))('%s', (_order, src) => {
  it('Swift constructs the prop\'s own struct', () => {
    const r = transform(src, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Card(user: CardUser(name: "a"), tags: [CardTag(label: "x")])')
    expect(r.code).not.toMatch(/__Obj\d/)
  })

  it('Kotlin constructs the prop\'s own data class', () => {
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('Card(user = CardUser(name = "a"), tags = listOf(CardTag(label = "x")))')
    expect(r.code).not.toMatch(/__Obj\d/)
  })

  it.skipIf(!isSwiftcAvailable())('the Swift emit typechecks', () => {
    const r = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the Kotlin emit compiles', () => {
    const r = validateKotlin(transform(src, { target: 'kotlin' }).code)
    expect(r.ok, r.ok ? '' : String(r.error)).toBe(true)
  }, 180_000)
})
