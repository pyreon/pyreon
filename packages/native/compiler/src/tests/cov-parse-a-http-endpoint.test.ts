// `@pyreon/http` endpoint DECLARATION recognition and CALL-SITE option
// reading, from the shapes an ordinary app writes.
//
// The contract this file locks is the one `readQueryEntries` states in its own
// doc: anything that cannot be read as a literal is REPORTED, never dropped,
// "because a query parameter that silently disappears from the native request
// is a data bug, not a missing feature". Each spec therefore asserts BOTH the
// baked URL and the diagnostic — a warning that fires while the parameter also
// survives would be as wrong as silence.
//
// The declaration side has the same shape: `api.endpoint('<METHOD> /path',
// opts)` only registers when the spec is a literal that actually carries a
// method AND a path, and every `opts` key outside `headers` / `response` is
// named rather than ignored.
import { describe, expect, it } from 'vitest'
import { transform } from '../index'

const P = '@pyreon/primitives'

/** A module whose single component issues ONE endpoint call through useFetch. */
const app = (decl: string, call: string, client = `createHttp({ baseUrl: '/api' })`): string => `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = ${client}
${decl}
export function S() {
  const u = useFetch<User>(${call})
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`

const run = (decl: string, call: string, client?: string) =>
  transform(app(decl, call, client), { target: 'swift' })

/** The baked absolute URL string literal in the emit, or '' when the call did not lower. */
const bakedUrl = (decl: string, call: string, client?: string): string =>
  (run(decl, call, client).code.match(/"\/api[^"]*"/) || [''])[0]

const warns = (decl: string, call: string, client?: string): string[] => run(decl, call, client).warnings

const EP = `const ep = api.endpoint('GET /users')`

describe('endpoint DECLARATION recognition', () => {
  it('a well-formed declaration bakes base + path into the request', () => {
    expect(bakedUrl(EP, 'ep()')).toBe('"/api/users"')
  })

  it('a member call that is not `.endpoint` does not register', () => {
    // `api.request(...)` is a plausible neighbour; treating it as an endpoint
    // would bake a URL for a call that never had one.
    const w = warns(`const ep = api.request('GET /users')`, 'ep()')
    expect(w.some((m) => m.includes('useFetch needs a statically-known url'))).toBe(true)
  })

  it('a NON-LITERAL spec does not register', () => {
    const w = warns(`const SPEC = 'GET /users'\nconst ep = api.endpoint(SPEC)`, 'ep()')
    expect(w.some((m) => m.includes('useFetch needs a statically-known url'))).toBe(true)
  })

  it('a spec with no space carries no path, so it does not register', () => {
    const w = warns(`const ep = api.endpoint('GET')`, 'ep()')
    expect(w.some((m) => m.includes('useFetch needs a statically-known url'))).toBe(true)
  })

  it('the method is upper-cased and the path trimmed', () => {
    // The method is upper-cased before it becomes the native enum case, and
    // the path is trimmed on both sides of the first space.
    const r = run(`const ep = api.endpoint('post   /users  ')`, `ep()`)
    expect(r.code).toContain('method: .post')
    expect(r.code).toContain('"/api/users"')
  })

  it('declaration `headers` reach the native request; `response` is not reported', () => {
    const r = run(`const ep = api.endpoint('GET /users', { headers: { 'x-a': 'b' }, response: U })`, 'ep()')
    expect(r.code).toContain('"x-a"')
    expect(r.warnings.filter((w) => w.includes('endpoint ep:'))).toEqual([])
  })

  it('a declaration option with no native equivalent is NAMED, not dropped', () => {
    expect(warns(`const ep = api.endpoint('GET /users', { retry: 3 })`, 'ep()')
      .some((m) => m.includes("declaration's `retry`"))).toBe(true)
  })

  it('`timeout` is named with its own reason', () => {
    expect(warns(`const ep = api.endpoint('GET /users', { timeout: 100 })`, 'ep()')
      .some((m) => m.includes('PyreonHttpRequest carries no timeout field'))).toBe(true)
  })

  it('`throwHttpErrors: true` matches the native harness exactly, so it is silent; `false` is named', () => {
    expect(warns(`const ep = api.endpoint('GET /users', { throwHttpErrors: true })`, 'ep()')
      .filter((m) => m.includes('endpoint ep:'))).toEqual([])
    expect(warns(`const ep = api.endpoint('GET /users', { throwHttpErrors: false })`, 'ep()')
      .some((m) => m.includes('`throwHttpErrors`'))).toBe(true)
  })

  it('a non-object-literal options argument is named', () => {
    expect(warns(`const OPTS = { retry: 1 }\nconst ep = api.endpoint('GET /users', OPTS)`, 'ep()')
      .some((m) => m.includes('options (not an object literal)'))).toBe(true)
  })

  it('a SPREAD in the declaration options is named', () => {
    expect(warns(`const EXTRA = { retry: 1 }\nconst ep = api.endpoint('GET /users', { ...EXTRA })`, 'ep()')
      .some((m) => m.includes('options (spread)'))).toBe(true)
  })

  it('a declaration header whose value is not a string literal is named by key', () => {
    expect(warns(`const ep = api.endpoint('GET /users', { headers: { 'x-a': 1 } })`, 'ep()')
      .some((m) => m.includes('headers.x-a'))).toBe(true)
  })
})

describe('endpoint baseUrl resolution', () => {
  it('a computed baseUrl names the client and keeps the call on web', () => {
    const w = warns(EP, 'ep()', 'createHttp({ baseUrl: compute() })')
    expect(w.some((m) => m.includes('needs a LITERAL baseUrl on client api'))).toBe(true)
  })

  it('an ABSENT baseUrl is an empty prefix, not a bail', () => {
    expect(run(EP, 'ep()', 'createHttp({})').code).toContain('"/users"')
  })

  it('an unknown callee is not an endpoint call at all — no warning about ours', () => {
    const w = warns(EP, 'somethingElse()')
    expect(w.some((m) => m.startsWith('endpoint '))).toBe(false)
  })
})

describe('endpoint call-site `query`', () => {
  it('literal entries are serialized in order', () => {
    expect(bakedUrl(EP, `ep({ query: { a: 1, b: 'two', c: true } })`)).toBe('"/api/users?a=1&b=two&c=true"')
  })

  it('an ARRAY value repeats the key, matching the web', () => {
    expect(bakedUrl(EP, `ep({ query: { tag: ['a', 'b'] } })`)).toBe('"/api/users?tag=a&tag=b"')
  })

  it('a nullish entry is DROPPED without a warning — the web drops it too', () => {
    expect(bakedUrl(EP, `ep({ query: { a: null, b: undefined, c: 1 } })`)).toBe('"/api/users?c=1"')
    expect(warns(EP, `ep({ query: { a: null, b: undefined, c: 1 } })`)).toEqual([])
  })

  it('a nullish ARRAY ELEMENT is dropped while its siblings survive', () => {
    expect(bakedUrl(EP, `ep({ query: { tag: ['a', null, 'b'] } })`)).toBe('"/api/users?tag=a&tag=b"')
  })

  it('a non-literal value is NAMED by key, and the parameter is omitted', () => {
    const w = warns(EP, `ep({ query: { page: runtime } })`)
    expect(w.some((m) => m.includes('query parameter `page`'))).toBe(true)
    expect(bakedUrl(EP, `ep({ query: { page: runtime } })`)).toBe('"/api/users"')
  })

  it('a non-literal ARRAY ELEMENT is named by its key', () => {
    expect(warns(EP, `ep({ query: { tag: [runtime] } })`)
      .some((m) => m.includes('query parameter `tag`'))).toBe(true)
  })

  it('a `query` that is not an object literal is named', () => {
    expect(warns(EP, `ep({ query: QQ })`).some((m) => m.includes('query parameter `query`'))).toBe(true)
  })

  it('a SPREAD inside `query` is named', () => {
    expect(warns(EP, `ep({ query: { ...more } })`)
      .some((m) => m.includes('query parameter `query (spread)`'))).toBe(true)
  })

  it('a quoted key is read exactly like a bare one', () => {
    expect(bakedUrl(EP, `ep({ query: { 'q-x': 1 } })`)).toBe('"/api/users?q-x=1"')
  })

  it('a path template that already carries `?` joins with `&`', () => {
    expect(bakedUrl(`const ep = api.endpoint('GET /users?a=1')`, `ep({ query: { b: 2 } })`))
      .toBe('"/api/users?a=1&b=2"')
  })

  it('an EMPTY query object adds no `?`', () => {
    expect(bakedUrl(EP, `ep({ query: {} })`)).toBe('"/api/users"')
  })
})

describe('endpoint call-site `params`', () => {
  it('a literal param is substituted and percent-encoded', () => {
    expect(bakedUrl(`const ep = api.endpoint('GET /u/:id')`, `ep({ params: { id: 'a b' } })`))
      .toBe('"/api/u/a%20b"')
  })

  it('a quoted param key is read like a bare one', () => {
    expect(bakedUrl(`const ep = api.endpoint('GET /u/:id')`, `ep({ params: { 'id': 'x' } })`))
      .toBe('"/api/u/x"')
  })

  it('a MISSING param bails and says the web throws for this shape too', () => {
    const w = warns(`const ep = api.endpoint('GET /u/:id')`, `ep({})`)
    expect(w.some((m) => m.includes('needs the `id` path parameter'))).toBe(true)
  })

  it('an EXPLICITLY nullish param is treated as missing', () => {
    expect(warns(`const ep = api.endpoint('GET /u/:id')`, `ep({ params: { id: null } })`)
      .some((m) => m.includes('needs the `id` path parameter'))).toBe(true)
  })

  it('a RUNTIME param under useFetch names useQuery as the hook to reach for', () => {
    const w = warns(`const ep = api.endpoint('GET /u/:id')`, `ep({ params: { id: runtime } })`)
    expect(w.some((m) => m.includes('ONE-SHOT native task') && m.includes('useQuery'))).toBe(true)
  })
})

describe('endpoint call-site `json` and `headers`', () => {
  it('a literal object body is baked and gets a content-type', () => {
    const r = run(`const ep = api.endpoint('POST /users')`, `ep({ json: { a: 1 } })`)
    expect(r.code).toContain('content-type')
    expect(r.warnings).toEqual([])
  })

  it('a negated / unary-plus number reads as a number', () => {
    const r = run(`const ep = api.endpoint('POST /users')`, `ep({ json: { n: -1, p: +2 } })`)
    expect(r.code).toContain('-1')
    expect(r.warnings).toEqual([])
  })

  it('an ARRAY body with a null element is a literal', () => {
    expect(run(`const ep = api.endpoint('POST /users')`, `ep({ json: [1, null, 'a', true] })`).warnings)
      .toEqual([])
  })

  it('a bare `null` body is nullish, so no body and no warning', () => {
    expect(run(`const ep = api.endpoint('POST /users')`, `ep({ json: null })`).warnings).toEqual([])
  })

  it('a non-literal body element is named', () => {
    expect(warns(`const ep = api.endpoint('POST /users')`, `ep({ json: [runtime] })`)
      .some((m) => m.includes('the `json` body must be a literal'))).toBe(true)
  })

  it('a COMPUTED key inside the body makes it unreadable', () => {
    expect(warns(`const ep = api.endpoint('POST /users')`, `ep({ json: { [k]: 1 } })`)
      .some((m) => m.includes('the `json` body must be a literal'))).toBe(true)
  })

  it('a unary operator over a non-number is not a literal', () => {
    expect(warns(`const ep = api.endpoint('POST /users')`, `ep({ json: -'a' })`)
      .some((m) => m.includes('the `json` body must be a literal'))).toBe(true)
  })

  it('a per-call `headers` REPLACES the declaration\'s, mirroring the web', () => {
    const r = run(
      `const ep = api.endpoint('POST /users', { headers: { 'x-decl': 'd' } })`,
      `ep({ headers: { 'x-call': 'c' } })`,
    )
    expect(r.code).toContain('"x-call"')
    expect(r.code).not.toContain('"x-decl"')
  })

  it('a non-string call header is named by key', () => {
    expect(warns(`const ep = api.endpoint('POST /users')`, `ep({ headers: { 'x-a': 1 } })`)
      .some((m) => m.includes('`headers.x-a`'))).toBe(true)
  })

  it('a `headers` that is not an object literal is named', () => {
    expect(warns(`const ep = api.endpoint('POST /users')`, `ep({ headers: HH })`)
      .some((m) => m.includes('`headers`'))).toBe(true)
  })

  it('a SPREAD inside call headers is named', () => {
    expect(warns(`const ep = api.endpoint('POST /users')`, `ep({ headers: { ...h } })`)
      .some((m) => m.includes('headers (spread)'))).toBe(true)
  })
})

describe('endpoint call-site — every other option is NAMED', () => {
  it('a call argument that is not an object literal bails loudly', () => {
    const w = warns(EP, `ep(ARGS)`)
    expect(w.some((m) => m.includes('the call argument is not an object literal'))).toBe(true)
  })

  it('a SPREAD in the call argument is named', () => {
    expect(warns(EP, `ep({ ...more })`).some((m) => m.includes('a spread in the call arguments'))).toBe(true)
  })

  it('a known-unlowerable option carries its own reason', () => {
    expect(warns(EP, `ep({ signal: sig })`).some((m) => m.includes('an AbortSignal has no analogue'))).toBe(true)
    expect(warns(EP, `ep({ meta: m })`).some((m) => m.includes('read by client middleware'))).toBe(true)
  })

  it('an UNKNOWN option falls back to the generic reason rather than silence', () => {
    expect(warns(EP, `ep({ retries: 2 })`)
      .some((m) => m.includes('option `retries`') && m.includes('not part of the lowered endpoint surface'))).toBe(true)
  })

  it('a LOWERED option is never reported', () => {
    expect(warns(EP, `ep({ query: { a: 1 } })`).filter((m) => m.includes('has no native equivalent'))).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// KNOWN BUGS — locked with `it.fails`, self-retiring when the product is fixed.
// ---------------------------------------------------------------------------

describe('KNOWN BUG — a NUMERIC-literal key is silently dropped from the native request', () => {
  // `propName()` reads a non-computed key as an Identifier name or a STRING
  // literal value and returns `undefined` for anything else. A numeric key
  // (`{ 1: 'a' }` — legal object-literal syntax whose runtime key is the string
  // "1") therefore reads as undefined, and both `readQueryEntries` and
  // `readLiteralHeaders` do `if (key === undefined) continue`: a silent drop,
  // in the two functions whose own doc comments say a value that cannot be read
  // must be REPORTED rather than dropped.
  //
  // The loss is PARTIAL, which is the worst form: the request still goes out,
  // just missing one parameter. The web's own `buildQuery` iterates
  // `Object.keys`, so it sends `?1=a&ok=b`.
  //
  // FIX: `propName` should also accept a NUMERIC literal key (`String(value)`),
  // matching JS object-key semantics — or, failing that, `readQueryEntries` /
  // `readLiteralHeaders` must route an unreadable key through `onUnlowerable`
  // instead of `continue`. parse.ts:1578 (`propName`), 1664, 1718.
  it.fails('KNOWN BUG: a numeric query key is dropped from the baked URL with no warning', () => {
    const call = `ep({ query: { 1: 'a', ok: 'b' } })`
    // The web builds `/api/users?1=a&ok=b`; PMTC builds `/api/users?ok=b`.
    expect(bakedUrl(EP, call)).toBe('"/api/users?1=a&ok=b"')
  })

  it.fails('KNOWN BUG: nor is the dropped numeric query key reported', () => {
    expect(warns(EP, `ep({ query: { 1: 'a', ok: 'b' } })`)).not.toEqual([])
  })

  it.fails('KNOWN BUG: a numeric header key is dropped with no warning', () => {
    const r = run(`const ep = api.endpoint('POST /users')`, `ep({ headers: { 1: 'a', ok: 'b' } })`)
    expect(r.warnings).not.toEqual([])
  })

  it('the partial loss it produces today, pinned so the fix is visible as a change', () => {
    // Not an assertion that the behaviour is RIGHT — it is the current one, kept
    // next to the failing specs so a reader can see exactly what is lost.
    expect(bakedUrl(EP, `ep({ query: { 1: 'a', ok: 'b' } })`)).toBe('"/api/users?ok=b"')
    expect(warns(EP, `ep({ query: { 1: 'a', ok: 'b' } })`)).toEqual([])
  })
})

describe('object-literal KEY spellings on the endpoint path', () => {
  it('a QUOTED `baseUrl` key on the client reads like a bare one', () => {
    expect(bakedUrl(EP, 'ep()', `createHttp({ 'baseUrl': '/api' })`)).toBe('"/api/users"')
  })

  it('a COMPUTED param key names no parameter, so the param reads as missing', () => {
    // `{ [\`id\`]: 'x' }` is a computed key: the reader cannot know it at compile
    // time, so the call bails on the missing `:id` rather than baking a guess.
    const call = 'ep({ params: { [`id`]: "x" } })'
    expect(warns(`const ep = api.endpoint('GET /u/:id')`, call)
      .some((m) => m.includes('needs the `id` path parameter'))).toBe(true)
  })
})

describe('numeric object keys on the client and the params object', () => {
  it('a numeric key beside `baseUrl` on the client does not disturb the read', () => {
    expect(bakedUrl(EP, 'ep()', `createHttp({ 1: 'z', baseUrl: '/api' })`)).toBe('"/api/users"')
  })

  it('a numeric key beside a real path param does not disturb the substitution', () => {
    // The numeric key names nothing the reader can use (see the KNOWN BUG
    // below); what matters here is that its presence does not take `id` down
    // with it.
    expect(bakedUrl(`const ep = api.endpoint('GET /u/:id')`, `ep({ params: { 1: 'x', id: 'y' } })`))
      .toBe('"/api/u/y"')
  })

  it('a MEMBER-expression call is not an endpoint call — resolution needs a bare name', () => {
    const w = warns(EP, `api.ep({ query: { a: 1 } })`)
    expect(w.some((m) => m.startsWith('endpoint '))).toBe(false)
    expect(w.some((m) => m.includes('useFetch needs a statically-known url'))).toBe(true)
  })

  it('a bare call to an UNREGISTERED name is not ours either', () => {
    const w = warns(EP, `other({ query: { a: 1 } })`)
    expect(w.some((m) => m.startsWith('endpoint '))).toBe(false)
  })
})
