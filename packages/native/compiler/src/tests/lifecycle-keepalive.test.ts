// Gap 3 PR-3.4 — real `<KeepAlive when={X}>` emit tests.
//
// Visibility-preservation semantic: per-target wrapper holds the
// "has-been-shown" flag; children stay in the view tree across
// `when` toggles after first show, hidden via opacity/alpha.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const SRC = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text, KeepAlive } from '@pyreon/primitives'

const isActive = signal(true)

export function App() {
  return (
    <KeepAlive when={isActive()}>
      <Stack>
        <Text>Preserved across toggles</Text>
      </Stack>
    </KeepAlive>
  )
}
`

describe('Gap 3 PR-3.4 — real KeepAlive emit', () => {
  it('Swift: emits PyreonKeepAliveWrapper call + wrapper struct', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.code).toContain('PyreonKeepAliveWrapper(when_:')
    expect(r.code).toContain('private struct PyreonKeepAliveWrapper')
    expect(r.code).toContain('@State private var hasShown = false')
    expect(r.code).toContain('.opacity(when_ ? 1 : 0)')
    expect(r.code).toContain('.allowsHitTesting(when_)')
    expect(r.code).toContain('Preserved across toggles')
  })

  it('Kotlin: emits PyreonKeepAliveWrapper call + wrapper composable', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('PyreonKeepAliveWrapper(when_ =')
    expect(r.code).toContain('private fun PyreonKeepAliveWrapper')
    expect(r.code).toContain('var hasShown by remember { mutableStateOf(false) }')
    expect(r.code).toContain('Modifier.alpha(if (when_) 1f else 0f)')
    expect(r.code).toContain('Preserved across toggles')
  })

  it('KeepAlive with no `when` prop falls back to walled emit', () => {
    const src = `
import { Stack, Text, KeepAlive } from '@pyreon/primitives'

export function App() {
  return (
    <KeepAlive>
      <Stack><Text>x</Text></Stack>
    </KeepAlive>
  )
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.code).not.toContain('PyreonKeepAliveWrapper')
  })

  it('Multiple KeepAlive sites share ONE wrapper definition', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack, Text, KeepAlive } from '@pyreon/primitives'

const a = signal(true)
const b = signal(false)

export function App() {
  return (
    <Stack>
      <KeepAlive when={a()}><Text>A</Text></KeepAlive>
      <KeepAlive when={b()}><Text>B</Text></KeepAlive>
    </Stack>
  )
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      const marker =
        target === 'swift'
          ? 'private struct PyreonKeepAliveWrapper'
          : 'private fun PyreonKeepAliveWrapper'
      const occurrences = r.code.split(marker).length - 1
      expect(occurrences).toBe(1)
      expect(r.code).toContain('A')
      expect(r.code).toContain('B')
    }
  })

  it('NO KeepAlive sites → NO wrapper definition (zero-cost when unused)', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'

export function App() {
  return <Stack><Text>x</Text></Stack>
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      expect(r.code).not.toContain('PyreonKeepAliveWrapper')
    }
  })
})
