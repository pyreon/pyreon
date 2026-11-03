// `toast(msg, { onDismiss: () => … })` lowers to a native closure the runtime
// fires once when the toast leaves the queue by any path (dismissed, expired,
// cleared or evicted), matching the web contract.
//
// The web type is `() => void`, so only an inline function with no parameters
// lowers; any other shape is warned by name and the callback is dropped while
// the toast itself still lowers.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const app = (call: string) => `
import { signal } from '@pyreon/reactivity'
import { Button, Stack } from '@pyreon/primitives'
import { toast, Toaster } from '@pyreon/toast'
export function App() {
  const closed = signal(0)
  return (
    <Stack>
      <Button onPress={() => ${call}}>go</Button>
      <Toaster />
    </Stack>
  )
}
`

const ONLY = app(`toast("Saved", { onDismiss: () => closed.set(closed() + 1) })`)
const ALL = app(
  `toast.success("Deleted", { description: "1 item", action: { label: "Undo", onClick: () => closed.set(0) }, onDismiss: () => closed.set(closed() + 1) })`,
)

const warningsOf = (r: { warnings: unknown[] }): string =>
  r.warnings.map((w) => String((w as { message?: string }).message ?? w)).join('\n')

describe('toast() onDismiss on native', () => {
  it('a no-argument onDismiss lowers to the runtime callback on both targets', () => {
    const swift = transform(ONLY, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toMatch(/PyreonToast\.shared\.add\("Saved", type: "info", onDismiss: \{[^}]*closed = closed \+ 1/)
    const kotlin = transform(ONLY, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toMatch(/PyreonToast\.add\("Saved", "info", onDismiss = \{ closed = closed \+ 1L \}/)
  })

  it('onDismiss follows description and action in the argument order', () => {
    const swift = transform(ALL, { target: 'swift' }).code
    expect(swift).toMatch(/description: "1 item", actionLabel: "Undo", onAction: \{[^}]*\}, onDismiss: \{/)
    const kotlin = transform(ALL, { target: 'kotlin' }).code
    expect(kotlin).toMatch(/description = "1 item", actionLabel = "Undo", onAction = \{[^}]*\}, onDismiss = \{/)
  })

  it('a shape that cannot lower is warned by name and the toast still lowers', () => {
    for (const opts of [`{ onDismiss: (t) => closed.set(1) }`, `{ onDismiss: handler }`]) {
      const src = app(`toast("Saved", ${opts})`).replace('export function App', 'const handler = () => {}\nexport function App')
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(src, { target })
        expect(warningsOf(r), `${target}: ${opts}`).toContain('`onDismiss` must be an inline function with no parameters')
        expect(r.code).not.toContain('onDismiss')
        expect(r.code).toContain('PyreonToast')
      }
    }
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    for (const src of [ONLY, ALL]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    for (const src of [ONLY, ALL]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})
