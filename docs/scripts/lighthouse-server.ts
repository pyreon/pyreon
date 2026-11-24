/**
 * A static server for `docs/dist` that answers the way GitHub Pages does for
 * pyreon.dev, so a Lighthouse run against it measures what ships:
 *
 * - `/dir/` serves `dir/index.html`; `/dir` (a directory, no slash) is a 301
 *   to `/dir/`; `/page` falls back to `page.html`; a miss serves `404.html`
 *   with status 404.
 * - gzip for text responses when the client accepts it.
 * - `Cache-Control: max-age=600` on everything (Pages' fixed lifetime).
 *
 * Used by `docs/scripts/lighthouse.ts`; binds 127.0.0.1 on a free port.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

const COMPRESSIBLE = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/

export interface StaticServer {
  origin: string
  close: () => Promise<void>
}

/** Resolve a request path to a file under `root`, the GitHub Pages way. */
export function resolvePagesPath(
  root: string,
  pathname: string,
): { file: string; status: 200 | 404 } | { redirect: string } {
  const decoded = decodeURIComponent(pathname)
  const target = normalize(join(root, decoded))
  if (target !== root && !target.startsWith(root + sep)) {
    return { file: join(root, '404.html'), status: 404 }
  }
  if (existsSync(target) && statSync(target).isDirectory()) {
    if (!decoded.endsWith('/')) return { redirect: `${pathname}/` }
    const index = join(target, 'index.html')
    if (existsSync(index)) return { file: index, status: 200 }
  } else if (existsSync(target)) {
    return { file: target, status: 200 }
  } else if (existsSync(`${target}.html`)) {
    return { file: `${target}.html`, status: 200 }
  }
  return { file: join(root, '404.html'), status: 404 }
}

/**
 * `latencyMs` delays every response, to stand in for the real host's server
 * response time when diagnosing (Lighthouse's simulation adds the observed
 * server latency to every request; a loopback server has none).
 */
export function serveStatic(root: string, options: { latencyMs?: number } = {}): Promise<StaticServer> {
  const latency = options.latencyMs ?? 0
  const server = createServer((req, res) => {
    if (latency > 0) setTimeout(() => respond(req, res), latency)
    else respond(req, res)
  })
  const respond = (req: IncomingMessage, res: ServerResponse) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost')
    const resolved = resolvePagesPath(root, pathname)
    if ('redirect' in resolved) {
      res.writeHead(301, { location: resolved.redirect, 'cache-control': 'max-age=600' })
      res.end()
      return
    }
    const type = TYPES[extname(resolved.file)] ?? 'application/octet-stream'
    let body: Buffer = readFileSync(resolved.file)
    const headers: Record<string, string> = {
      'content-type': type,
      'cache-control': 'max-age=600',
    }
    if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''))) {
      body = gzipSync(body)
      headers['content-encoding'] = 'gzip'
      headers.vary = 'Accept-Encoding'
    }
    headers['content-length'] = String(body.length)
    res.writeHead(resolved.status, headers)
    res.end(req.method === 'HEAD' ? undefined : body)
  }
  return new Promise((resolveServer) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      resolveServer({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
