/**
 * The generated mocks' JSDoc names only calls that EXIST.
 *
 * It told readers to `api.use(mockRoutes)` -- `HttpClient` has no `use`, so the
 * first thing someone copying the doc wrote was a TypeError. The check is on
 * the class, not the one string: every backticked call in the file's comments
 * must be something the file exports or the http mock module provides.
 */
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /a:
    get:
      operationId: getA
      tags: [a]
      responses: { '200': { content: { application/json: { schema: { type: string } } } } }
`

for (const client of ['pyreon', 'fetch'] as const) {
  it(`every call named in mocks.ts comments exists (client=${client})`, () => {
    const cfg = resolveConfig({ input: 'x', client, plugins: ['mocks'] })
    const src = generate(SPEC, cfg).files.find((f) => f.path === 'mocks.ts')?.contents ?? ''
    const comments = (src.match(/\/\*\*[\s\S]*?\*\//g) ?? []).join('\n')
    const named = [...comments.matchAll(/`([\w.]+)\(/g)].map((m) => m[1] as string)
    expect(named.length).toBeGreaterThan(0)
    const exported = new Set([...src.matchAll(/export (?:const|function) (\w+)/g)].map((m) => m[1]))
    // The generated client's own exports, which mocks.ts imports.
    const provided = new Set(['mock', 'setDevTransport', 'createHttp', 'configureApi', 'apiBaseUrl'])
    for (const call of named) {
      expect(exported.has(call) || provided.has(call), `\`${call}(\` is named but does not exist`).toBe(true)
    }
  })
}
