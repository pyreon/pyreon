// A local closure called as a statement keeps its call.
//
// `const f = () => { n++ }` inside a function body lowers to a closure on both
// targets (`let f = { … }` / `val f = { … }`). A zero-argument identifier call
// otherwise emits BARE, because at component scope `x()` is a signal/computed
// READ — so `f()` emitted `f`. On iOS that is a swiftc error; on Android it is
// worse, a statement that compiles and silently does nothing.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const HELPER = `import { Text } from '@pyreon/primitives'
function total(xs: number[]): number {
  let n = 0
  const bump = () => { n++ }
  for (const x of xs) { if (x > 0) bump() }
  return n
}
function App() { return (<Text>{total([1, 2, -3])}</Text>) }`

const HANDLER = `import { Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const c = signal(0)
  return (<Button onPress={() => { let n = 0; const f = () => { n++ }; f(); f(); c.set(n) }}>go</Button>)
}`

// The scope must END with the list that declared the closure: a sibling
// handler's zero-arg call of a SIGNAL that happens to share the name is a read.
const SCOPED = `import { Button, Text, Stack } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const f = signal(0)
  const c = signal(0)
  return (
    <Stack>
      <Button onPress={() => { let n = 0; const f = () => { n++ }; f(); c.set(n) }}>a</Button>
      <Text>{f()}</Text>
    </Stack>
  )
}`

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })
const lines = (code: string) => code.split('\n').map((l) => l.trim())

describe('local closure call statement', () => {
  for (const [name, t] of [
    ['swift', swift],
    ['kotlin', kotlin],
  ] as const) {
    it(`${name}: a call inside a loop body in a helper keeps its parens`, () => {
      const code = lines(t(HELPER).code)
      expect(code).toContain('bump()')
      expect(code).not.toContain('bump')
    })

    it(`${name}: repeated calls in an event handler are all emitted as calls`, () => {
      const code = lines(t(HANDLER).code)
      expect(code.filter((l) => l === 'f()')).toHaveLength(2)
      expect(code).not.toContain('f')
    })

    it(`${name}: the name stops being a call when its list ends`, () => {
      const code = t(SCOPED).code
      expect(lines(code)).toContain('f()')
      // The signal read outside the handler is still a bare read.
      expect(code).not.toMatch(/\{f\(\)\}|"\\\(f\(\)\)"|\$\{f\(\)\}/)
    })
  }
})

describe('local closure call statement — compiles', () => {
  it.skipIf(!isSwiftcAvailable())('swiftc accepts the helper and handler shapes', () => {
    for (const src of [HELPER, HANDLER, SCOPED]) {
      const res = validateSwiftWithStubs(swift(src).code)
      expect(res.ok, res.error ?? '').toBe(true)
    }
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the helper and handler shapes', () => {
    for (const src of [HELPER, HANDLER, SCOPED]) {
      const res = validateKotlin(kotlin(src).code)
      expect(res.ok, res.error ?? '').toBe(true)
    }
  })
})
