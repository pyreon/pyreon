// `useDebouncedCallback` / `useThrottledCallback` did not lower — the calls
// emitted verbatim, so a debounced save or a throttled scroll handler
// compiled clean and never fired on device.
//
// Unlike `useDebouncedValue`, these need a RUNTIME: they return a callable
// carrying `.cancel()` / `.flush()`, so there is a handle a caller reaches
// and a latest-args slot to hold. A `.task(id:)` has no identity to offer.
//
// The EDGES are the contract, and were measured on the web before either
// port existed (native-callback-throttle-parity.test.ts) — two native ports
// would otherwise agree with each other on the wrong ones:
//
//   debounce → NO leading edge
//   throttle → leading edge AND a trailing one, with the LATEST args

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const APP = `import { useDebouncedCallback, useThrottledCallback } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { Stack, Button } from '@pyreon/primitives'
export function App() {
  const hits = signal(0)
  const save = useDebouncedCallback((n: number) => { hits.set(n) }, 300)
  const scroll = useThrottledCallback((n: number) => { hits.set(n) }, 100)
  return (
    <Stack>
      <Button onPress={() => save(1)}>save</Button>
      <Button onPress={() => scroll(2)}>scroll</Button>
      <Button onPress={() => save.cancel()}>cancel</Button>
    </Stack>
  )
}`

describe('each binding becomes its runtime instance', () => {
  it('Swift picks the right class and delay label', () => {
    const out = transform(APP, { target: 'swift' }).code
    expect(out).toContain('PyreonDebounced<Int>(delayMs: 300)')
    expect(out).toContain('PyreonThrottled<Int>(waitMs: 100)')
  })

  it('Kotlin mirrors it, with the default scheduler', () => {
    const out = transform(APP, { target: 'kotlin' }).code
    expect(out).toContain('PyreonDebounced<Int>(300, PyreonTaskScheduler())')
    expect(out).toContain('PyreonThrottled<Int>(100, PyreonTaskScheduler())')
  })

  it('call sites and the handle both survive', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const out = transform(APP, { target }).code
      expect(out).toContain('save(1)')
      expect(out).toContain('scroll(2)')
      // The whole reason these need a runtime rather than a .task.
      expect(out).toContain('save.cancel()')
    }
  })

  it('lowering is silent and the verbatim call is gone', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(APP, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).not.toContain('useDebouncedCallback(')
      expect(r.code).not.toContain('useThrottledCallback(')
    }
  })
})

describe('Swift attaches the action POST-init', () => {
  it('the initializer carries no closure; .onAppear binds it', () => {
    const out = transform(APP, { target: 'swift' }).code
    // A @State initializer runs before `self` exists, so a closure capturing
    // sibling state there is "cannot use instance member within property
    // initializer" — the same reason PyreonForm attaches onSubmit late.
    expect(out).toContain('save.action = { n in')
    expect(out).not.toContain('PyreonDebounced<Int>(delayMs: 300) {')
  })
})

describe('what cannot be lowered declines BY NAME', () => {
  const decline = (call: string) =>
    transform(
      `import { useDebouncedCallback } from '@pyreon/hooks'
import { Text } from '@pyreon/primitives'
export function App() {
  ${call}
  return <Text>x</Text>
}`,
      { target: 'swift' },
    ).warnings.join('\n')

  it('a multi-argument callback — the runtime carries ONE', () => {
    // Silently dropping the extra arguments would produce a callback that
    // runs with the WRONG data rather than one that visibly does not run.
    const w = decline('const f = useDebouncedCallback((a: number, b: number) => {}, 300)')
    expect(w).toContain('carries ONE argument')
    expect(w).toContain('NOT lowered')
  })

  it('a non-literal delay', () => {
    expect(decline('const f = useDebouncedCallback((n: number) => {}, ms)')).toContain(
      'numeric literal',
    )
  })

  it('a non-inline callback', () => {
    expect(decline('const f = useDebouncedCallback(handler, 300)')).toContain(
      'inline function',
    )
  })
})

describe('the emitted limiters survive the real toolchains', () => {
  it.skipIf(!isSwiftcAvailable())('Swift type-checks against the stub', () => {
    const r = validateSwiftWithStubs(transform(APP, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin compiles on kotlinc', () => {
    const r = validateKotlin(transform(APP, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
