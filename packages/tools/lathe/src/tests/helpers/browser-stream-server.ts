/**
 * The real-Chromium stream suite's two node-side halves.
 *
 * `generateBrowserClient` is a vitest `globalSetup`: it writes the generated
 * axios client where the browser test can import it through the dev server.
 * `sseServer` is a Vite plugin serving a Server-Sent Events endpoint on the
 * SAME origin as the test page, so the browser's own `fetch` (the one axios's
 * fetch adapter uses) streams it -- no mock, no CORS, no node shim.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../../core/config'
import { generate } from '../../core/generate'

const HERE = dirname(fileURLToPath(import.meta.url))
export const BROWSER_CLIENT_DIR = join(HERE, '..', '.generated', 'browser-axios')

export default function generateBrowserClient(): () => void {
  const spec = readFileSync(join(HERE, '..', 'fixtures', 'streams.json'), 'utf8')
  const { files } = generate(spec, resolveConfig({ input: 'x', client: 'axios', plugins: ['schemas', 'client'] }))
  rmSync(BROWSER_CLIENT_DIR, { recursive: true, force: true })
  for (const f of files) {
    const p = join(BROWSER_CLIENT_DIR, f.path)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, f.contents)
  }
  return () => rmSync(BROWSER_CLIENT_DIR, { recursive: true, force: true })
}

/** What the server saw per request, read back by the test through `/__lathe_sse/seen`. */
interface Seen {
  url: string
  lastEventId: string | undefined
  accept: string | undefined
  auth: string | undefined
}

/** The slice of a Vite plugin this needs -- structural, so no `vite` import. */
interface MiddlewarePlugin {
  name: string
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void } }): void
}

export function sseServer(): MiddlewarePlugin {
  let seen: Seen[] = []
  let hits = 0
  const handle = (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = req.url ?? ''
    if (!url.startsWith('/__lathe_sse/')) return next()
    if (url === '/__lathe_sse/reset') {
      seen = []
      hits = 0
      res.end('ok')
      return
    }
    if (url === '/__lathe_sse/seen') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(seen))
      return
    }
    seen.push({
      url,
      lastEventId: req.headers['last-event-id'] as string | undefined,
      accept: req.headers.accept,
      auth: req.headers.authorization,
    })
    if (url.startsWith('/__lathe_sse/v1/rooms/lobby/events')) {
      hits++
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' })
      if (hits === 1) {
        // One event split across two writes (the reader must reassemble it),
        // then the connection is destroyed mid-stream.
        res.write('retry: 5\nid: 1\ndata: {"kind":"join",')
        setTimeout(() => res.write('"at":1}\n\n'), 5)
        setTimeout(() => res.destroy(), 30)
        return
      }
      res.end('id: 2\ndata: {"kind":"leave","at":2}\n\n')
      return
    }
    res.statusCode = 404
    res.end()
  }
  return {
    name: 'lathe-sse-test-server',
    configureServer(server) {
      server.middlewares.use(handle)
    },
  }
}
