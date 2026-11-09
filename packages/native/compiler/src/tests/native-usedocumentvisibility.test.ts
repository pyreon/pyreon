// `useDocumentVisibility()` native emit. The web hook is an accessor over
// `document.visibilityState` ('visible' | 'hidden'); natively the same
// lifecycle container `useAppState()` uses answers it, through a `visibility`
// getter derived from `phase` ("hidden" only once the app is backgrounded).
//
// Two properties this file exists to hold, both of which a green compile alone
// would not show:
//   1. the container is STARTED — a never-started `PyreonAppState` reports
//      "visible" forever (the never-wired class), so the emit must call
//      `start()` on Swift and use the self-installing factory on Kotlin;
//   2. the accessor call `vis()` lowers to the `visibility` read, NOT to
//      `phase` (a `phase === 'visible'` compare would always be false).

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `
import { Stack, Text, Show } from '@pyreon/primitives'
import { useDocumentVisibility } from '@pyreon/hooks'
export function LivePoll() {
  const vis = useDocumentVisibility()
  return (
    <Stack>
      <Show when={() => vis() === 'visible'}><Text>Polling</Text></Show>
      <Text>{() => 'Tab: ' + vis()}</Text>
    </Stack>
  )
}
`

describe('useDocumentVisibility() native emit', () => {
  it('Swift: starts the lifecycle container and reads .visibility (not .phase)', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('@State private var vis = PyreonAppState()')
    expect(r.code).toContain('.onAppear { vis.start() }')
    expect(r.code).toContain('.onDisappear { vis.stop() }')
    expect(r.code).toContain('vis.visibility')
    expect(r.code).not.toContain('vis.phase')
    expect(r.code).not.toMatch(/\bvis\(\)/)
  })

  it('Kotlin: uses the self-installing factory and a plain (non-.value) visibility read', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('val vis = rememberPyreonAppState()')
    // `visibility` is a String getter, not a MutableState: a `.value` here would
    // not compile against the real runtime.
    expect(r.code).toContain('vis.visibility')
    expect(r.code).not.toContain('vis.visibility.value')
    expect(r.code).not.toContain('vis.phase')
    expect(r.code).not.toMatch(/\bvis\(\)/)
  })

  it('shares one container type with useAppState but a distinct declaration kind', () => {
    const both = `
      import { Stack, Text } from '@pyreon/primitives'
      import { useAppState, useDocumentVisibility } from '@pyreon/hooks'
      export function Both() {
        const app = useAppState()
        const vis = useDocumentVisibility()
        return <Stack><Text>{() => app() + vis()}</Text></Stack>
      }
    `
    const sw = transform(both, { target: 'swift' })
    expect(sw.warnings).toEqual([])
    expect(sw.code).toContain('app.phase')
    expect(sw.code).toContain('vis.visibility')
    expect(sw.code).toContain('.onAppear { app.start() }')
    expect(sw.code).toContain('.onAppear { vis.start() }')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: emit type-checks against the stub', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: emit compiles on kotlinc', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
