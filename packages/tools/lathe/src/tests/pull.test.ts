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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { main } from '../cli/main'

const SPEC = `openapi: 3.1.0
info: { title: Remote, version: '1' }
paths: {}
components: { schemas: {} }
`

let server: Server
let port = 0

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/spec.yaml') {
      res.writeHead(200, { 'content-type': 'text/yaml' })
      res.end(SPEC)
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

  it('an unreachable host fails without writing', async () => {
    const dir = project()
    // Port 1 is reserved and nothing listens on it.
    const code = await silently(() => main(['pull', 'http://127.0.0.1:1/spec.yaml'], dir))
    expect(code).toBe(1)
    expect(existsSync(join(dir, 'openapi.yaml'))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})
