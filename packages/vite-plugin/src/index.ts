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

// Virtual module ID for the HMR runtime
const HMR_RUNTIME_ID = "\0pyreon/hmr-runtime"
const HMR_RUNTIME_IMPORT = "virtual:pyreon/hmr-runtime"

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
  let isBuild = false

  return {
    name: "pyreon",
    enforce: "pre",

    config(_, env) {
      isBuild = env.command === "build"

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

    // ── Virtual module: HMR runtime ─────────────────────────────────────────
    resolveId(id) {
      if (id === HMR_RUNTIME_IMPORT) return HMR_RUNTIME_ID
    },

    load(id) {
      if (id === HMR_RUNTIME_ID) {
        return HMR_RUNTIME_SOURCE
      }
    },

    transform(code, id) {
      const ext = getExt(id)
      if (ext !== ".tsx" && ext !== ".jsx" && ext !== ".pyreon") return
      const result = transformJSX(code, id)
      // Surface compiler warnings in the terminal
      for (const w of result.warnings) {
        this.warn(`${w.message} (${id}:${w.line}:${w.column})`)
      }

      let output = result.code

      // ── HMR injection (dev only) ────────────────────────────────────────
      if (!isBuild) {
        output = injectHmr(output, id)
      }

      return { code: output, map: null }
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
              headers: Object.entries(req.headers).reduce((h, [k, v]) => {
                if (v) h.set(k, Array.isArray(v) ? v.join(", ") : v)
                return h
              }, new Headers()),
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

// ── HMR injection ─────────────────────────────────────────────────────────────

/**
 * Regex that detects top-level signal declarations (prefix + variable name).
 * The arguments are extracted via balanced-paren matching in `injectHmr`
 * to handle arbitrary nesting like `signal(compute(getValue(x)))`.
 */
const SIGNAL_PREFIX_RE =
  /^((?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*)signal\(/gm

/**
 * Detect whether the module exports any component-like functions
 * (uppercase first letter — standard convention for JSX components).
 */
const EXPORT_COMPONENT_RE =
  /export\s+(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*[=:])/

/** Extract balanced parentheses content starting at the given offset (after the opening paren). */
function extractBalancedArgs(code: string, start: number): string | null {
  let depth = 1
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) return code.slice(start, i)
    }
    // Skip string literals to avoid counting parens inside strings
    else if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch
      let j = i + 1
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2
          continue
        }
        if (code[j] === quote) break
        j++
      }
      i = j
    }
  }
  return null // unbalanced — skip this declaration
}

function injectHmr(code: string, moduleId: string): string {
  const hasSignals = SIGNAL_PREFIX_RE.test(code)
  SIGNAL_PREFIX_RE.lastIndex = 0

  const hasComponentExport = EXPORT_COMPONENT_RE.test(code)

  // Only inject HMR if the module exports components or has module-scope signals
  if (!hasComponentExport && !hasSignals) return code

  let output = code

  // Rewrite top-level signal() calls to use __hmr_signal for state preservation
  if (hasSignals) {
    const escapedId = JSON.stringify(moduleId)
    // Process matches in reverse order so indices stay valid after replacement
    const matches: Array<{ start: number; end: number; prefix: string; name: string; args: string }> = []
    let m: RegExpExecArray | null
    while ((m = SIGNAL_PREFIX_RE.exec(code)) !== null) {
      const argsStart = m.index + m[0].length
      const args = extractBalancedArgs(code, argsStart)
      if (args === null) continue // unbalanced — skip
      matches.push({
        start: m.index,
        end: argsStart + args.length + 1, // +1 for closing paren
        prefix: m[1],
        name: m[2],
        args,
      })
    }
    SIGNAL_PREFIX_RE.lastIndex = 0

    // Replace in reverse to preserve offsets
    for (let i = matches.length - 1; i >= 0; i--) {
      const { start, end, prefix, name, args } = matches[i]
      const replacement = `${prefix}__hmr_signal(${escapedId}, ${JSON.stringify(name)}, signal, ${args})`
      output = output.slice(0, start) + replacement + output.slice(end)
    }
  }

  // Build the HMR footer
  const escapedId = JSON.stringify(moduleId)
  const lines: string[] = []

  if (hasSignals) {
    lines.push(`import { __hmr_signal, __hmr_dispose } from "${HMR_RUNTIME_IMPORT}";`)
  }

  lines.push(`if (import.meta.hot) {`)

  if (hasSignals) {
    lines.push(`  import.meta.hot.dispose(() => __hmr_dispose(${escapedId}));`)
  }

  lines.push(`  import.meta.hot.accept();`)
  lines.push(`}`)

  output = output + "\n\n" + lines.join("\n") + "\n"

  return output
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── HMR runtime source (served as virtual module) ─────────────────────────────
//
// Inlined here so it's available without a filesystem read. This is the
// compiled-to-JS version of hmr-runtime.ts — kept in sync manually.

const HMR_RUNTIME_SOURCE = `
const REGISTRY_KEY = "__pyreon_hmr_registry__";

function getRegistry() {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = new Map();
  }
  return globalThis[REGISTRY_KEY];
}

const moduleSignals = new Map();

export function __hmr_signal(moduleId, name, signalFn, initialValue) {
  const registry = getRegistry();
  const saved = registry.get(moduleId);
  const value = saved?.has(name) ? saved.get(name) : initialValue;
  const s = signalFn(value);

  let mod = moduleSignals.get(moduleId);
  if (!mod) {
    mod = { entries: new Map() };
    moduleSignals.set(moduleId, mod);
  }
  mod.entries.set(name, s);

  return s;
}

export function __hmr_dispose(moduleId) {
  const mod = moduleSignals.get(moduleId);
  if (!mod) return;

  const registry = getRegistry();
  const saved = new Map();
  for (const [name, s] of mod.entries) {
    saved.set(name, s.peek());
  }
  registry.set(moduleId, saved);
  moduleSignals.delete(moduleId);
}
`
