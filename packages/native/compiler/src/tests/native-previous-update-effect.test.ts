// `usePrevious` and `useUpdateEffect` native emit.
//
// Both observe a source expression and need its OLD value, which web gets from a signal write inside an effect. SwiftUI's
// two-argument `.onChange(of:)` is exactly that observer; Compose has none, so a remembered snapshot compared inside a keyed
// `LaunchedEffect` stands in. The properties worth holding:
//   1. the first run is skipped (web `watch` semantics) — the snapshot starts equal to the source;
//   2. `usePrevious` starts empty (`undefined` on web, `nil`/`null` here), not at the initial value;
//   3. an unsupported shape is a NAMED warning that drops the hook, never a verbatim call the native build chokes on.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const PREVIOUS = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { usePrevious } from '@pyreon/hooks'
export function Counter() {
  const count = signal(0)
  const prev = usePrevious(() => count())
  return (
    <Stack>
      <Text>{() => 'now ' + count() + ' was ' + (prev() ?? 0)}</Text>
      <Button onPress={() => count.set(count() + 1)}>inc</Button>
    </Stack>
  )
}
`

const UPDATE = `
import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { useUpdateEffect } from '@pyreon/hooks'
export function Watcher() {
  const count = signal(0)
  const log = signal('none')
  useUpdateEffect(() => count(), (next, prev) => {
    log.set('from ' + prev + ' to ' + next)
  })
  return (
    <Stack>
      <Text>{() => log()}</Text>
      <Button onPress={() => count.set(count() + 1)}>inc</Button>
    </Stack>
  )
}
`

describe('usePrevious native emit', () => {
  it('Swift: an optional @State fed by the two-argument .onChange(of:), starting nil', () => {
    const r = transform(PREVIOUS, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var prev: Int? = nil')
    expect(r.code).toContain('.onChange(of: count) { old, _ in prev = old }')
    // The accessor read lowers to the binding itself, never a call of an Int?.
    expect(r.code).not.toMatch(/\bprev\(\)/)
  })

  it('Kotlin: starts null and moves a remembered snapshot only on a real change', () => {
    const r = transform(PREVIOUS, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('var prev by remember { mutableStateOf<Long?>(null) }')
    // The snapshot is seeded FROM the source, so the first composition compares equal and does nothing.
    expect(r.code).toContain('var prevSeen by remember { mutableStateOf(count) }')
    expect(r.code).toContain('LaunchedEffect(count)')
    expect(r.code).toContain('if (count != prevSeen) { prev = prevSeen; prevSeen = count }')
    expect(r.code).not.toMatch(/\bprev\(\)/)
  })

  it('declines a block-bodied source with a named warning instead of emitting a verbatim call', () => {
    const src = PREVIOUS.replace('usePrevious(() => count())', 'usePrevious(() => { return count() })')
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n')).toContain('usePrevious()')
      expect(r.warnings.join('\n')).toContain('expression-body getter')
    }
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(PREVIOUS, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(PREVIOUS, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('useUpdateEffect native emit', () => {
  it('Swift: SwiftUI\'s own old/new observer, with the callback parameters in (old, new) order', () => {
    const r = transform(UPDATE, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // The web callback is (next, prev); SwiftUI hands (old, new), so the names must be crossed, not copied.
    expect(r.code).toContain('.onChange(of: count) { prev, next in')
    expect(r.code).toContain('log = "from " + String(prev) + " to " + String(next)')
  })

  it('Kotlin: declares its snapshot, skips the first composition and binds next/prev', () => {
    const r = transform(UPDATE, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    const seen = r.code.match(/var (\w+Seen) by remember \{ mutableStateOf\(count\) \}/)
    expect(seen, 'the snapshot declaration must exist (lifecycleOnly would swallow it)').not.toBeNull()
    const name = seen![1]!
    expect(r.code).toContain(`if (count != ${name}) {`)
    expect(r.code).toContain(`val prev = ${name}`)
    expect(r.code).toContain('val next = count')
    // Updated BEFORE the body so a body that reads state still sees the new snapshot.
    expect(r.code.indexOf(`${name} = count`)).toBeLessThan(r.code.indexOf('log = "from "'))
  })

  it('a callback that returns a cleanup is a named warning, not a silently dropped cleanup', () => {
    const src = UPDATE.replace("log.set('from ' + prev + ' to ' + next)", "log.set('x')\n    return () => log.set('cleanup')")
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.warnings.join('\n')).toContain('useUpdateEffect()')
      expect(r.warnings.join('\n')).toContain('cleanup')
      expect(r.code).not.toContain('useUpdateEffect(')
    }
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(UPDATE, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(UPDATE, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
