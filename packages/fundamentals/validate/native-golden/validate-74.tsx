import { s } from '@pyreon/validate'
const U1 = s.discriminatedUnion('type', [s.object({ type: s.literal('a') })])
const U2 = s.discriminatedUnion('type', [foo({ type: s.literal('a') })])
const U3 = s.discriminatedUnion('type', [x.object({ type: s.literal('a') })])
const U4 = s.discriminatedUnion('type', [s.object(shapeVar)])
const U5 = s.discriminatedUnion('type', [s.object({ type: s.string() })])
const U6 = s.discriminatedUnion('type', [s.object({ type: foo.literal('a') })])
const U7 = s.discriminatedUnion('type', [s.object({ type: s.literal(lit) })])
const U8 = s.discriminatedUnion('type', [s.object({ type: x(), n: s.number() })])
