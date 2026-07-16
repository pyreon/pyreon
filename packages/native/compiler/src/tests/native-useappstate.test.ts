// M3.7 — `useAppState()` native emit. `const state = useAppState()` → the
// PyreonAppState reactive lifecycle container. Swift `@State PyreonAppState()`;
// Kotlin `remember { PyreonAppState() }`.
//
// The web `useAppState()` returns an ACCESSOR (`() => 'active'|…`), so ONE
// shared source reads it as `state()` — the emit lowers that accessor call to
// the container's `phase` read (`state.phase` on Swift @Observable, a Compose
// `MutableState` `state.phase.value` on Kotlin). Without the lowering, `state()`
// falls to a bare `state` → `if state {` — UNCOMPILABLE (the container is not a
// String). The direct `state.phase` member read also works.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// Web-idiomatic SHARED shape: read the accessor as `state()`.
const SHARED = `
  export function LifecycleBar() {
    const state = useAppState()
    return (
      <Stack>
        <Show when={() => state() === 'active'}><Text>Live</Text></Show>
        <Text>{() => 'Phase: ' + state()}</Text>
      </Stack>
    )
  }
`

describe('M3.7 — useAppState() native emit (shared state() accessor)', () => {
  it('Swift: state() lowers to the @Observable phase read (no .value)', () => {
    const r = transform(SHARED, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var state = PyreonAppState()')
    expect(r.code).toContain('state.phase')
    expect(r.code).not.toContain('if state {')
    expect(r.code).not.toContain('state.phase.value')
  })

  it('Kotlin: state() lowers to the MutableState phase.value read', () => {
    const r = transform(SHARED, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val state = remember { PyreonAppState() }')
    expect(r.code).toContain('state.phase.value')
    expect(r.code).not.toContain('if (state)')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(SHARED, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(SHARED, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // Back-compat: the direct `state.phase` MEMBER read emits correctly too.
  const MEMBER = `
    export function LifecycleBar() {
      const state = useAppState()
      return <Show when={() => state.phase === 'active'}><Text>Live</Text></Show>
    }
  `
  it('Swift: state.phase member read emits bare', () => {
    const out = transform(MEMBER, { target: 'swift' }).code
    expect(out).toContain('state.phase')
    expect(out).not.toContain('state.phase.value')
  })

  it('Kotlin: state.phase member read emits .value', () => {
    const out = transform(MEMBER, { target: 'kotlin' }).code
    expect(out).toContain('state.phase.value')
  })
})
