import type { Adapter, AdapterBuildOptions } from "../types"

/**
 * Node.js adapter — generates a standalone server entry using node:http.
 */
export function nodeAdapter(): Adapter {
  return {
    name: "node",
    async build(options: AdapterBuildOptions) {
      const { writeFile, cp, mkdir } = await import("node:fs/promises")
      const { join } = await import("node:path")

      const outDir = options.outDir
      await mkdir(outDir, { recursive: true })

      // Copy server and client builds
      await cp(options.clientOutDir, join(outDir, "client"), {
        recursive: true,
      })
      await cp(join(options.serverEntry, ".."), join(outDir, "server"), {
        recursive: true,
      })

      // Generate standalone server entry
      const port = options.config.port ?? 3000
      const serverEntry = `
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { join, extname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const handler = (await import("./server/entry-server.js")).default
const clientDir = join(__dirname, "client")

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

  // Try to serve static files first
  if (req.method === "GET") {
    try {
      const filePath = join(clientDir, url.pathname === "/" ? "index.html" : url.pathname)
      // Prevent path traversal — ensure resolved path stays within clientDir
      const { resolve } = await import("node:path")
      const resolved = resolve(filePath)
      if (!resolved.startsWith(resolve(clientDir))) {
        res.writeHead(403)
        res.end("Forbidden")
        return
      }
      const ext = extname(filePath)
      if (ext && ext !== ".html") {
        const data = await readFile(filePath)
        const mime = MIME_TYPES[ext] || "application/octet-stream"
        res.writeHead(200, {
          "content-type": mime,
          "cache-control": ext === ".js" || ext === ".css"
            ? "public, max-age=31536000, immutable"
            : "public, max-age=3600",
        })
        res.end(data)
        return
      }
    } catch {}
  }

  // Fall through to SSR handler
  const headers = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers[key] = Array.isArray(value) ? value.join(", ") : value
  }

  const request = new Request(url.href, {
    method: req.method,
    headers,
  })

  const response = await handler(request)
  const body = await response.text()

  const responseHeaders = {}
  response.headers.forEach((v, k) => { responseHeaders[k] = v })

  res.writeHead(response.status, responseHeaders)
  res.end(body)
})

server.listen(${port}, () => {
  console.log("\\n  ⚡ Zero production server running on http://localhost:${port}\\n")
})
`.trimStart()

      await writeFile(join(outDir, "index.js"), serverEntry)
      await writeFile(join(outDir, "package.json"), JSON.stringify({ type: "module" }, null, 2))
    },
  }
}
