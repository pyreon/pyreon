// Plain-Mode shared source through PMTC — the dialect crosses to native.
//
// `parsePyreon` runs the SAME `transformPlain` pre-pass the web compiler
// runs (`@pyreon/compiler/plain`) before its own parse, so a plain file
// lowers through the exact classic pipeline both targets already prove.
// The load-bearing oracle here is EMIT EQUALITY: a plain component and its
// hand-written classic twin must produce byte-identical Swift AND Kotlin —
// any divergence indicts the pre-pass integration, not the emitters.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const PLAIN = `'use plain'
import { state, derived } from '@pyreon/core/plain'

export function App() {
  let count = state(0)
  const double = derived(count * 2)
  return (
    <Stack>
      <Text>{count}</Text>
      <Text>{double}</Text>
      <Button onPress={() => { count = count + 1 }}>inc</Button>
    </Stack>
  )
}
`

// The classic twin — exactly what transformPlain emits, hand-written.
const CLASSIC = `
import { signal, computed } from '@pyreon/reactivity'

export function App() {
  const count = signal(0)
  const double = computed(() => (count() * 2))
  return (
    <Stack>
      <Text>{count()}</Text>
      <Text>{double()}</Text>
      <Button onPress={() => { count.set(count() + 1) }}>inc</Button>
    </Stack>
  )
}
`

describe('Plain-Mode source through PMTC', () => {
  it.each(['swift', 'kotlin'] as const)(
    '%s emit is byte-identical to the classic twin',
    (target) => {
      const plain = transform(PLAIN, { target })
      const classic = transform(CLASSIC, { target })
      expect(plain.code).toBe(classic.code)
      expect(plain.code).toContain('count')
    },
  )

  it('a plain warning surfaces through ParseResult.warnings with its location', () => {
    const src = `'use plain'
import { state } from '@pyreon/core/plain'

export function App() {
  let cfg = state.raw({ a: 1 })
  const f = () => { cfg.a = 5 }
  return <Text>{cfg.a}</Text>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => w.includes('does not notify'))).toBe(true)
  })

  it('a classic file is untouched by the hook (detectPlain gate)', () => {
    const r = transform(CLASSIC, { target: 'swift' })
    expect(r.code).toContain('count')
  })
})
