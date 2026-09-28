/**
 * `remoteRefs: 'fetch'` — a spec ON DISK whose parts live on a server.
 *
 * The default stays offline: the remote `$ref` is reported (naming this
 * option) and typed `unknown`. Opting in downloads every remote part with
 * `lathe pull`'s rules, proven here against a real HTTP server through the
 * shipped CLI entry: credentials go to their own origin only, each document
 * is conditional on its own ETag, and a part that cannot be fetched fails the
 * run with nothing written.
 */
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { main } from '../cli/main'

let server: Server
let port = 0
const seen: Array<{ host: string | undefined; url: string | undefined; auth: string | undefined; inm: string | undefined }> = []

beforeAll(async () => {
  server = createServer((req, res) => {
    seen.push({
      host: req.headers.host,
      url: req.url,
      auth: req.headers.authorization,
      inm: req.headers['if-none-match'] as string | undefined,
    })
    if (req.url === '/models/pet.yaml') {
      if (req.headers.authorization !== 'Bearer t0k') {
        res.writeHead(401)
        res.end()
      } else if (req.headers['if-none-match'] === '"p1"') {
        res.writeHead(304)
        res.end()
      } else {
        res.writeHead(200, { 'content-type': 'text/yaml', etag: '"p1"' })
        res.end("type: object\nrequired: [name]\nproperties: { name: { type: string }, owner: { $ref: 'http://localhost:" + port + "/models/owner.yaml' } }\n")
      }
    } else if (req.url === '/models/owner.yaml') {
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end('type: object\nproperties: { id: { type: integer } }\n')
    } else {
      res.writeHead(404)
      res.end()
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

function project(remoteRefs: string | undefined, part = 'models/pet.yaml'): string {
  const dir = mkdtempSync(join(tmpdir(), 'lathe-remote-'))
  mkdirSync(join(dir, 'node_modules'))
  writeFileSync(
    join(dir, 'openapi.yaml'),
    `openapi: 3.0.3
info: { title: R, version: '1' }
servers: [{ url: 'https://api.test' }]
paths:
  /pet:
    get:
      operationId: getPet
      responses: { '200': { description: ok, content: { application/json: { schema: { $ref: 'http://127.0.0.1:${port}/${part}' } } } } }
`,
  )
  const cfg = remoteRefs
    ? `remoteRefs: '${remoteRefs}', remoteHeaders: { 'http://127.0.0.1:${port}': { Authorization: 'Bearer t0k' } },`
    : ''
  writeFileSync(join(dir, 'pyreon.config.ts'), `export default { lathe: { input: './openapi.yaml', output: './gen', plugins: ['schemas'], ${cfg} } }\n`)
  return dir
}

async function quietly(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  try {
    const code = await fn()
    return { code, out: out.mock.calls.map((c) => String(c[0])).join(''), err: err.mock.calls.map((c) => String(c[0])).join('') }
  } finally {
    out.mockRestore()
    err.mockRestore()
  }
}

describe('remote $ref parts of a spec on disk', () => {
  it('by default stays offline: reported, not fetched', async () => {
    const dir = project(undefined)
    seen.length = 0
    const r = await quietly(() => main(['generate', '--json'], dir))
    expect(r.code).toBe(0)
    expect(seen).toEqual([])
    expect(r.out).toContain("remoteRefs: 'fetch'")
    rmSync(dir, { recursive: true, force: true })
  })

  it("`remoteRefs: 'fetch'` bundles them, with credentials for their own origin only", async () => {
    const dir = project('fetch')
    seen.length = 0
    const r = await quietly(() => main(['generate'], dir))
    expect(r.code).toBe(0)
    expect(readFileSync(join(dir, 'gen/schemas/Pet.ts'), 'utf8')).toContain('owner')
    expect(existsSync(join(dir, 'gen/schemas/Owner.ts'))).toBe(true)
    // `localhost` is a different origin from `127.0.0.1`: no credential.
    expect(seen.find((s) => s.url === '/models/pet.yaml')?.auth).toBe('Bearer t0k')
    expect(seen.find((s) => s.url === '/models/owner.yaml')?.auth).toBeUndefined()

    // The next run is conditional on the part's own ETag, answered from cache.
    seen.length = 0
    expect((await quietly(() => main(['generate'], dir))).code).toBe(0)
    expect(seen.find((s) => s.url === '/models/pet.yaml')?.inm).toBe('"p1"')
    expect(readFileSync(join(dir, 'gen/schemas/Pet.ts'), 'utf8')).toContain('owner')
    rmSync(dir, { recursive: true, force: true })
  })

  it('a part that cannot be fetched fails the run, and nothing is written', async () => {
    const dir = project('fetch', 'models/gone.yaml')
    const r = await quietly(() => main(['generate'], dir))
    expect(r.code).toBe(1)
    expect(r.err).toContain('models/gone.yaml: responded 404')
    expect(existsSync(join(dir, 'gen'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
