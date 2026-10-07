import { s } from '@pyreon/validate'
const U = s.discriminatedUnion('type', [s.object({ type: s.literal('a'), bad: s.nothing() }), s.object({ type: s.literal('b'), n: s.number() })])
const U2 = s.discriminatedUnion(notLiteral, [s.object({ type: s.literal('a') })])
const U3 = s.discriminatedUnion('type', variantsVar)
const U4 = s.discriminatedUnion('type', [])
const U5 = s.discriminatedUnion('type', [notCall])
const U6 = s.discriminatedUnion('type', [s.object({ type: s.string() })])
