// The cross-file Kotlin redeclaration gate.
//
// Every native Android example adds `runtime-kotlin` and `router-kotlin` as
// Gradle `srcDir`s, so all of those files compile as ONE module — two files
// declaring the same top-level name in the same package is a hard
// `Redeclaration:` error there.
//
// No local gate could see it. `verify-kotlin.ts` compiles ONE service file
// against stubs (that isolation is the point — it is how a module gets checked
// without the Android SDK), and `run-kotlin-tests.ts` compiles one module plus
// its test. So the first thing that noticed was `gradle assembleDebug` on the
// device workflow: an 8-minute CI round trip, on a workflow that does not run
// for every change.
//
// It cost exactly that when `PyreonDatabase.kt` added an `object PyreonJson`
// for its file backend, unaware that `PyreonJson.kt` already existed for the
// WebView bridge.

import { describe, expect, it } from 'vitest'
import {
  collectDeclarations,
  findCollisions,
} from '../../../../native/runtime-kotlin/scripts/check-duplicate-declarations'

const decls = (src: string, file = 'A.kt') => collectDeclarations(src, file)

describe('collectDeclarations', () => {
  it('captures top-level types with their package', () => {
    const out = decls(`package com.pyreon.runtime

public class Foo
internal object Bar
interface Baz
`)
    expect(out.map((d) => d.name)).toEqual(['Foo', 'Bar', 'Baz'])
    expect(out.every((d) => d.pkg === 'com.pyreon.runtime')).toBe(true)
  })

  it('IGNORES nested declarations — they are namespaced by their parent', () => {
    // The bug class is top-level collisions only. A nested `class Parser`
    // inside two different objects is perfectly legal, and flagging it would
    // make the gate a nuisance that gets disabled.
    const out = decls(`package p

object Outer {
    private class Parser
    object Inner
}
`)
    expect(out.map((d) => d.name)).toEqual(['Outer'])
  })

  it('keys functions by name AND parameters, because overloads are legal', () => {
    // `fun PyreonDatabase(context: Context)` and
    // `fun PyreonDatabase(backend: Backend)` coexist by design.
    const out = decls(`package p

fun make(a: Context): X = TODO()
fun make(b: Backend): X = TODO()
`)
    expect(findCollisions(out).size).toBe(0)
    expect(out.map((d) => d.name)).toEqual(['make(a:Context)', 'make(b:Backend)'])
  })

  it('does NOT overload types — two classes of one name always collide', () => {
    const out = decls(`package p

class Dup
object Dup
`)
    expect(findCollisions(out).size).toBe(1)
  })

  it('skips comment lines that mention a declaration keyword', () => {
    const out = decls(`package p

// class Ghost
/* object Phantom */
* interface Spectre
class Real
`)
    expect(out.map((d) => d.name)).toEqual(['Real'])
  })

  it('captures top-level properties', () => {
    const out = decls(`package p

const val LIMIT = 4
var mutableThing: Int = 0
`)
    expect(out.map((d) => d.name)).toEqual(['LIMIT', 'mutableThing'])
  })
})

describe('findCollisions', () => {
  it('reports the SHIPPED collision shape with both files', () => {
    // The literal incident: PyreonDatabase.kt's file-backend codec vs the
    // WebView bridge's serializer wrapper.
    const a = collectDeclarations('package com.pyreon.runtime\n\nobject PyreonJson\n', 'PyreonJson.kt')
    const b = collectDeclarations(
      'package com.pyreon.runtime\n\ninternal object PyreonJson\n',
      'PyreonDatabase.kt',
    )
    const found = findCollisions([...a, ...b])
    expect([...found.keys()]).toEqual(['com.pyreon.runtime::PyreonJson'])
    expect(found.get('com.pyreon.runtime::PyreonJson')!.map((d) => d.file)).toEqual([
      'PyreonJson.kt',
      'PyreonDatabase.kt',
    ])
  })

  it('does NOT collide across different packages', () => {
    // runtime-kotlin and router-kotlin compile together but use different
    // packages, so a same-named object in each is legal.
    const a = collectDeclarations('package com.pyreon.runtime\n\nobject Shared\n', 'a.kt')
    const b = collectDeclarations('package com.pyreon.router\n\nobject Shared\n', 'b.kt')
    expect(findCollisions([...a, ...b]).size).toBe(0)
  })

  it('is clean on no input', () => {
    expect(findCollisions([]).size).toBe(0)
  })
})
