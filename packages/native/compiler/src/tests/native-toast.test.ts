// `@pyreon/toast` emit — the imperative `toast(...)` call + `<Toaster />`
// render lowered to the PyreonToast runtime on both native targets.
//
//   toast("x")          → PyreonToast.shared.add("x", type: "info")  (Swift)
//                       → PyreonToast.add("x", "info")               (Kotlin)
//   toast.error("x")    → …, type: "error"  /  …, "error"
//   <Toaster />         → a native overlay iterating the reactive queue
//
// v1 scope: the message is the first argument (any expression); the preset
// method (`.success`/`.error`/`.warning`/`.info`/`.loading`) selects the type;
// an options object (2nd arg) is dropped (duration/onDismiss are a follow-up).
// `@pyreon/toast` is no longer warned web-only.

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
import { toast, Toaster } from '@pyreon/toast'
export function App() {
  const name = "world"
  return (
    <Stack gap={2}>
      <Press data-testid="save" onPress={() => toast("Saved " + name)}><Text>Save</Text></Press>
      <Press data-testid="ok" onPress={() => toast.success("Done")}><Text>OK</Text></Press>
      <Press data-testid="bad" onPress={() => toast.error("Failed")}><Text>Bad</Text></Press>
      <Toaster />
    </Stack>
  )
}
`

describe('@pyreon/toast emit', () => {
  it('no longer warns web-only; lowers toast() + presets + <Toaster/>', () => {
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(SRC, { target })
      expect(r.warnings, `${target} warnings`).toEqual([])
    }
  })

  it('Swift: toast()/preset → PyreonToast.shared.add; <Toaster/> → ForEach overlay', () => {
    const r = transform(SRC, { target: 'swift' })
    // Message can be an expression (string concat), not just a literal.
    expect(r.code).toContain('PyreonToast.shared.add("Saved " + name, type: "info")')
    expect(r.code).toContain('PyreonToast.shared.add("Done", type: "success")')
    expect(r.code).toContain('PyreonToast.shared.add("Failed", type: "error")')
    expect(r.code).toContain('ForEach(PyreonToast.shared.toasts, id: \\.id)')
    expect(r.code).toContain('Text(__toast.message)')
  })

  it('Kotlin: toast()/preset → PyreonToast.add; <Toaster/> → forEach overlay', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('PyreonToast.add("Saved " + name, "info")')
    expect(r.code).toContain('PyreonToast.add("Done", "success")')
    expect(r.code).toContain('PyreonToast.add("Failed", "error")')
    expect(r.code).toContain('PyreonToast.toasts.value.forEach')
    expect(r.code).toContain('Text(text = __toast.message)')
  })

  it('a renamed import (`toast as notify`) still lowers', () => {
    const src = `
import { Text, Press } from '@pyreon/primitives'
import { toast as notify } from '@pyreon/toast'
export function P() {
  return <Press onPress={() => notify.warning("Careful")}><Text>W</Text></Press>
}
`
    expect(transform(src, { target: 'swift' }).code).toContain(
      'PyreonToast.shared.add("Careful", type: "warning")',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonToast.add("Careful", "warning")')
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const r = transform(SRC, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const r = transform(SRC, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })
})
