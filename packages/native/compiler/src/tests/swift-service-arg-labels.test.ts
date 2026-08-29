// Swift argument labels on native SERVICE methods — the same defect #2514 fixed
// for PyreonDatabase, generalised past the one service it was found on.
//
// Swift API-design convention labels arguments; the shared TS surface is
// positional. The generic member-call emit is positional too, so any service
// method with a labelled Swift signature produced Swift that does not compile:
//
//   map.moveTo(37.3, -122.0)   ->  map.moveTo(37.3, -122.0)
//   error: missing argument labels 'latitude:longitude:' in call
//
// `swiftc -parse` waves this through (labels are a TYPE-level concern), which
// is why PyreonDatabase's `get`/`delete`/`find` shipped broken until the
// typecheck gate landed. Map's `moveTo` and `removeMarker` — the primary map
// API — were still broken after that fix, because the fix was database-shaped.
//
// SCOPE WAS ENUMERATED, NOT GUESSED. Every `public func` in runtime-swift with
// a labelled parameter was listed, then each probed for reachability from the
// TS hook surface:
//
//   PyreonDatabase    get/delete/find        already fixed (#2514)
//   PyreonMapState    moveTo, removeMarker   BROKEN -> fixed here
//   PyreonMapState    selectMarker(_ id:)    unlabelled natively, fine
//   PyreonGeolocation update(latitude:…)     internal transition, not on the
//                                            hook surface
//   PyreonWebSocket   connect(to:)           internal; the TS surface is 0-arg
//   PyreonSecureStorage write/read/remove    not lowered at all (deferred v1)
//
// Kotlin needs no equivalent — named arguments are optional there, so its
// positional emit was already valid. The Kotlin assertions below exist to prove
// that claim rather than assume it.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const wrap = (decl: string, call: string) => `
  import { useMap, useDatabase } from '@pyreon/hooks'
  import { Stack, Button } from '@pyreon/primitives'
  export function C() {
    ${decl}
    return (<Stack><Button onPress={() => { ${call} }}>go</Button></Stack>)
  }
`

const swift = (decl: string, call: string) =>
  transform(wrap(decl, call), { target: 'swift' }).code ?? ''
const kotlin = (decl: string, call: string) =>
  transform(wrap(decl, call), { target: 'kotlin' }).code ?? ''

const MAP = 'const map = useMap()'

describe('Swift service argument labels', () => {
  // The LABELS are this file's invariant; the literal FORM is incidental to it.
  // These previously read `longitude: -122` because an integral-valued float
  // literal lost its decimal point on the way through — `-122.0` in the source
  // emitted as an Int and leaned on Swift's literal coercion to still compile.
  // The source text is now preserved, so the expectation matches what this
  // file's own header comment always documented:
  //   map.moveTo(37.3, -122.0)  ->  map.moveTo(37.3, -122.0)
  it('moveTo labels both required arguments', () => {
    expect(swift(MAP, 'map.moveTo(37.3, -122.0)')).toContain(
      'map.moveTo(latitude: 37.3, longitude: -122.0)',
    )
  })

  it('moveTo labels the DEFAULTED third argument too', () => {
    // zoom has a default, so 2-arg and 3-arg are both legal — the arity check
    // must accept both rather than only an exact match.
    expect(swift(MAP, 'map.moveTo(37.3, -122.0, 12)')).toContain(
      'map.moveTo(latitude: 37.3, longitude: -122.0, zoom: 12)',
    )
  })

  it('removeMarker labels its single argument', () => {
    expect(swift(MAP, "map.removeMarker('a')")).toContain('map.removeMarker(id: "a")')
  })

  it('selectMarker stays UNLABELLED — it is `_ id:` natively', () => {
    // Over-labelling is as broken as under-labelling; this guards the
    // direction a "label everything" fix would get wrong.
    const out = swift(MAP, "map.selectMarker('a')")
    expect(out).toContain('map.selectMarker("a")')
    expect(out).not.toContain('selectMarker(id:')
  })

  it('an over-long call falls through to the generic emit', () => {
    // Deliberately NOT papered over: a genuinely wrong call should still
    // surface as a Swift compiler error rather than being silently labelled.
    expect(swift(MAP, 'map.moveTo(1, 2, 3, 4)')).toContain('map.moveTo(1, 2, 3, 4)')
  })

  it('the PyreonDatabase labels from #2514 are unchanged', () => {
    // The table was reshaped from "labels after a leading unlabelled argument"
    // to full-positional labels; database output must be byte-identical.
    const db = 'const db = useDatabase()'
    expect(swift(db, "db.delete('tx', 'a')")).toContain('db.delete("tx", id: "a")')
    expect(swift(db, "db.find('tx', 'k', 'v')")).toContain(
      'db.find("tx", field: "k", equals: "v")',
    )
  })
})

describe('Kotlin is unaffected — named arguments are optional there', () => {
  it('emits the positional call, which is already valid', () => {
    expect(kotlin(MAP, 'map.moveTo(37.3, -122.0)')).toContain('map.moveTo(37.3, -122')
    expect(kotlin(MAP, "map.removeMarker('a')")).toContain('map.removeMarker("a")')
  })
})
