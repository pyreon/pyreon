// Dynamic `useQuery` — the runtime-key / templated-URL / direct-value widening
// (GAP 1). The v1 emit only lowered a STATIC queryKey + an inline
// fetch('<url-literal>') queryFn; this closes the common real-app shapes:
//
//   • queryKey with non-literal parts (`['user', userId]`, `['k', id()]`) →
//     a RUNTIME cache key. SwiftUI's @State default can't reference a
//     prop/signal, so the query constructs KEYLESS (`queryKey: ""`) and is
//     re-keyed in the async harness via `setKey`, with the harness keyed on
//     the computed string (`.task(id:)` / `LaunchedEffect(key)`) so a key
//     change re-fetches — matching the web's reactive queryKey.
//   • a TEMPLATE-literal fetch URL (`fetch(`/users/${userId}`)`) → native
//     string interpolation inside the harness (self/params in scope).
//   • a DIRECT-VALUE queryFn (`() => <expr>` / `async () => <expr>`, no fetch,
//     no await) → `resolve(<expr>)`, no URLSession/decode.
//
// Bisect: neuter `tryQueryKeyParts`'s `hasExpr` branch (return `{ literal }`
// always) → the runtime-key specs fall back to the old bail warning; restore
// → they lower.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

// Runtime queryKey (a prop) + a templated fetch URL — the dominant real-app
// shape (`useQuery(['user', userId], () => fetch(`/users/${userId}`))`).
const RUNTIME_URL = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface User { id: number; name: string }
export function UserCard({ userId }: { userId: string }) {
  const q = useQuery<User>(() => ({
    queryKey: ['user', userId],
    queryFn: () => fetch(\`https://api.example.com/users/\${userId}\`).then((r) => r.json()),
    staleTime: 60000,
  }))
  return <Text>{q.data}</Text>
}
`

describe('useQuery() — runtime key + templated URL', () => {
  it('Swift: keyless @State, .task(id:) + setKey, interpolated URL', () => {
    const r = transform(RUNTIME_URL, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // Constructed KEYLESS — the @State default can't read `userId`.
    expect(r.code).toContain(
      '@State private var q = PyreonQuery<User>(queryKey: "", staleSeconds: 60)',
    )
    // Harness keyed on the runtime key string; setKey re-points the cache.
    expect(r.code).toContain('.task(id: "user:\\(userId)") {')
    expect(r.code).toContain('q.setKey("user:\\(userId)")')
    expect(r.code).toContain('if q.isStale {')
    // The templated URL is interpolated inside the harness.
    expect(r.code).toContain(
      'URLSession.shared.data(from: URL(string: "https://api.example.com/users/\\(userId)")!)',
    )
  })

  it('Kotlin: keyless remember, LaunchedEffect(key) + setKey, interpolated URL', () => {
    const r = transform(RUNTIME_URL, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'val q = remember { PyreonQuery<User>(queryKey = "", staleMillis = 60000L) }',
    )
    expect(r.code).toContain('LaunchedEffect("user:${userId}") {')
    expect(r.code).toContain('q.setKey("user:${userId}")')
    expect(r.code).toContain('java.net.URL("https://api.example.com/users/${userId}").readText()')
  })

  it.runIf(isSwiftcAvailable())('Swift runtime-key emit typechecks against the stubs', () => {
    const r = transform(RUNTIME_URL, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin runtime-key emit typechecks against the stubs', () => {
    const r = transform(RUNTIME_URL, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })
})

// Runtime queryKey reading a SIGNAL + a direct-value queryFn (no fetch).
const SIGNAL_VALUE = `
import { Text } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
import { useQuery } from '@pyreon/query'
export function P() {
  const id = signal(1)
  const q = useQuery<number>(() => ({ queryKey: ['k', id()], queryFn: async () => id() }))
  return <Text>{q.data}</Text>
}
`

describe('useQuery() — signal key + direct-value queryFn', () => {
  it('Swift: keyed on the signal read, resolves the value directly (no fetch/decode)', () => {
    const r = transform(SIGNAL_VALUE, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      '@State private var q = PyreonQuery<Int>(queryKey: "", staleSeconds: 0)',
    )
    expect(r.code).toContain('.task(id: "k:\\(id)") {')
    expect(r.code).toContain('q.setKey("k:\\(id)")')
    expect(r.code).toContain('q.resolve(id)')
    // No network path for a direct-value fetcher.
    expect(r.code).not.toContain('URLSession')
  })

  it('Kotlin: keyed on the signal read, resolves the value directly', () => {
    const r = transform(SIGNAL_VALUE, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('LaunchedEffect("k:${id}") {')
    expect(r.code).toContain('q.setKey("k:${id}")')
    expect(r.code).toContain('q.resolve(id)')
    expect(r.code).not.toContain('java.net.URL')
  })

  it.runIf(isSwiftcAvailable())('Swift direct-value emit typechecks against the stubs', () => {
    const r = transform(SIGNAL_VALUE, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin direct-value emit typechecks against the stubs', () => {
    const r = transform(SIGNAL_VALUE, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })
})

describe('useQuery() — still bails on genuinely unsupported queryFn shapes', () => {
  it('warns on a fetch with a CALL-expression URL (can’t be baked)', () => {
    const src = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface T { id: number }
export function P() {
  const q = useQuery<T>(() => ({ queryKey: ['t'], queryFn: () => fetch(buildUrl()), staleTime: 0 }))
  return <Text>{q.data}</Text>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => /queryFn must be an inline/.test(w))).toBe(true)
    expect(r.code).not.toContain('PyreonQuery<')
  })

  it('warns on a direct-value queryFn that awaits (async body is a follow-up)', () => {
    const src = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface T { id: number }
export function P() {
  const q = useQuery<T>(() => ({ queryKey: ['t'], queryFn: async () => await load(), staleTime: 0 }))
  return <Text>{q.data}</Text>
}
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings.some((w) => /queryFn must be an inline/.test(w))).toBe(true)
    expect(r.code).not.toContain('PyreonQuery<')
  })
})
