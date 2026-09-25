import type { Adapter, AdapterBuildOptions, AdapterRevalidateResult } from '../types'
import { DENO_ADAPTER_OUTPUT } from './contract'
import { EDGE_INIT_FILE, renderEdgeInit } from './edge-wrapper'
import { stageClientThenServer } from './stage'
import { validateBuildInputs } from './validate'

/**
 * Deno adapter — a standalone `Deno.serve()` runner over the EDGE server
 * bundle (web-worker target, every dependency bundled, no `node:*` import),
 * for Deno Deploy or any `deno run` host.
 *
 * Produces, under `outDir`:
 * - `main.js` — the runner: static files from `client/` first (immutable
 *   cache for `<assetsDir>/*`), everything else through the SSR handler.
 * - `client/` — the client assets.
 * - `server-edge/` — the edge server bundle (+ `_pyreon-edge-init.js`).
 *
 * `export const schedule` API routes register with `Deno.cron` (native on
 * Deno Deploy; locally it needs `--unstable-cron`, and the runner says so
 * rather than skipping silently).
 *
 * Run with: `deno run --allow-net --allow-read --allow-env dist/main.js`
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import zero, { denoAdapter } from "@pyreon/zero/server"
 *
 * export default {
 *   plugins: [pyreon(), zero({ mode: "ssr", adapter: denoAdapter() })],
 * }
 * ```
 */
export function denoAdapter(): Adapter {
  return {
    name: 'deno',
    capabilities: { edgeOnly: true, edgeRoutes: true, schedules: true },
    async build(options: AdapterBuildOptions) {
      if (options.kind === 'ssg') {
        // SSG output is complete static HTML — serve it with any static host
        // (`deno run -A jsr:@std/http/file-server dist`).
        return
      }
      await validateBuildInputs(options)
      if (options.edgeServerEntry === undefined) {
        throw new Error('[Pyreon] denoAdapter: the edge server bundle was not built — denoAdapter needs the SSR plugin (mode "ssr" | "isr").')
      }
      const { writeFile, readFile } = await import('node:fs/promises')
      const { join } = await import('node:path')
      const outDir = options.outDir

      await stageClientThenServer(
        { clientOutDir: options.clientOutDir, serverEntry: options.edgeServerEntry },
        {
          clientDest: join(outDir, DENO_ADAPTER_OUTPUT.clientDir),
          serverDest: join(outDir, DENO_ADAPTER_OUTPUT.serverDir),
          preserve: [DENO_ADAPTER_OUTPUT.runnerEntry, 'server'],
        },
      )

      const serverDir = join(outDir, DENO_ADAPTER_OUTPUT.serverDir)
      const template = await readFile(join(serverDir, 'template.html'), 'utf-8').catch(() => '')
      await writeFile(join(serverDir, EDGE_INIT_FILE), renderEdgeInit(template))

      const assetPrefix = `/${options.assetsDir ?? 'assets'}/`
      const port = options.config.port ?? 8000
      const jobs = options.deploy?.schedules ?? []
      const runner = `
import "./${DENO_ADAPTER_OUTPUT.serverDir}/${EDGE_INIT_FILE}"
import handler from "./${DENO_ADAPTER_OUTPUT.serverDir}/entry-server.js"

const clientDir = new URL("./${DENO_ADAPTER_OUTPUT.clientDir}/", import.meta.url)

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

async function serveStatic(url) {
  const path = decodeURIComponent(url.pathname)
  const dot = path.lastIndexOf(".")
  if (dot <= path.lastIndexOf("/")) return undefined
  // Resolve against the client dir and refuse anything that escapes it.
  const file = new URL("." + path, clientDir)
  if (!file.href.startsWith(clientDir.href)) return new Response("Forbidden", { status: 403 })
  let body
  try {
    body = await Deno.readFile(file)
  } catch {
    return undefined
  }
  const ext = path.slice(dot)
  return new Response(body, {
    headers: {
      "content-type": MIME_TYPES[ext] ?? "application/octet-stream",
      // Immutable ONLY for content-hashed assets; HTML always revalidates.
      "cache-control": path.startsWith(${JSON.stringify(assetPrefix)})
        ? "public, max-age=31536000, immutable"
        : ext === ".html"
          ? "public, max-age=0, must-revalidate"
          : "public, max-age=3600",
    },
  })
}

const PORT = Number(Deno.env.get("PORT") || ${port})

Deno.serve({ port: PORT }, async (request) => {
  if (request.method === "GET" || request.method === "HEAD") {
    const hit = await serveStatic(new URL(request.url))
    if (hit) return hit
  }
  try {
    return await handler(request)
  } catch (err) {
    console.error("[Pyreon SSR] handler failed:", err)
    return new Response("Internal Server Error", { status: 500 })
  }
})
${
  jobs.length === 0
    ? ''
    : `
// \`export const schedule\` API routes → Deno.cron (UTC). Each job calls the
// SSR handler in-process with a GET for its path.
const JOBS = ${JSON.stringify(jobs.map((j) => ({ path: j.path, schedule: j.schedule })))}
if (typeof Deno.cron !== "function") {
  console.error("[Pyreon] Deno.cron is unavailable — scheduled routes will NOT run. Deno Deploy provides it; locally run with --unstable-cron.")
} else {
  for (const job of JOBS) {
    Deno.cron("pyreon " + job.path, job.schedule, async () => {
      const res = await handler(new Request(new URL(job.path, "http://localhost:" + PORT)))
      if (!res.ok) console.error("[Pyreon] scheduled " + job.path + " answered", res.status)
    })
  }
}
`
}`.trimStart()

      await writeFile(join(outDir, DENO_ADAPTER_OUTPUT.runnerEntry), runner)
    },
    async revalidate(_path: string): Promise<AdapterRevalidateResult> {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(
          '[Pyreon] denoAdapter.revalidate() is a no-op — Deno has no platform-driven ISR. Use mode: "isr" for runtime LRU caching.',
        )
      }
      return { regenerated: false }
    },
  }
}
