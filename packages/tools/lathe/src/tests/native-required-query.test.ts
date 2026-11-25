/**
 * A native data component SENDS a GET's required query parameters.
 *
 * It used to pass path parameters only: a `GET /search?q=` with `q` required
 * lowered with zero warnings and was reported `web+native`, and every native
 * request left `q` out (a 400 on any API that enforces it). A required query
 * parameter is now a prop and travels as `query`, the way a path parameter
 * travels as `params`; one the native component cannot send names the reason.
 */
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  transform,
  validateKotlin,
  validateSwiftWithStubs,
} from './native-plugins'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { cleanTypecheck, typecheckSpec } from './helpers/typecheck'

const list = { description: 'x', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Hit' } } } } }
const get = (operationId: string, parameters: unknown[]) => ({ get: { operationId, tags: ['s'], parameters, responses: { 200: list } } })
const qp = (name: string, schema: unknown, required = true, where = 'query') => ({ name, in: where, required, schema })

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Search', version: '1' },
  servers: [{ url: 'https://search.test' }],
  paths: {
    // `q` is also the name every generated component used for its query local.
    '/search/{scope}': get('search', [qp('scope', { type: 'string' }, true, 'path'), qp('q', { type: 'string' }), qp('limit', { type: 'integer' }), qp('page', { type: 'integer' }, false)]),
    '/tagged': get('tagged', [qp('tags', { type: 'array', items: { type: 'string' } })]),
    '/owned': get('owned', [qp('children', { type: 'string' })]),
    '/keyed': get('keyed', [qp('x-api-key', { type: 'string' }, true, 'header')]),
  },
  components: { schemas: { Hit: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
})

const out = generate(SPEC, resolveConfig({ input: 'x', target: 'multiplatform' }))
const mod = out.files.find((f) => f.path === 's.native.tsx')?.contents ?? ''

afterAll(() => cleanTypecheck('native-required-query'))

describe('a GET with a required query parameter', () => {
  it('takes it as a prop and sends it as `query`; an optional one is left to the web hook', () => {
    expect(out.reach.get('search')).toEqual({ reach: 'web+native' })
    expect(mod).toContain('export function SearchData(props: { scope: string; q: string; limit: number; children:')
    expect(mod).toContain("search.query({ params: { scope: props.scope }, query: { q: props.q, limit: props.limit } })")
    expect(mod).not.toContain('props.page')
  })

  it('names what the native component cannot send', () => {
    expect(out.reach.get('tagged')?.reason).toContain('`tags` is an array')
    expect(out.reach.get('owned')?.reason).toContain('`children` cannot be a prop')
    expect(out.reach.get('keyed')?.reason).toContain('required header parameter `x-api-key`')
    for (const op of ['tagged', 'owned', 'keyed']) expect(mod, op).not.toContain(`${op[0]?.toUpperCase()}${op.slice(1)}Data`)
  })

  for (const target of ['swift', 'kotlin'] as const) {
    it(`lowers on ${target} with the query in the request URL`, () => {
      const r = transform(mod, { target })
      expect(r.warnings).toEqual([])
      expect(r.code).toContain('PyreonQuery<')
      expect(r.code).toContain('PyreonURL.query("?", "q", q, "limit", limit)')
    })
  }

  describe.skipIf(!isSwiftcAvailable())('swiftc (stubs)', () => {
    it('accepts it — a `q` prop beside the query local', () => {
      expect(validateSwiftWithStubs(transform(mod, { target: 'swift' }).code).error ?? '').toBe('')
    })
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc (stubs)', () => {
    it('accepts it', () => {
      expect(validateKotlin(transform(mod, { target: 'kotlin' }).code).error ?? '').toBe('')
    })
  })

  it('the native module typechecks as ordinary TypeScript', () => {
    const { errors } = typecheckSpec('native-required-query', SPEC, { target: 'multiplatform' }, { extra: { 's.native.tsx': mod } })
    expect(errors).toEqual([])
  })
})
