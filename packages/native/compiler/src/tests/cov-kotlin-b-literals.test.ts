// Kotlin emit — the object-literal last-resort fallbacks and the
// `db.insert` shape diagnostic (emit-kotlin.ts, the tail of `emitKotlinExpr`).
//
// Two distinct last stops before a structurally-wrong emit:
//
//   * `byNames` — struct synthesis keys on field name:TYPE, so a literal with
//     one un-typeable field bails even though an EARLIER literal with the same
//     field NAMES already synthesized a data class. Reusing that class is what
//     keeps `todos.set([...todos(), { … }])` from emitting `(id = 3, …)`,
//     named arguments with no constructor (not valid Kotlin at all).
//   * `warnDatabaseInsertShape` — the Kotlin half. The existing
//     `native-database-insert-record` suite drives the Swift side through every
//     reason and the Kotlin side through only the two-unknown-fields shape, so
//     the missing-`id` reason, the SINGULAR unknown-field wording and the
//     empty-literal `(empty)` rendering are exercised here.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const kotlin = (src: string) => transform(src, { target: 'kotlin' })

describe('Kotlin object literal — the name-set fallback', () => {
  // The field NAMES still uniquely identify the struct synthesized for the
  // signal's initial value, so the append reuses that same `__Obj0` rather
  // than falling through to the invalid named-argument tuple.
  const APPEND = `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const todos = signal([{ id: 1, text: 'a', done: false }])
  const add = (raw: string) => {
    todos.set([...todos(), { id: 3, text: { a: raw, b: [1, 'x'] }, done: false }])
  }
  return (<Stack><Text>{todos().length}</Text></Stack>)
}`

  it('reuses the earlier synthesized data class when only the field TYPES are un-inferable', () => {
    const r = kotlin(APPEND)
    // The OUTER literal resolves by name-set to the class the initial value
    // synthesized — not to a fresh `__Obj1`, and not to a bare tuple.
    expect(r.code).toContain('data class __Obj0(var id: Int, var text: String, var done: Boolean)')
    expect(r.code).toContain('todos = (todos + listOf(__Obj0(id = 3, text =')
    expect(r.code).not.toContain('listOf((id = 3')
  })

  it('the INNER literal that defeated synthesis is named, with its cause and the Kotlin consequence', () => {
    const r = kotlin(APPEND)
    expect(r.warnings).toHaveLength(1)
    const w = r.warnings[0]!
    expect(w).toContain('object literal { a, b }')
    expect(w).toContain('`b`: the array mixes element types')
    // The Kotlin half of the consequence — the Swift wording ("labelled tuple,
    // which COMPILES") belongs to emit-swift's own call of the same helper.
    expect(w).toContain('named arguments with no constructor, which is INVALID Kotlin')
    expect(w).toContain('signal<Shape>({ … })')
  })

  it('a fully typeable append needs no fallback at all — no warning, same class', () => {
    const clean = APPEND.replace(`{ a: raw, b: [1, 'x'] }`, 'raw')
    const r = kotlin(clean)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('__Obj0(id = 3, text = raw, done = false)')
  })
})

describe('Kotlin db.insert — every reason in the shape diagnostic', () => {
  const app = (body: string) => `import { useDatabase, Stack, Text } from '@pyreon/primitives'
export function C() {
  const db = useDatabase()
  ${body}
  return <Stack><Text>{db.count('notes')}</Text></Stack>
}`

  it('a literal with NO id at all names that reason', () => {
    const r = kotlin(app(`const add = () => { db.insert('notes', { fields: { at: 'x' } }) }`))
    expect(r.warnings.join(' ')).toContain('no `id` field')
    expect(r.warnings.join(' ')).toContain('{ fields }')
    expect(r.warnings.join(' ')).toContain('will NOT compile')
  })

  it('an EMPTY literal renders the given field list as `(empty)` and still names the missing id', () => {
    const r = kotlin(app(`const add = () => { db.insert('notes', {}) }`))
    expect(r.warnings.join(' ')).toContain('argument { (empty) } is not the { id, fields } shape')
    expect(r.warnings.join(' ')).toContain('no `id` field')
    // Only the missing-id reason — there is no unknown field to list.
    expect(r.warnings.join(' ')).not.toContain('nest')
  })

  it('ONE unknown field uses the singular wording; two use the plural', () => {
    const one = kotlin(app(`const add = () => { db.insert('notes', { id: 'n1', amount: 1 }) }`))
    expect(one.warnings.join(' ')).toContain('`amount` is not `id`/`fields` — nest it under `fields: { ... }`')
    const two = kotlin(app(`const add = () => { db.insert('notes', { id: 'n1', amount: 1, note: 'x' }) }`))
    expect(two.warnings.join(' ')).toContain('are not `id`/`fields` — nest them under `fields: { ... }`')
  })

  it('the recognized { id, fields } shape stays silent on Kotlin', () => {
    const r = kotlin(app(`const add = () => { db.insert('notes', { id: 'n1', fields: { at: 'x' } }) }`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('db.insert("notes", PyreonRecord("n1", mapOf("at" to "x")))')
  })
})

describe('object-literal KEYS that are not legal native identifiers', () => {
  const flags = (key: string) => `import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
export function App() {
  const f = signal({ '${key}': true })
  return (<Stack><Text>x</Text></Stack>)
}`

  it.fails(
    'KNOWN BUG: an object-literal key that is not a legal Swift/Kotlin identifier is emitted VERBATIM into the '
      + 'synthesized struct — `data class __Obj0(var posts.read: Boolean)` / `var posts.read: Bool` — which parses on '
      + 'neither target, with ZERO warnings. Ordinary TS reaches it: a permissions map, a feature-flag bag, an i18n '
      + 'or analytics key set. FIX: route every synthesized field name through an identifier sanitizer at the struct '
      + 'DECLARATION and at each construction site (emit-kotlin `synthLiteralStructName` / `byNames` / the tuple '
      + 'fallback, and their emit-swift twins), the way `expandKotlinSpread` already does with `safeIdent`. '
      + 'The clincher that this is an inconsistency rather than a gap: `safeIdent` handles a HYPHEN, and `a-b` is '
      + 'emitted raw here too — so the repo\'s own remedy exists and simply is not reached on this path. It needs '
      + 'widening past hyphens as part of the fix (dots, spaces, slashes, a leading digit all reach the same emit). '
      + 'Delete this spec when it starts passing.',
    () => {
      for (const key of ['posts.read', 'has space', '2fa', 'a/b', 'a-b']) {
        for (const target of ['swift', 'kotlin'] as const) {
          const r = transform(flags(key), { target })
          const decl = r.code.split('\n').find((l) => l.includes(': Bool') || l.includes(': Boolean')) ?? ''
          expect(decl, `${target} ${key}: ${JSON.stringify(r.warnings)}`).not.toContain(key)
        }
      }
    },
  )

  it('a LEGAL key still synthesizes normally — the fix above must not churn this', () => {
    const r = kotlin(flags('postsRead'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('data class __Obj0(var postsRead: Boolean)')
  })
})
