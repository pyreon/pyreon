import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'

/**
 * Bun adapter — generates a standalone Bun.serve() entry.
 *
 * **SSG mode (PR J)**: no-op. Bun adapter exists for serving the SSR
 * runtime; SSG output is already complete static HTML — serve it with
 * any static-file server (`bun preview` / `bunx serve` / nginx / Caddy).
 * Use `staticAdapter()` if you want explicit SSG semantics.
 */
export function bunAdapter(): Adapter {
  return {
    name: 'bun',
    async build(options: AdapterBuildOptions) {
      if (options.kind === 'ssg') {
        // Bun runner has nothing to add for prerendered SSG dist.
        return
      }
      await validateBuildInputs(options)
      const { writeFile, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      await mkdir(outDir, { recursive: true })

      // Stage client → outDir/client and server → outDir/server. See node.ts /
      // stage.ts for why a plain cp is a copy-into-self here (clientOutDir ===
      // outDir, server already at outDir/server).
      await stageClientThenServer(options, {
        clientDest: join(outDir, 'client'),
        serverDest: join(outDir, 'server'),
        preserve: ['index.ts'],
      })

      const port = options.config.port ?? 3000
      // The hashed-asset URL prefix (`/assets/` by default) is baked into the
      // emitted handler so a custom `build.assetsDir` still gets immutable cache.
      const assetPrefix = `/${options.assetsDir ?? 'assets'}/`
      const serverEntry = `
import { normalize } from "node:path"

const handler = (await import("./server/entry-server.js")).default
const clientDir = new URL("./client/", import.meta.url).pathname

Bun.serve({
  port: ${port},
  async fetch(req) {
    const url = new URL(req.url)

    // Try static files first (GET only).
    //
    // Path safety: decode percent-encoding, normalize \`..\` segments,
    // then assert the resulting path doesn't escape the clientDir
    // prefix. The previous implementation used \`Bun.resolveSync\`,
    // which is MODULE resolution — it throws on any non-existent
    // path, so it crashed every SSR route (URLs without a matching
    // static file) with a 500 before the SSR handler ran.
    // \`node:path.normalize\` is pure-string path arithmetic and
    // doesn't touch the filesystem — safe for arbitrary input.
    if (req.method === "GET") {
      let decoded
      try {
        decoded = decodeURIComponent(url.pathname)
      } catch {
        // Malformed %-encoding → reject (don't fall through to SSR
        // with a corrupt URL).
        return new Response("Bad Request", { status: 400 })
      }
      // Reject null bytes outright — no legitimate use in a URL,
      // and they can confuse downstream filesystem code.
      if (decoded.includes("\\0")) {
        return new Response("Forbidden", { status: 403 })
      }
      // Serve existing static files (incl. prerendered / public *.html). Only
      // "/" falls through to the SSR handler (no index.html mapping) — the fix
      // for "/" shipping the unfilled <!--pyreon-app--> shell; a missing file
      // also falls through. (Explicit "/index.html" serves the template shell,
      // a harmless non-canonical edge the client hydrates.)
      if (decoded !== "/") {
        // Prepend clientDir then normalize. If the normalized result
        // no longer starts with clientDir, a \`..\` segment escaped —
        // reject. Using string-startsWith with clientDir (which ends
        // in "/") prevents the "/clientdir-evil/" sibling-prefix
        // bypass.
        const candidate = normalize(clientDir + decoded)
        if (!candidate.startsWith(clientDir)) {
          return new Response("Forbidden", { status: 403 })
        }
        const file = Bun.file(candidate)
        if (await file.exists()) {
          // Immutable cache ONLY for content-hashed assets under /assets/
          // (Vite's hashed output dir — the same scope vercel/netlify use).
          // Keying on the EXTENSION would 1-year-immutable-cache a non-hashed
          // root file like public/sw.js or public/config.js — a deploy-poisoning
          // bug (a stale service worker becomes unevictable). HTML must always
          // revalidate (prerendered pages change on every content edit).
          return new Response(file, {
            headers: {
              "cache-control": decoded.startsWith(${JSON.stringify(assetPrefix)})
                ? "public, max-age=31536000, immutable"
                : decoded.endsWith(".html")
                  ? "public, max-age=0, must-revalidate"
                  : "public, max-age=3600",
            },
          })
        }
      }
    }

    // Fall through to SSR handler
    return handler(req)
  },
})

console.log("\\n  ⚡ Zero production server running on http://localhost:${port}\\n")
`.trimStart()

      await writeFile(join(outDir, 'index.ts'), serverEntry)
    },
    async revalidate(_path: string): Promise<AdapterRevalidateResult> {
      // Self-hosted Bun has no platform-driven ISR — same shape as
      // nodeAdapter. See nodeAdapter.revalidate for full rationale.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Pyreon] bunAdapter.revalidate() is a no-op — self-hosted Bun has no platform-driven ISR. Use mode: "isr" for runtime LRU caching, or vercelAdapter / cloudflareAdapter / netlifyAdapter for platform-driven build-time ISR.',
        )
      }
      return { regenerated: false }
    },
  }
}
