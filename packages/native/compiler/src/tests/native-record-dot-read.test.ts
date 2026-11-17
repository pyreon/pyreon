// A field read through a string-keyed record — `rec.fields.title` on a `useDatabase` record, or any
// `Record<string, string>` — was emitted verbatim. A Swift dictionary and a Kotlin map have no `.title`, so both
// native builds failed, and nothing warned. It lowers to a subscript with the value type's empty value for an absent
// key; a record whose values have no empty value is named. The router demo's RecordField device tests hold the
// lowering on devices.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const DB = `import { useDatabase } from '@pyreon/hooks'
import { Text, Stack } from '@pyreon/primitives'
import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
export function App() {
  const db = useDatabase()
  const title = signal('none')
  const done = signal(0)
  onMount(() => {
    const rec = db.get('notes', '1')
    if (rec) title.set(rec.fields.title)
    done.set(db.all('notes').filter((r) => r.fields.state === 'done').length)
  })
  return <Stack><Text>{title()}</Text><Text>{done()}</Text></Stack>
}`

const PLAIN = `import { Text } from '@pyreon/primitives'
const scores: Record<string, number> = { ann: 3 }
const flags: Record<string, boolean> = { dark: true }
export function App() {
  return <Text>{scores.ann + (flags.dark ? 1 : 0)}</Text>
}`

describe('a dot read of a string-keyed record lowers to a subscript', () => {
  it('reads a database record field on both targets, with no warning', () => {
    const swift = transform(DB, { target: 'swift' })
    const kotlin = transform(DB, { target: 'kotlin' })
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toContain('(rec.fields["title"] ?? "")')
    expect(swift.code).toContain('(r.fields["state"] ?? "")')
    expect(kotlin.code).toContain('(rec.fields["title"] ?: "")')
    expect(kotlin.code).toContain('(r.fields["state"] ?: "")')
  })

  it('reads a declared number / boolean record with that type’s empty value', () => {
    expect(transform(PLAIN, { target: 'swift' }).code).toContain('(scores["ann"] ?? 0)')
    expect(transform(PLAIN, { target: 'kotlin' }).code).toContain('(flags["dark"] ?: false)')
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks', () => {
    for (const src of [DB, PLAIN]) {
      const v = validateSwiftWithStubs(transform(src, { target: 'swift' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks', () => {
    for (const src of [DB, PLAIN]) {
      const v = validateKotlin(transform(src, { target: 'kotlin' }).code)
      expect(v.ok, v.error).toBe(true)
    }
  })

  it('names a dot read of a record whose values have no empty value', () => {
    const src = `import { Text } from '@pyreon/primitives'
type Item = { n: number }
const byId: Record<string, Item> = { a: { n: 1 } }
export function App() {
  return <Text>{byId.a.n}</Text>
}`
    for (const target of ['swift', 'kotlin'] as const) {
      expect(transform(src, { target }).warnings.join('\n'), target).toMatch(/dot read `\.a` of a string-keyed record/)
    }
  })

  // Found while proving the lowering on device: the demo's `let body = state('none')` became `@State private var body`
  // beside the View's `var body`, which swiftc rejects. It is named now.
  it('names a component binding called `body`, which collides with SwiftUI View.body', () => {
    const src = `import { Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function Note() {
  const body = signal('x')
  return <Text>{body()}</Text>
}`
    expect(transform(src, { target: 'swift' }).warnings.join('\n')).toMatch(/named `body` collides with SwiftUI's `View.body`/)
    expect(transform(src, { target: 'kotlin' }).warnings.join('\n')).not.toMatch(/View.body/)
  })
})
