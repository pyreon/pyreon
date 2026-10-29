// Requests that carry RUNTIME data (#3978): a `json` body built from signals, runtime header and query values, an
// endpoint awaited in an async event handler, and `useMutation`.
//
// Every spec asserts the EMIT on both targets and compiles it — against the stub gates here (both toolchains), and
// against the real SDK + real runtime in `real-runtime-typecheck.test.ts`, whose package snippets exercise the same
// shapes. The byte-level contracts live elsewhere: `native-query-encoder-parity` (PyreonURL.query vs the web's
// buildQuery, executed) and `native-json-stringify-parity` (the body serializer).
import { describe, expect, it } from 'vitest'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'

const HEAD = `
import { signal } from '@pyreon/reactivity'
import { createHttp } from '@pyreon/http'
import { useMutation, useQuery } from '@pyreon/query'
import { useFetch } from '@pyreon/hooks'
import { Stack, Text, Button, Field } from '@pyreon/primitives'
interface Reply { id: string; name: string }
const api = createHttp({ baseUrl: 'https://x.test/api' })
`

const both = (src: string) => ({
  swift: transform(HEAD + src, { target: 'swift' }),
  kotlin: transform(HEAD + src, { target: 'kotlin' }),
})

const compiles = (src: string): void => {
  const { swift, kotlin } = both(src)
  if (isSwiftcAvailable()) {
    const v = validateSwiftWithStubs(swift.code)
    expect(v.ok, `swift:\n${JSON.stringify(v)}\n${swift.code}`).toBe(true)
  }
  if (isKotlincAvailable()) {
    const v = validateKotlin(kotlin.code)
    expect(v.ok, `kotlin:\n${JSON.stringify(v)}\n${kotlin.code}`).toBe(true)
  }
}

describe('a runtime json body', () => {
  const SRC = `
const save = api.endpoint('POST /items')
export function C() {
  const name = signal('a')
  const q = useQuery<Reply>(() => save.query({ json: { name: name(), n: 2 } }))
  return <Stack><Text>{q.data()?.id ?? ''}</Text></Stack>
}`

  it('is serialized by the web-identical stringify, with content-type, on both targets', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toMatch(/body: Data\(\(PyreonJSON\.stringify\(\w+\(name: name, n: 2\)\)\)\.utf8\)/)
    expect(swift.code).toContain('"content-type": "application/json"')
    expect(kotlin.code).toMatch(/body = PyreonJson\.stringify\(\w+\(name = name, n = 2L?\)\)/)
  })

  it('compiles', () => compiles(SRC), 120_000)
})

describe('headers', () => {
  it('a call header MERGES over the declared ones by lower-cased name, as the web mergeHeaders does', () => {
    const { swift } = both(`
const ep = api.endpoint('GET /a', { headers: { 'X-Decl': 'd', 'X-Gone': 'g' } })
export function C() {
  const r = useFetch<Reply>(ep({ headers: { 'x-call': 'c', 'X-GONE': null } }))
  return <Text>{r.data()?.id ?? ''}</Text>
}`)
    expect(swift.code).toContain('headers: ["x-decl": "d", "x-call": "c"]')
    expect(swift.code).not.toContain('x-gone')
  })

  it('a runtime header value is evaluated when the request is built', () => {
    const { swift, kotlin } = both(`
const ep = api.endpoint('GET /a')
export function C() {
  const token = signal('t')
  const q = useQuery<Reply>(() => ep.query({ headers: { authorization: \`Bearer \${token()}\` } }))
  return <Text>{q.data()?.id ?? ''}</Text>
}`)
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('"authorization": "Bearer \\(token)"')
    expect(kotlin.code).toContain('"authorization" to "Bearer ${token}"')
  })

  it('a number header is sent as String(value), computed at compile time', () => {
    const { swift } = both(`
const ep = api.endpoint('GET /a')
export function C() {
  const r = useFetch<Reply>(ep({ headers: { 'x-n': 1.5 } }))
  return <Text>{r.data()?.id ?? ''}</Text>
}`)
    expect(swift.code).toContain('"x-n": "1.5"')
  })
})

describe('a string body with no content-type', () => {
  it('gets the Fetch standard default, so every platform sends the same type', () => {
    const { swift, kotlin } = both(`
export function C() {
  const draft = signal('x')
  const r = useFetch<Reply>('https://x.test/a', { method: 'POST', body: JSON.stringify({ d: draft() }) })
  return <Text>{r.data()?.id ?? ''}</Text>
}`)
    expect(swift.warnings).toEqual([])
    expect(swift.code).toContain('"content-type": "text/plain;charset=UTF-8"')
    expect(kotlin.code).toContain('"content-type" to "text/plain;charset=UTF-8"')
  })

  it('a non-string body is refused by name rather than sent as text', () => {
    const { swift } = both(`
export function C() {
  const r = useFetch<Reply>('https://x.test/a', { method: 'POST', body: 42 })
  return <Text>{r.data()?.id ?? ''}</Text>
}`)
    expect(swift.warnings.some((w) => w.includes('body must be a string'))).toBe(true)
    expect(swift.code).not.toContain('body: Data')
  })
})

describe('a runtime query value', () => {
  const SRC = `
const search = api.endpoint('GET /search?v=1')
export function C() {
  const q = signal('a b')
  const page = signal(2)
  const r = useQuery<Reply>(() => search.query({ query: { q: q(), page: page(), fixed: 'x' } }))
  return <Text>{r.data()?.id ?? ''}</Text>
}`

  it('is serialized at request time by PyreonURL.query, keeping source order and joining with & after a path ?', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.code).toContain('PyreonURL.query("&", "q", q, "page", page, "fixed", "x")')
    expect(kotlin.code).toContain('PyreonURL.query("&", "q", q, "page", page, "fixed", "x")')
    // It is part of the cache key, so a changed value re-fetches.
    expect(swift.code).toMatch(/\.task\(id: "GET:https:\/\/x\.test\/api\/search\?v=1\\\(PyreonURL\.query/)
  })

  it('compiles', () => compiles(SRC), 120_000)
})

describe('an endpoint awaited in an async handler', () => {
  const SRC = `
const signIn = api.endpoint('POST /session')
export function C() {
  const email = signal('')
  const status = signal('idle')
  const submit = async () => {
    await signIn({ json: { email: email() } })
    status.set('in')
  }
  return (
    <Stack>
      <Field value={email} onChangeText={(v) => email.set(v)} />
      <Button onPress={submit}>Sign in</Button>
      <Button onPress={() => signIn({ json: { email: email() } })}>Fire</Button>
      <Text>{status()}</Text>
    </Stack>
  )
}`

  it('lowers to PyreonHttp.call, and a failure ends the handler without escaping it', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toContain('try await PyreonHttp.call(PyreonHttpRequest(method: .post, url: "https://x.test/api/session"')
    expect(swift.code).toMatch(/do \{[\s\S]*try await PyreonHttp\.call[\s\S]*status = "in"[\s\S]*\} catch \{ print\("\[Pyreon\] Unhandled error in an async handler/)
    expect(kotlin.code).toContain('withContext(Dispatchers.IO) { PyreonHttp.call(__request, fallback = PyreonHttpOkHttp) }')
    // Uncaught inside `launch` would crash the app; a cancellation still propagates.
    expect(kotlin.code).toContain('if (e is kotlin.coroutines.cancellation.CancellationException) throw e')
  })

  it('an un-awaited call is sent fire-and-forget, the request built before the handler moves on', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.code).toContain('PyreonHttp.fire(PyreonHttpRequest(method: .post')
    expect(kotlin.code).toMatch(/PyreonHttpRequest\([^\n]*\)\.let \{ __request -> pyreonAsyncScope\.launch \{ try \{ withContext/)
  })

  it('using the awaited VALUE is refused by name and pointed at useMutation', () => {
    const { swift } = both(`
const signIn = api.endpoint('POST /session')
export function C() {
  const go = async () => { const r = await signIn({ json: {} }) }
  return <Button onPress={go}>x</Button>
}`)
    expect(swift.warnings.some((w) => w.includes('useMutation<Reply>(signIn.mutation())'))).toBe(true)
  })

  it('compiles', () => compiles(SRC), 120_000)
})

describe('useMutation', () => {
  const SRC = `
const saveItem = api.endpoint('PUT /items/:id')
const ping = api.endpoint('POST /ping')
export function C() {
  const name = signal('a')
  const last = signal('')
  const save = useMutation<Reply>(saveItem.mutation())
  const pinger = useMutation({ mutationFn: (n: string) => ping({ json: { name: n } }), onSuccess: () => last.set('pinged') })
  const go = async () => {
    const r = await save.mutateAsync({ params: { id: '7' }, json: { name: name() } })
    last.set(r.name)
  }
  return (
    <Stack>
      <Button onPress={() => { save.mutate({ params: { id: name() }, json: { name: name() } }, { onSuccess: (d) => last.set(d.id) }); name.set('') }}>Save</Button>
      <Button onPress={() => pinger.mutate(name())}>Ping</Button>
      <Button onPress={go}>Go</Button>
      <Button onPress={() => save.reset()}>Reset</Button>
      <Text>{save.isPending() ? 'saving' : save.data()?.name ?? 'none'}</Text>
      <Text>{save.status()}</Text>
    </Stack>
  )
}`

  it('declares a container and builds each request at its call site', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.warnings).toEqual([])
    expect(kotlin.warnings).toEqual([])
    expect(swift.code).toContain('@State private var save = PyreonMutation<Reply>()')
    expect(swift.code).toContain('@State private var pinger = PyreonMutation<Void>()')
    expect(kotlin.code).toContain('val save = remember { PyreonMutation<Reply>() }')
    // The request is an ARGUMENT, so `name.set('')` after it cannot change what is sent.
    expect(swift.code).toMatch(/save\.mutate\(PyreonHttpRequest\(method: \.put, url: "https:\/\/x\.test\/api\/items\/\\\(PyreonURL\.encodePathParam\(name\)\)"/)
    expect(kotlin.code).toMatch(/PyreonHttpRequest\([^\n]*\)\.let \{ __request -> save\.begin\(\)\.let \{ __mine -> pyreonAsyncScope\.launch \{ save\.run\(__mine, __request,/)
  })

  it('a mutationFn parameter is substituted by the call-site argument', () => {
    const { swift } = both(SRC)
    expect(swift.code).toMatch(/pinger\.mutate\(PyreonHttpRequest\(method: \.post, url: "https:\/\/x\.test\/api\/ping"[^\n]*PyreonJSON\.stringify\(\w+\(name: name\)\)/)
  })

  it('mutateAsync is awaited, typed, and throws into the handler', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.code).toContain('let r = try await save.mutateAsync(PyreonHttpRequest(')
    expect(kotlin.code).toContain('val r = save.runAsync(PyreonHttpRequest(')
  })

  it('options-level and call-level callbacks land in their own slots', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.code).toMatch(/options: PyreonMutationCallbacks\(onSuccess: \{ _ in\s+last = "pinged"/)
    expect(swift.code).toMatch(/call: PyreonMutationCallbacks\(onSuccess: \{ d in\s+last = d\.id/)
    expect(kotlin.code).toMatch(/call = PyreonMutationCallbacks\(onSuccess = \{ d ->\s+last = d\.id/)
  })

  it('reads data / status / isPending as container fields', () => {
    const { swift, kotlin } = both(SRC)
    expect(swift.code).toContain('save.isPending ? "saving" : (save.data?.name ?? "none")')
    expect(kotlin.code).toContain('save.isPending.value')
    expect(kotlin.code).toContain('save.status.value')
  })

  it('compiles', () => compiles(SRC), 120_000)

  it('names every option it does not lower', () => {
    const { swift } = both(`
const ep = api.endpoint('POST /a')
export function C() {
  const m = useMutation({ ...ep.mutation({ invalidates: [] }), retry: 3, onMutate: () => {} })
  return <Button onPress={() => m.mutate({})}>x</Button>
}`)
    for (const key of ['invalidates', 'retry', 'onMutate']) {
      expect(swift.warnings.some((w) => w.includes(key)), key).toBe(true)
    }
  })

  it('a mutationFn that does not call a same-file endpoint stays web, by name', () => {
    const { swift } = both(`
export function C() {
  const m = useMutation({ mutationFn: (v: string) => fetch('https://x', { method: 'POST', body: v }) })
  return <Button onPress={() => m.mutate('a')}>x</Button>
}`)
    expect(swift.warnings.some((w) => w.includes('must return a call of a same-file `@pyreon/http` endpoint'))).toBe(true)
  })

  it('an endpoint-form mutate needs its call arguments as an object literal', () => {
    const { swift } = both(`
const ep = api.endpoint('POST /a')
export function C() {
  const args = { json: 1 }
  const m = useMutation(ep.mutation())
  return <Button onPress={() => m.mutate(args)}>x</Button>
}`)
    expect(swift.warnings.some((w) => w.includes('with a non-literal argument'))).toBe(true)
  })
})

describe('an app model named Task', () => {
  // The first type a to-do app declares. It lives in the app module beside the emit, so a bare `Task { … }` in an
  // async handler resolved to the model's initializer and the file stopped compiling.
  const SRC = `
const save = api.endpoint('POST /tasks')
type Task = { id: number; title: string }
export function C() {
  const title = signal('a')
  const tasks = signal<Task[]>([])
  const add = async () => {
    await save({ json: { title: title() } })
    tasks.set([...tasks(), { id: 1, title: title() }])
  }
  return <Stack><Button onPress={add}>add</Button><Text>{tasks().length}</Text></Stack>
}`

  it('does not shadow the concurrency Task', () => {
    const { swift } = both(SRC)
    expect(swift.code).toContain('_Concurrency.Task {')
    expect(swift.code).not.toMatch(/(?<![.\w])Task \{/)
  })

  it('compiles', () => compiles(SRC), 120_000)
})
