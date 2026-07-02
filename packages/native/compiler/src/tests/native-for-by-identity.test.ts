// Zero-silent-drops (P1) — `<For by={(x) => x}>` identity keying (both
// targets).
//
// The `by` resolver only understood the member shape (`(i) => i.id` →
// `\.id` / `{ it.id }`) and SILENTLY fell back to `.id` for everything
// else — so the identity key over a plain-string list (`<For each={names}
// by={(n) => n}>`, the tags/categories/subjects shape) emitted
// `ForEach(names, id: \.id)` / `key = { it.id }`: an uncompilable SILENT
// mis-emit on both targets ("value of type 'String' has no member 'id'" /
// "unresolved reference 'id'"). Surfaced by the StatsPage example — the
// realistic-app discovery pattern.
//
// Fix: identity body ((n) => n, param === body identifier) → Swift
// `id: \.self` (String/Int are Hashable) / Kotlin `key = { it }`; member
// body unchanged; any OTHER by-shape (computed keys) → NAMED warning +
// the id fallback so the native compiler names the site (never silent).
// The dead `extractMemberPath` helpers were removed from both emitters.
//
// Bisect-load-bearing: neuter the identity branch → the identity specs
// revert to `.id` + both compile proofs fail; the member-key controls pass.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftUIAvailable,
  validateKotlin,
  validateSwiftTypecheck,
} from '../validate'

const STR_LIST = `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
export function App(){
  const names = signal<string[]>(["a", "b"])
  return (<Stack><For each={names} by={(n: string) => n}>{(n: string) => <Text>{n}</Text>}</For></Stack>)
}`

const ID_LIST = `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; label: string }
export function App(){
  const items = signal<T[]>([{ id: 1, label: "a" }])
  return (<Stack><For each={items} by={(t: T) => t.id}>{(t: T) => <Text>{t.label}</Text>}</For></Stack>)
}`

describe('P1 — <For by={(x) => x}> identity keying', () => {
  it('Swift: identity by → `id: \\.self` (was the uncompilable `\\.id`)', () => {
    const rs = transform(STR_LIST, { target: 'swift' })
    expect(rs.code).toContain('ForEach(names, id: \\.self)')
    expect(rs.code).not.toContain('id: \\.id')
    expect(rs.warnings).toHaveLength(0)
  })
  it('Kotlin: identity by → `key = { it }`', () => {
    const rk = transform(STR_LIST, { target: 'kotlin' })
    expect(rk.code).toContain('key = { it }')
    expect(rk.code).not.toContain('it.id')
    expect(rk.warnings).toHaveLength(0)
  })
  it('controls: the member key `(t) => t.id` is unchanged on both targets', () => {
    expect(transform(ID_LIST, { target: 'swift' }).code).toContain('ForEach(items, id: \\.id)')
    expect(transform(ID_LIST, { target: 'kotlin' }).code).toContain('key = { it.id }')
  })
  it('guard: a computed by-key warns NAMED on both targets (never silent)', () => {
    const src = `import { signal } from '@pyreon/reactivity'
import { For } from '@pyreon/core'
import { Stack, Text } from '@pyreon/primitives'
type T = { id: number; label: string }
export function App(){
  const items = signal<T[]>([{ id: 1, label: "a" }])
  return (<Stack><For each={items} by={(t: T) => t.id + 1}>{(t: T) => <Text>{t.label}</Text>}</For></Stack>)
}`
    expect(transform(src, { target: 'swift' }).warnings.some((w) => w.includes('<For by='))).toBe(true)
    expect(transform(src, { target: 'kotlin' }).warnings.some((w) => w.includes('<For by='))).toBe(true)
  })

  it.skipIf(!isSwiftUIAvailable())('iOS: a string-list For TYPECHECKS against real SwiftUI', () => {
    const r = validateSwiftTypecheck(transform(STR_LIST, { target: 'swift' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Android: the same compiles via kotlinc', () => {
    const r = validateKotlin(transform(STR_LIST, { target: 'kotlin' }).code)
    expect(r.ok, r.error ?? '').toBe(true)
  })
})
