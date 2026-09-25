/**
 * `lathe pull` — fetching a remote spec INTO the repo.
 *
 * The design this tests is the deliberate rejection of the obvious one. Letting
 * `input` be a URL and fetching during generation makes output depend on a
 * server's mood: two developers generate different clients from the same
 * commit, `check` fails in CI for reasons nobody can reproduce, and an offline
 * build stops working. Determinism is worth more than the round trip.
 *
 * So `pull` is a separate step that lands the spec on disk, and the assertions
 * below are about the properties that make that safe — above all that a
 * response which is not a spec must not overwrite one that is.
 */
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { main } from '../cli/main'

const SPEC = `openapi: 3.1.0
info: { title: Remote, version: '1' }
paths: {}
components: { schemas: {} }
`

let server: Server
let port = 0
const requests: Array<{ url: string | undefined; inm: string | string[] | undefined }> = []
/** Requests to the split spec's documents: host, path, auth, conditional. */
const splitRequests: Array<{ host: string | undefined; url: string | undefined; auth: string | undefined; inm: string | undefined }> = []
/** Stand-in for a split spec published as several files (DigitalOcean's shape). */
const splitRoot = (foreign: string): string => `openapi: 3.0.3
info: { title: Split, version: '1' }
servers: [{ url: 'https://api.test' }]
paths:
  /pets/{id}:
    $ref: 'paths/pet.yaml'
  /other:
    get:
      operationId: other
      responses: { '200': { description: ok, content: { application/json: { schema: { $ref: '${foreign}' } } } } }
`

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/spec.yaml') {
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end(SPEC)
    } else if (req.url === '/yaml-but-not-a-spec') {
      // Parses perfectly. Is not a spec. This is the case an "is it valid
      // YAML?" check waves straight through and onto a working spec.
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end('name: my-ci-pipeline\njobs: { build: { runs-on: ubuntu } }\n')
    } else if (req.url === '/huge-chunked') {
      // NO content-length, so the response is chunked and the client cannot
      // know the size in advance — the case the streaming cap exists for.
      //
      // The payload is a VALID spec followed by megabytes of YAML comment,
      // which matters: a payload of junk would also be rejected by the parser,
      // so the test would pass whether or not the cap fired. This one is a real
      // OpenAPI document, so the ONLY thing that can refuse it is the cap.
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.write(SPEC)
      const chunk = `# ${'x'.repeat(1024 * 1024 - 3)}\n`
      for (let i = 0; i < 80; i++) res.write(chunk)
      res.end()
    } else if (req.url === '/huge-declared') {
      // An HONEST oversized content-length. Rejected from the header alone,
      // without reading a byte — which is why the body here is tiny.
      res.writeHead(200, { 'content-type': 'text/yaml', 'content-length': String(128 * 1024 * 1024) })
      res.end(SPEC)
    } else if (req.url === '/etag') {
      requests.push({ url: req.url, inm: req.headers['if-none-match'] })
      if (req.headers['if-none-match'] === '"v1"') {
        res.writeHead(304)
        res.end()
      } else {
        res.writeHead(200, { 'content-type': 'text/yaml', etag: '"v1"' })
        res.end(SPEC)
      }
    } else if (req.url === '/private') {
      if (req.headers.authorization === 'Bearer s3cret' && req.headers['x-team'] === 'core') {
        res.writeHead(200, { 'content-type': 'text/yaml' })
        res.end(SPEC)
      } else {
        res.writeHead(401)
        res.end('unauthorized')
      }
    } else if (req.url === '/second.yaml') {
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end(SPEC.replace('Remote', 'Second'))
    } else if (req.url?.startsWith('/split/')) {
      splitRequests.push({
        host: req.headers.host,
        url: req.url,
        auth: req.headers.authorization,
        inm: req.headers['if-none-match'] as string | undefined,
      })
      const docs: Record<string, string> = {
        '/split/openapi.yaml': splitRoot(`http://localhost:${port}/split/foreign.yaml`),
        '/split/paths/pet.yaml':
          "get:\n  operationId: getPet\n  parameters: [{ name: id, in: path, required: true, schema: { type: string } }]\n  responses: { '200': { description: ok, content: { application/json: { schema: { $ref: '../models/pet.yaml' } } } } }\n",
        '/split/models/pet.yaml': 'type: object\nproperties: { name: { type: string } }\n',
        '/split/foreign.yaml': 'type: string\n',
        '/split/broken.yaml': splitRoot('missing.yaml'),
        '/split/local.yaml': splitRoot('file:///etc/hosts'),
      }
      const body = docs[req.url]
      if (body === undefined) {
        res.writeHead(404)
        res.end('nope')
      } else if (req.url === '/split/models/pet.yaml' && req.headers['if-none-match'] === '"pet-1"') {
        res.writeHead(304)
        res.end()
      } else {
        res.writeHead(200, { 'content-type': 'text/yaml', ...(req.url === '/split/models/pet.yaml' ? { etag: '"pet-1"' } : {}) })
        res.end(body)
      }
    } else if (req.url === '/html') {
      // The dangerous case: a 200 whose BODY is not a spec. A proxy error page,
      // a login redirect, a truncated response.
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>you are not logged in</html>')
    } else {
      res.writeHead(404)
      res.end('nope')
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  port = typeof addr === 'object' && addr ? addr.port : 0
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lathe-pull-'))
  writeFileSync(
    join(dir, 'pyreon.config.ts'),
    "export default { lathe: { input: './openapi.yaml', output: './gen' } }\n",
  )
  return dir
}

const silently = async (fn: () => Promise<number>): Promise<number> => {
  const out = process.stdout.write.bind(process.stdout)
  const err = process.stderr.write.bind(process.stderr)
  const swallow = ((): boolean => true) as typeof process.stdout.write
  process.stdout.write = swallow
  process.stderr.write = swallow
  try {
    return await fn()
  } finally {
    process.stdout.write = out
    process.stderr.write = err
  }
}

describe('lathe pull', () => {
  it('writes the spec to the CONFIGURED input path', async () => {
    const dir = project()
    const code = await silently(() => main(['pull', `http://127.0.0.1:${port}/spec.yaml`], dir))
    expect(code).toBe(0)
    // The destination is the configured `input`, never a positional, so `pull`
    // and `generate` cannot disagree about which file is the spec.
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a 200 that is NOT a spec leaves the existing one untouched', async () => {
    // Parse before writing, or a transient network problem — a proxy error
    // page, an expired session redirect — becomes a committed one.
    const dir = project()
    writeFileSync(join(dir, 'openapi.yaml'), SPEC)
    const code = await silently(() => main(['pull', `http://127.0.0.1:${port}/html`], dir))
    expect(code).toBe(1)
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('YAML that is not an OpenAPI document is refused', async () => {
    // "It parsed" is a much weaker statement than it sounds — an HTML error
    // page fails, but a JSON error envelope or somebody's CI config does not.
    const dir = project()
    writeFileSync(join(dir, 'openapi.yaml'), SPEC)
    const code = await silently(() =>
      main(['pull', `http://127.0.0.1:${port}/yaml-but-not-a-spec`], dir),
    )
    expect(code).toBe(1)
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a CHUNKED response that streams past the cap is refused', async () => {
    // A lying `content-length` cannot be used to test this: a compliant HTTP
    // client truncates the body AT the declared length, so an oversized stream
    // behind a small header never reaches us at all. Measured while writing
    // this — the first version of the fixture declared 10 bytes and delivered
    // exactly 10, so the test passed because the truncated body was not a
    // spec, not because the cap fired.
    const dir = project()
    const code = await silently(() => main(['pull', `http://127.0.0.1:${port}/huge-chunked`], dir))
    expect(code).toBe(1)
    expect(existsSync(join(dir, 'openapi.yaml'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  }, 60_000)

  it('an honestly-declared oversized response is refused from the header alone', async () => {
    const dir = project()
    const code = await silently(() => main(['pull', `http://127.0.0.1:${port}/huge-declared`], dir))
    expect(code).toBe(1)
    expect(existsSync(join(dir, 'openapi.yaml'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a 404 writes nothing and fails', async () => {
    const dir = project()
    const code = await silently(() => main(['pull', `http://127.0.0.1:${port}/missing`], dir))
    expect(code).toBe(1)
    expect(existsSync(join(dir, 'openapi.yaml'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses a non-URL rather than treating it as a path', async () => {
    const dir = project()
    const code = await silently(() => main(['pull', './local.yaml'], dir))
    expect(code).toBe(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('without a config, `lathe pull <url> <dest>` needs no config at all', async () => {
    // It used to fail with GENERATE's "no input spec" error and point at a
    // `--out-spec` flag that never existed.
    const dir = mkdtempSync(join(tmpdir(), 'lathe-pull-bare-'))
    const code = await silently(() => main(['pull', `http://127.0.0.1:${port}/spec.yaml`, 'spec.yaml'], dir))
    expect(code).toBe(0)
    expect(readFileSync(join(dir, 'spec.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('without a config or a destination, says where to put it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lathe-pull-bare-'))
    const err: string[] = []
    const e = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((t: string) => (err.push(String(t)), true)) as typeof process.stderr.write
    try {
      expect(await main(['pull', `http://127.0.0.1:${port}/spec.yaml`], dir)).toBe(1)
    } finally {
      process.stderr.write = e
    }
    expect(err.join('')).toContain('nowhere to write the spec')
    expect(err.join('')).not.toContain('out-spec')
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends --token and --header, for a spec behind auth', async () => {
    const dir = project()
    const bare = await silently(() => main(['pull', `http://127.0.0.1:${port}/private`], dir))
    expect(bare).toBe(1)
    const code = await silently(() =>
      main(['pull', `http://127.0.0.1:${port}/private`, '--token', 's3cret', '--header', 'X-Team: core'], dir),
    )
    expect(code).toBe(0)
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('sends If-None-Match on the next pull and treats a 304 as unchanged', async () => {
    const dir = project()
    mkdirSync(join(dir, 'node_modules'))
    requests.length = 0
    expect(await silently(() => main(['pull', `http://127.0.0.1:${port}/etag`], dir))).toBe(0)
    expect(await silently(() => main(['pull', `http://127.0.0.1:${port}/etag`], dir))).toBe(0)
    expect(requests.map((r) => r.inm)).toEqual([undefined, '"v1"'])
    // A LOCALLY EDITED spec must be re-downloaded, not "confirmed unchanged".
    writeFileSync(join(dir, 'openapi.yaml'), '# edited\n')
    expect(await silently(() => main(['pull', `http://127.0.0.1:${port}/etag`], dir))).toBe(0)
    expect(requests.at(-1)?.inm).toBeUndefined()
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('pulls EVERY project that declares a source, not only the first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lathe-pull-multi-'))
    writeFileSync(
      join(dir, 'pyreon.config.ts'),
      `export default { lathe: { projects: [
        { name: 'one', input: './one.yaml', source: 'http://127.0.0.1:${port}/spec.yaml' },
        { name: 'two', input: './two.yaml', source: 'http://127.0.0.1:${port}/second.yaml' },
      ] } }\n`,
    )
    expect(await silently(() => main(['pull'], dir))).toBe(0)
    expect(readFileSync(join(dir, 'one.yaml'), 'utf8')).toContain('Remote')
    expect(readFileSync(join(dir, 'two.yaml'), 'utf8')).toContain('Second')
    rmSync(dir, { recursive: true, force: true })
  })

  it('a split spec: fetches every referenced document and writes ONE bundle', async () => {
    const dir = project()
    mkdirSync(join(dir, 'node_modules'))
    splitRequests.length = 0
    const url = `http://127.0.0.1:${port}/split/openapi.yaml`
    expect(await silently(() => main(['pull', url, '--token', 's3cret'], dir))).toBe(0)
    const written = readFileSync(join(dir, 'openapi.yaml'), 'utf8')
    // Nothing points outside the file any more.
    expect(written).not.toMatch(/\$ref: .*\.yaml/)
    expect(written).toContain('getPet')
    const { loadOpenApi } = await import('../input/openapi')
    const doc = loadOpenApi(written).doc
    expect(doc.operations.find((o) => o.id === 'getPet')?.response).toEqual({ kind: 'ref', name: 'Pet' })
    expect(doc.notes.filter((n) => n.code === 'unsupported-ref')).toEqual([])
    // The credential goes to the spec's own origin ONLY -- never to a host a
    // `$ref` happens to name (`localhost` is a different origin).
    const byHost = (h: string) => splitRequests.filter((r) => r.host?.startsWith(h)).map((r) => r.auth)
    expect(byHost('127.0.0.1').every((a) => a === 'Bearer s3cret')).toBe(true)
    expect(byHost('localhost')).toEqual([undefined])
    // A second pull is conditional per DOCUMENT, and a 304 is answered from
    // the cached body -- the bundle is identical.
    splitRequests.length = 0
    expect(await silently(() => main(['pull', url, '--token', 's3cret'], dir))).toBe(0)
    expect(splitRequests.find((r) => r.url === '/split/models/pet.yaml')?.inm).toBe('"pet-1"')
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(written)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a split spec with an unreachable document writes nothing', async () => {
    // A bundle missing a part would type every `$ref` into it as unknown and
    // overwrite a working spec with a hollow one.
    const dir = project()
    writeFileSync(join(dir, 'openapi.yaml'), SPEC)
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const code = await main(['pull', `http://127.0.0.1:${port}/split/broken.yaml`], dir)
    const said = err.mock.calls.map((c) => String(c[0])).join('')
    err.mockRestore()
    out.mockRestore()
    expect(code).toBe(1)
    expect(said).toContain('split/missing.yaml: responded 404')
    expect(readFileSync(join(dir, 'openapi.yaml'), 'utf8')).toBe(SPEC)
    rmSync(dir, { recursive: true, force: true })
  })

  it('a remote spec cannot make pull read a LOCAL file', async () => {
    // `$ref: file:///…` in a downloaded document must not reach the disk of
    // the machine running `lathe pull`.
    const dir = project()
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const code = await main(['pull', `http://127.0.0.1:${port}/split/local.yaml`], dir)
    const said = err.mock.calls.map((c) => String(c[0])).join('')
    err.mockRestore()
    expect(code).toBe(1)
    expect(said).toContain('can only reference other http(s) documents')
    expect(existsSync(join(dir, 'openapi.yaml'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  it('an unreachable host fails without writing', async () => {
    const dir = project()
    // Port 1 is reserved and nothing listens on it.
    const code = await silently(() => main(['pull', 'http://127.0.0.1:1/spec.yaml'], dir))
    expect(code).toBe(1)
    expect(existsSync(join(dir, 'openapi.yaml'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
