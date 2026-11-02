// `createHttp({ use: [...] })` — client middleware crosses to native, or the call stays web BY NAME.
//
// Before this, the client was compile-time METADATA only: `use:` was never read, so an endpoint call on a
// `use: [bearer(...)]` client lowered to a native request with NO Authorization header, and a `retry()` client to one
// that never retried — on both targets, silently. What lowers now is `bearer` / `retry` / `logger` (plus
// `forwardHeaders`, a no-op on any client, exactly as in a browser); every other entry keeps every call on that client
// on the web with a warning naming the entry. The runtime half and its parity with the web middleware are
// `native-http-middleware-parity.test.ts`; this file is the scan and the emit.

import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const swift = (s: string) => transform(s, { target: 'swift' })
const kotlin = (s: string) => transform(s, { target: 'kotlin' })

/** A client whose `use` array is `use`, read by `useFetch` and `useQuery`. */
const app = (use: string, imports = 'bearer, retry, logger', extra = ''): string => `
import { createHttp } from '@pyreon/http'
import { ${imports} } from '@pyreon/http/middleware'
import { useFetch } from '@pyreon/hooks'
import { useQuery } from '@pyreon/query'
import { defineStore } from '@pyreon/store'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const useAuth = defineStore('auth', () => {
  const token = signal('')
  return { token }
})
${extra}
const api = createHttp({ baseUrl: 'https://api.example.com', use: [${use}] })
const getUser = api.endpoint('GET /users/:id')
export function C() {
  const a = useFetch<User>(getUser({ params: { id: '1' } }))
  const b = useQuery<User>(() => getUser.query({ params: { id: '2' } }))
  return <Stack><Text>{a.data()?.id ?? ''}</Text><Text>{b.data()?.id ?? ''}</Text></Stack>
}
`

const FULL = app(
  `bearer(() => useAuth().store.token()), retry({ limit: 3, statuses: [503] }), logger()`,
)

describe('the lowerable middleware reaches both native requests, in order', () => {
  it('Swift: useFetch AND useQuery pass the same ordered list to PyreonHttp.send', () => {
    const r = swift(FULL)
    expect(r.warnings).toEqual([])
    const list =
      '[.bearer(baseUrl: "https://api.example.com", crossOrigin: false, token: { PyreonStore_auth.shared.token }), .retry(PyreonRetryPolicy(limit: 3, statuses: [503])), .logger(production: false)] as [PyreonHttpMiddleware]'
    // Once per harness: the fetch and the query.
    expect(r.code.split(`middleware: ${list}`).length - 1).toBe(2)
  })

  it('Kotlin: useFetch AND useQuery pass the same ordered list to PyreonHttp.send', () => {
    const r = kotlin(FULL)
    expect(r.warnings).toEqual([])
    const list =
      'middleware = listOf<PyreonHttpMiddleware>(PyreonHttpMiddleware.Bearer(baseUrl = "https://api.example.com", crossOrigin = false, token = { PyreonStore_auth.token }), PyreonHttpMiddleware.Retry(PyreonRetryPolicy(limit = 3, statuses = listOf(503))), PyreonHttpMiddleware.Logger(production = false))'
    expect(r.code.split(list).length - 1).toBe(2)
  })

  it('emits only the retry options that differ from the web defaults', () => {
    const r = kotlin(
      app(`retry({ limit: 2, network: false, maxDelay: 5000, methods: ['GET', 'POST'] })`, 'retry'),
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'PyreonHttpMiddleware.Retry(PyreonRetryPolicy(methods = listOf("GET", "POST"), network = false, maxDelay = 5000.0))',
    )
  })

  it('order is the array order — the web onion is order-sensitive', () => {
    const r = swift(
      app(`retry(), bearer(() => 'static-token', { crossOrigin: true })`, 'bearer, retry'),
    )
    expect(r.warnings).toEqual([])
    expect(r.code).toContain(
      'middleware: [.retry(PyreonRetryPolicy()), .bearer(baseUrl: "https://api.example.com", crossOrigin: true, token: { "static-token" })] as [PyreonHttpMiddleware]',
    )
  })

  it('a block-bodied token function lowers the same as an expression body', () => {
    const r = kotlin(app(`bearer(() => { return useAuth().store.token() })`, 'bearer'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('token = { PyreonStore_auth.token }')
  })

  it('logger({ production: true }) is carried through', () => {
    const r = swift(app(`logger({ production: true })`, 'logger'))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('.logger(production: true)')
  })

  it('forwardHeaders is a no-op on a client (as in a browser) — no warning, and nothing to apply', () => {
    const r = swift(app(`forwardHeaders(['cookie'])`, 'forwardHeaders'))
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('middleware:')
    expect(r.code).toContain('PyreonHttp.send(')
  })

  it('a client without `use` emits exactly what it did before', () => {
    const plain = app('').replace(', use: []', '')
    const r = swift(plain.replace(/^import \{ bearer.*\n/m, ''))
    expect(r.warnings).toEqual([])
    expect(r.code).not.toContain('middleware')
  })
})

describe('anything that cannot lower keeps the call on the web, and says which entry', () => {
  const stays = (src: string, needle: string) => {
    for (const r of [swift(src), kotlin(src)]) {
      expect(
        r.warnings.some((w) => w.includes(needle) && w.includes('stays web')),
        r.warnings.join('\n'),
      ).toBe(true)
      // No native request at all — a request without the middleware would be a different request.
      expect(r.code).not.toContain('PyreonHttp.send(')
    }
  }

  it('refresh', () =>
    stays(
      app(`refresh({ refresh: async () => true })`, 'refresh'),
      'refresh(…) runs your async refresh callback',
    ))
  it('dedupe', () => stays(app(`dedupe()`, 'dedupe'), 'dedupe(…) shares one in-flight request'))
  it('a custom middleware function', () =>
    stays(
      app(
        `auth`,
        'bearer',
        `const auth = async (req: unknown, next: () => Promise<unknown>) => next()`,
      ),
      '`auth` is a custom middleware function',
    ))
  it('an inline custom middleware', () =>
    stays(
      app(`(req: unknown, next: () => unknown) => next()`, 'bearer'),
      'a computed middleware entry',
    ))
  it('a retry backoff callback', () =>
    stays(app(`retry({ backoff: (n) => n * 10 })`, 'retry'), 'retry({ backoff })'))
  it('a non-literal retry limit', () =>
    stays(
      app(`retry({ limit: LIMIT })`, 'retry', 'let LIMIT = 3'),
      'retry({ limit }) must be a non-negative integer literal',
    ))
  it('a logger log callback', () =>
    stays(app(`logger({ log: () => {} })`, 'logger'), 'logger({ log })'))
  it('a token function that is not inline', () =>
    stays(
      app(`bearer(readToken)`, 'bearer', `const readToken = () => 'x'`),
      'bearer(…) needs an inline token function',
    ))
  it('a token reading a module-scope signal, which does not exist natively', () =>
    stays(
      app(`bearer(() => tok())`, 'bearer', `const tok = signal('x')`),
      'module-scope signal `tok`',
    ))
  it('a `use` that is not an array literal', () =>
    stays(
      app('', 'bearer', 'const mws = [bearer(() => "x")]').replace('use: []', 'use: mws'),
      '`use` is not an array literal',
    ))
  it('a spread inside `use`', () =>
    stays(app('...mws', 'bearer', 'const mws = [bearer(() => "x")]'), 'a spread inside `use`'))
  it('every unlowerable entry is named, not just the first', () => {
    const r = swift(app(`refresh({ refresh: async () => true }), dedupe()`, 'refresh, dedupe'))
    expect(
      r.warnings.filter((w) => w.includes('stays web') && w.includes("client api's `use`")),
    ).toHaveLength(4)
  })
})

describe('a caller that does not apply client middleware refuses it by name', () => {
  it('useStream on a middleware client stays web', () => {
    const src = `
import { createHttp } from '@pyreon/http'
import { bearer } from '@pyreon/http/middleware'
import { openEventStream, type SseEvent } from '@pyreon/http/stream'
import { useStream } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface Ev { n: number }
const api = createHttp({ baseUrl: 'https://api.example.com', use: [bearer(() => 'x')] })
const feed = api.endpoint('GET /feed', { responseType: 'stream' })
export function C() {
  const s = useStream<SseEvent<Ev>>((ctx) => openEventStream((c) => feed({ signal: c.signal, headers: c.headers }), { signal: ctx.signal, onStatus: ctx.onStatus }))
  return <Stack><Text>{String(s.latest()?.data.n ?? 0)}</Text></Stack>
}
`
    const r = swift(src)
    expect(
      r.warnings.some(
        (w) => w.includes('applies middleware (bearer)') && w.includes('`useStream`'),
      ),
    ).toBe(true)
  })
})

describe('the emitted middleware compiles on both toolchains', () => {
  it.runIf(isSwiftcAvailable())('typechecks against the Swift stubs', () => {
    const v = validateSwiftWithStubs(swift(FULL).code)
    expect(v.ok, v.error).toBe(true)
  })

  it.runIf(isKotlincAvailable())('typechecks against the Compose stubs', () => {
    const v = validateKotlin(kotlin(FULL).code)
    expect(v.ok, v.error).toBe(true)
  })
})
