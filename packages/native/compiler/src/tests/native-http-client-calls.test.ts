// A `createHttp` client lowers to compile-time METADATA (a base URL), so it emits nothing: there is no native object for
// `api.get(…)` to be called on, and the handler used to reference an `api` that does not exist, with no warning. Found by
// the documented-example sweep (`scripts/native-example-sweep.ts`): `createHttp`'s own example failed to compile silently.
//
// What does lower is endpoint → `useFetch` / `useQuery`; the spec keeps that working (no new warnings) while naming the
// imperative form and the body-scope declaration.
import { describe, expect, it } from 'vitest'
import { transform } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable, validateKotlin, validateSwiftWithStubs } from '../validate'

const wrap = (top: string, body: string) => `import { createHttp } from '@pyreon/http'
import { useFetch } from '@pyreon/hooks'
import { Stack, Text } from '@pyreon/primitives'
${top}
export function App() {
${body}
  return (<Stack><Text>x</Text></Stack>)
}`

describe.each(['swift', 'kotlin'] as const)('%s', (target) => {
  it('an imperative call on a client (api.get) is named, with the endpoint → useFetch alternative', () => {
    const r = transform(
      wrap(`const api = createHttp({ baseUrl: '/api' })`, `  const load = async () => { await api.get('/users/1').json() }`),
      { target },
    )
    const w = r.warnings.find((x) => x.includes('api.get'))
    expect(w, r.warnings.join('\n')).toBeDefined()
    expect(w).toContain('compile-time metadata')
    expect(w).toContain(".endpoint('GET /path')")
  })

  it('every verb is claimed, not just get', () => {
    for (const verb of ['post', 'put', 'patch', 'delete', 'head', 'options', 'request']) {
      const r = transform(
        wrap(`const api = createHttp({ baseUrl: '/api' })`, `  const go = async () => { await api.${verb}('/x') }`),
        { target },
      )
      expect(r.warnings.some((x) => x.includes(`api.${verb}`)), `${verb}: ${r.warnings.join('\n')}`).toBe(true)
    }
  })

  it('a client declared inside a component body is named instead of copied through', () => {
    const r = transform(wrap('', `  const api = createHttp({ baseUrl: '/api' })`), { target })
    expect(r.warnings.some((x) => x.startsWith('createHttp() declared')), r.warnings.join('\n')).toBe(true)
    expect(r.code).not.toMatch(/createHttp/)
  })

  it('the supported flow stays silent: module-scope client + endpoint + useFetch', () => {
    const r = transform(
      wrap(
        `const api = createHttp({ baseUrl: 'https://x.dev' })\nconst getUser = api.endpoint('GET /users/:id')`,
        `  const user = useFetch<{ name: string }>(getUser({ params: { id: '1' } }))`,
      ),
      { target },
    )
    expect(r.warnings.filter((x) => /createHttp|api\./.test(x))).toEqual([])
  })

  it('a method of the same name on something that is NOT a client is untouched', () => {
    const r = transform(
      wrap('', `  const items = new Map<string, number>()\n  const v = items.get('a')`),
      { target },
    )
    expect(r.warnings.filter((x) => x.includes('@pyreon/http'))).toEqual([])
  })
})

describe('the real compilers accept the body-scope form once it is named', () => {
  const src = wrap('', `  const api = createHttp({ baseUrl: '/api' })`)
  it.skipIf(!isSwiftcAvailable())('Swift type-checks', () => {
    expect(validateSwiftWithStubs(transform(src, { target: 'swift' }).code).ok).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('Kotlin type-checks', () => {
    expect(validateKotlin(transform(src, { target: 'kotlin' }).code).ok).toBe(true)
  })
})
