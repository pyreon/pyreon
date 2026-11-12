/**
 * Byte-for-byte locks on every MACHINE output lathe prints: `--json` for
 * generate / check / dry-run / diff, and `diff --format github|markdown|json`.
 *
 * The human report is free to change its look; these are read by tools (CI
 * steps, the GitHub Action, scripts piping `--json` into `jq`), so a change
 * here is a breaking change and must show up as a snapshot diff. The
 * snapshots were written against the renderer as it stood BEFORE the
 * terminal-theme migration, and that migration must leave them untouched.
 */
import { describe, expect, it } from 'vitest'
import { parseArgv, run, type Fs } from '../cli/run'

const SPEC = `
openapi: 3.0.3
info: { title: T, version: '1' }
servers: [{ url: 'https://t.test' }]
paths:
  /books:
    get:
      operationId: listBooks
      tags: [books]
      responses:
        '200':
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Book' } }
components:
  schemas:
    Book:
      type: object
      required: [id]
      properties:
        id: { type: string }
`

const SPEC_V2 = SPEC.replace('        id: { type: string }', '        id: { type: string }\n        title: { type: string }')

const DIFF_BEFORE = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Shop', version: '1' },
  servers: [{ url: 'https://shop.test' }],
  paths: {
    '/orders/{id}': {
      get: {
        operationId: 'getOrder',
        tags: ['orders'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
      },
      delete: {
        operationId: 'deleteOrder',
        tags: ['orders'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'gone' } },
      },
    },
  },
  components: {
    schemas: {
      Order: {
        type: 'object',
        required: ['id', 'total'],
        properties: { id: { type: 'string' }, total: { type: 'number', description: 'a | pipe' } },
      },
    },
  },
})

const DIFF_AFTER = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Shop', version: '2' },
  servers: [{ url: 'https://shop.test' }],
  paths: {
    '/orders/{id}': {
      get: {
        operationId: 'getOrder',
        tags: ['orders'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Order: {
        type: 'object',
        required: ['id', 'total'],
        properties: { id: { type: 'string' }, total: { type: 'number' }, dueAt: { type: 'string' } },
      },
    },
  },
})

function memFs(seed: Record<string, string> = {}): Fs & { files: Record<string, string> } {
  const files: Record<string, string> = { 'openapi.yaml': SPEC, ...seed }
  return {
    files,
    read: (p) => {
      const v = files[p]
      if (v === undefined) throw new Error(`ENOENT ${p}`)
      return v
    },
    write: (p, c) => {
      files[p] = c
    },
    exists: (p) => p in files,
    mkdirp: () => undefined,
    remove: (p) => {
      delete files[p]
    },
    join: (...parts) => parts.join('/').replace(/\/+/g, '/'),
  }
}

const go = (fs: Fs, args: string[]) => run(parseArgv(args), undefined, fs)

describe('lathe --json is locked', () => {
  it('generate --json', async () => {
    const r = await go(memFs(), ['generate', 'openapi.yaml', '--out', 'gen', '--json'])
    expect(r.code).toBe(0)
    expect(r.stderr).toBe('')
    expect(r.stdout).toMatchSnapshot()
  })

  it('check --json, current and stale', async () => {
    const fs = memFs()
    await go(fs, ['generate', 'openapi.yaml', '--out', 'gen'])
    const current = await go(fs, ['check', 'openapi.yaml', '--out', 'gen', '--json'])
    expect(current.code).toBe(0)
    expect(current.stdout).toMatchSnapshot('current')
    fs.files['openapi.yaml'] = SPEC_V2
    const stale = await go(fs, ['check', 'openapi.yaml', '--out', 'gen', '--json'])
    expect(stale.code).toBe(1)
    expect(stale.stdout).toMatchSnapshot('stale')
  })

  it('generate --dry-run --json', async () => {
    const fs = memFs()
    await go(fs, ['generate', 'openapi.yaml', '--out', 'gen'])
    fs.files['openapi.yaml'] = SPEC_V2
    const r = await go(fs, ['generate', 'openapi.yaml', '--out', 'gen', '--dry-run', '--json'])
    expect(r.stdout).toMatchSnapshot()
  })
})

describe('lathe diff machine formats are locked', () => {
  const fs = () => memFs({ 'a.json': DIFF_BEFORE, 'b.json': DIFF_AFTER })

  it('--json', async () => {
    const r = await go(fs(), ['diff', 'a.json', 'b.json', '--json', '--fail-on-breaking'])
    expect(r.code).toBe(1)
    expect(r.stdout).toMatchSnapshot()
  })

  it('--format json', async () => {
    const r = await go(fs(), ['diff', 'a.json', 'b.json', '--format', 'json'])
    expect(r.stdout).toMatchSnapshot()
  })

  it('--format github (annotations + markdown, and the job summary)', async () => {
    const r = await go(fs(), ['diff', 'a.json', 'b.json', '--format', 'github'])
    expect(r.stdout).toMatchSnapshot('stdout')
    expect(r.summary).toMatchSnapshot('summary')
  })

  it('--format markdown', async () => {
    const r = await go(fs(), ['diff', 'a.json', 'b.json', '--format', 'markdown'])
    expect(r.stdout).toMatchSnapshot()
  })

  it('--format markdown with no change', async () => {
    const r = await go(fs(), ['diff', 'a.json', 'a.json', '--format', 'markdown'])
    expect(r.stdout).toMatchSnapshot()
  })
})
