// `useDatabase` — Swift ARGUMENT LABELS.
//
// THE BUG. The shared TS surface is positional (`db.delete('tx', id)`), but
// `PyreonDatabase` in runtime-swift follows Swift API-design convention and
// declares LABELLED arguments:
//
//   public func get(_ collection: String, id: String) -> PyreonRecord?
//   public func delete(_ collection: String, id: String) -> Bool
//   public func find(_ collection: String, field: String, equals value: String) -> [PyreonRecord]
//
// The generic member-call emit passed arguments through positionally, so
// `db.delete("tx", id)` emitted `db.delete("tx", id)` — which does NOT compile
// ("missing argument label 'id:' in call"). `get`, `delete` and `find` have
// therefore never produced compilable Swift.
//
// WHY IT SHIPPED. Argument labels are part of a Swift call's TYPE, not its
// syntax, so `swiftc -parse` — the per-PR Swift gate until the stub
// `-typecheck` harness landed — accepts the un-labelled call. It surfaced the
// moment the showcase-app emits were type-checked (M-gate.1f). Same lesson as
// the `.animation(_:value:)`-needs-Equatable incident: a gate that does not
// actually TYPE-check is a false-safety gate.
//
// KOTLIN IS UNAFFECTED — named arguments are optional there, so its positional
// emit was already valid. This is a Swift-only fix, asserted below on both
// backends so the asymmetry stays deliberate rather than accidental.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwiftWithStubs } from '../validate'

const SRC = `import { useDatabase } from '@pyreon/hooks'
export function Ledger() {
  const db = useDatabase()
  return (
    <Button onPress={() => {
      db.delete('tx', 'a')
      db.get('tx', 'b')
      db.find('tx', 'kind', 'debit')
      db.count('tx')
      db.all('tx')
    }}>Run</Button>
  )
}`

describe('useDatabase — Swift argument labels', () => {
  const swift = () => transform(SRC, { target: 'swift' }).code

  it('labels the id: argument on get and delete', () => {
    const out = swift()
    expect(out).toContain('db.delete("tx", id: "a")')
    expect(out).toContain('db.get("tx", id: "b")')
  })

  it('labels field: and equals: on find', () => {
    expect(swift()).toContain('db.find("tx", field: "kind", equals: "debit")')
  })

  it('leaves single-argument methods unlabelled (count / all take only the collection)', () => {
    const out = swift()
    expect(out).toContain('db.count("tx")')
    expect(out).toContain('db.all("tx")')
  })

  it('only rewrites calls on a REAL useDatabase decl, not any object named db', () => {
    // A same-named local must not get database labels grafted onto it.
    const out = transform(
      `export function C(props: { db: { delete(a: string, b: string): void } }) {
         return <Button onPress={() => { props.db.delete('tx', 'a') }}>X</Button>
       }`,
      { target: 'swift' },
    ).code
    expect(out).not.toContain('id:')
  })

  it('a wrong-arity call falls through to the plain emit (the compiler still reports it)', () => {
    // Papering over an arity mistake would hide a real error; the emit must not
    // invent labels for a shape the runtime does not declare.
    const out = transform(
      `import { useDatabase } from '@pyreon/hooks'
       export function C() {
         const db = useDatabase()
         return <Button onPress={() => { db.delete('tx') }}>X</Button>
       }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('db.delete("tx")')
  })

  it('KOTLIN keeps the positional call (named args are optional there)', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('db.delete("tx", "a")')
    expect(out).toContain('db.find("tx", "kind", "debit")')
    expect(out).not.toContain('id =')
  })

  it.skipIf(!isSwiftcAvailable())('the emitted Swift COMPILES against the runtime surface', () => {
    // The load-bearing assertion: a string match proves the shape, this proves
    // the call actually type-checks against PyreonDatabase's real signature.
    const res = validateSwiftWithStubs(swift())
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
