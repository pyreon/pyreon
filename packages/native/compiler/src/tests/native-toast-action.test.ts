// `toast(msg, { action: { label, onClick } })` lowers to the native card's
// action button. Like the web, a tap runs `onClick` and leaves the toast up.
//
// `onClick` must take no arguments: the web hands it `{ id, dismiss }`, which
// has no native lowering yet, so a handler that declares a parameter — and
// every other action shape that cannot lower — is warned by name and the
// button is dropped while the toast itself still lowers.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const app = (call: string) => `
import { signal } from '@pyreon/reactivity'
import { Button, Stack } from '@pyreon/primitives'
import { toast, Toaster } from '@pyreon/toast'
export function App() {
  const count = signal(0)
  return (
    <Stack>
      <Button onPress={() => ${call}}>go</Button>
      <Toaster />
    </Stack>
  )
}
`

const ACTION = app(`toast("Deleted", { action: { label: "Undo", onClick: () => count.set(count() + 1) } })`)
const BOTH = app(`toast("Deleted", { description: "1 item", action: { label: "Undo", onClick: () => count.set(0) } })`)

const warningsOf = (r: { warnings: unknown[] }): string =>
  r.warnings.map((w) => String((w as { message?: string }).message ?? w)).join('\n')

describe('toast() action on native', () => {
  it('a no-argument onClick lowers to the action button on both targets', () => {
    const swift = transform(ACTION, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toMatch(/PyreonToast\.shared\.add\("Deleted", type: "info", actionLabel: "Undo", onAction: \{[^}]*count = count \+ 1/)
    const kotlin = transform(ACTION, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toMatch(/PyreonToast\.add\("Deleted", "info", actionLabel = "Undo", onAction = \{[^}]*count = count \+ 1L/)
  })

  it('combines with a description, in the runtime parameter order', () => {
    expect(transform(BOTH, { target: 'swift' }).code).toContain(
      'PyreonToast.shared.add("Deleted", type: "info", description: "1 item", actionLabel: "Undo", onAction: {',
    )
    expect(transform(BOTH, { target: 'kotlin' }).code).toContain(
      'PyreonToast.add("Deleted", "info", description = "1 item", actionLabel = "Undo", onAction = {',
    )
  })

  it('every action shape that cannot lower is warned by name; the toast still lowers', () => {
    const cases: Array<[string, string]> = [
      ['action: { label: "Undo", onClick: ({ dismiss }) => dismiss() }', 'takes the `{ id, dismiss }` context'],
      ['action: { label: <b>Undo</b>, onClick: () => {} }', 'needs a text `label`'],
      ['action: { onClick: () => {} }', 'needs a text `label`'],
      ['action: { label: "Undo" }', 'needs an inline `onClick` function'],
      ['action: count() > 0 ? undefined : undefined', 'must be an object literal'],
    ]
    for (const [opt, needle] of cases) {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(app(`toast("x", { ${opt} })`), { target })
        expect(warningsOf(r), `${target}: ${opt}`).toContain(needle)
        expect(r.code, `${target}: ${opt}`).not.toContain('onAction')
        expect(r.code, `${target}: ${opt}`).toContain(target === 'swift' ? 'PyreonToast.shared.add("x"' : 'PyreonToast.add("x"')
      }
    }
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    for (const src of [ACTION, BOTH]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    for (const src of [ACTION, BOTH]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})
