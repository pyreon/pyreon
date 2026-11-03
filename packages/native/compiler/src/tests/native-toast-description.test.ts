// `toast(msg, { description })` lowers to the native card's second line, and
// every toast option that does NOT lower is warned by name.
//
// Before: the options loop read `duration` and `dismissible` and skipped
// everything else without a word — `description`, `icon`, `action` and
// `onDismiss` vanished on iOS/Android, and so did a non-literal `duration`.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const app = (call: string) => `
import { signal } from '@pyreon/reactivity'
import { Button, Stack } from '@pyreon/primitives'
import { toast, Toaster } from '@pyreon/toast'
export function App() {
  const name = signal('report.pdf')
  return (
    <Stack>
      <Button onPress={() => ${call}}>go</Button>
      <Toaster />
    </Stack>
  )
}
`

const DESCRIBED = app(`toast.success("Uploaded", { description: "Saved " + name() })`)

describe('toast() description on native', () => {
  it('a text description lowers to the second line on both targets', () => {
    const swift = transform(DESCRIBED, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('PyreonToast.shared.add("Uploaded", type: "success", description: "Saved " + name)')
    const kotlin = transform(DESCRIBED, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('PyreonToast.add("Uploaded", "success", description = "Saved " + name)')
  })

  it('a description combines with duration and dismissible, in the runtime parameter order', () => {
    const src = app(`toast("Hi", { duration: 2000, dismissible: false, description: "there" })`)
    expect(transform(src, { target: 'swift' }).code).toContain(
      'PyreonToast.shared.add("Hi", type: "info", duration: 2, dismissible: false, description: "there")',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain(
      'PyreonToast.add("Hi", "info", 2000L, dismissible = false, description = "there")',
    )
  })

  it('every option that does not lower is warned by name, and the toast still lowers', () => {
    const cases: Array<[string, string]> = [
      ['icon: "x"', '`icon` has no native lowering'],
      ['onDismiss: () => {}', '`onDismiss` has no native lowering'],
      ['action: { label: "Undo", onClick: () => {} }', '`action` has no native lowering'],
      ['description: <b>x</b>', '`description` given as JSX'],
      ['duration: name().length', '`duration` must be a literal'],
      ['dismissible: name() === ""', '`dismissible` must be a literal'],
    ]
    for (const [opt, needle] of cases) {
      for (const target of ['swift', 'kotlin'] as const) {
        const r = transform(app(`toast("x", { ${opt} })`), { target })
        const text = r.warnings.map((w) => String((w as { message?: string }).message ?? w)).join('\n')
        expect(text, `${target}: ${opt}`).toContain(needle)
        expect(r.code, `${target}: ${opt}`).toContain(target === 'swift' ? 'PyreonToast.shared.add("x"' : 'PyreonToast.add("x"')
      }
    }
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(DESCRIBED, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const v = validateKotlin(transform(DESCRIBED, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
