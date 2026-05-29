// Phase 3 — `const { id } = useParams()` destructuring emit. Own test file
// (not canonical-primitives.test.ts) to avoid append-conflicts with in-flight
// emit PRs that also extend that file.
//
// Before this, the decl parser skipped ObjectPattern bindings, so
// `const { id } = useParams()` referenced an undeclared `id` (uncompilable on
// both targets). Now each destructured field binds to the router's params map:
//   Swift  → private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }
//            (COMPUTED — the initializer reads @Environment, illegal in a stored let)
//   Kotlin → val id = useParams()["id"] ?: ""
// Aliasing (`{ id: userId }`) binds the local to the param key.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Phase 3 — useParams() destructuring emit', () => {
  const SRC = `
    export function UserPage() {
      const { id } = useParams<{ id: string }>()
      return <Text>{id}</Text>
    }
  `

  it('Swift: each field is a COMPUTED property reading the params map', () => {
    const out = transform(SRC, { target: 'swift' }).code
    // Computed (not stored `let id = …`) — the initializer reads @Environment.
    expect(out).toContain('private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }')
    expect(out).not.toContain('let id = useParams')
    // @Environment(\.pyreonRouter) injected since the destructure reads it.
    expect(out).toContain('@Environment(\\.pyreonRouter)')
    // `id` is now declared — the JSX read resolves.
    expect(out).toContain('Text("\\(id)")')
  })

  it('Kotlin: each field is a val reading the params map', () => {
    const out = transform(SRC, { target: 'kotlin' }).code
    expect(out).toContain('val id = useParams()["id"] ?: ""')
    expect(out).toContain('Text(text = "${id}")')
  })

  it('aliasing { id: userId } binds the local to the param key', () => {
    const ALIAS = `
      export function P() {
        const { id: userId, tab } = useParams()
        return <Text>{userId}</Text>
      }
    `
    const swift = transform(ALIAS, { target: 'swift' }).code
    expect(swift).toContain('private var userId: String { useParams(router: pyreonRouter)["id"] ?? "" }')
    expect(swift).toContain('private var tab: String { useParams(router: pyreonRouter)["tab"] ?? "" }')

    const kotlin = transform(ALIAS, { target: 'kotlin' }).code
    expect(kotlin).toContain('val userId = useParams()["id"] ?: ""')
    expect(kotlin).toContain('val tab = useParams()["tab"] ?: ""')
  })
})
