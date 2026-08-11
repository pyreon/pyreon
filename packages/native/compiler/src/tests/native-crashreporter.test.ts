// `useCrashReporter()` emit — the Crash reporting & observability row's
// vocabulary. Capture + persist + rehydrate on both native runtimes; the
// transport is app-wired, so the framework proves the credential-free half.
//
//   Swift  → @State PyreonCrashReporter + .onAppear { crash.start() } on the
//            ZStack stable host (start installs the uncaught hook + rehydrates)
//   Kotlin → rememberPyreonCrashReporter() (self-installs a file backend +
//            start()); reactive reads crash.lastCrash/hadCrash append .value
//
// Same never-wired-class fix as useAppState: start() was never called, so
// lastCrash/hadCrash would stay frozen; the emit auto-starts on the host.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { Stack, Text, Press } from '@pyreon/primitives'
import { useCrashReporter } from '@pyreon/hooks'
export function CrashPage() {
  const crash = useCrashReporter()
  return (
    <Stack gap={3}>
      <Text data-testid="had-crash">Crashed: {crash.hadCrash}</Text>
      <Text data-testid="last-crash">Last: {crash.lastCrash}</Text>
      <Press data-testid="record" onPress={() => crash.recordError("manual")}>
        <Text>Record</Text>
      </Press>
      <Press data-testid="ack" onPress={() => crash.clear()}>
        <Text>Ack</Text>
      </Press>
    </Stack>
  )
}
`

describe('useCrashReporter() emit', () => {
  it('Swift: @State container, onAppear-start on the stable host, bare reads', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var crash = PyreonCrashReporter()')
    expect(r.code).toContain('.onAppear { crash.start() }')
    expect(r.code).toContain('ZStack {')
    // Reactive reads are bare @Observable properties on Swift.
    expect(r.code).toContain('Crashed: \\(crash.hadCrash)')
    expect(r.code).toContain('Last: \\(crash.lastCrash)')
    // Imperative methods pass through unchanged.
    expect(r.code).toContain('crash.recordError("manual")')
    expect(r.code).toContain('crash.clear()')
  })

  it('Kotlin: self-installing composable, .value reads, bare methods', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val crash = rememberPyreonCrashReporter()')
    // Reactive member reads append .value (Compose MutableState) — a missing
    // .value renders the state object's toString instead of the value.
    expect(r.code).toContain('Crashed: ${crash.hadCrash.value}')
    expect(r.code).toContain('Last: ${crash.lastCrash.value}')
    // Methods read bare (no .value).
    expect(r.code).toContain('crash.recordError("manual")')
    expect(r.code).toContain('crash.clear()')
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const r = transform(SRC, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.errors?.join('\n')).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const r = transform(SRC, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.errors?.join('\n')).toBe(true)
  })
})
