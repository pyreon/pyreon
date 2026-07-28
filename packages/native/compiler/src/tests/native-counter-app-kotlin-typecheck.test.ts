// Type-check a WHOLE app's Kotlin emit, not one hook at a time.
//
// The per-hook fixtures each compile a component using a single capability.
// That is how a stub gap stays invisible when the missing symbol is a COMPOSE
// api rather than a `Pyreon*` type: no single-hook fixture used
// `<Transition show>` or `<Press onLongPress>` and then type-checked the
// result, so `AnimatedVisibility` and `combinedClickable` were absent from the
// stubs while both features were DEVICE-PROVEN on two platforms.
//
// `stub-coverage-ratchet.test.ts` cannot see that class either — it scans
// `Pyreon*` names. Running a real app's full emit is what catches it, which is
// exactly how those two were found.
//
// The counter is the right app for this: it is the repo's densest capability
// surface — signals, a state machine, i18n, size class, colour scheme,
// haptics, share, linking, notifications, biometrics, image + file pickers,
// a database, an animated transition, a long-press gesture, an adaptive
// layout, and an app-owned FFI module.
//
// ## The one thing this test must supply
//
// `DeviceInfo` is the APP's class, reached through `useNativeModule`. The
// framework cannot stub a type it does not own, and synthesizing a stand-in
// would mask a mismatched method name — the same reasoning the Swift gate
// documents for compiling an example's own `useNativeModule` sources
// alongside the emit. So the test appends a minimal DeviceInfo exactly as the
// real build supplies one, and nothing else.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, validateKotlin } from '../validate'

const HERE = dirname(fileURLToPath(import.meta.url))
const COUNTER = join(HERE, '../../../../../examples/native-counter-ios/src/Counter.tsx')

/** The app's own `useNativeModule` class — supplied, never stubbed. */
const APP_OWNED = `
class DeviceInfo(context: Context) {
  fun platformName(): String = "Android"
}
`

describe('the counter app Kotlin emit type-checks end to end', () => {
  const source = readFileSync(COUNTER, 'utf8')

  it('emits without warnings', () => {
    expect(transform(source, { target: 'kotlin' }).warnings ?? []).toEqual([])
  })

  it.skipIf(!isKotlincAvailable())('the whole emit type-checks against the stubs', () => {
    const res = validateKotlin(transform(source, { target: 'kotlin' }).code + APP_OWNED)
    expect(
      res.ok,
      (res.error ?? '') +
        '\n\nAn `unresolved reference` here usually means a Compose api the emit ' +
        'produces has no stub. Per-hook fixtures will not catch that — they each ' +
        'exercise one capability, and the gap is in the combination. Add the ' +
        'missing type to kotlin-stubs.ts, mirroring the REAL signature.',
    ).toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('FAILS without the app-owned class — the gate is real', () => {
    // Proves the check above is actually compiling this app rather than
    // passing on an empty or trivially-satisfied input.
    const res = validateKotlin(transform(source, { target: 'kotlin' }).code)
    expect(res.ok).toBe(false)
    expect(res.error ?? '').toContain('DeviceInfo')
  })
})
