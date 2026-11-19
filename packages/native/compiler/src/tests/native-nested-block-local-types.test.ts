// A local declared inside a nested block (an `if` branch, a `try` body, a loop body, a `switch` case, an inline
// handler's `try`) had no type in the inference context (#4588). The callers seed only a body's top-level locals, and
// the statement-list emit recorded a nested local's type only when it was optional, so every type-gated lowering of
// such a local missed: `Object.keys(r)` over a `Record` emitted an EMPTY array with an "Object.keys(...) has no native
// equivalent" warning, where the same code with `r` at function level lowers to the record's keys. A nested local
// now records any known type, scoped to its list, on both targets.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `import { signal } from '@pyreon/reactivity'
import { Button, Stack, Text } from '@pyreon/primitives'

type Int = number
function rec(t: string): Record<string, Int> { return JSON.parse(t) as Record<string, Int> }

export function inTry(): string {
  try { const r = rec('{"a":1}'); return Object.keys(r).join(',') } catch { return '' }
}
export function inIf(n: number): string {
  if (n > 0) { const r = rec('{"a":1}'); return Object.keys(r).join(',') }
  return ''
}
export function inLoop(xs: string[]): number {
  let c = 0
  for (const x of xs) { const r = rec(x); c += Object.keys(r).length }
  return c
}
export function inSwitch(k: string): string {
  switch (k) {
    case 'a': { const r = rec('{"a":1}'); return Object.keys(r).join(',') }
    default: return ''
  }
}

export function Keys() {
  const count = signal(0)
  return (
    <Stack>
      <Button onPress={() => { try { const r = rec('{"a":1}'); count.set(Object.keys(r).length) } catch { count.set(-1) } }}>Count</Button>
      <Text>{count()}</Text>
    </Stack>
  )
}`

const emit = (target: 'swift' | 'kotlin') => {
  const r = transform(SRC, { target })
  expect(r.warnings).toEqual([])
  return r.code
}

describe('a local declared inside a nested block is typed for inference', () => {
  it('Swift: Object.keys over a nested Record local lowers to its keys in every block shape', () => {
    const sw = emit('swift')
    expect(sw.match(/pyreonRecordKeys\(r\)/g)?.length).toBe(5)
    expect(sw).not.toContain('[String]()')
  })

  it('Kotlin: Object.keys over a nested Record local lowers to its keys in every block shape', () => {
    const kt = emit('kotlin')
    expect(kt.match(/pyreonRecordKeys\(r\)/g)?.length).toBe(5)
    expect(kt).not.toContain('emptyList<String>()')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks (real swiftc)', () => {
    const r = validateSwiftWithStubs(emit('swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    const r = validateKotlin(emit('kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
