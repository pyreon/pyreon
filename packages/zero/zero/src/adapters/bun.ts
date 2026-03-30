import type { Adapter, AdapterBuildOptions } from '../types'

/**
 * Bun adapter — generates a standalone Bun.serve() entry.
 */
export function bunAdapter(): Adapter {
  return {
    name: 'bun',
    async build(options: AdapterBuildOptions) {
      const { writeFile, cp, mkdir } = await import('node:fs/promises')
      const { join } = await import('node:path')

      const outDir = options.outDir
      await mkdir(outDir, { recursive: true })

      // Copy server and client builds
      await cp(options.clientOutDir, join(outDir, 'client'), {
        recursive: true,
      })
      await cp(join(options.serverEntry, '..'), join(outDir, 'server'), {
        recursive: true,
      })

      const port = options.config.port ?? 3000
      const serverEntry = `
const handler = (await import("./server/entry-server.js")).default
const clientDir = new URL("./client/", import.meta.url).pathname

Bun.serve({
  port: ${port},
  async fetch(req) {
    const url = new URL(req.url)

    // Try static files first
    if (req.method === "GET") {
      const filePath = clientDir + (url.pathname === "/" ? "index.html" : url.pathname)
      // Prevent path traversal — ensure resolved path stays within clientDir
      const resolved = Bun.resolveSync(filePath, ".")
      if (!resolved.startsWith(Bun.resolveSync(clientDir, "."))) {
        return new Response("Forbidden", { status: 403 })
      }
      const file = Bun.file(filePath)
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "cache-control": filePath.endsWith(".js") || filePath.endsWith(".css")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
          },
        })
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
  }
}
