// Synthesized data classes carry @Serializable — consistency with the
// named-struct emit (fetch-arc, 2026-06-10).
//
// Pre-fix, `emitKotlinDataClass` (the SYNTH path — inline object types
// in decls/props) emitted a bare `data class`, while `emitKotlinStruct`
// (named `type X = {...}`) always annotated. A synth class reachable
// from a fetch decode (`useFetch<{ name: string }[]>(url)` →
// `Json.decodeFromString<List<AppData>>`) compiled against the kotlinc
// validate STUBS but fails a REAL Compose build — the serialization
// plugin only generates serializers for annotated classes.
//
// Bisect site: the `@Serializable\n` prefix in emitKotlinDataClass.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('synthesized data classes — @Serializable consistency', () => {
  it('inline object type in a useFetch generic emits an annotated synth class', () => {
    const out = transform(
      `
      export function App() {
        const user = useFetch<{ name: string; age: number }[]>('/api/users')
        return <Text>{user.data}</Text>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('@Serializable\ndata class AppData(val name: String, val age: Int)')
    expect(out).toContain('Json.decodeFromString<List<AppData>>(body)')
  })

  it('named type structs keep their annotation (no regression)', () => {
    const out = transform(
      `
      type User = { name: string }
      export function App() {
        const user = useFetch<User>('/api/user')
        return <Text>{user.data}</Text>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('@Serializable\ndata class User(')
  })
})
