/**
 * A spec with no models or no operations emits entries that only name files
 * that exist (audit A12). The barrels used to key on the PLUGIN selection, so
 * `index.ts` imported `./schemas`, `./keys` or `./faker` that no emitter wrote.
 */
import { typecheckSpec } from './helpers/typecheck'

const NO_MODELS = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://a.test' }],
  paths: { '/ping': { get: { operationId: 'ping', responses: { '200': { description: 'x', content: { 'application/json': { schema: { type: 'string' } } } } } } } },
})
const NO_OPS = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  servers: [{ url: 'https://a.test' }],
  paths: {},
  components: { schemas: { A: { type: 'object', properties: { a: { type: 'string' } } } } },
})
const NOTHING = JSON.stringify({ openapi: '3.0.3', info: { title: 'T', version: '1' }, paths: {} })
const ALL = ['schemas', 'client', 'queries', 'mocks', 'faker'] as const

describe('entries name only emitted files', () => {
  for (const [name, spec] of [
    ['no-models', NO_MODELS],
    ['no-ops', NO_OPS],
    ['nothing', NOTHING],
  ] as const) {
    it(`${name}: every re-exported module exists and the tree typechecks`, () => {
      const { errors, result } = typecheckSpec(`a12-${name}`, spec, { plugins: [...ALL] })
      const paths = new Set(result.files.map((f) => f.path))
      for (const f of result.files.filter((x) => x.path === 'index.ts' || x.path === 'dev.ts')) {
        for (const m of f.contents.matchAll(/^export .* from '\.\/([^']+)'$/gm)) {
          const target = m[1] as string
          expect([...paths].some((p) => p === `${target}.ts` || p === `${target}.tsx`), `${f.path} -> ${target}`).toBe(true)
        }
      }
      expect(errors, errors.join('\n')).toEqual([])
    })
  }
})
