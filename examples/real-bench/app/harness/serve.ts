/**
 * The one static server every arm is served by, so no arm's own server or
 * hosting defaults move a number.
 *
 * - Every file of the arm's build output is read and compressed ONCE at start
 *   (brotli quality 11 and gzip level 9); a request gets brotli, gzip or the
 *   raw bytes by its `Accept-Encoding`. Chromium asks for brotli, so the
 *   throttled time-to-interactive load transfers brotli bytes for every arm.
 * - A path without a file extension gets the arm's SPA fallback page (history
 *   routing). A missing file with an extension is a 404.
 * - Cross-origin isolated (COOP/COEP): `performance.now()` has a 5 µs quantum
 *   instead of Chromium's 100 µs clamp. `bench.ts` checks this and refuses a
 *   coarse clock.
 * - `Cache-Control: no-store`; every timed load also uses a fresh browser
 *   context, so every load is a first visit.
 * - `/__blank` is an empty page with no script: the heap floor the memory
 *   metric reports next to each arm.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, relative, sep } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
}

export const BLANK_PATH = '/__blank'
const BLANK_HTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>blank</title></head><body></body></html>'

interface Entry {
  type: string
  raw: Buffer
  br: Buffer
  gzip: Buffer
}

export const gzipSize = (b: Uint8Array): number => gzipSync(b, { level: 9 }).length
export const brotliSize = (b: Uint8Array): number =>
  brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length

function entry(type: string, raw: Buffer): Entry {
  return {
    type,
    raw,
    br: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
    gzip: gzipSync(raw, { level: 9 }),
  }
}

/** Every file under `dir`, as `/`-separated paths relative to it. */
export function walk(dir: string): string[] {
  const out: string[] = []
  const visit = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) visit(p)
      else if (e.isFile()) out.push(relative(dir, p).split(sep).join('/'))
    }
  }
  visit(dir)
  return out.sort()
}

export interface RunningStatic {
  base: string
  stop(): Promise<void>
}

export async function serveStatic(
  root: string,
  fallback: string,
  port = 0,
): Promise<RunningStatic> {
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(
      `[real-bench/app] build output ${root} does not exist; run \`bun setup.ts\` first`,
    )
  }
  const files = new Map<string, Entry>()
  for (const rel of walk(root)) {
    files.set(
      `/${rel}`,
      entry(TYPES[extname(rel)] ?? 'application/octet-stream', readFileSync(join(root, rel))),
    )
  }
  const fallbackEntry = files.get(`/${fallback}`)
  if (!fallbackEntry) throw new Error(`[real-bench/app] fallback ${fallback} is not in ${root}`)
  const blank = entry(TYPES['.html'] as string, Buffer.from(BLANK_HTML))

  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    let hit = files.get(path)
    if (!hit && path === BLANK_PATH) hit = blank
    if (!hit && extname(path) === '') hit = fallbackEntry
    const headers: Record<string, string> = {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cache-Control': 'no-store',
      Vary: 'Accept-Encoding',
    }
    if (!hit) {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/plain' })
      res.end('not found')
      return
    }
    const accept = String(req.headers['accept-encoding'] ?? '')
    let body = hit.raw
    if (/\bbr\b/.test(accept)) {
      body = hit.br
      headers['Content-Encoding'] = 'br'
    } else if (/\bgzip\b/.test(accept)) {
      body = hit.gzip
      headers['Content-Encoding'] = 'gzip'
    }
    res.writeHead(200, {
      ...headers,
      'Content-Type': hit.type,
      'Content-Length': String(body.length),
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', () => ok())
  })
  const { port: bound } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${bound}`,
    stop: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections()
        server.close(() => ok())
      }),
  }
}
