// `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` emit — the cached
// data-fetching hook lowered to PyreonQuery on both native targets.
//
//   Swift  → @State PyreonQuery<T>(queryKey:, staleSeconds:) + an isStale-
//            guarded `.task` on the stable ZStack host (begin → resolve|reject)
//   Kotlin → remember { PyreonQuery<T>(queryKey =, staleMillis =) } + an
//            isStale-guarded LaunchedEffect(Unit); reactive reads append .value
//
// The delta over useFetch is the CACHE: the emit guards the network on
// `isStale`, so a fresh hit skips the fetch and serves the hydrated value.
//
// v1 scope (conservative, same literal-only rule as useFetch): queryKey =
// array of string/number literals (colon-joined); queryFn = inline
// `() => fetch('<url-literal>')`; staleTime = number literal (ms). Anything
// else warns + bails, so `useQuery` still warns as unsupported rather than
// mis-lowering.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const SRC = `
import { Stack, Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface Todo { id: number; title: string }
export function TodoPage() {
  const q = useQuery<Todo>(() => ({
    queryKey: ['todo', 1],
    queryFn: () => fetch('https://api.example.com/todos/1').then(r => r.json()),
    staleTime: 60000,
  }))
  return (
    <Stack gap={3}>
      <Text data-testid="pending">{q.isPending}</Text>
      <Text data-testid="fetching">{q.isFetching}</Text>
      <Text data-testid="title">{q.data}</Text>
      <Text data-testid="err">{q.error}</Text>
    </Stack>
  )
}
`

describe('useQuery() emit', () => {
  it('Swift: @State PyreonQuery, isStale-guarded .task on the ZStack host, bare reads', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // Container seeded with the colon-joined cache key + staleTime→seconds.
    expect(r.code).toContain(
      '@State private var q = PyreonQuery<Todo>(queryKey: "todo:1", staleSeconds: 60)',
    )
    // The fetch runs ONLY when the cache is stale (the whole point of a cache).
    expect(r.code).toContain('.task {')
    expect(r.code).toContain('if q.isStale {')
    expect(r.code).toContain('q.begin()')
    expect(r.code).toContain(
      'URLSession.shared.data(from: URL(string: "https://api.example.com/todos/1")!)',
    )
    expect(r.code).toContain('q.resolve(try JSONDecoder().decode(Todo.self, from: bytes))')
    expect(r.code).toContain('} catch { q.reject(error) }')
    // Stable-identity host so .task fires once (not restarted per branch flip).
    expect(r.code).toContain('ZStack {')
    // Reactive reads are bare @Observable properties on Swift (all four fields).
    expect(r.code).toContain('\\(q.isPending)')
    expect(r.code).toContain('\\(q.isFetching)')
    expect(r.code).toContain('\\(q.data)')
    expect(r.code).toContain('\\(q.error)')
  })

  it('Kotlin: remembered PyreonQuery, isStale-guarded LaunchedEffect, .value reads', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'val q = remember { PyreonQuery<Todo>(queryKey = "todo:1", staleMillis = 60000L) }',
    )
    expect(r.code).toContain('LaunchedEffect(Unit) {')
    expect(r.code).toContain('if (q.isStale) {')
    expect(r.code).toContain('q.begin()')
    expect(r.code).toContain('java.net.URL("https://api.example.com/todos/1").readText()')
    expect(r.code).toContain('q.resolve(PyreonFetchJson.decodeFromString<Todo>(body))')
    expect(r.code).toContain('} catch (e: Throwable) { q.reject(e) }')
    // Reactive member reads append .value (Compose MutableState) — all four.
    expect(r.code).toContain('${q.isPending.value}')
    expect(r.code).toContain('${q.isFetching.value}')
    expect(r.code).toContain('${q.data.value}')
    expect(r.code).toContain('${q.error.value}')
  })

  it('warns + does not lower a non-literal queryKey (reactive key is a follow-up)', () => {
    const src = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface Todo { id: number }
export function P({ id }: { id: () => number }) {
  const q = useQuery<Todo>(() => ({ queryKey: ['todo', id()], queryFn: () => fetch('/x'), staleTime: 0 }))
  return <Text>{q.data}</Text>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => /queryKey must be an array of string\/number literals/.test(w))).toBe(true)
    // Bailed → no PyreonQuery emitted.
    expect(r.code).not.toContain('PyreonQuery<')
  })

  it('warns + does not lower when queryFn is not an inline fetch', () => {
    const src = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface Todo { id: number }
export function P() {
  const q = useQuery<Todo>(() => ({ queryKey: ['todo'], queryFn: fetchTodo, staleTime: 0 }))
  return <Text>{q.data}</Text>
}
`
    const r = transform(src, { target: 'kotlin' })
    expect(r.warnings.some((w) => /queryFn must be an inline/.test(w))).toBe(true)
    expect(r.code).not.toContain('PyreonQuery<')
  })

  // A queryFn whose inline fetch carries a verb/headers/body routes through
  // PyreonHttp (mirroring useFetch), not the bare URLSession/readText path.
  const POST_SRC = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface Todo { id: number }
export function P() {
  const q = useQuery<Todo>(() => ({
    queryKey: ['todo'],
    queryFn: () => fetch('/todos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"x":1}' }),
    staleTime: 0,
  }))
  return <Text>{q.data}</Text>
}
`

  it('Swift: an inline fetch with method/headers/body routes through PyreonHttp', () => {
    const r = transform(POST_SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonHttp.send(')
    expect(r.code).toContain('method: .post')
    expect(r.code).toContain('url: "/todos"')
    expect(r.code).toContain('"Content-Type": "application/json"')
    expect(r.code).toContain('body: Data("{\\"x\\":1}".utf8)')
    expect(r.code).toContain('q.resolve(try __response.decode(Todo.self))')
  })

  it('Kotlin: an inline fetch with method/headers/body routes through PyreonHttp', () => {
    const r = transform(POST_SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonHttp.send(PyreonHttpRequest(')
    expect(r.code).toContain('method = PyreonHttpMethod.POST')
    expect(r.code).toContain('"Content-Type" to "application/json"')
    expect(r.code).toContain('body = "{\\"x\\":1}"')
    expect(r.code).toContain('if (!__response.isOk) throw PyreonHttpError.BadStatus')
  })

  it.runIf(isSwiftcAvailable())('Swift POST-query emit typechecks against the stubs', () => {
    const r = transform(POST_SRC, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin POST-query emit typechecks against the stubs', () => {
    const r = transform(POST_SRC, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isSwiftcAvailable())('Swift emit typechecks against the stubs', () => {
    const r = transform(SRC, { target: 'swift' })
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin emit typechecks against the stubs', () => {
    const r = transform(SRC, { target: 'kotlin' })
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })
})
