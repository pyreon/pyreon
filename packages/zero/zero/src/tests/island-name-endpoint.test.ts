// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { _resetServerIslands } from '@pyreon/server'
import { isIslandName } from '@pyreon/server/paths'
import type { MiddlewareContext } from '@pyreon/server'
import { afterEach, describe, expect, it } from 'vitest'
import { ISLAND_NAME_CASES } from '../../../../core/server/src/tests/island-name.cases'
import { createIslandSigner } from '../server-island-token'
import { createServerIslandMiddleware } from '../server-islands-middleware'

const signer = createIslandSigner({ secret: 'k'.repeat(32) })

function ctxFor(url: string): MiddlewareContext {
  const u = new URL(url)
  return { req: new Request(url), url: u, path: u.pathname + u.search, headers: new Headers(), locals: {} } as MiddlewareContext
}

afterEach(() => _resetServerIslands())

/**
 * The fragment endpoint refuses (400) exactly the names registration and the
 * browser refuse — the shared `isIslandName`, run on the decoded name.
 */
describe('fragment endpoint: the shared island-name rule', () => {
  for (const [name, valid] of ISLAND_NAME_CASES) {
    if (name === '') continue // `/_pyreon/fragment/` with no name: not a fragment request for any island
    it(`${JSON.stringify(name)} → ${valid ? 'not a 400' : '400'}`, async () => {
      const mw = createServerIslandMiddleware([], signer)
      const sig = await signer.sign(name, '/', '', Date.now() + 60_000)
      const res = (await mw(
        ctxFor(`http://x/_pyreon/fragment/${encodeURIComponent(name)}?page=%2F&sig=${encodeURIComponent(sig)}`),
      )) as Response | undefined
      if (valid) {
        expect(res?.status).not.toBe(400)
      } else if (res === undefined) {
        // `.` / `..` are dot segments: URL parsing resolves them before the
        // endpoint sees the path, so the request is not a fragment request at all.
        expect(new URL(`http://x/_pyreon/fragment/${encodeURIComponent(name)}`).pathname.startsWith('/_pyreon/fragment/')).toBe(false)
      } else {
        expect(res.status).toBe(400)
      }
    })
  }
})

/**
 * Why the rule refuses separators and `%` even though the browser escapes the
 * name into one segment: an intermediary may decode it. This is a minimal
 * model of nginx's standard sub-path proxy (`location /sub/ { proxy_pass
 * http://app/; }`), which forwards the NORMALISED URI: `%XX` decoded, dot
 * segments resolved, `/sub/` replaced by `/`.
 */
describe('a decoding reverse proxy un-escapes the fragment path', () => {
  let app: Server
  let proxy: Server
  const seen: string[] = []

  async function listen(server: Server): Promise<number> {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    return (server.address() as AddressInfo).port
  }

  afterEach(async () => {
    await new Promise((r) => proxy?.close(() => r(undefined)))
    await new Promise((r) => app?.close(() => r(undefined)))
    seen.length = 0
  })

  it('an escaped "../../api/x" reaches the app as /api/x — so the name rule refuses it', async () => {
    app = createServer((req, res) => {
      seen.push(req.url ?? '')
      res.end('ok')
    })
    const appPort = await listen(app)
    proxy = createServer((req, res) => {
      // nginx: decode, then resolve dot segments, then map /sub/ → /.
      const decoded = decodeURIComponent((req.url ?? '/').split('?')[0]!)
      const normalised = new URL(decoded, 'http://n').pathname
      const upstream = normalised.startsWith('/sub/') ? normalised.slice('/sub'.length) : normalised
      const fwd = httpRequest({ host: '127.0.0.1', port: appPort, path: upstream }, (r) => r.pipe(res))
      fwd.end()
    })
    const proxyPort = await listen(proxy)

    const name = '../../api/x'
    const browserPath = `/sub/_pyreon/fragment/${encodeURIComponent(name)}`
    expect(browserPath).toBe('/sub/_pyreon/fragment/..%2F..%2Fapi%2Fx') // one segment, as sent
    await fetch(`http://127.0.0.1:${proxyPort}${browserPath}`)
    expect(seen).toEqual(['/api/x']) // …but not as received
    expect(isIslandName(name)).toBe(false)
  })
})
