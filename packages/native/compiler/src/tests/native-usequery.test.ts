// `useQuery<T>(() => ({ queryKey, queryFn, staleTime }))` emit — the cached
// data-fetching hook lowered to PyreonQuery on both native targets.
//
//   Swift  → @State PyreonQuery<T>(queryKey:, staleSeconds:) + a `.task` on
//            the stable ZStack host that hands the request to `q.run { … }`
//   Kotlin → remember { PyreonQuery<T>(queryKey =, staleMillis =) } + a
//            LaunchedEffect(Unit) calling `q.run(launch = …) { … }`; reactive
//            reads append .value
//
// The delta over useFetch is the CACHE: the runtime's `run` fetches only when
// the cache is stale, so a fresh hit skips the fetch and serves the hydrated
// value — and it KEEPS the request, so `q.refetch()` re-runs it.
//
// v1 scope (conservative, same literal-only rule as useFetch): queryKey =
// array of string/number literals (colon-joined); queryFn = inline
// `() => fetch('<url-literal>')`; staleTime = number literal (ms). Anything
// else warns + bails, so `useQuery` still warns as unsupported rather than
// mis-lowering.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

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
  it('Swift: @State PyreonQuery, a .task that registers the request on the ZStack host, bare reads', () => {
    const r = transform(SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    // Container seeded with the colon-joined cache key + staleTime→seconds.
    expect(r.code).toContain(
      '@State private var q = PyreonQuery<Todo>(queryKey: "todo:1", staleSeconds: 60)',
    )
    // The request is handed to the runtime, which fetches ONLY when the cache is stale and keeps it for refetch.
    expect(r.code).toContain('.task {\n        await q.run {')
    expect(r.code).toContain(
      'URLSession.shared.data(from: URL(string: "https://api.example.com/todos/1")!)',
    )
    expect(r.code).toContain('return try JSONDecoder().decode(Todo.self, from: bytes)')
    // Stable-identity host so .task fires once (not restarted per branch flip).
    expect(r.code).toContain('ZStack {')
    // Reactive reads are bare @Observable properties on Swift (all four fields).
    expect(r.code).toContain('\\(q.isPending)')
    expect(r.code).toContain('\\(q.isFetching)')
    expect(r.code).toContain('\\(q.data)')
    expect(r.code).toContain('\\(q.error)')
  })

  it('Kotlin: remembered PyreonQuery, a LaunchedEffect that registers the request, .value reads', () => {
    const r = transform(SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'val q = remember { PyreonQuery<Todo>(queryKey = "todo:1", staleMillis = 60000L) }',
    )
    expect(r.code).toContain(
      'LaunchedEffect(Unit) {\n    q.run(launch = { __refetch -> pyreonAsyncScope.launch { __refetch() } }) {',
    )
    expect(r.code).toContain('java.net.URL("https://api.example.com/todos/1").readText()')
    expect(r.code).toContain('PyreonJson.decode<Todo>(body)')
    // Reactive member reads append .value (Compose MutableState) — all four.
    expect(r.code).toContain('${q.isPending.value}')
    expect(r.code).toContain('${q.isFetching.value}')
    expect(r.code).toContain('${q.data.value}')
    expect(r.code).toContain('${q.error.value}')
  })

  it('warns + does not lower when queryKey is NOT an array', () => {
    // A runtime-key array (`['todo', id()]`) DOES lower now (see the dynamic
    // suite); the bail is reserved for a genuinely unsupported shape — a
    // queryKey that isn't an array literal at all.
    const src = `
import { Text } from '@pyreon/primitives'
import { useQuery } from '@pyreon/query'
interface Todo { id: number }
export function P({ keys }: { keys: string[] }) {
  const q = useQuery<Todo>(() => ({ queryKey: keys, queryFn: () => fetch('/x'), staleTime: 0 }))
  return <Text>{q.data}</Text>
}
`
    const r = transform(src, { target: 'swift' })
    expect(r.warnings.some((w) => /queryKey must be an ARRAY/.test(w))).toBe(true)
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
    expect(r.code).toContain('return try __response.decode(Todo.self)')
  })

  it('Kotlin: an inline fetch with method/headers/body routes through PyreonHttp', () => {
    const r = transform(POST_SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonHttp.send(PyreonHttpRequest(')
    expect(r.code).toContain('method = PyreonHttpMethod.POST')
    expect(r.code).toContain('"Content-Type" to "application/json"')
    expect(r.code).toContain('body = "{\\"x\\":1}"')
    expect(r.code).toContain('if (!__response.isOk) throw PyreonHttpError.BadStatus')
    // An app that installs no executor still has one: the OkHttp default, named by the generated code itself.
    expect(r.code).toContain('fallback = PyreonHttpOkHttp)')
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

// `q.refetch()` re-runs the SAME request. The runtime can only do that if the harness REGISTERED the request with it:
// an emit that fetched inline (begin → resolve|reject) left `refetch()` a silent no-op on both targets.
describe('useQuery() refetch: the harness registers the request', () => {
  const REFETCH_SRC = `
import { Stack, Text, Button } from '@pyreon/primitives'
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
      <Text>{q.data}</Text>
      <Button onPress={() => q.refetch()}>Reload</Button>
    </Stack>
  )
}
`

  it('Swift: the request is handed to run, nothing settles it inline', () => {
    const r = transform(REFETCH_SRC, { target: 'swift' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('await q.run {')
    expect(r.code).toContain('{ q.refetch() }')
    for (const inline of ['q.begin()', 'q.resolve(', 'q.reject(', 'q.isStale']) expect(r.code).not.toContain(inline)
  })

  it('Kotlin: the request and a scope launcher are handed to run, the scope declared before the harness', () => {
    const r = transform(REFETCH_SRC, { target: 'kotlin' })
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('q.run(launch = { __refetch -> pyreonAsyncScope.launch { __refetch() } }) {')
    expect(r.code).toContain('onClick = { q.refetch() }')
    for (const inline of ['q.begin()', 'q.resolve(', 'q.reject(', 'q.isStale']) expect(r.code).not.toContain(inline)
    // A local is only visible below its declaration, so the scope must precede the LaunchedEffect that reads it.
    expect(r.code.indexOf('val pyreonAsyncScope = rememberCoroutineScope()')).toBeGreaterThan(-1)
    expect(r.code.indexOf('val pyreonAsyncScope = rememberCoroutineScope()')).toBeLessThan(r.code.indexOf('LaunchedEffect(Unit)'))
  })

  it.runIf(isSwiftcAvailable())('Swift refetch emit typechecks against the stubs', () => {
    const v = validateSwiftWithStubs(transform(REFETCH_SRC, { target: 'swift' }).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('Kotlin refetch emit typechecks against the stubs', () => {
    const v = validateKotlin(transform(REFETCH_SRC, { target: 'kotlin' }).code)
    expect(v.ok, v.error).toBe(true)
  })
})
