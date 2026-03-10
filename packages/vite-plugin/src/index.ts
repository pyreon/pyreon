/**
 * @pyreon/vite-plugin — Vite integration for Pyreon framework.
 *
 * Applies Pyreon's JSX reactive transform to .tsx, .jsx, and .pyreon files,
 * and configures Vite to use Pyreon's JSX runtime.
 *
 * ## Basic usage (SPA)
 *
 *   import pyreon from "@pyreon/vite-plugin"
 *   export default { plugins: [pyreon()] }
 *
 * ## SSR mode
 *
 *   import pyreon from "@pyreon/vite-plugin"
 *   export default { plugins: [pyreon({ ssr: { entry: "./src/entry-server.ts" } })] }
 *
 * In SSR mode, the plugin adds dev server middleware that:
 *   1. Loads your server entry via Vite's `ssrLoadModule`
 *   2. Calls the exported `handler` or default export (Request → Response)
 *   3. Returns the SSR'd HTML for every non-asset request
 *
 * For production, build separately:
 *   vite build                                                  # client bundle
 *   vite build --ssr src/entry-server.ts --outDir dist/server   # server bundle
 */

import { transformJSX } from "@pyreon/compiler"
import type { Plugin, ViteDevServer } from "vite"

export interface PyreonPluginOptions {
  /**
   * Enable SSR dev middleware.
   *
   * Pass an object with `entry` pointing to your server entry file.
   * The entry must export a `handler` function: `(req: Request) => Promise<Response>`
   * or a default export of the same type.
   *
   * @example
   * pyreonPlugin({ ssr: { entry: "./src/entry-server.ts" } })
   */
  ssr?: {
    /** Server entry file path (e.g. "./src/entry-server.ts") */
    entry: string
  }
}

export default function pyreonPlugin(options?: PyreonPluginOptions): Plugin {
  const ssrConfig = options?.ssr

  return {
    name: "pyreon",
    enforce: "pre",

    config(_, env) {
      return {
        resolve: {
          conditions: ["bun"],
        },
        esbuild: {
          jsx: "automatic",
          jsxImportSource: "@pyreon/core",
        },
        // In SSR build mode, configure the entry
        ...(env.isSsrBuild && ssrConfig
          ? {
              build: {
                ssr: true,
                rollupOptions: {
                  input: ssrConfig.entry,
                },
              },
            }
          : {}),
      }
    },

    transform(code, id) {
      const ext = getExt(id)
      if (ext !== ".tsx" && ext !== ".jsx" && ext !== ".pyreon") return
      const result = transformJSX(code, id)
      return { code: result.code, map: null }
    },

    // ── SSR dev middleware ───────────────────────────────────────────────────
    configureServer(server: ViteDevServer) {
      if (!ssrConfig) return

      // Return a function so the middleware runs AFTER Vite's built-in middleware
      // (static files, HMR, etc.) — only handle requests that Vite doesn't serve.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          // Skip non-GET requests and asset requests
          if (req.method !== "GET") return next()
          const url = req.url ?? "/"
          if (isAssetRequest(url)) return next()

          try {
            // Load the server entry through Vite's module graph (HMR-aware)
            const mod = await server.ssrLoadModule(ssrConfig.entry)
            const handler = mod.handler ?? mod.default

            if (typeof handler !== "function") {
              console.error(
                `[pyreon/vite] SSR entry "${ssrConfig.entry}" must export a \`handler\` or default export: (Request) => Promise<Response>`,
              )
              return next()
            }

            // Construct a Web-standard Request from the Node.js IncomingMessage
            const origin = `http://${req.headers.host ?? "localhost"}`
            const fullUrl = new URL(url, origin)
            const request = new Request(fullUrl.href, {
              method: req.method,
              headers: Object.entries(req.headers).reduce(
                (h, [k, v]) => {
                  if (v) h.set(k, Array.isArray(v) ? v.join(", ") : v)
                  return h
                },
                new Headers(),
              ),
            })

            const response: Response = await handler(request)
            let html = await response.text()

            // Inject Vite's HMR client + dev transforms
            html = await server.transformIndexHtml(url, html)

            res.statusCode = response.status
            response.headers.forEach((v, k) => res.setHeader(k, v))
            res.end(html)
          } catch (err) {
            // Let Vite handle the error overlay
            server.ssrFixStacktrace(err as Error)
            console.error("[pyreon/vite] SSR error:", err)
            next(err)
          }
        })
      }
    },
  }
}

function getExt(id: string): string {
  const clean = id.split("?")[0] ?? id
  const dot = clean.lastIndexOf(".")
  return dot >= 0 ? clean.slice(dot) : ""
}

/** Skip Vite-handled asset requests (CSS, images, HMR, etc.) */
function isAssetRequest(url: string): boolean {
  return (
    url.startsWith("/@") || // @vite/client, @id, @fs, etc.
    url.startsWith("/__") || // __open-in-editor, etc.
    url.includes("/node_modules/") ||
    /\.(css|js|ts|tsx|jsx|json|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|map)(\?|$)/.test(url)
  )
}
