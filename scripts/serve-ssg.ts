#!/usr/bin/env bun
/**
 * Minimal directory-rewriting static server for SSG e2e gates.
 *
 * **Why this exists**: `vite preview` does SPA fallback — for ANY URL
 * that doesn't map to a literal file in `dist/`, it serves
 * `dist/index.html`. That's correct for SPA builds, but breaks SSG e2e
 * gates: a request to `/cs/posts` should serve `dist/cs/posts/index.html`,
 * NOT `dist/index.html`.
 *
 * Real static hosts (Netlify, Cloudflare Pages, GitHub Pages, S3 +
 * CloudFront, nginx + try_files) do this directory rewriting natively.
 * `vite preview` does not — so e2e tests against `vite preview` were
 * silently testing client-side routing on top of an SPA shell rather
 * than the real SSG-served behaviour.
 *
 * The bug shape this revealed: in PR #516's ssg-i18n e2e, spec (c)
 * documented `useLoaderData() === undefined` post-hydration on
 * `/cs/posts` as a "known gap, framework bug." Investigation in this PR
 * proved the framework was correct all along: the inline
 * `<script>window.__PYREON_LOADER_DATA__=…</script>` was missing from
 * the served HTML because `vite preview` returned `dist/index.html`
 * (which has NO loader data — it's the home page) instead of
 * `dist/cs/posts/index.html` (which DOES carry the dehydrated data
 * keyed correctly by `/cs/posts`).
 *
 * **Behaviour:**
 * - URL ends with `/` → serve `<dir>/index.html`
 * - URL has no extension → treat as directory: `/foo/bar` →
 *   `<dir>/foo/bar/index.html`
 * - URL has an extension → serve the literal file
 * - Missing file → serve `404.html` with status 404 if it exists, else
 *   plain text
 *
 * Path-traversal guard: resolved file must start with the root dir.
 *
 * **Why not `vite preview --rewrite`**: no such flag exists. Vite
 * preview's SPA-fallback behaviour is hardcoded. Patches landing it
 * upstream would take months; a 60-line static server is the
 * pragmatic shape.
 *
 * **Why not `serve` (npm package)**: introduces an external dep just
 * for e2e infra. The 60 lines below ship in the Pyreon monorepo as
 * `scripts/serve-ssg.ts` and serve via `bun scripts/serve-ssg.ts
 * <dist> <port>` — zero deps.
 *
 * @example
 *   bun scripts/serve-ssg.ts examples/ssr-showcase/dist 5199
 */

import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DIST_ARG = process.argv[2]
const PORT_ARG = process.argv[3]

if (!DIST_ARG || !PORT_ARG) {
  console.error('Usage: bun scripts/serve-ssg.ts <dist-dir> <port>')
  process.exit(1)
}

const root = resolve(DIST_ARG)
const port = Number(PORT_ARG)

if (!Number.isFinite(port) || port <= 0 || port > 65535) {
  console.error(`[serve-ssg] Invalid port: ${PORT_ARG}`)
  process.exit(1)
}

if (!existsSync(root)) {
  console.error(`[serve-ssg] Dist directory does not exist: ${root}`)
  process.exit(1)
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
}

function getMime(path: string): string {
  const dotIdx = path.lastIndexOf('.')
  if (dotIdx < 0) return 'application/octet-stream'
  const ext = path.slice(dotIdx).toLowerCase()
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

Bun.serve({
  port,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    let pathname = url.pathname

    // Directory rewriting: paths without an extension (and not literal
    // file paths) become `<path>/index.html`. Static hosts do this
    // automatically — we mirror the behaviour so e2e gates against
    // `bun scripts/serve-ssg.ts` reflect production deployment shape.
    const hasExt = /\.[a-z0-9]+$/i.test(pathname)
    if (!hasExt) {
      if (!pathname.endsWith('/')) pathname = `${pathname}/`
      pathname = `${pathname}index.html`
    }

    // Resolve + path-traversal guard.
    const filePath = join(root, pathname)
    const resolved = resolve(filePath)
    if (!resolved.startsWith(root)) {
      return new Response('Forbidden', { status: 403 })
    }

    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return new Response(Bun.file(resolved), {
        headers: { 'content-type': getMime(resolved) },
      })
    }

    // 404 fallback. Static hosts serve `404.html` for unmatched URLs;
    // mirror that so e2e tests for missing routes see the right output.
    const fourOhFour = join(root, '404.html')
    if (existsSync(fourOhFour)) {
      return new Response(Bun.file(fourOhFour), {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[serve-ssg] Serving ${root} at http://localhost:${port}`)
