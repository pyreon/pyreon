// `@pyreon/sync`'s `syncedSignal` lowers to a native PyreonSyncedSignal over a
// shared PyreonCrdtDoc. The Swift side needs a GENERATED component init()
// because a synced signal's @State initializer references the doc, and one
// @State cannot reference another at property init; Kotlin uses sequential
// `remember {}` blocks and needs none.
//
// Verified END-TO-END beyond these string assertions: the ACTUAL emit
// type-checks against the real SwiftUI SDK + the real facade on macOS, and both
// targets validate against the compiler stubs (validate.ts). These specs lock
// the emit SHAPE so a regression is loud.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'

const collab = `
import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text, Button } from '${P}'
export function CollabScreen() {
  const doc = new PyreonCrdtDoc()
  const title = syncedSignal({ doc, key: 'title', initial: '' })
  const count = syncedSignal({ doc, key: 'count', initial: 0 })
  const done = syncedSignal({ doc, key: 'done', initial: false })
  return (
    <Stack>
      <Text>{title()}</Text>
      <Text>{count()}</Text>
      <Button onPress={() => count.set(count() + 1)}>Inc</Button>
    </Stack>
  )
}
`

describe('syncedSignal — Swift lowering', () => {
  const r = transform(collab, { target: 'swift' })

  it('emits typed @State (no inline init) for the doc + each scalar signal', () => {
    expect(r.code).toContain('@State private var doc: PyreonCrdtDoc')
    expect(r.code).toContain('@State private var title: PyreonSyncedSignal<String>')
    expect(r.code).toContain('@State private var count: PyreonSyncedSignal<Double>')
    expect(r.code).toContain('@State private var done: PyreonSyncedSignal<Bool>')
  })

  it('seeds them in a generated init() — doc first, then signals referencing it', () => {
    expect(r.code).toContain('init() {')
    expect(r.code).toContain('let doc = PyreonCrdtDoc(actor: UUID().uuidString)')
    expect(r.code).toContain('_doc = State(initialValue: doc)')
    expect(r.code).toContain(
      '_title = State(initialValue: PyreonSyncedSignal(doc: doc, key: "title", initial: ""))',
    )
    expect(r.code).toContain(
      '_count = State(initialValue: PyreonSyncedSignal(doc: doc, key: "count", initial: 0))',
    )
    expect(r.code).toContain(
      '_done = State(initialValue: PyreonSyncedSignal(doc: doc, key: "done", initial: false))',
    )
    // doc's `let` must appear before the first signal that references it.
    expect(r.code.indexOf('let doc = PyreonCrdtDoc')).toBeLessThan(
      r.code.indexOf('PyreonSyncedSignal(doc: doc'),
    )
  })

  it('reads title() (callAsFunction) and writes count.set(...) — NOT bare/= ', () => {
    expect(r.code).toContain('"\\(title())"')
    expect(r.code).toContain('count.set(count() + 1)')
    expect(r.code).not.toContain('count = count + 1') // the wrong signal-write rewrite
  })

  it('does NOT warn as web-only (sync left WEB_ONLY_PACKAGES)', () => {
    expect(r.warnings ?? []).toEqual([])
  })

  it('the emit type-checks against the Swift stubs (validate gate)', () => {
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('syncedSignal — Kotlin lowering', () => {
  const r = transform(collab, { target: 'kotlin' })

  it('emits sequential remember { } blocks (no init needed)', () => {
    expect(r.code).toContain(
      'val doc = remember { PyreonCrdtDoc(java.util.UUID.randomUUID().toString()) }',
    )
    expect(r.code).toContain('val title = remember { PyreonSyncedSignal(doc, "title", "") }')
    expect(r.code).toContain('val count = remember { PyreonSyncedSignal(doc, "count", 0.0) }')
    expect(r.code).toContain('val done = remember { PyreonSyncedSignal(doc, "done", false) }')
  })

  it('reads title() (invoke) and writes count.set(...)', () => {
    expect(r.code).toContain('"${title()}"')
    expect(r.code).toContain('count.set(count() + 1)')
  })

  it('does NOT warn as web-only', () => {
    expect(r.warnings ?? []).toEqual([])
  })

  it('the emit type-checks against the Kotlin stubs (validate gate)', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error ?? '').toBe(true)
  })
})

describe('syncedSignal — a string-literal actor + custom map', () => {
  const src = `
import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'
import { Stack, Text } from '${P}'
export function C() {
  const doc = new PyreonCrdtDoc('fixed-actor')
  const n = syncedSignal({ doc, map: 'room1', key: 'n', initial: 0 })
  return (<Stack><Text>{n()}</Text></Stack>)
}
`
  it('bakes the actor literal + threads a custom map (Swift)', () => {
    const r = transform(src, { target: 'swift' })
    expect(r.code).toContain('let doc = PyreonCrdtDoc(actor: "fixed-actor")')
    expect(r.code).toContain('PyreonSyncedSignal(doc: doc, map: "room1", key: "n", initial: 0)')
  })
  it('bakes the actor literal + threads a custom map (Kotlin)', () => {
    const r = transform(src, { target: 'kotlin' })
    expect(r.code).toContain('PyreonCrdtDoc("fixed-actor")')
    expect(r.code).toContain('PyreonSyncedSignal(doc, "n", 0.0, "room1")')
  })
})

describe('syncedSignal — warns (silent-drop) outside the v1 shape', () => {
  const base = (decl: string) =>
    `import { PyreonCrdtDoc, syncedSignal } from '@pyreon/sync'\nimport { Stack, Text } from '${P}'\nexport function C(){ const doc = new PyreonCrdtDoc(); ${decl} return (<Stack><Text>x</Text></Stack>) }`

  it('warns when `doc` is absent', () => {
    const r = transform(base(`const s = syncedSignal({ key: 'k', initial: 0 });`), {
      target: 'swift',
    })
    expect((r.warnings ?? []).some((w) => w.includes('syncedSignal') && w.includes('doc'))).toBe(
      true,
    )
  })

  it('warns when `initial` is not a scalar literal', () => {
    const r = transform(base(`const s = syncedSignal({ doc, key: 'k', initial: someVar });`), {
      target: 'swift',
    })
    expect(
      (r.warnings ?? []).some((w) => w.includes('syncedSignal') && w.includes('initial')),
    ).toBe(true)
  })
})
