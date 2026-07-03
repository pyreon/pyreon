import { describe, expect, it } from 'vitest'
import { transform } from '../index'

// Function-typed struct fields (iter44). Pre-fix, THREE silent fails:
// (1) `type X = { cb: () => void }` emitted `struct X: Codable` — closures
// aren't Codable, a HARD swiftc error ("does not conform to protocol
// 'Decodable'", scratch-proven) — and `@Serializable data class` — the
// kotlinx serialization plugin rejects function properties on the REAL
// Compose build while the kotlinc validate stubs mask it (device-only red).
// (2) A parenthesized type `(() => void) | undefined` hit parse's unknown
// default → the whole union degraded to `Any?` (compilable for assignment,
// uncompilable the moment the callback is CALLED). (3) With (2) fixed, the
// union emit produced `() -> Void?` / `(Int) -> Unit?` — a function
// RETURNING an optional, not an optional function; both need parens.

const FN_FIELDS = `
import { Stack, Text } from '@pyreon/primitives'
type RowActions = { label: string; onDone: () => void; onPick: (id: number) => void }
export function Row(props: { actions: RowActions }) {
  return <Stack gap="sm"><Text>{props.actions.label}</Text></Stack>
}
`

const OPT_FN_UNION = `
import { Stack, Text } from '@pyreon/primitives'
type Cfg = { tag: string; cb: (() => void) | undefined }
export function Row(props: { cfg: Cfg }) {
  return <Stack gap="sm"><Text>{props.cfg.tag}</Text></Stack>
}
`

const PLAIN = `
import { Stack, Text } from '@pyreon/primitives'
type Item = { id: number; name: string }
export function Row(props: { item: Item }) {
  return <Stack gap="sm"><Text>{props.item.name}</Text></Stack>
}
`

describe('function-typed struct fields drop serialization conformance', () => {
  it('Swift: a struct with a function field emits WITHOUT Codable', () => {
    const out = transform(FN_FIELDS, { target: 'swift' }).code
    expect(out).toContain('struct RowActions {')
    expect(out).not.toContain('struct RowActions: Codable')
    expect(out).toContain('var onDone: () -> Void')
    expect(out).toContain('var onPick: (Int) -> Void')
  })

  it('Kotlin: a data class with a function property emits WITHOUT @Serializable', () => {
    const out = transform(FN_FIELDS, { target: 'kotlin' }).code
    expect(out).toContain('data class RowActions(')
    expect(out).not.toContain('@Serializable\ndata class RowActions(')
  })

  it('a function-FREE struct keeps Codable / @Serializable byte-identically', () => {
    const sw = transform(PLAIN, { target: 'swift' }).code
    expect(sw).toContain('struct Item: Codable {')
    const kt = transform(PLAIN, { target: 'kotlin' }).code
    expect(kt).toContain('@Serializable\ndata class Item(')
  })
})

describe('parenthesized + optional function types', () => {
  it('parse: `(() => void) | undefined` resolves (was Any? via the unknown default)', () => {
    const sw = transform(OPT_FN_UNION, { target: 'swift' }).code
    expect(sw).not.toContain('var cb: Any?')
  })

  it('Swift: optional function field is PARENTHESIZED — `(() -> Void)?`', () => {
    const sw = transform(OPT_FN_UNION, { target: 'swift' }).code
    // bare `() -> Void?` would be a function RETURNING Void?, not an
    // optional function
    expect(sw).toContain('var cb: (() -> Void)?')
  })

  it('Kotlin: nullable function property is PARENTHESIZED — `(() -> Unit)?`', () => {
    const kt = transform(OPT_FN_UNION, { target: 'kotlin' }).code
    expect(kt).toContain('var cb: (() -> Unit)?')
  })

  it('a SYNTHESIZED data class (anon object w/ function field) drops @Serializable too', () => {
    const src = `
import { Stack, Text } from '@pyreon/primitives'
export function Row(props: { cfg: { tag: string; cb: () => void } }) {
  return <Stack gap="sm"><Text>{props.cfg.tag}</Text></Stack>
}
`
    const kt = transform(src, { target: 'kotlin' }).code
    expect(kt).toContain('data class RowCfg(')
    expect(kt).not.toContain('@Serializable\ndata class RowCfg(')
    const sw = transform(src, { target: 'swift' }).code
    expect(sw).toContain('struct RowCfg {')
    expect(sw).not.toContain('struct RowCfg: Codable')
  })

  it('a struct with only an OPTIONAL function field still drops conformance', () => {
    // typeContainsFunction walks union branches — the optional wrapper
    // must not hide the closure from the gate.
    const sw = transform(OPT_FN_UNION, { target: 'swift' }).code
    expect(sw).toContain('struct Cfg {')
    expect(sw).not.toContain('struct Cfg: Codable')
    const kt = transform(OPT_FN_UNION, { target: 'kotlin' }).code
    expect(kt).not.toContain('@Serializable\ndata class Cfg(')
  })
})
