// `geo.start()` compiled on iOS and web and FAILED TO BUILD on Android.
//
// Swift's `PyreonGeolocation.start()` is 0-arg. Kotlin's only overload took a
// host closure — `start(register: (GeolocationHandlers) -> (() -> Unit))` —
// because taking a real location source would have dragged the Android SDK
// into a file that must stay stub-verifiable. So the SAME source built for two
// targets and not the third, silently, with no warning: the documented
// "OkHttp-for-WebSocket asymmetry".
//
// That mattered concretely: `native-counter-android` compiles the SAME
// `Counter.tsx` as `native-counter-ios`, so geolocation could not be added to
// the shared counter example at all — which is why the maps/geolocation matrix
// row could not be raised by a device test even though the runtimes existed.
//
// Closed with the seam already used twice in this runtime: a registry plus an
// `installDefault…` guard (`PyreonStorageRegistry` /
// `installDefaultStorageBackend`), with the Android-SDK half in its own file so
// the core stays free of `android.*` imports and keeps running in the
// dependency-free Kotlin test set.
//
// With NO source installed, the 0-arg `start()` fails LOUDLY through the same
// error channel a denial takes. A silent no-op would leave `latitude` null
// forever, indistinguishable from "no fix yet" — the harder bug to diagnose.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (body: string) =>
  `import { useGeolocation } from '@pyreon/hooks'
import { Stack, Text, Button } from '@pyreon/primitives'
export function C(){
  const geo = useGeolocation()
  return (<Stack>${body}</Stack>)
}`

/** The shape an author writes — identical on all three targets. */
const WITH_START = app(
  '<Text>{geo.latitude}</Text><Button onPress={() => geo.start()}>Locate</Button>',
)
const WITH_STOP = app('<Button onPress={() => geo.stop()}>Stop</Button>')
const READS_ONLY = app('<Text>{geo.latitude}</Text><Text>{geo.longitude}</Text>')

describe('geo.start() is shared code', () => {
  it('emits no warnings on either target', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(WITH_START, { target }).warnings ?? [], target).toEqual([])
    }
  })

  it.skipIf(!isSwiftcAvailable())('type-checks on Swift', () => {
    const res = validateSwiftWithStubs(transform(WITH_START, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  // The regression that matters: this is the cell that used to fail.
  it.skipIf(!isKotlincAvailable())('type-checks on Kotlin — the cell that used to fail', () => {
    const res = validateKotlin(transform(WITH_START, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  for (const [label, src] of [
    ['stop()', WITH_STOP],
    ['reads only', READS_ONLY],
  ] as const) {
    it.skipIf(!isKotlincAvailable())(`${label}: still type-checks on Kotlin`, () => {
      const res = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it.skipIf(!isSwiftcAvailable())(`${label}: still type-checks on Swift`, () => {
      const res = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(res.ok, res.error ?? '').toBe(true)
    })
  }

  it('emits the 0-arg call on both targets — no host closure at the call site', () => {
    // The author never writes the register closure; that is the whole point.
    const swift = transform(WITH_START, { target: 'swift' }).code
    const kotlin = transform(WITH_START, { target: 'kotlin' }).code
    expect(swift).toContain('geo.start()')
    expect(kotlin).toContain('geo.start()')
  })
})
