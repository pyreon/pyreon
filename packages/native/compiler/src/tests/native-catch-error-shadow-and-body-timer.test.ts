// #4251 — two emits that produced no warning and were wrong.
//
// 1. Swift's bare `catch { … }` binds an implicit `error`. A signal named `error` assigned in a bare `catch {}` then
//    resolved to that binding: `error = "failed"` → "cannot assign to value: 'error' is immutable". Kotlin names its
//    binding `pyreonCaught`; Swift now writes `catch _`, which binds nothing.
// 2. `const id = setInterval(…)` directly in a component body starts one timer on the web (the body runs once) but is
//    a body-level value natively, re-evaluated on every update; on Swift a later `clearInterval(id)` was inlined into
//    `PyreonTimers.clear(PyreonTimers.setInterval(…))`. It is now NAMED, pointing at the shapes that lower correctly.
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const CATCH = `import { signal } from '@pyreon/reactivity'
import { Stack, Text, Button } from '@pyreon/primitives'
function risky(s: string): number { if (s === '') throw new Error('empty'); return 1 }
export function App() {
  const error = signal('')
  const go = () => { try { risky('') } catch { error.set('failed') } }
  const named = () => { try { risky('') } catch (e) { error.set('again') } }
  return <Stack><Button onPress={go}>x</Button><Button onPress={named}>y</Button><Text>{error()}</Text></Stack>
}`

const TIMER = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  const id = setInterval(() => n.set(n() + 1), 1000)
  const stop = () => { clearInterval(id) }
  return <Stack><Text onPress={stop}>{n()}</Text></Stack>
}`

const TIMER_IN_MOUNT = `import { signal, onMount } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const n = signal(0)
  onMount(() => { const id = setInterval(() => n.set(n() + 1), 1000); return () => clearInterval(id) })
  return <Stack><Text>{n()}</Text></Stack>
}`

const timerWarnings = (ws: readonly string[]) => ws.filter((w) => w.includes('directly in a component body'))

describe('a bare catch does not shadow a binding named `error` (#4251)', () => {
  it('Swift emits `catch _` for a bare catch and keeps a named binding', () => {
    const code = transform(CATCH, { target: 'swift' }).code
    expect(code).toContain('} catch _ {')
    expect(code).toContain('} catch let e {')
    expect(code).not.toMatch(/\} catch \{/)
  })

  it('compiles on both targets', () => {
    if (isSwiftcAvailable()) expect(validateSwiftWithStubs(transform(CATCH, { target: 'swift' }).code).error ?? '').toBe('')
    if (isKotlincAvailable()) expect(validateKotlin(transform(CATCH, { target: 'kotlin' }).code).error ?? '').toBe('')
  }, 180_000)
})

describe('a timer started directly in a component body is named (#4251)', () => {
  for (const target of ['swift', 'kotlin'] as const) {
    it(`${target}: named once, with the onMount fix`, () => {
      const ws = timerWarnings(transform(TIMER, { target }).warnings)
      expect(ws).toHaveLength(1)
      expect(ws[0]).toContain('`const id = setInterval(…)`')
      expect(ws[0]).toContain('onMount(() => { const id = setInterval(…); return () => clearInterval(id) })')
    })
  }

  it('setTimeout and the window.-qualified spelling are named too', () => {
    const src = TIMER.replace('setInterval(() => n.set(n() + 1), 1000)', 'window.setTimeout(() => n.set(1), 10)')
    const ws = timerWarnings(transform(src, { target: 'swift' }).warnings)
    expect(ws).toHaveLength(1)
    expect(ws[0]).toContain('clearTimeout(id)')
  })

  it('the documented onMount shape is not named and compiles on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(timerWarnings(transform(TIMER_IN_MOUNT, { target }).warnings)).toEqual([])
    }
    if (isSwiftcAvailable())
      expect(validateSwiftWithStubs(transform(TIMER_IN_MOUNT, { target: 'swift' }).code).error ?? '').toBe('')
    if (isKotlincAvailable())
      expect(validateKotlin(transform(TIMER_IN_MOUNT, { target: 'kotlin' }).code).error ?? '').toBe('')
  }, 180_000)

  it('a timer started inside a handler is not named', () => {
    const src = TIMER.replace(
      '  const id = setInterval(() => n.set(n() + 1), 1000)\n  const stop = () => { clearInterval(id) }',
      '  const tid = signal(0)\n  const stop = () => { tid.set(setInterval(() => n.set(n() + 1), 1000)) }',
    )
    expect(timerWarnings(transform(src, { target: 'swift' }).warnings)).toEqual([])
  })
})
