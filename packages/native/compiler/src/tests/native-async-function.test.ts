// A component-local `async` function (`const shoot = async () => { await … }`) used to emit a plain `func`/`fun`,
// which neither target lets `await` in: Swift rejects it in a non-async function, Kotlin rejects a suspend call outside
// a coroutine. It is now fire-and-forget on both (`Task { … }` / `pyreonAsyncScope.launch { … }`), like an inline async
// handler. A function that RETURNS a value is a Promise a caller may await — named in a warning, never mis-lowered.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `import { signal } from '@pyreon/reactivity'
import { useBiometrics } from '@pyreon/hooks'
export function Unlock() {
  const bio = useBiometrics()
  const status = signal('idle')
  const check = async () => {
    const ok = await bio.authenticate('Unlock')
    status.set(ok ? 'unlocked' : 'denied')
  }
  return (
    <VStack>
      <Text>{status()}</Text>
      <Button onPress={() => check()}>Unlock</Button>
    </VStack>
  )
}`

const SRC_VALUE = `import { useBiometrics } from '@pyreon/hooks'
export function Gate() {
  const bio = useBiometrics()
  const ask = async () => { return await bio.authenticate('Gate') }
  return <Button onPress={() => ask()}>Go</Button>
}`

describe('async component function', () => {
  it('Swift wraps the body in Task and keeps the await', () => {
    const r = transform(SRC, { target: 'swift' })
    // Spelled through its module so an app model named `Task` cannot shadow it.
    expect(r.code).toMatch(/func check\(\) \{\s*_Concurrency\.Task \{/)
    expect(r.code).toContain('let ok = await bio.authenticate("Unlock")')
    expect(r.warnings ?? []).toEqual([])
  })

  it('Kotlin launches on the composition scope and hoists the scope', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toMatch(/fun check\(\) \{\s*pyreonAsyncScope\.launch \{/)
    expect(r.code).toContain('val pyreonAsyncScope = rememberCoroutineScope()')
    expect(r.warnings ?? []).toEqual([])
  })

  it('a value-returning async function warns by name on both targets', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const w = (transform(SRC_VALUE, { target }).warnings ?? []).join('\n')
      expect(w, target).toContain('async function `ask` returns a value')
    }
  })
})

describe.skipIf(!isSwiftcAvailable())('async component function compiles (swiftc)', () => {
  it('type-checks', () => {
    const res = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe.skipIf(!isKotlincAvailable())('async component function compiles (kotlinc)', () => {
  it('type-checks', () => {
    const res = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
