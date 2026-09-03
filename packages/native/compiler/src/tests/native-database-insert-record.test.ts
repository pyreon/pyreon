// `db.insert(collection, { id, fields })` never compiled — on either target.
//
// `insert` is the ONLY way to get data into a `useDatabase()` store, and its
// record argument is naturally written as an object literal. The generic
// object-literal path lowered it to an anonymous shape:
//
//   Swift   db.insert("notes", (id: "1", fields: __Obj0(at: "x")))
//   Kotlin  db.insert("notes", (id = "1", fields = __Obj0(at = "x")))
//
// A Swift tuple is not a `PyreonRecord`, and the Kotlin form is not even a
// valid expression. Zero warnings on both.
//
// This is the third defect in one capability, and the ordering explains why
// the earlier two hid: #2514 fixed `get`/`delete`/`find`'s missing argument
// labels, and the persistence fix made the default backend durable — but with
// `insert` uncompilable, no app could ever put a record in, so nothing
// downstream was reachable. "No gated app renders FROM the database" had a
// cause, not just an absence of effort.
//
// `swiftc -parse` accepts a tuple literal happily, which is why this needed
// the type gate rather than the syntax gate — the same reason the argument
// labels survived so long.
//
// FOURTH defect, found while auditing whether this fix was actually usable:
// fixing the RECORD shape (`{ id, fields }`) left the FLAT shape people
// naturally write (`{ id, description, amount }`, no `fields` key) falling
// through to the generic struct-synthesis path with ZERO warning — that path
// happily synthesizes a real, compiling struct for a flat object of typed
// fields, it just isn't `PyreonRecord`. `native-finance`'s own showcase hit
// this and retreated to string-keyed ops rather than ever inserting a real
// row. See `warnDatabaseInsertShape` at the bottom of `emit-swift.ts` /
// `emit-kotlin.ts`.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const app = (body: string) => `import { useDatabase } from '@pyreon/primitives'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const db = useDatabase()
  ${body}
  return <Stack><Text>{db.count('notes')}</Text></Stack>
}`

const WRITE = app(`const add = () => { db.insert('notes', { id: 'n1', fields: { at: 'x', who: 'me' } }) }`)

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

describe('db.insert record literal', () => {
  it('Swift lowers the literal to PyreonRecord with a dictionary', () => {
    expect(swift(WRITE).code).toContain(
      'db.insert("notes", PyreonRecord(id: "n1", fields: ["at": "x", "who": "me"]))',
    )
  })

  it('Kotlin lowers the literal to PyreonRecord with a mapOf', () => {
    expect(kotlin(WRITE).code).toContain(
      'db.insert("notes", PyreonRecord("n1", mapOf("at" to "x", "who" to "me")))',
    )
  })

  it('emits NO anonymous object/tuple for the record — that was the bug', () => {
    // Stated separately from the positive assertions: an emit could satisfy
    // those and still leak a `__Obj` synth class for the same literal.
    expect(swift(WRITE).code).not.toContain('__Obj')
    expect(kotlin(WRITE).code).not.toContain('__Obj')
  })

  it('handles a record with NO fields (the id-only shape)', () => {
    const idOnly = app(`const add = () => { db.insert('notes', { id: 'n1' }) }`)
    // Both runtimes default `fields` to empty, so omitting it is legal and
    // must not emit an empty dictionary of the wrong type.
    expect(swift(idOnly).code).toContain('db.insert("notes", PyreonRecord(id: "n1"))')
    expect(kotlin(idOnly).code).toContain('db.insert("notes", PyreonRecord("n1"))')
  })

  it('handles an EMPTY fields object', () => {
    const empty = app(`const add = () => { db.insert('notes', { id: 'n1', fields: {} }) }`)
    // `[:]` is Swift's empty-dictionary literal — `[]` would be an ARRAY and
    // would not typecheck against `[String: String]`.
    expect(swift(empty).code).toContain('PyreonRecord(id: "n1", fields: [:])')
    expect(kotlin(empty).code).toContain('PyreonRecord("n1", emptyMap())')
  })

  it('passes computed id and field expressions through unchanged', () => {
    // A signal read, not a `const` — the compiler inlines a literal-valued
    // const at its use sites, so `const n = 2` would emit `String((2) + 1)`
    // and the assertion would be testing constant folding rather than the
    // record lowering.
    const computed = `import { signal } from '@pyreon/reactivity'
import { useDatabase, Stack, Text } from '@pyreon/primitives'
export function C() {
  const db = useDatabase()
  const n = signal(2)
  const add = () => { db.insert('notes', { id: String(n() + 1), fields: { at: 'x' } }) }
  return <Stack><Text>{db.count('notes')}</Text></Stack>
}`
    expect(swift(computed).code).toContain('PyreonRecord(id: String(n + 1), fields: ["at": "x"])')
    expect(kotlin(computed).code).toContain('PyreonRecord((n + 1).toString(), mapOf("at" to "x"))')
  })

  it('does NOT rewrite a literal with unexpected keys — a wrong call must still error', () => {
    // Papering over a mistyped key (`{ id, feilds }`) by silently dropping it
    // would be worse than the compiler error. Fall through to the generic path.
    const typo = app(`const add = () => { db.insert('notes', { id: 'n1', feilds: { at: 'x' } }) }`)
    expect(swift(typo).code).not.toContain('PyreonRecord(id: "n1"')
  })

  describe('a non-matching literal warns before falling through', () => {
    // The class this closes: struct synthesis for the fallthrough SUCCEEDS
    // whenever the fields are individually typeable — a flat domain object of
    // strings/numbers is the normal case, not the exception — so
    // `warnUntypeableObjectLiteral` (which asks "could a struct be
    // synthesized at all") stays silent. The struct compiles; it just isn't
    // `PyreonRecord`, and Swift/Kotlin are nominally typed, so nothing
    // synthesized here can ever satisfy that parameter. Proven by compiling,
    // not by reading the emit, at the bottom of this file.

    it('the FLAT domain object shape people naturally write', () => {
      const flat = app(
        `const add = () => { db.insert('notes', { id: 'n1', description: 'x', amount: 1 }) }`,
      )
      expect(swift(flat).warnings ?? []).not.toEqual([])
      expect((swift(flat).warnings ?? []).join(' ')).toMatch(/description.*amount|amount.*description/)
      expect((swift(flat).warnings ?? []).join(' ')).toContain('fields: { ... }')
      expect((kotlin(flat).warnings ?? []).join(' ')).toContain('PyreonRecord')
    })

    it('names the SPECIFIC unknown fields, not a generic message', () => {
      const flat = app(`const add = () => { db.insert('notes', { id: 'n1', amount: 1 }) }`)
      expect((swift(flat).warnings ?? []).join(' ')).toContain('`amount`')
    })

    it('a literal missing `id` entirely', () => {
      const noId = app(`const add = () => { db.insert('notes', { fields: { at: 'x' } }) }`)
      expect((swift(noId).warnings ?? []).join(' ')).toContain('no `id` field')
    })

    it('the mistyped-key case above ALSO warns (extends the earlier spec)', () => {
      const typo = app(`const add = () => { db.insert('notes', { id: 'n1', feilds: { at: 'x' } }) }`)
      expect(swift(typo).warnings ?? []).not.toEqual([])
    })

    it('the RECOGNIZED shapes stay silent — id+fields, id-only, empty fields', () => {
      expect(swift(WRITE).warnings ?? []).toEqual([])
      expect(kotlin(WRITE).warnings ?? []).toEqual([])
      const idOnly = app(`const add = () => { db.insert('notes', { id: 'n1' }) }`)
      expect(swift(idOnly).warnings ?? []).toEqual([])
      const empty = app(`const add = () => { db.insert('notes', { id: 'n1', fields: {} }) }`)
      expect(swift(empty).warnings ?? []).toEqual([])
    })

    it.skipIf(!isSwiftcAvailable())('the flat-object emit does NOT compile — proves the warning is honest', () => {
      const flat = app(
        `const add = () => { db.insert('notes', { id: 'n1', description: 'x', amount: 1 }) }`,
      )
      const res = validateSwiftWithStubs(swift(flat).code)
      expect(res.ok).toBe(false)
      expect(res.error ?? '').toContain('PyreonRecord')
    })

    it.skipIf(!isKotlincAvailable())('same on Kotlin — argument type mismatch, not a parse error', () => {
      const flat = app(
        `const add = () => { db.insert('notes', { id: 'n1', description: 'x', amount: 1 }) }`,
      )
      const res = validateKotlin(kotlin(flat).code)
      expect(res.ok).toBe(false)
      expect(res.error ?? '').toContain('PyreonRecord')
    })
  })

  it('does NOT rewrite insert on a NON-database binding', () => {
    // The rewrite is keyed on `useDatabase()` bindings only; an unrelated
    // object with an `insert` method must be untouched.
    const other = `import { useDatabase } from '@pyreon/primitives'
import { Stack, Text } from '@pyreon/primitives'
export function C() {
  const db = useDatabase()
  const other = { insert: (a: string, b: { id: string }) => a + b.id }
  const go = () => { other.insert('notes', { id: 'n1' }) }
  return <Stack><Text>{db.count('notes')}</Text></Stack>
}`
    expect(swift(other).code).not.toContain('other.insert("notes", PyreonRecord')
  })

  it.skipIf(!isKotlincAvailable())('the emitted Kotlin typechecks', () => {
    const res = validateKotlin(kotlin(WRITE).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift TYPE-checks (a tuple would not)', () => {
    const res = validateSwiftWithStubs(swift(WRITE).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
