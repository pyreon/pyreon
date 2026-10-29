// `@pyreon/toast` emit — the imperative `toast(...)` call + `<Toaster />`
// render lowered to the PyreonToast runtime on both native targets.
//
//   toast("x")          → PyreonToast.shared.add("x", type: "info")  (Swift)
//                       → PyreonToast.add("x", "info")               (Kotlin)
//   toast.error("x")    → …, type: "error"  /  …, "error"
//   <Toaster />         → PyreonToaster(…) — the runtime's screen-anchored
//                         overlay (a pass-through window on iOS, a
//                         window-anchored Popup on Android), configured by
//                         literal position / max / gap / offset / duration
//
// v1 scope: the message is the first argument (any expression); the preset
// method (`.success`/`.error`/`.warning`/`.info`/`.loading`) selects the type;
// an options object (2nd arg) is dropped (duration/onDismiss are a follow-up).
// `@pyreon/toast` is no longer warned web-only.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

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

  it('Swift: toast()/preset → PyreonToast.shared.add; <Toaster/> → the PyreonToaster overlay', () => {
    const r = transform(SRC, { target: 'swift' })
    // Message can be an expression (string concat), not just a literal.
    expect(r.code).toContain('PyreonToast.shared.add("Saved " + name, type: "info")')
    expect(r.code).toContain('PyreonToast.shared.add("Done", type: "success")')
    expect(r.code).toContain('PyreonToast.shared.add("Failed", type: "error")')
    // Not an inline stack: an inline VStack pushed the layout and, sitting in
    // the NavigationStack root, vanished on every pushed screen.
    expect(r.code).toContain('PyreonToaster()')
    expect(r.code).not.toContain('ForEach(PyreonToast.shared.toasts')
  })

  it('Kotlin: toast()/preset → PyreonToast.add; <Toaster/> → the PyreonToaster overlay', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.code).toContain('PyreonToast.add("Saved " + name, "info")')
    expect(r.code).toContain('PyreonToast.add("Done", "success")')
    expect(r.code).toContain('PyreonToast.add("Failed", "error")')
    expect(r.code).toContain('PyreonToaster()')
    expect(r.code).not.toContain('PyreonToast.toasts.value.forEach')
  })

  const CONFIGURED = `
import { Stack } from '@pyreon/primitives'
import { Toaster } from '@pyreon/toast'
const EDGE = 24
export function App() {
  return <Stack><Toaster position="bottom-center" max={3} gap={12} offset={EDGE} duration={2500} /></Stack>
}
`

  it('literal props configure the overlay, in the runtime parameter order (Swift labels require it)', () => {
    const swift = transform(CONFIGURED, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain(
      'PyreonToaster(position: "bottom-center", max: 3, gap: 12, offset: 24, duration: 2500)',
    )
    const kotlin = transform(CONFIGURED, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    // Doubles carry a decimal point: `gap = 12` would be an Int and fail to typecheck.
    expect(kotlin.code).toContain(
      'PyreonToaster(position = "bottom-center", max = 3L, gap = 12.0, offset = 24.0, duration = 2500L)',
    )
  })

  it('a dynamic or invalid prop is warned by name and keeps the default, never dropped silently', () => {
    const src = `
import { signal } from '@pyreon/reactivity'
import { Stack } from '@pyreon/primitives'
import { Toaster } from '@pyreon/toast'
export function App() {
  const where = signal('top-left')
  return <Stack><Toaster position={where()} max={2.5} gap={8} /></Stack>
}
`
    for (const target of ['swift', 'kotlin'] as const) {
      const r = transform(src, { target })
      const text = r.warnings.map((w) => String((w as { message?: string }).message ?? w)).join('\n')
      expect(text, target).toContain('<Toaster position>')
      expect(text, target).toContain('<Toaster max>')
      expect(r.code).toContain(target === 'swift' ? 'PyreonToaster(gap: 8)' : 'PyreonToaster(gap = 8.0)')
    }
  })

  const NOT_DISMISSIBLE = `
import { Stack, Press, Text } from '@pyreon/primitives'
import { toast, Toaster } from '@pyreon/toast'
export function App() {
  return (
    <Stack>
      <Press onPress={() => toast.error("Locked", { dismissible: false, duration: 0 })}><Text>x</Text></Press>
      <Press onPress={() => toast("Normal", { dismissible: true })}><Text>y</Text></Press>
      <Toaster />
    </Stack>
  )
}
`

  it('a literal dismissible: false hides the dismiss button; true is the default and is not emitted', () => {
    const swift = transform(NOT_DISMISSIBLE, { target: 'swift' })
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('PyreonToast.shared.add("Locked", type: "error", duration: 0, dismissible: false)')
    expect(swift.code).toContain('PyreonToast.shared.add("Normal", type: "info")')
    const kotlin = transform(NOT_DISMISSIBLE, { target: 'kotlin' })
    expect(kotlin.warnings).toEqual([])
    expect(kotlin.code).toContain('PyreonToast.add("Locked", "error", 0L, dismissible = false)')
    expect(kotlin.code).toContain('PyreonToast.add("Normal", "info")')
  })

  it('a non-finite or negative duration is persistent (0), as on the web', () => {
    const src = `
import { Stack } from '@pyreon/primitives'
import { Toaster } from '@pyreon/toast'
export function App() {
  return <Stack><Toaster duration={-1} /></Stack>
}
`
    expect(transform(src, { target: 'swift' }).code).toContain('PyreonToaster(duration: 0)')
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonToaster(duration = 0L)')
  })

  it('a literal duration (ms) sets the auto-dismiss (Swift ms→sec, Kotlin ms Long)', () => {
    const src = `
import { Text, Press } from '@pyreon/primitives'
import { toast } from '@pyreon/toast'
export function P() {
  return <Press onPress={() => toast("Bye", { duration: 2000 })}><Text>X</Text></Press>
}
`
    expect(transform(src, { target: 'swift' }).code).toContain(
      'PyreonToast.shared.add("Bye", type: "info", duration: 2)',
    )
    expect(transform(src, { target: 'kotlin' }).code).toContain('PyreonToast.add("Bye", "info", 2000L)')
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
    for (const src of [SRC, CONFIGURED, NOT_DISMISSIBLE]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    for (const src of [SRC, CONFIGURED, NOT_DISMISSIBLE]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })
})
