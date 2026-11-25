/**
 * `responseValidation: 'off'` at generate time emits endpoints TYPES ONLY (#4815).
 *
 * `off` already skipped the check at runtime, but every endpoint still
 * declared `{ response: Schema, errors: { … } }` and imported those schema
 * modules, so one GET shipped `@pyreon/validate` and its response's whole
 * schema tree for a check that never ran. Now an operation whose effective
 * mode is `off` (the project default or `operations.<id>.responseValidation`)
 * names its response, error and event models as TYPES, and the bundle proves
 * nothing of the validator is reachable from it.
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HttpRequest, HttpResponse } from '@pyreon/http'
import type { LatheSection } from '../core/config'
import { cleanEmitted, emitToDisk } from './helpers/emit-to-disk'
import { cleanTypecheck, TYPECHECK_BUDGET, typecheckSpec } from './helpers/typecheck'

const json = (schema: unknown) => ({ description: 'x', content: { 'application/json': { schema } } })

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'Shop', version: '1' },
  servers: [{ url: 'https://shop.test' }],
  paths: {
    '/items': {
      get: {
        operationId: 'listItems',
        tags: ['items'],
        responses: { 200: json({ $ref: '#/components/schemas/Items' }), 404: json({ $ref: '#/components/schemas/NotFound' }) },
      },
    },
    '/items/{id}': {
      get: {
        operationId: 'getItem',
        tags: ['items'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: json({ type: 'array', items: { $ref: '#/components/schemas/Item' } }),
          default: json({ type: 'object', required: ['code'], properties: { code: { type: 'integer' } } }),
        },
      },
    },
    '/feed': {
      get: {
        operationId: 'feed',
        tags: ['items'],
        responses: { 200: { description: 'x', content: { 'text/event-stream': { schema: { $ref: '#/components/schemas/Item' } } } } },
      },
    },
  },
  components: {
    schemas: {
      NotFound: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } },
      Item: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } },
      Items: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Item' } } } },
    },
  },
})

const NAMES = ['rv-off-pyreon', 'rv-off-fetch', 'rv-off-axios', 'rv-off-ky', 'rv-off-strict', 'rv-off-per-op']
afterAll(() => {
  for (const n of NAMES) cleanEmitted(n)
  for (const c of ['pyreon', 'fetch', 'axios', 'ky', 'zod']) cleanTypecheck(`rv-off-${c}`)
  rmSync(BUNDLES, { recursive: true, force: true })
})

const OFF: Omit<LatheSection, 'input' | 'projects'> = { plugins: ['schemas', 'client', 'queries'], responseValidation: 'off' }

describe('the endpoints of an `off` client name no schema', () => {
  const e = emitToDisk('rv-off-pyreon', SPEC, OFF)
  const endpoints = e.file('endpoints/items.ts')

  it('imports every response, error and event model as a TYPE, and no validator', () => {
    expect(endpoints).toContain("import type { Item } from '../schemas/Item'")
    expect(endpoints).toContain("import type { Items } from '../schemas/Items'")
    expect(endpoints).toContain("import type { NotFound } from '../schemas/NotFound'")
    expect(endpoints).not.toMatch(/^import \{[^}]*\b(Item|Items|NotFound)\b[^}]*\} from '\.\.\/schemas/m)
    expect(endpoints).not.toContain('@pyreon/validate')
    expect(endpoints).not.toContain('streamEvent')
  })

  it('declares the response through its interface, with no `response` entry', () => {
    expect(endpoints).toContain(
      "api.endpoint<'GET /items', (raw: unknown) => Items, {}, 'json', { 404: (raw: unknown) => NotFound }>('GET /items', { errors: { 404: unchecked } })",
    )
    // A composite response or error body gets a named TYPE, not a schema const.
    expect(endpoints).toContain('type getItem$response = Item[]')
    expect(endpoints).toMatch(/type getItem\$errorDefault = \{\n\s+code: number\n\}/)
    expect(endpoints).not.toContain('response:')
    expect(endpoints).toContain('parse: (value: unknown) => value as Item')
  })

  it('a strict client still declares and imports the schemas (the control)', () => {
    const strict = emitToDisk('rv-off-strict', SPEC, { ...OFF, responseValidation: 'strict' }).file('endpoints/items.ts')
    expect(strict).toContain("{ response: Items, errors: { 404: NotFound } }")
    expect(strict).toContain("import { s } from '@pyreon/validate'")
    expect(strict).toContain('parse: streamEvent(Item)')
    expect(strict).not.toContain('unchecked')
  })

  const respond = (status: number, body: unknown) => (req: HttpRequest): Promise<HttpResponse> =>
    Promise.resolve({
      raw: new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      status,
      ok: status < 400,
      headers: new Headers({ 'content-type': 'application/json' }),
      request: req,
    })

  it('passes a body through unchecked, and still matches an error to its status key', async () => {
    const client = await e.load<{ setDevTransport(m: unknown): void; configureApi(c: unknown): void }>('client.ts')
    const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/index.ts')
    try {
      client.setDevTransport(respond(200, { items: 'not an array' }))
      await expect(eps.listItems?.()).resolves.toEqual({ items: 'not an array' })
      // Switched to strict at runtime there is still nothing to check against.
      client.configureApi({ validate: 'strict' })
      await expect(eps.listItems?.()).resolves.toEqual({ items: 'not an array' })
      client.setDevTransport(respond(404, { other: 1 }))
      await expect(eps.listItems?.()).rejects.toMatchObject({ status: 404, matched: '404', body: { other: 1 } })
      client.setDevTransport(respond(500, { code: 'x' }))
      await expect(eps.getItem?.({ params: { id: '1' } })).rejects.toMatchObject({ status: 500, matched: 'default' })
    } finally {
      client.setDevTransport(null)
      client.configureApi({ validate: 'off' })
    }
  })
})

describe('the adapter clients', () => {
  for (const client of ['fetch', 'axios', 'ky'] as const) {
    it(`${client}: no schema is imported, a body passes through and an error matches its key`, async () => {
      const e = emitToDisk(`rv-off-${client}`, SPEC, { ...OFF, client })
      expect(e.file('endpoints/items.ts')).not.toContain('@pyreon/validate')
      const c = await e.load<{ setDevTransport(t: (() => unknown) | null): void }>('client.ts')
      const eps = await e.load<Record<string, (a?: unknown) => Promise<unknown>>>('endpoints/index.ts')
      try {
        c.setDevTransport(() => ({ json: { items: 1 } }))
        await expect(eps.listItems?.()).resolves.toEqual({ items: 1 })
        c.setDevTransport(() => ({ status: 404, json: { other: 1 } }))
        await expect(eps.listItems?.()).rejects.toMatchObject({ status: 404, matched: '404' })
      } finally {
        c.setDevTransport(null)
      }
    })
  }
})

describe('operations.<id>.responseValidation decides per operation', () => {
  it('`off` on one operation of a strict client, and `strict` on one of an `off` client', () => {
    const one = emitToDisk('rv-off-per-op', SPEC, {
      plugins: ['schemas', 'client'],
      operations: { listItems: { responseValidation: 'off' } },
    }).file('endpoints/items.ts')
    expect(one).toContain("('GET /items', { errors: { 404: unchecked } })")
    expect(one).toContain('{ response: getItem$response, errors: { default: getItem$errorDefault } }')
    expect(one).toContain("import { s } from '@pyreon/validate'")

    const other = emitToDisk('rv-off-per-op', SPEC, {
      ...OFF,
      operations: { getItem: { responseValidation: 'strict' } },
    }).file('endpoints/items.ts')
    expect(other).toContain("('GET /items', { errors: { 404: unchecked } })")
    expect(other).toContain("validate: 'strict'")
    expect(other).toContain("import { Item } from '../schemas/Item'")
  })
})

describe('the types a caller sees are the interfaces', () => {
  const CONSUMER = `
import { getItem, listItems } from './endpoints/items'
import { useListItems } from './queries/items'
import type { EndpointError } from './client'
import type { Item } from './schemas/Item'
import type { Items } from './schemas/Items'
export async function run(): Promise<void> {
  const list: Items = await listItems()
  const one: Item[] = await getItem({ params: { id: '1' } })
  // @ts-expect-error -- the response is typed, not unknown
  const wrong: number = await listItems()
  void list; void one; void wrong
}
export function narrow(err: EndpointError<typeof listItems>): string | undefined {
  if ('matched' in err && err.matched === '404') return err.body.message
  return undefined
}
export const hook = (): Items | undefined => useListItems().data()
`
  for (const client of ['pyreon', 'fetch', 'axios', 'ky'] as const) {
    it(`${client}: compiles under strict TypeScript`, TYPECHECK_BUDGET, () => {
      const { errors } = typecheckSpec(`rv-off-${client}`, SPEC, { ...OFF, client }, { extra: { 'consumer.ts': CONSUMER }, noUnused: true })
      expect(errors).toEqual([])
    })
  }
  it('zod validator: compiles too', TYPECHECK_BUDGET, () => {
    const { errors } = typecheckSpec('rv-off-zod', SPEC, { ...OFF, validator: 'zod' }, { extra: { 'consumer.ts': CONSUMER } })
    expect(errors).toEqual([])
  })
})

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLES = join(HERE, '.generated', 'rv-off-bundle')

/** Bundle one endpoint the way an app does, and list the validator imports left in it. */
async function bundledImports(mode: 'off' | 'strict'): Promise<string[]> {
  const dir = join(BUNDLES, mode)
  rmSync(dir, { recursive: true, force: true })
  const e = emitToDisk(`rv-off-bundle-${mode}`, SPEC, { plugins: ['schemas', 'client'], responseValidation: mode })
  for (const f of e.result.files) {
    const abs = join(dir, 'gen', f.path)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.contents)
  }
  cleanEmitted(`rv-off-bundle-${mode}`)
  writeFileSync(join(dir, 'entry.ts'), "import { listItems } from './gen/endpoints/items'\nexport const go = () => listItems()\n")
  const out = await build({
    entryPoints: [join(dir, 'entry.ts')],
    bundle: true,
    write: false,
    format: 'esm',
    minify: true,
    treeShaking: true,
    external: ['@pyreon/*'],
    platform: 'browser',
  })
  const code = out.outputFiles[0]?.text ?? ''
  return [...code.matchAll(/from\s*"(@pyreon\/[^"]+)"/g)].map((m) => m[1] as string).sort()
}

describe('what one endpoint bundles', () => {
  it('`off` reaches @pyreon/http only; `strict` reaches @pyreon/validate too', async () => {
    const off = await bundledImports('off')
    expect(off).toContain('@pyreon/http')
    expect(off).not.toContain('@pyreon/validate')
    expect(await bundledImports('strict')).toContain('@pyreon/validate')
  })
})
