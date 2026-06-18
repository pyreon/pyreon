import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'

/**
 * Node.js adapter — generates a standalone server entry using node:http.
 *
 * **SSG mode (PR J)**: no-op. Node adapter exists for serving the SSR
 * runtime; SSG output is already complete static HTML — serve it with
 * any static-file server (`bun preview` / nginx / Caddy / `npx serve`).
 * Use `staticAdapter()` if you want explicit SSG semantics.
 */
export function nodeAdapter(): Adapter {
  return {
    name: 'node',
    async build(options: AdapterBuildOptions) {
      if (options.kind === 'ssg') {
        // Node runner has nothing to add for prerendered SSG dist.
        return
      }
      await validateBuildInputs(options)
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      await mkdir(outDir, { recursive: true })

      // Stage client → outDir/client and server → outDir/server. The zero SSR
      // plugin passes clientOutDir === outDir with the server bundle already at
      // outDir/server, so a naive cp would copy a directory into its own
      // subtree → EINVAL. `stageClientThenServer` per-entry-copies the client
      // into client/ (auto-preserving the server subdir + the scaffold files we
      // write next) and no-ops the already-in-place server copy.
      await stageClientThenServer(options, {
        clientDest: join(outDir, 'client'),
        serverDest: join(outDir, 'server'),
        preserve: ['index.js', 'package.json'],
      })

      // Generate standalone server entry
      const port = options.config.port ?? 3000
      // The hashed-asset URL prefix (`/<assetsDir>/`, default `/assets/`) baked
      // into the emitted handler so a custom `build.assetsDir` still gets
      // immutable cache. NOTE: `base` is deliberately NOT included — this
      // self-hosted handler serves files by raw `url.pathname` (no base-strip),
      // so a subpath deploy isn't supported here regardless; threading base into
      // only the cache check would imply support that doesn't exist. (The CDN
      // adapters DO scope their rules to `<base><assetsDir>`.)
      const assetPrefix = `/${options.assetsDir ?? 'assets'}/`
      const serverEntry = `
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { join, extname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const handler = (await import("./server/entry-server.js")).default
const clientDir = join(__dirname, "client")

// Phase 2 — hybrid static-first. Routes declaring \`renderMode = 'ssg'\` are
// prerendered at build time and listed in \`_pyreon-ssg-paths.json\` (the
// prerendered-paths manifest the SSG pass writes). Serving those straight
// from disk skips the SSR render entirely; a path missing from the manifest
// (or whose file vanished) falls through to SSR — graceful, never a 404.
// Loaded ONCE at boot (the set is immutable for a deploy).
let prerenderedPaths = new Set()
try {
  const manifestRaw = await readFile(join(__dirname, "_pyreon-ssg-paths.json"), "utf-8")
  const parsed = JSON.parse(manifestRaw)
  if (parsed && Array.isArray(parsed.paths)) prerenderedPaths = new Set(parsed.paths)
} catch {}

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon",
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost")

  // Serve existing static files (js / css / images / fonts / prerendered
  // .html / public assets). The root "/" deliberately has NO index.html
  // mapping, so with no file extension it falls through to the SSR handler —
  // that's the fix for "/" shipping the unfilled <!--pyreon-app--> shell.
  // Any other path serves its file if present (incl. legit public/*.html);
  // a missing file falls through to SSR. (An explicit "/index.html" request
  // serves the template shell — a harmless non-canonical edge the client
  // still hydrates.)
  if (req.method === "GET") {
    // Hybrid static-first: prerendered route → serve its index.html.
    if (prerenderedPaths.has(url.pathname)) {
      try {
        const pagePath = url.pathname === "/"
          ? join(clientDir, "index.html")
          : join(clientDir, url.pathname, "index.html")
        const { resolve } = await import("node:path")
        if (resolve(pagePath).startsWith(resolve(clientDir))) {
          const html = await readFile(pagePath)
          res.writeHead(200, {
            "content-type": "text/html",
            "cache-control": "public, max-age=0, must-revalidate",
          })
          res.end(html)
          return
        }
      } catch {}
      // File missing → fall through to SSR below.
    }
    const ext = extname(url.pathname)
    if (ext) {
      try {
        const filePath = join(clientDir, url.pathname)
        // Prevent path traversal — ensure resolved path stays within clientDir.
        const { resolve } = await import("node:path")
        const resolved = resolve(filePath)
        if (!resolved.startsWith(resolve(clientDir))) {
          res.writeHead(403)
          res.end("Forbidden")
          return
        }
        const data = await readFile(filePath)
        const mime = MIME_TYPES[ext] || "application/octet-stream"
        // Immutable cache ONLY for content-hashed assets under /assets/ (Vite's
        // hashed output dir — the same scope vercel/netlify use). Keying on the
        // EXTENSION would 1-year-immutable-cache a non-hashed root file like
        // public/sw.js or public/config.js — a deploy-poisoning bug (a stale
        // service worker becomes unevictable). HTML must always revalidate
        // (prerendered pages change on every content edit).
        res.writeHead(200, {
          "content-type": mime,
          "cache-control": url.pathname.startsWith(${JSON.stringify(assetPrefix)})
            ? "public, max-age=31536000, immutable"
            : ext === ".html"
              ? "public, max-age=0, must-revalidate"
              : "public, max-age=3600",
        })
        res.end(data)
        return
      } catch {}
    }
  }

  // Fall through to SSR handler.
  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers[key] = Array.isArray(value) ? value.join(", ") : value
  }

  const request = new Request(url.href, {
    method: req.method,
    headers,
  })

  const response = await handler(request)

  const responseHeaders = {}
  response.headers.forEach((v, k) => { responseHeaders[k] = v })

  res.writeHead(response.status, responseHeaders)

  // Pipe the Response body stream directly to res instead of buffering
  // the whole body via response.text(). For mode: 'stream' SSR (Suspense
  // out-of-order streaming) the pre-fix \`await response.text()\` drained
  // every Suspense chunk server-side and arrived at the client all at
  // once at the end — silently defeating streaming. For mode: 'string'
  // the body is a single chunk and this loop runs once with identical
  // observable behaviour.
  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        res.write(value)
      }
    } finally {
      res.end()
    }
  } else {
    res.end()
  }
})

// Honor \`$PORT\` at runtime (Vercel / Heroku / Cloud Run / CI all set it),
// falling back to the build-time configured port (default 3000). A set-but-
// empty \`PORT\` falls back too; \`PORT=0\` binds an ephemeral port.
const PORT = process.env.PORT ? Number(process.env.PORT) : ${port}
server.listen(PORT, () => {
  console.log(\`\\n  ⚡ Zero production server running on http://localhost:\${PORT}\\n\`)
})
`.trimStart()

      await writeFile(join(outDir, 'index.js'), serverEntry)
      await writeFile(join(outDir, 'package.json'), JSON.stringify({ type: 'module' }, null, 2))
    },
    async revalidate(_path: string): Promise<AdapterRevalidateResult> {
      // Self-hosted Node has no platform-driven ISR. Real ISR support
      // requires a reverse-proxy cache (nginx/varnish) + your own
      // cache-purge wiring, OR mode: 'isr' for runtime LRU caching.
      // This no-op preserves the Adapter API contract; user code that
      // calls `adapter.revalidate(path)` against a self-hosted Node
      // deploy gets the same `regenerated: false` shape as the static
      // adapter, so migrating between adapters doesn't surprise.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Pyreon] nodeAdapter.revalidate() is a no-op — self-hosted Node has no platform-driven ISR. Use mode: "isr" for runtime LRU caching, or vercelAdapter / cloudflareAdapter / netlifyAdapter for platform-driven build-time ISR.',
        )
      }
      return { regenerated: false }
    },
  }
}
