// `useAppState()` lifecycle emit — the THIRD member of the never-wired class
// (after network-status and push, all found in the same 2026-08 sweep of
// `start(register)` seams). The Swift runtime wired REAL UIApplication
// lifecycle notifications behind `start()` from inception and NO emit called
// it; the Kotlin container had an injected seam and no Android edge at all —
// `useAppState()` reported its initial "active" forever on both targets.
//
//   Swift  → @State container + .onAppear { app.start() } on the ZStack host
//   Kotlin → rememberPyreonAppState() (LifecycleEventObserver on the hosting
//            Activity — the composition's LocalContext, avoiding the
//            LocalLifecycleOwner package move between compose-ui 1.6/1.7)
//
// The STICKY `wasBackgrounded` flag is the device-assert surface: an
// end-state a frozen container can never reach, independent of the exact
// number of transition events a backgrounding path fires.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { Stack, Text } from '@pyreon/primitives'
import { useAppState } from '@pyreon/hooks'
export function LifecyclePage() {
  const app = useAppState()
  return (
    <Stack gap={3}>
      <Text data-testid="phase-text">Phase: {app()}</Text>
      <Text data-testid="bg-flag">BG: {app.wasBackgrounded}</Text>
    </Stack>
  )
}
`

describe('useAppState() lifecycle emit (never-wired class, third member)', () => {
  it('Swift: the emit STARTS the lifecycle observers on a stable host', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var app = PyreonAppState()')
    expect(r.code).toContain('.onAppear { app.start() }')
    expect(r.code).toContain('.onDisappear { app.stop() }')
    expect(r.code).toContain('ZStack {')
    // The accessor form `app()` lowers to the phase read; the sticky flag is
    // a bare @Observable member read.
    expect(r.code).toContain('Phase: \\(app.phase)')
    expect(r.code).toContain('BG: \\(app.wasBackgrounded)')
  })

  it('Kotlin: lowers to the SELF-INSTALLING composable with .value reads', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val app = rememberPyreonAppState()')
    expect(r.code).toContain('Phase: ${app.phase.value}')
    // wasBackgrounded is Compose MutableState too — a missing .value renders
    // the state object's toString instead of the boolean.
    expect(r.code).toContain('BG: ${app.wasBackgrounded.value}')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const out = transform(SRC, { target: 'swift' }).code
    const res = validateSwiftWithStubs(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
