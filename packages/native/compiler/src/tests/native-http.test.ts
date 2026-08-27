// `@pyreon/http`'s endpoint DSL lowers to the EXISTING PyreonFetch machinery.
//
// A same-file, compile-time-templated endpoint call —
// `useFetch<T>(getUser({ params: { id: '1' } }))` — resolves at parse time to a
// concrete URL literal + HTTP method, then feeds the same `kind: 'fetch'` path
// a literal-URL `useFetch<T>('/api/users/1', { method: 'GET' })` takes. The
// `createHttp(...)` / `.endpoint(...)` declarations are metadata only and emit
// nothing. So this v1 reuses the whole fetch emit/IR/stub surface unchanged —
// the only new code is the parse-time endpoint→URL resolution.
//
// These specs lock: (1) the resolved emit is BYTE-IDENTICAL to the literal form
// on both targets, (2) both targets validate against the compiler stubs, (3)
// the supported shape fires NO web-only warning, and (4) the shapes that can't
// be lowered (reactive params, POST verb carried through, the `.query()`
// fetcher form) warn rather than mis-lower in silence.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { validateKotlin, validateSwiftWithStubs } from '../validate'

const P = '@pyreon/primitives'

const swift = (s: string) => transform(s, { target: 'swift' })
const kotlin = (s: string) => transform(s, { target: 'kotlin' })

// The endpoint form and the literal form it must resolve to — the ONLY
// difference between the two sources is the `useFetch` argument.
const ENDPOINT_GET = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string; name: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = api.endpoint('GET /users/:id', { response: UserSchema })
export function UserScreen() {
  const user = useFetch<User>(getUser({ params: { id: '1' } }))
  return <Stack><Text>{user.data()?.name ?? ''}</Text></Stack>
}
`

// What `getUser({ params: { id: '1' } })` must resolve to: the concrete URL +
// method, expressed as an ordinary literal-URL useFetch.
const LITERAL_GET = `
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string; name: string }
export function UserScreen() {
  const user = useFetch<User>('/api/users/1', { method: 'GET' })
  return <Stack><Text>{user.data()?.name ?? ''}</Text></Stack>
}
`

// Only the fetch-relevant lines: the @State/remember container + the request.
const fetchLines = (code: string, re: RegExp): string =>
  code
    .split('\n')
    .filter((l) => re.test(l))
    .map((l) => l.trim())
    .join('\n')

const SWIFT_FETCH_RE = /PyreonFetch|PyreonHttp|PyreonHttpRequest|method:|\/api\/users\/1/
const KOTLIN_FETCH_RE = /PyreonFetch|PyreonHttp|LaunchedEffect|method =|\/api\/users\/1/

describe('endpoint DSL — Swift lowering', () => {
  const r = swift(ENDPOINT_GET)

  it('emits an @State PyreonFetch<User> and the resolved URL + GET verb', () => {
    expect(r.code).toContain('@State private var user = PyreonFetch<User>()')
    expect(r.code).toContain('url: "/api/users/1"')
    expect(r.code).toContain('method: .get')
    expect(r.code).toContain('PyreonHttp.send(')
  })

  it('resolves BYTE-IDENTICALLY to a literal `/api/users/1` GET useFetch', () => {
    expect(fetchLines(r.code, SWIFT_FETCH_RE)).toBe(
      fetchLines(swift(LITERAL_GET).code, SWIFT_FETCH_RE),
    )
  })

  it('type-checks against the SwiftUI stubs', () => {
    const v = validateSwiftWithStubs(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it('fires NO web-only / no-native-lowering warning for the supported shape', () => {
    expect(
      r.warnings.filter((w) => w.includes('WEB-ONLY') || w.includes('NO native lowering')),
    ).toEqual([])
  })
})

describe('endpoint DSL — Kotlin lowering', () => {
  const r = kotlin(ENDPOINT_GET)

  it('emits a remembered PyreonFetch<User> + LaunchedEffect(Unit) + resolved URL', () => {
    expect(r.code).toContain('PyreonFetch<User>()')
    expect(r.code).toContain('LaunchedEffect(Unit)')
    expect(r.code).toContain('url = "/api/users/1"')
    expect(r.code).toContain('PyreonHttpMethod.GET')
  })

  it('resolves BYTE-IDENTICALLY to a literal `/api/users/1` GET useFetch', () => {
    expect(fetchLines(r.code, KOTLIN_FETCH_RE)).toBe(
      fetchLines(kotlin(LITERAL_GET).code, KOTLIN_FETCH_RE),
    )
  })

  it('type-checks against the Compose stubs', () => {
    const v = validateKotlin(r.code)
    expect(v.ok, v.error).toBe(true)
  })

  it('fires NO web-only / no-native-lowering warning for the supported shape', () => {
    expect(
      r.warnings.filter((w) => w.includes('WEB-ONLY') || w.includes('NO native lowering')),
    ).toEqual([])
  })
})

describe('endpoint DSL — the verb carries through', () => {
  const POST = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const createUser = api.endpoint('POST /users/:id')
export function S() {
  const u = useFetch<User>(createUser({ params: { id: '1' } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`

  it('lowers a POST endpoint through PyreonHttp.send with method .post (Swift)', () => {
    const r = swift(POST)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonHttp.send(')
    expect(r.code).toContain('method: .post')
    expect(r.code).toContain('url: "/api/users/1"')
    expect(validateSwiftWithStubs(r.code).ok).toBe(true)
  })

  it('lowers a POST endpoint through PyreonHttp.send with PyreonHttpMethod.POST (Kotlin)', () => {
    const r = kotlin(POST)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonHttpMethod.POST')
    expect(r.code).toContain('url = "/api/users/1"')
    expect(validateKotlin(r.code).ok).toBe(true)
  })
})

describe('endpoint DSL — literal query params append to the URL', () => {
  const LIST = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const listUsers = api.endpoint('GET /users')
export function S() {
  const u = useFetch<User>(listUsers({ query: { page: 2, active: true } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`
  it('bakes literal query entries into a native fetch URL', () => {
    const r = swift(LIST)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('url: "/api/users?page=2&active=true"')
    expect(validateSwiftWithStubs(r.code).ok).toBe(true)
  })
})

describe('endpoint DSL — shapes that cannot lower WARN (stay web)', () => {
  it('warns on a reactive param under useFetch, and pushes ONLY that one warning', () => {
    const REACTIVE = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = api.endpoint('GET /users/:id')
export function S() {
  const id = signal('1')
  const user = useFetch<User>(getUser({ params: { id: id() } }))
  return <Stack><Text>{user.data()?.id ?? ''}</Text></Stack>
}
`
    const w = swift(REACTIVE).warnings
    // A runtime `:param` DOES lower now — but only through `useQuery`, whose
    // native harness is keyed on the value and therefore re-fetches when it
    // changes. `useFetch` lowers to a one-shot task, so it still bails; the
    // message names the hook to switch to rather than describing the limit.
    expect(w.some((m) => m.includes('`id`') && m.includes('ONE-SHOT'))).toBe(true)
    expect(w.some((m) => m.includes('useQuery(() => getUser.query('))).toBe(true)
    // The reactive bail must NOT also emit the generic "url must be a string
    // literal" line — the endpoint diagnostic is the specific, actionable one.
    expect(w.some((m) => m.includes('url argument must be a string literal'))).toBe(false)
  })

  it('warns on an UNRESOLVABLE baseUrl — no compile-time URL to bake', () => {
    // The fixture used to be `const base = '/api'`, which now RESOLVES — a
    // module-scope const holding a string is as known at build time as an
    // inline one, and sharing an API base that way is how this is normally
    // written. The invariant is unchanged: a baseUrl that genuinely cannot be
    // known must warn rather than silently mis-lower, so the fixture moved to a
    // value that genuinely cannot be.
    const DYNAMIC = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: resolveBase() })
const getUser = api.endpoint('GET /users/:id')
export function S() {
  const user = useFetch<User>(getUser({ params: { id: '1' } }))
  return <Stack><Text>{user.data()?.id ?? ''}</Text></Stack>
}
`
    expect(swift(DYNAMIC).warnings.some((m) => m.includes('LITERAL baseUrl'))).toBe(true)
  })

  it('a module-scope const baseUrl resolves and bakes the full URL', () => {
    const CONST_BASE = `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const API_BASE = 'https://api.example.com'
const api = createHttp({ baseUrl: API_BASE })
const getUser = api.endpoint('GET /users/:id')
export function S() {
  const user = useFetch<User>(getUser({ params: { id: '1' } }))
  return <Stack><Text>{user.data()?.id ?? ''}</Text></Stack>
}
`
    const r = swift(CONST_BASE)
    expect(r.warnings).toEqual([])
    // The RESOLVED base, joined with the endpoint path — not the identifier.
    expect(r.code).toContain('https://api.example.com/users/1')
  })

  it('lowers the `.query()` fetcher form to PyreonQuery (resolved url + method:url queryKey)', () => {
    const QUERY = `
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = api.endpoint('GET /users/:id')
export function S() {
  const q = useQuery<User>(() => getUser.query({ params: { id: '1' } }))
  return <Stack><Text>{q.data()?.id ?? ''}</Text></Stack>
}
`
    const s = swift(QUERY)
    const k = kotlin(QUERY)
    // Resolves to the SAME PyreonQuery path a literal-key useQuery takes, no
    // emit change — the endpoint just supplies the url + a `method:url` key.
    expect(s.code).toContain('PyreonQuery<User>(queryKey: "GET:/api/users/1"')
    expect(s.code).toContain('/api/users/1')
    expect(k.code).toContain('PyreonQuery<User>')
    expect(k.code).toContain('"GET:/api/users/1"')
    expect(k.code).toContain('/api/users/1')
    // No longer stays web.
    expect(s.warnings.some((m) => m.includes('`.query()` fetcher form'))).toBe(false)
    expect(validateSwiftWithStubs(s.code).ok, validateSwiftWithStubs(s.code).error).toBe(true)
    expect(validateKotlin(k.code).ok, validateKotlin(k.code).error).toBe(true)
  })
})
