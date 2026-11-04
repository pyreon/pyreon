// `onClick({ id, dismiss })` and `toast.dismiss(…)` lower natively.
//
// The web hands an action's `onClick` the `{ id, dismiss }` context. The
// plugin rewrites the handler to ONE parameter — the toast's id — with every
// `dismiss()` becoming `toast.dismiss(id)`, which now lowers to
// `PyreonToast.shared.dismiss(id)` / `PyreonToast.dismiss(id)` (and a bare
// `toast.dismiss()` to `clear()`). The runtime's `onActionContext` hands the
// handler its own toast's id.

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

const DESTRUCTURED = app(
  `toast("Saved", { action: { label: "Undo", onClick: ({ id, dismiss }) => { count.set(count() + 1); dismiss() } } })`,
)
const NAMED = app(`toast("Saved", { action: { label: "Undo", onClick: (t) => t.dismiss() } })`)
const RENAMED = app(`toast("Saved", { action: { label: "Undo", onClick: ({ dismiss: close }) => close() } })`)
const DISMISS = app(`{ const id = toast("x"); toast.dismiss(id); toast.dismiss() }`)

describe('action onClick({ id, dismiss })', () => {
  it('destructured: one-parameter closure; dismiss() is a dismiss of that id', () => {
    const swift = transform(DESTRUCTURED, { target: 'swift' })
    expect(swift.code).toContain('onActionContext: { id in')
    expect(swift.code).toContain('PyreonToast.shared.dismiss(id)')
    expect(swift.code).not.toContain('onAction:')
    const kotlin = transform(DESTRUCTURED, { target: 'kotlin' })
    expect(kotlin.code).toContain('onActionContext = { id ->')
    expect(kotlin.code).toContain('PyreonToast.dismiss(id)')
    for (const r of [swift, kotlin]) expect(r.warnings.join('\n')).not.toMatch(/action/)
  })

  it('a named context and a renamed dismiss lower the same way', () => {
    expect(transform(NAMED, { target: 'swift' }).code).toContain(
      'onActionContext: { __pyToastId in PyreonToast.shared.dismiss(__pyToastId) }',
    )
    expect(transform(RENAMED, { target: 'kotlin' }).code).toContain(
      'onActionContext = { __pyToastId -> PyreonToast.dismiss(__pyToastId) }',
    )
  })

  it('toast.dismiss(id) and toast.dismiss() lower; neither warns', () => {
    const swift = transform(DISMISS, { target: 'swift' })
    expect(swift.code).toContain('PyreonToast.shared.dismiss(id)')
    expect(swift.code).toContain('PyreonToast.shared.clear()')
    const kotlin = transform(DISMISS, { target: 'kotlin' })
    expect(kotlin.code).toContain('PyreonToast.dismiss(id)')
    expect(kotlin.code).toContain('PyreonToast.clear()')
    for (const r of [swift, kotlin]) expect(r.warnings.join('\n')).not.toMatch(/dismiss/)
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    for (const src of [DESTRUCTURED, NAMED, RENAMED, DISMISS]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    for (const src of [DESTRUCTURED, NAMED, RENAMED, DISMISS]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})
