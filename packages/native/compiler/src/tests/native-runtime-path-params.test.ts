import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

/**
 * A generated API hook's whole point is `useGetUser(id)` where `id` is a
 * signal — so an endpoint whose `:param` is a RUNTIME value is the dominant
 * shape, not an edge case. It used to bail to web with a warning that read as
 * a hard limitation ("can't be baked into the URL at compile time"), which is
 * true of a compile-time CONSTANT and beside the point: the URL can be built
 * at runtime, the same way the web builds it.
 *
 * The line this draws is between the two hooks, and it is a semantic one
 * rather than a scope one:
 *
 *   `useQuery` lowers to a harness KEYED on the query key, so a key carrying
 *   the runtime value re-fetches when that value changes — exactly the web's
 *   behaviour. It lowers.
 *
 *   `useFetch` lowers to a ONE-SHOT task with nothing to re-run it. A runtime
 *   URL there would fetch once and freeze at the first value while the web
 *   re-fetched — silently wrong rather than merely unsupported. It still
 *   bails, and now names the hook to reach for.
 */

const app = (hook: string, decl = `api.endpoint('GET /users/:id')`): string => `
import { createHttp } from '@pyreon/http'
import { useFetch, useQuery } from '@pyreon/query'
import { signal } from '@pyreon/reactivity'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = ${decl}
export function S() {
  const id = signal('u1')
  ${hook}
  return <Stack><Text>{u.data()?.id ?? ''}</Text></Stack>
}
`

const RUNTIME_QUERY = app(`const u = useQuery<User>(() => getUser.query({ params: { id: id() } }))`)

const swift = (s: string) => transform(s, { target: 'swift' })
const kotlin = (s: string) => transform(s, { target: 'kotlin' })

describe('endpoint DSL — a RUNTIME path param lowers through useQuery', () => {
  it('interpolates the encoded value into the Swift URL, with no warning', () => {
    const r = swift(RUNTIME_QUERY)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"/api/users/\\(PyreonURL.encodePathParam(id))"')
  })

  it('interpolates the encoded value into the Kotlin URL, with no warning', () => {
    const r = kotlin(RUNTIME_QUERY)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"/api/users/${PyreonURL.encodePathParam(id)}"')
  })

  /**
   * The half that is easy to get wrong and impossible to see: with the URL
   * templated but the KEY left constant, every id collapses onto ONE cache
   * entry — the first user fetched is served for every other id — and nothing
   * re-fetches, because the harness re-runs on KEY change. The emit would look
   * completely correct.
   */
  it('carries the runtime value in the cache key, not just the URL (Swift)', () => {
    const r = swift(RUNTIME_QUERY)
    expect(r.code).toContain('u.setKey("GET:/api/users/\\(PyreonURL.encodePathParam(id))")')
    // ...and the harness is KEYED on it, which is what makes it re-fetch.
    expect(r.code).toContain('.task(id: "GET:/api/users/\\(PyreonURL.encodePathParam(id))")')
    expect(r.code).not.toContain('queryKey: "GET:/api/users/:id"')
  })

  it('carries the runtime value in the cache key, not just the URL (Kotlin)', () => {
    const r = kotlin(RUNTIME_QUERY)
    expect(r.code).toContain('u.setKey("GET:/api/users/${PyreonURL.encodePathParam(id)}")')
    expect(r.code).toContain('LaunchedEffect("GET:/api/users/${PyreonURL.encodePathParam(id)}")')
  })

  it('mixes literal and runtime params in ONE url, in source order', () => {
    const src = app(
      `const u = useQuery<User>(() => getPost.query({ params: { uid: id(), pid: 7 } }))`,
      `api.endpoint('GET /users/:uid/posts/:pid')`,
    ).replace('const getUser =', 'const getPost =')
    const r = swift(src)
    expect(r.warnings).toEqual([])
    // The literal is baked, the runtime one interpolated, and `/posts/` sits
    // between them — the ordering a per-name replace loop cannot express.
    expect(r.code).toContain('"/api/users/\\(PyreonURL.encodePathParam(id))/posts/7"')
  })

  it('appends a literal query string AFTER the interpolated path', () => {
    const src = app(
      `const u = useQuery<User>(() => getUser.query({ params: { id: id() }, query: { full: true } }))`,
    )
    const r = swift(src)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('"/api/users/\\(PyreonURL.encodePathParam(id))?full=true"')
  })
})

/**
 * The shape this whole change exists for: a data component that takes the id
 * as a PROP and fetches that record. Before, it warned and stayed web — which
 * meant the single most ordinary thing an API-backed screen does was the one
 * thing that did not cross.
 */
describe('endpoint DSL — a component PROP as the path param', () => {
  const CARD = `
import { createHttp } from '@pyreon/http'
import { useQuery } from '@pyreon/query'
import { Stack, Text } from '@pyreon/primitives'
interface User { id: string; name: string }
const api = createHttp({ baseUrl: '/api' })
const getUser = api.endpoint('GET /users/:id')
export function UserCard(props: { userId: string }) {
  const q = useQuery<User>(() => getUser.query({ params: { id: props.userId } }))
  return <Stack><Text>{q.data()?.name ?? ''}</Text></Stack>
}
`

  it('lowers to a prop-driven fetch on Swift', () => {
    const r = swift(CARD)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('let userId: String')
    expect(r.code).toContain('"/api/users/\\(PyreonURL.encodePathParam(userId))"')
    // Keyed on the prop, so a parent passing a different id re-fetches.
    expect(r.code).toContain('.task(id: "GET:/api/users/\\(PyreonURL.encodePathParam(userId))")')
  })

  it('lowers to a prop-driven fetch on Kotlin', () => {
    const r = kotlin(CARD)
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('fun UserCard(userId: String)')
    expect(r.code).toContain('"/api/users/${PyreonURL.encodePathParam(userId)}"')
    expect(r.code).toContain('LaunchedEffect("GET:/api/users/${PyreonURL.encodePathParam(userId)}")')
  })

  it.skipIf(!isSwiftcAvailable())('swiftc accepts the prop-driven form', () => {
    const res = validateSwiftWithStubs(swift(CARD).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the prop-driven form', () => {
    const res = validateKotlin(kotlin(CARD).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})

describe('endpoint DSL — the shapes that still bail, and why', () => {
  it('useFetch names useQuery rather than saying "reactive params are unsupported"', () => {
    const r = swift(app(`const u = useFetch<User>(getUser({ params: { id: id() } }))`))
    expect(r.warnings.join('\n')).toContain('ONE-SHOT')
    expect(r.warnings.join('\n')).toContain('useQuery(() => getUser.query({ params: { id } }))')
    expect(r.code).not.toContain('PyreonURL')
  })

  it('a MISSING param still bails — the web throws for that shape too', () => {
    const r = swift(app(`const u = useQuery<User>(() => getUser.query({ params: {} }))`))
    expect(r.warnings.join('\n')).toContain('needs the `id` path parameter')
    expect(r.code).not.toContain('PyreonURL')
  })

  it('a LITERAL param is unchanged — still a baked constant, no encoder call', () => {
    const r = swift(app(`const u = useQuery<User>(() => getUser.query({ params: { id: 'a b' } }))`))
    expect(r.warnings).toEqual([])
    expect(r.code).toContain('queryKey: "GET:/api/users/a%20b"')
    expect(r.code).not.toContain('PyreonURL')
  })
})

describe('endpoint DSL — the emitted runtime-param code COMPILES', () => {
  it.skipIf(!isSwiftcAvailable())('swiftc accepts the interpolated URL + key', () => {
    const res = validateSwiftWithStubs(swift(RUNTIME_QUERY).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('kotlinc accepts the interpolated URL + key', () => {
    const res = validateKotlin(kotlin(RUNTIME_QUERY).code)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
