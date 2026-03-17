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
 * ## Drop-in compat mode (zero code changes)
 *
 *   import pyreon from "@pyreon/vite-plugin"
 *   export default { plugins: [pyreon({ compat: "react" })] }
 *
 * Aliases `react`, `react-dom`, `vue`, `solid-js`, or `preact` imports to
 * Pyreon's compat packages — existing code works without changing imports.
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

import { readFileSync } from "node:fs"
import { resolve as pathResolve } from "node:path"
import { transformJSX } from "@pyreon/compiler"
import type { Plugin, ViteDevServer } from "vite"

// Virtual module ID for the HMR runtime
const HMR_RUNTIME_ID = "\0pyreon/hmr-runtime"
const HMR_RUNTIME_IMPORT = "virtual:pyreon/hmr-runtime"

export type CompatFramework = "react" | "preact" | "vue" | "solid"

export interface PyreonPluginOptions {
  /**
   * Alias imports from an existing framework to Pyreon's compat layer.
   *
   * This lets you drop Pyreon into an existing project with zero code changes —
   * `import { useState } from "react"` will resolve to `@pyreon/react-compat`.
   *
   * @example
   * pyreon({ compat: "react" })   // react + react-dom → @pyreon/react-compat
   * pyreon({ compat: "vue" })     // vue → @pyreon/vue-compat
   * pyreon({ compat: "solid" })   // solid-js → @pyreon/solid-compat
   * pyreon({ compat: "preact" })  // preact + hooks + signals → @pyreon/preact-compat
   */
  compat?: CompatFramework

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

// ── Compat alias maps ─────────────────────────────────────────────────────────

const COMPAT_ALIASES: Record<CompatFramework, Record<string, string>> = {
  react: {
    react: "@pyreon/react-compat",
    "react/jsx-runtime": "@pyreon/react-compat/jsx-runtime",
    "react/jsx-dev-runtime": "@pyreon/react-compat/jsx-runtime",
    "react-dom": "@pyreon/react-compat/dom",
    "react-dom/client": "@pyreon/react-compat/dom",
  },
  preact: {
    preact: "@pyreon/preact-compat",
    "preact/hooks": "@pyreon/preact-compat/hooks",
    "@preact/signals": "@pyreon/preact-compat/signals",
  },
  vue: {
    vue: "@pyreon/vue-compat",
  },
  solid: {
    "solid-js": "@pyreon/solid-compat",
  },
}

/**
 * Resolve a package specifier to an absolute source path, respecting the "bun"
 * export condition. Falls back to the "import" condition.
 *
 * This is needed because Vite 8's resolve pipeline doesn't consistently apply
 * custom conditions from `resolve.conditions` during the `vite:import-analysis`
 * phase for aliased workspace packages.
 */
function resolveWithBunCondition(specifier: string, projectRoot: string): string | undefined {
  // Split specifier: "@pyreon/react-compat/dom" → pkg="@pyreon/react-compat", subpath="./dom"
  const parts = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2)
    : specifier.split("/").slice(0, 1)
  const pkgName = parts.join("/")
  const subpath = specifier.slice(pkgName.length) || "."
  const exportKey = subpath === "." ? "." : `.${subpath}`

  try {
    // Walk up from project root to find node_modules containing the package
    const pkgDir = pathResolve(projectRoot, "node_modules", pkgName)
    const pkgJsonPath = pathResolve(pkgDir, "package.json")
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as {
      exports?: Record<string, Record<string, string> | string>
    }

    const exp = pkgJson.exports?.[exportKey]
    if (!exp) return undefined

    if (typeof exp === "string") return pathResolve(pkgDir, exp)
    // Prefer bun → import → default
    const target = exp.bun ?? exp.import ?? exp.default
    return target ? pathResolve(pkgDir, target) : undefined
  } catch {
    return undefined
  }
}

/**
 * Return the Pyreon compat target for an import specifier, or undefined if
 * the import should not be redirected.
 */
function getCompatTarget(compat: CompatFramework | undefined, id: string): string | undefined {
  if (!compat) return undefined
  const aliased = COMPAT_ALIASES[compat][id]
  if (aliased) return aliased
  // OXC's JSX transform reads jsxImportSource from tsconfig (@pyreon/core),
  // not from our plugin config. Redirect JSX runtime imports in compat mode.
  if (
    compat === "react" &&
    (id === "@pyreon/core/jsx-runtime" || id === "@pyreon/core/jsx-dev-runtime")
  ) {
    return "@pyreon/react-compat/jsx-runtime"
  }
  return undefined
}

export default function pyreonPlugin(options?: PyreonPluginOptions): Plugin {
  const ssrConfig = options?.ssr
  const compat = options?.compat
  let isBuild = false
  let projectRoot = ""
  // Cache resolved absolute paths for compat aliases
  const resolvedAliases = new Map<string, string>()

  return {
    name: "pyreon",
    enforce: "pre",

    config(userConfig, env) {
      isBuild = env.command === "build"
      // Capture the project root for package resolution in resolveId
      projectRoot = userConfig.root ?? process.cwd()

      // Tell Vite's dep scanner not to pre-bundle the aliased framework imports —
      // they resolve to workspace packages via our resolveId hook, not node_modules.
      const optimizeDepsExclude = compat ? Object.keys(COMPAT_ALIASES[compat]) : []

      return {
        resolve: {
          conditions: ["bun"],
        },
        optimizeDeps: {
          exclude: optimizeDepsExclude,
        },
        oxc: {
          jsx: {
            runtime: "automatic",
            importSource: compat === "react" ? "@pyreon/react-compat" : "@pyreon/core",
          },
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

    // ── Virtual module + compat alias resolution ─────────────────────────────
    resolveId(id) {
      if (id === HMR_RUNTIME_IMPORT) return HMR_RUNTIME_ID
      const target = getCompatTarget(compat, id)
      if (!target) return

      // Use cached resolution or resolve with bun condition
      let resolved = resolvedAliases.get(target)
      if (!resolved) {
        resolved = resolveWithBunCondition(target, projectRoot)
        if (resolved) resolvedAliases.set(target, resolved)
      }
      return resolved
    },

    load(id) {
      if (id === HMR_RUNTIME_ID) {
        return HMR_RUNTIME_SOURCE
      }
    },

    transform(code, id) {
      const ext = getExt(id)
      if (ext !== ".tsx" && ext !== ".jsx" && ext !== ".pyreon") return

      // In react compat mode, skip Pyreon's reactive JSX transform.
      // OXC's built-in JSX transform handles jsx() calls; the compat
      // JSX runtime wraps components for re-render support.
      if (compat === "react") return

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
          if (req.method !== "GET") return next()
          const url = req.url ?? "/"
          if (isAssetRequest(url)) return next()

          try {
            await handleSsrRequest(server, ssrConfig.entry, url, req, res, next)
          } catch (err) {
            server.ssrFixStacktrace(err as Error)
            next(err)
          }
        })
      }
    },
  }
}

async function handleSsrRequest(
  server: ViteDevServer,
  entry: string,
  url: string,
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  next: (err?: unknown) => void,
): Promise<void> {
  const mod = await server.ssrLoadModule(entry)
  const handler = mod.handler ?? mod.default

  if (typeof handler !== "function") {
    next()
    return
  }

  const origin = `http://${req.headers.host ?? "localhost"}`
  const fullUrl = new URL(url, origin)
  const request = new Request(fullUrl.href, {
    method: req.method ?? "GET",
    headers: Object.entries(req.headers).reduce((h, [k, v]) => {
      if (v) h.set(k, Array.isArray(v) ? v.join(", ") : v)
      return h
    }, new Headers()),
  })

  const response: Response = await handler(request)
  let html = await response.text()

  html = await server.transformIndexHtml(url, html)

  res.statusCode = response.status
  response.headers.forEach((v, k) => {
    res.setHeader(k, v)
  })
  res.end(html)
}

// ── HMR injection ─────────────────────────────────────────────────────────────

/**
 * Regex that detects signal declarations (prefix + variable name).
 * The arguments are extracted via balanced-paren matching in `injectHmr`.
 * A brace-depth check filters out matches inside functions/blocks — only
 * module-scope (depth 0) signals are rewritten for HMR state preservation.
 */
const SIGNAL_PREFIX_RE = /^((?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*)signal\(/gm

/**
 * Detect whether the module exports any component-like functions
 * (uppercase first letter — standard convention for JSX components).
 */
const EXPORT_COMPONENT_RE =
  /export\s+(?:default\s+)?(?:function\s+([A-Z]\w*)|const\s+([A-Z]\w*)\s*[=:])/

function skipStringLiteral(code: string, start: number, quote: string): number {
  let j = start + 1
  while (j < code.length) {
    if (code[j] === "\\") {
      j += 2
      continue
    }
    if (code[j] === quote) break
    j++
  }
  return j
}

function extractBalancedArgs(code: string, start: number): string | null {
  let depth = 1
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) return code.slice(start, i)
    } else if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(code, i, ch)
    }
  }
  return null
}

/**
 * Compute brace depth at position `pos` — returns 0 for module scope.
 * Skips string literals to avoid counting braces inside strings.
 */
function braceDepthAt(code: string, pos: number): number {
  let depth = 0
  for (let i = 0; i < pos; i++) {
    const ch = code[i]
    if (ch === "{") depth++
    else if (ch === "}") depth--
    else if (ch === '"' || ch === "'" || ch === "`") {
      i = skipStringLiteral(code, i, ch)
    }
  }
  return depth
}

/** Rewrite module-scope `signal()` calls to `__hmr_signal()` for state preservation. */
function rewriteSignals(code: string, moduleId: string): string {
  const escapedId = JSON.stringify(moduleId)
  const matches: {
    start: number
    end: number
    prefix: string
    name: string
    args: string
  }[] = []
  let m: RegExpExecArray | null = SIGNAL_PREFIX_RE.exec(code)
  while (m !== null) {
    const argsStart = m.index + m[0].length
    const args = extractBalancedArgs(code, argsStart)
    if (args === null) {
      m = SIGNAL_PREFIX_RE.exec(code)
      continue // unbalanced — skip
    }
    // Only rewrite module-scope signals (brace depth 0).
    if (braceDepthAt(code, m.index) === 0) {
      matches.push({
        start: m.index,
        end: argsStart + args.length + 1, // +1 for closing paren
        prefix: m[1] ?? "",
        name: m[2] ?? "",
        args,
      })
    }
    m = SIGNAL_PREFIX_RE.exec(code)
  }
  SIGNAL_PREFIX_RE.lastIndex = 0

  // Replace in reverse to preserve offsets
  let output = code
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, prefix, name, args } = matches[i] as (typeof matches)[number]
    const replacement = `${prefix}__hmr_signal(${escapedId}, ${JSON.stringify(name)}, signal, ${args})`
    output = output.slice(0, start) + replacement + output.slice(end)
  }
  return output
}

function injectHmr(code: string, moduleId: string): string {
  const hasSignals = SIGNAL_PREFIX_RE.test(code)
  SIGNAL_PREFIX_RE.lastIndex = 0

  const hasComponentExport = EXPORT_COMPONENT_RE.test(code)

  // Only inject HMR if the module exports components or has module-scope signals
  if (!hasComponentExport && !hasSignals) return code

  let output = hasSignals ? rewriteSignals(code, moduleId) : code

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

  output = `${output}\n\n${lines.join("\n")}\n`

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
