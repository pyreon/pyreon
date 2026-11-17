// A bare-signal `value` on `<Field>`, `<Toggle>` or `<Tabs>` lowers on iOS to
// SwiftUI's `$signal` projection, which writes the signal by itself. The change
// handler is redundant only when it does exactly that (`(v) => sig.set(v)`).
// The Swift emit dropped EVERY handler next to a bare signal, so
// `onChangeText={(t) => { draft.set(t.toUpperCase()); edits.set(edits() + 1) }}`
// never ran on iOS while Compose ran it — no warning, different behaviour per
// platform. A handler that does more now goes through `Binding(get:set:)`.

import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const app = (jsx: string) => `import { Stack, Field, Toggle, Tabs, Tab, Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
function App() {
  const draft = signal('')
  const on = signal(false)
  const tab = signal('a')
  const edits = signal(0)
  return (<Stack>${jsx}</Stack>)
}`
const swift = (jsx: string) => {
  const r = transform(app(jsx), { target: 'swift' })
  expect(r.warnings).toEqual([])
  return r.code
}
const kotlin = (jsx: string) => transform(app(jsx), { target: 'kotlin' }).code

const FIELD = '<Field value={draft} onChangeText={(t) => { draft.set(t.toUpperCase()); edits.set(edits() + 1) }} />'
const TOGGLE = '<Toggle value={on} onChange={(v) => { on.set(v); edits.set(edits() + 1) }} />'
const TABS =
  '<Tabs value={tab} onChange={(v) => { tab.set(v); edits.set(edits() + 1) }}><Tab value="a" label="A"><Text>a</Text></Tab></Tabs>'

describe('bare-signal value with a change handler that does more than set it', () => {
  it('<Field>: iOS runs the handler through a Binding, as Android does', () => {
    const sw = swift(FIELD)
    expect(sw).not.toContain('text: $draft')
    expect(sw).toContain('get: { draft }')
    expect(sw).toContain('draft = t.uppercased()')
    expect(sw).toContain('edits = edits + 1')
    expect(kotlin(FIELD)).toContain('edits = edits + 1L')
  })

  it('<Toggle>: iOS runs the handler through a Binding', () => {
    const sw = swift(TOGGLE)
    expect(sw).not.toContain('isOn: $on')
    expect(sw).toContain('get: { on }')
    expect(sw).toContain('edits = edits + 1')
  })

  it('<Tabs>: iOS runs the handler through a Binding', () => {
    const sw = swift(TABS)
    expect(sw).not.toContain('selection: $tab')
    expect(sw).toContain('Binding(get: { tab }')
    expect(sw).toContain('edits = edits + 1')
  })

  it('a handler that only sets the same signal keeps the `$signal` projection', () => {
    expect(swift('<Field value={draft} onChangeText={(t) => draft.set(t)} />')).toContain('text: $draft')
    expect(swift('<Toggle value={on} onChange={(v) => on.set(v)} />')).toContain('isOn: $on')
    expect(
      swift('<Tabs value={tab} onChange={(v) => tab.set(v)}><Tab value="a" label="A"><Text>a</Text></Tab></Tabs>'),
    ).toContain('selection: $tab')
    expect(swift('<Field value={draft} />')).toContain('text: $draft')
  })

  it('a handler that sets a DIFFERENT signal is not redundant', () => {
    const sw = swift('<Field value={draft} onChangeText={(t) => edits.set(t.length)} />')
    expect(sw).not.toContain('text: $draft')
    expect(sw).toContain('get: { draft }')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: the three Binding shapes type-check against the stub', () => {
    const res = validateSwiftWithStubs(swift(`${FIELD}${TOGGLE}${TABS}`))
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
