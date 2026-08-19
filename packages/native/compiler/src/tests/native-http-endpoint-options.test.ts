// Every option an `@pyreon/http` endpoint call accepts must either LOWER to the
// native request or WARN by name. Neither is optional; silence is the bug.
//
// `resolveEndpointParts` read only `params` and `query`, so
// `useFetch<User>(createUser({ json: {…} }))` emitted a POST with no body and
// no diagnostic on either target. The omission did not stop at `json`:
// call-level `headers` was dropped the same way, and the endpoint DECLARATION's
// second argument (`api.endpoint('POST /users', { headers, timeout })`) was
// never read at all.
//
// `json` and `headers` LOWER — the `kind: 'fetch'` / `kind: 'query'` IR already
// carries `headers` and `body`, and both emitters already route a request that
// has either through `PyreonHttp.send`, so this needs no emit, IR or stub
// change. `signal` / `timeout` / `meta` cannot lower and are named instead.
//
// The last spec is the one that closes the CLASS rather than the instances: it
// walks the real `EndpointArgs` type and asserts every field is accounted for,
// so an option added to the DSL later cannot quietly rejoin the dropped set.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwiftWithStubs,
} from '../validate'

const P = '@pyreon/primitives'

const app = (body: string, decl = `api.endpoint('POST /users')`): string => `
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const createUser = ${decl}
export function S() {
  const u = useFetch<User>(createUser(${body}))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`

const swift = (s: string) => transform(s, { target: 'swift' })
const kotlin = (s: string) => transform(s, { target: 'kotlin' })

describe('endpoint DSL — a literal `json` body lowers to the native request', () => {
  const SRC = app(`{ json: { name: 'Ada', age: 36 } }`)

  it('emits the serialized body + a JSON content-type on Swift', () => {
    const r = swift(SRC)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('method: .post')
    expect(r.code).toContain(`body: Data("{\\"name\\":\\"Ada\\",\\"age\\":36}".utf8)`)
    expect(r.code).toContain('"content-type": "application/json"')
  })

  it('emits the serialized body + a JSON content-type on Kotlin', () => {
    const r = kotlin(SRC)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('PyreonHttpMethod.POST')
    expect(r.code).toContain(`body = "{\\"name\\":\\"Ada\\",\\"age\\":36}"`)
    expect(r.code).toContain('"content-type" to "application/json"')
  })

  it('serializes nested objects, arrays and null exactly as JSON.stringify does', () => {
    const value = { a: [1, 'x', true, null], b: { c: -2 } }
    const r = swift(app(`{ json: { a: [1, 'x', true, null], b: { c: -2 } } }`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(JSON.stringify(JSON.stringify(value)).slice(1, -1))
  })

  it('does NOT override a content-type the caller already declared', () => {
    // `Headers` matches case-insensitively, so an upper-case declaration wins
    // too — the same rule the web's `encodeBody` follows.
    const r = swift(app(`{ json: { a: 1 }, headers: { 'Content-Type': 'application/vnd+json' } }`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"Content-Type": "application/vnd+json"')
    expect(r.code).not.toContain('application/json')
  })

  it('warns by name when the body is not a literal, rather than sending none', () => {
    const r = swift(`
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const createUser = api.endpoint('POST /users')
export function S() {
  const name = signal('Ada')
  const u = useFetch<User>(createUser({ json: { name: name() } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`)
    expect(r.warnings.some((w) => w.includes('`json` body must be a literal'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('NO body on iOS and Android'))).toBe(true)
  })
})

describe('endpoint DSL — `headers` lower from the call AND the declaration', () => {
  it('lowers a per-call headers object', () => {
    const r = swift(app(`{ headers: { 'X-Tok': 'abc' } }`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"X-Tok": "abc"')
  })

  it('lowers headers declared once on the endpoint', () => {
    const r = swift(app(`{}`, `api.endpoint('POST /users', { headers: { 'X-App': 'pyreon' } })`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"X-App": "pyreon"')
  })

  it('lets a per-call headers object REPLACE the declaration, like the web does', () => {
    // The web is `args?.headers ?? options.headers` — a replace, not a merge.
    const r = swift(
      app(`{ headers: { 'X-Call': 'y' } }`, `api.endpoint('POST /users', { headers: { 'X-App': 'x' } })`),
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"X-Call": "y"')
    expect(r.code).not.toContain('X-App')
  })

  it('names a header value it cannot bake instead of omitting it silently', () => {
    const r = swift(`
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const createUser = api.endpoint('POST /users')
export function S() {
  const tok = signal('t')
  const u = useFetch<User>(createUser({ headers: { 'X-Tok': tok() } }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`)
    expect(r.warnings.some((w) => w.includes('`headers.X-Tok`'))).toBe(true)
  })
})

describe('endpoint DSL — options with no native lowering are NAMED', () => {
  it.each([
    ['signal', `{ signal: undefined }`],
    ['timeout', `{ timeout: 5000 }`],
    ['meta', `{ meta: { trace: 'x' } }`],
  ])('warns for `%s` rather than dropping it', (key, body) => {
    const r = swift(app(body))
    expect(
      r.warnings.some((w) => w.includes(`option \`${key}\``) && w.includes('IGNORED')),
      `warnings were: ${JSON.stringify(r.warnings)}`,
    ).toBe(true)
  })

  it('warns for a declaration option it cannot honour', () => {
    const r = swift(app(`{}`, `api.endpoint('POST /users', { timeout: 1000 })`))
    expect(r.warnings.some((w) => w.includes("declaration's `timeout`"))).toBe(true)
  })

  it('warns for `throwHttpErrors: false` but NOT for `true`', () => {
    // The native harness always rejects a non-2xx, so `true` is honoured
    // exactly and only the opt-OUT is unhonourable. Warning on both would be
    // noise; warning on neither would hide a real behaviour difference.
    const off = swift(app(`{}`, `api.endpoint('POST /users', { throwHttpErrors: false })`))
    const on = swift(app(`{}`, `api.endpoint('POST /users', { throwHttpErrors: true })`))
    expect(off.warnings.some((w) => w.includes('throwHttpErrors'))).toBe(true)
    expect(on.warnings).toEqual([])
  })

  it('does NOT warn for `response` — the typed decode honours it structurally', () => {
    const r = swift(app(`{}`, `api.endpoint('POST /users', { response: UserSchema })`))
    expect(r.warnings).toEqual([])
  })

  it('warns for a spread it cannot read, which could hide any option', () => {
    const r = swift(`
import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const opts = { json: { a: 1 } }
const createUser = api.endpoint('POST /users')
export function S() {
  const u = useFetch<User>(createUser({ ...opts }))
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`)
    expect(r.warnings.some((w) => w.includes('spread'))).toBe(true)
  })
})

describe('endpoint DSL — the `.query()` fetcher form carries the body too', () => {
  const QUERY = `
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '${P}'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const createUser = api.endpoint('POST /users')
export function S() {
  const q = useQuery<User>(() => createUser.query({ json: { name: 'Ada' }, headers: { 'X-Tok': 'abc' } }))
  return <Stack><Text>{q.data()?.id ?? ''}</Text></Stack>
}
`
  it('lowers json + headers through PyreonQuery on Swift', () => {
    const r = swift(QUERY)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`body: Data("{\\"name\\":\\"Ada\\"}".utf8)`)
    expect(r.code).toContain('"X-Tok": "abc"')
  })

  it('lowers json + headers through PyreonQuery on Kotlin', () => {
    const r = kotlin(QUERY)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(`body = "{\\"name\\":\\"Ada\\"}"`)
    expect(r.code).toContain('"X-Tok" to "abc"')
  })
})

describe('endpoint DSL — the emitted body + headers compile on both toolchains', () => {
  const SRC = app(`{ json: { name: 'Ada', tags: ['a', 'b'] }, headers: { 'X-Tok': 'abc' } }`)

  it.runIf(isSwiftcAvailable())('typechecks against the SwiftUI stubs', () => {
    const v = validateSwiftWithStubs(swift(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('typechecks against the Compose stubs', () => {
    const v = validateKotlin(kotlin(SRC).code)
    expect(v.ok, v.error).toBe(true)
  })
})

describe('endpoint DSL — the option set is CLOSED, not a list of instances', () => {
  it('accounts for every field of the real EndpointArgs type', () => {
    // Read the SHIPPED type rather than restating it: a field added to
    // `EndpointArgs` must be classified in `parse.ts` (lowered or named) or
    // this fails, which is the guard that stops `json`'s silent drop from
    // recurring under a different name.
    const endpointTs = readFileSync(
      join(import.meta.dirname, '../../../../fundamentals/http/src/endpoint.ts'),
      'utf8',
    )
    const block = /export type EndpointArgs<[^>]*> =([\s\S]*?)\n\n/.exec(endpointTs)?.[1]
    expect(block, 'could not locate EndpointArgs in @pyreon/http').toBeTruthy()
    // `params` is declared in the conditional PREFIX (`… extends [never] ? {
    // params?: undefined } : { params: … }`), not the trailing `& { … }` block,
    // so an indentation-anchored scrape silently misses the one required field
    // — which is exactly what the sanity assertions below are here to catch.
    const fields = [...new Set([...(block as string).matchAll(/(\w+)\??:/g)].map((m) => m[1]))]
    expect(fields).toContain('params')
    expect(fields).toContain('json')
    expect(fields.length).toBeGreaterThanOrEqual(7)

    const parseTs = readFileSync(join(import.meta.dirname, '../parse.ts'), 'utf8')
    const lowered = /ENDPOINT_LOWERED_ARGS: ReadonlySet<string> = new Set\(\[([^\]]*)\]/.exec(parseTs)?.[1]
    const named = /ENDPOINT_UNLOWERABLE_ARGS: ReadonlyMap<string, string> = new Map\(\[([\s\S]*?)\n\]\)/.exec(
      parseTs,
    )?.[1]
    const classified = new Set([
      ...[...(lowered ?? '').matchAll(/'(\w+)'/g)].map((m) => m[1]),
      ...[...(named ?? '').matchAll(/\['(\w+)'/g)].map((m) => m[1]),
    ])
    expect(classified.size).toBeGreaterThan(0)

    const unclassified = fields.filter((f) => !classified.has(f as string))
    expect(
      unclassified,
      `EndpointArgs fields neither lowered nor named in parse.ts: ${unclassified.join(', ')}`,
    ).toEqual([])
  })
})
