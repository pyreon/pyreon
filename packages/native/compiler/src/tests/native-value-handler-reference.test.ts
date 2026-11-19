// A value-change handler passed BY REFERENCE (#4544). `<Field onChangeText={save}>` with `save(t: string)` emitted
// `save()` on both targets — swiftc and kotlinc reject the missing argument — and with a bare signal value
// (`value={draft} onChangeText={save}`) iOS projected `$draft` and dropped `save` entirely. The handler now
// becomes `(newValue) => save(newValue)` when the callee is known to take a parameter (a component function, a
// file-scope helper, a function-typed prop), for all four value-change events. A zero-parameter callback keeps the
// no-argument call: `<Toggle onChange={props.onToggle}>` with `onToggle: () => void` is a normal shape; next to a
// bare signal it now runs on iOS too (it was dropped for the `$on` projection). A signal's setter passed by
// reference (`onChangeText={draft.set}`) emitted the uncallable `draft.set` on both targets; it is the same rule.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const SRC = `import { signal } from '@pyreon/reactivity'
import { Field, Select, Stack, Tab, Tabs, Text, Toggle } from '@pyreon/primitives'

function clean(t: string): string { return t.trim() }
function logText(t: string): void { clean(t) }

export function Editor(props: { onToggle: () => void; onPick: (v: string) => void }) {
  const draft = signal('')
  const on = signal(false)
  const tab = signal('a')
  const pick = signal('x')
  const save = (t: string) => draft.set(t.trim())
  const flip = (v: boolean) => on.set(v)
  const go = (v: string) => tab.set(v)
  return (
    <Stack>
      <Field value={draft()} onChangeText={save} />
      <Field value={draft} onChangeText={save} />
      <Field value={draft()} onChangeText={logText} />
      <Toggle value={on()} onChange={flip} />
      <Toggle value={on()} onChange={props.onToggle} />
      <Toggle value={on} onChange={props.onToggle} />
      <Field value={draft()} onChangeText={draft.set} />
      <Select value={pick()} options={[{ value: 'x', label: 'X' }]} onChange={props.onPick} />
      <Tabs value={tab()} onChange={go}><Tab value="a" label="A"><Text>a</Text></Tab></Tabs>
    </Stack>
  )
}`

const emit = (target: 'swift' | 'kotlin') => {
  const r = transform(SRC, { target })
  expect(r.warnings).toEqual([])
  return r.code
}

describe('a value-change handler passed by reference receives the value', () => {
  it('Swift: each by-reference handler that takes a value is called with it', () => {
    const sw = emit('swift')
    expect(sw).not.toContain('save()')
    expect(sw).not.toContain('flip()')
    expect(sw).not.toContain('go()')
    expect(sw).not.toContain('onPick()')
    expect(sw).not.toContain('logText()')
    expect(sw.match(/set: \{ newValue in save\(newValue\) \}/g)?.length).toBe(2)
    expect(sw).toContain('set: { newValue in logText(newValue) }')
    expect(sw).toContain('set: { newValue in flip(newValue) }')
    expect(sw).toContain('set: { newValue in onPick(newValue) }')
    expect(sw).toContain('set: { newValue in go(newValue) }')
  })

  it('Swift: a bare-signal value with a by-reference handler runs the handler (no `$draft` projection)', () => {
    // The one `text: $draft` left is the `draft.set` field, checked below.
    expect(emit('swift').match(/text: \$draft/g)?.length).toBe(1)
  })

  it('a zero-parameter callback prop keeps the no-argument call, and runs on iOS next to a bare signal', () => {
    const sw = emit('swift')
    expect(sw.match(/set: \{ _ in onToggle\(\) \}/g)?.length).toBe(2)
    expect(sw).not.toContain('isOn: $on')
    expect(emit('kotlin').match(/onCheckedChange = \{ onToggle\(\) \}/g)?.length).toBe(2)
  })

  it("a signal's setter passed by reference writes the value (iOS: the `$draft` projection)", () => {
    expect(emit('swift')).toContain('TextField("", text: $draft)')
    expect(emit('swift')).not.toContain('draft.set')
    expect(emit('kotlin')).toContain('onValueChange = { newValue -> draft = newValue }')
    expect(emit('kotlin')).not.toContain('draft.set')
  })

  it('Kotlin: each by-reference handler that takes a value is called with it', () => {
    const kt = emit('kotlin')
    expect(kt.match(/onValueChange = \{ newValue -> save\(newValue\) \}/g)?.length).toBe(2)
    expect(kt).toContain('onValueChange = { newValue -> logText(newValue) }')
    expect(kt).toContain('onCheckedChange = { newValue -> flip(newValue) }')
    expect(kt).toContain('onChange = { newValue -> onPick(newValue) }')
    expect(kt).toContain('{ newValue -> go(newValue) }')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift typechecks (real swiftc)', () => {
    const r = validateSwiftWithStubs(emit('swift'))
    expect(r.ok, r.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin compiles (real kotlinc)', () => {
    const r = validateKotlin(emit('kotlin'))
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
