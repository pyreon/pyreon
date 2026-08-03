// `const found = db.get(c, id); if (found) { … }` — read a row, branch on
// whether it exists. The single most common database shape, and it compiled
// on NEITHER target.
//
// `db.get` returns an optional RECORD on both runtimes, but inference had no
// model for it, so the condition emitted a bare optional: swiftc "optional
// type 'PyreonRecord?' cannot be used as a boolean", kotlinc "condition type
// mismatch". Identical to the `secureStorage.read` gap fixed alongside the
// auth-rehydration arc — `database.get` was named there as the follow-up and
// is simply one more entry in `SERVICE_METHOD_RETURNS`.
//
// Found by writing the natural offline-first shape for the Offline/sync row:
// an app that reads local state at launch and branches on whether it is there.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `import { onMount } from '@pyreon/core'
import { useDatabase } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'

export function App() {
  const db = useDatabase()
  const state = signal<string>('none')
  onMount(() => {
    const found = db.get('notes', 'n1')
    if (found) {
      state.set('restored')
    }
  })
  return (
    <Stack>
      <Text>State: {state()}</Text>
    </Stack>
  )
}`

describe('database.get presence check', () => {
  it('Swift lowers to the `if let` binding, not a bare optional condition', () => {
    const out = transform(SRC, { target: 'swift' })
    expect(out.code).toContain('if let found {')
    // The broken emit — an optional used directly as a Bool.
    expect(out.code).not.toMatch(/if found \{/)
    expect(out.warnings).toEqual([])
  })

  it('Kotlin lowers to an explicit null check', () => {
    const out = transform(SRC, { target: 'kotlin' })
    expect(out.code).toContain('if (found != null) {')
    expect(out.code).not.toMatch(/if \(found\) \{/)
    expect(out.warnings).toEqual([])
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks (real swiftc)', () => {
    const r = validateSwiftWithStubs(transform(SRC, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    const r = validateKotlin(transform(SRC, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
