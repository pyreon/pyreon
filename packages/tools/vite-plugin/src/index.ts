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

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join as pathJoin, resolve as pathResolve } from 'node:path'
import { generateContext, transformJSX } from '@pyreon/compiler'
import type { Plugin, ViteDevServer } from 'vite'

// Virtual module ID for the HMR runtime
const HMR_RUNTIME_ID = '\0pyreon/hmr-runtime'
const HMR_RUNTIME_IMPORT = 'virtual:pyreon/hmr-runtime'

export type CompatFramework = 'react' | 'preact' | 'vue' | 'solid'

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

// ── Compat JSX import sources ─────────────────────────────────────────────────

const COMPAT_JSX_SOURCE: Record<CompatFramework, string> = {
  react: '@pyreon/react-compat',
  preact: '@pyreon/preact-compat',
  vue: '@pyreon/vue-compat',
  solid: '@pyreon/solid-compat',
}

// ── Compat alias maps ─────────────────────────────────────────────────────────

const COMPAT_ALIASES: Record<CompatFramework, Record<string, string>> = {
  react: {
    react: '@pyreon/react-compat',
    'react/jsx-runtime': '@pyreon/react-compat/jsx-runtime',
    'react/jsx-dev-runtime': '@pyreon/react-compat/jsx-runtime',
    'react-dom': '@pyreon/react-compat/dom',
    'react-dom/client': '@pyreon/react-compat/dom',
  },
  preact: {
    preact: '@pyreon/preact-compat',
    'preact/hooks': '@pyreon/preact-compat/hooks',
    'preact/jsx-runtime': '@pyreon/preact-compat/jsx-runtime',
    'preact/jsx-dev-runtime': '@pyreon/preact-compat/jsx-runtime',
    '@preact/signals': '@pyreon/preact-compat/signals',
  },
  vue: {
    vue: '@pyreon/vue-compat',
    'vue/jsx-runtime': '@pyreon/vue-compat/jsx-runtime',
    'vue/jsx-dev-runtime': '@pyreon/vue-compat/jsx-runtime',
  },
  solid: {
    'solid-js': '@pyreon/solid-compat',
    'solid-js/jsx-runtime': '@pyreon/solid-compat/jsx-runtime',
    'solid-js/jsx-dev-runtime': '@pyreon/solid-compat/jsx-runtime',
  },
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
  if (id === '@pyreon/core/jsx-runtime' || id === '@pyreon/core/jsx-dev-runtime') {
    if (compat === 'react') return '@pyreon/react-compat/jsx-runtime'
    if (compat === 'preact') return '@pyreon/preact-compat/jsx-runtime'
    if (compat === 'vue') return '@pyreon/vue-compat/jsx-runtime'
    if (compat === 'solid') return '@pyreon/solid-compat/jsx-runtime'
  }
  return undefined
}

export default function pyreonPlugin(options?: PyreonPluginOptions): Plugin {
  const ssrConfig = options?.ssr
  const compat = options?.compat
  let isBuild = false
  let projectRoot = ''

  // ── Cross-module signal export registry ─────────────────────────────────
  // Tracks which modules export signal() declarations so imported signals
  // can be auto-called in JSX across file boundaries.
  // Key: normalized module ID, Value: set of exported signal names
  const signalExportRegistry = new Map<string, Set<string>>()
  // Cache resolved import specifiers to avoid redundant resolution calls
  const resolveCache = new Map<string, string | null>()

  return {
    name: 'pyreon',
    enforce: 'pre',

    config(userConfig, env) {
      isBuild = env.command === 'build'
      // Capture the project root for package resolution in resolveId
      projectRoot = userConfig.root ?? process.cwd()

      // Tell Vite's dep scanner not to pre-bundle the aliased framework imports —
      // they resolve to workspace packages via our resolveId hook, not node_modules.
      const optimizeDepsExclude = compat ? Object.keys(COMPAT_ALIASES[compat]) : []

      const jsxSource = compat ? COMPAT_JSX_SOURCE[compat] : '@pyreon/core'

      return {
        // Use "bun" condition for workspace resolution — source .ts/.tsx files
        // for HMR, fast refresh, and type-safe imports.
        resolve: { conditions: ['bun'] },
        optimizeDeps: {
          exclude: optimizeDepsExclude,
        },
        // Vite 8 uses oxc for JSX transform (not esbuildOptions or rolldownOptions)
        oxc: {
          jsx: {
            runtime: 'automatic',
            importSource: jsxSource,
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

    // ── Pre-scan all source files for signal exports ──────────────────────
    async buildStart() {
      // Pre-scan all source files for signal exports so the registry
      // is complete before any transforms run. This solves the build
      // ordering problem where component.tsx is transformed before
      // store.ts — without pre-scanning, the registry would be empty.
      await prescanSignalExports(projectRoot, signalExportRegistry)
    },

    // ── Virtual module + compat alias resolution ─────────────────────────────
    async resolveId(id, importer) {
      if (id === HMR_RUNTIME_IMPORT) return HMR_RUNTIME_ID
      const target = getCompatTarget(compat, id)
      if (!target) return

      // Vite 8 resolves the "bun" condition natively via resolve.conditions.
      // Delegate to Vite's resolver instead of manual package.json parsing.
      const resolved = await this.resolve(target, importer, { skipSelf: true })
      return resolved?.id
    },

    load(id) {
      if (id === HMR_RUNTIME_ID) {
        return HMR_RUNTIME_SOURCE
      }
    },

    async transform(code, id, transformOptions) {
      const ext = getExt(id)
      if (ext !== '.tsx' && ext !== '.jsx' && ext !== '.pyreon') return

      // In compat mode, skip Pyreon's reactive JSX transform but apply
      // attribute renames (className → class, htmlFor → for) so source code
      // that uses React-style attribute names works correctly.
      if (compat === 'react' || compat === 'preact' || compat === 'vue' || compat === 'solid') {
        if (compat === 'react' || compat === 'preact') {
          const transformed = transformCompatAttributes(code)
          if (transformed !== code) return { code: transformed, map: null }
        }
        return
      }

      // ── Scan for exported signal declarations (populate registry) ──────
      // This runs on every .tsx/.jsx file so the registry is built
      // incrementally. buildStart pre-scans all files, but this handles
      // files created/modified after buildStart (dev mode HMR).
      scanSignalExports(code, normalizeModuleId(id), signalExportRegistry)

      // ── Resolve imported signals from the registry ─────────────────────
      // Check each import in this file: if the imported module has signal
      // exports in the registry, pass them as knownSignals to the compiler.
      const knownSignals = await resolveImportedSignals(code, id, signalExportRegistry, this, resolveCache)

      // Vite passes `ssr: true` when transforming for the SSR module graph
      // (both build --ssr and dev `ssrLoadModule`). The compiler emits plain
      // `h()` calls in that mode so `runtime-server` can render to a string.
      const isSsr = transformOptions?.ssr === true
      const result = transformJSX(code, id, { ssr: isSsr, knownSignals })
      // Surface compiler warnings in the terminal
      for (const w of result.warnings) {
        this.warn(`${w.message} (${id}:${w.line}:${w.column})`)
      }

      let output = result.code

      // ── Dev-only transforms ────────────────────────────────────────────
      if (!isBuild) {
        output = injectHmr(output, id)
        // Inject debug names for signal() calls not rewritten by HMR
        output = injectSignalNames(output)
      }

      return { code: output, map: null }
    },

    // ── SSR dev middleware ───────────────────────────────────────────────────
    configureServer(server: ViteDevServer) {
      // Generate .pyreon/context.json for AI tools on dev server start
      generateProjectContext(projectRoot)

      // Debounced regeneration on file changes
      let contextTimer: ReturnType<typeof setTimeout> | null = null
      server.watcher.on('change', (file) => {
        if (/\.(tsx|jsx|ts|js)$/.test(file) && !file.includes('node_modules')) {
          if (contextTimer) clearTimeout(contextTimer)
          contextTimer = setTimeout(() => generateProjectContext(projectRoot), 500)
        }
      })

      if (!ssrConfig) return

      // Return a function so the middleware runs AFTER Vite's built-in middleware
      // (static files, HMR, etc.) — only handle requests that Vite doesn't serve.
      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.method !== 'GET') return next()
          const url = req.url ?? '/'
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
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
  next: (err?: unknown) => void,
): Promise<void> {
  const mod = await server.ssrLoadModule(entry)
  const handler = mod.handler ?? mod.default

  if (typeof handler !== 'function') {
    next()
    return
  }

  const origin = `http://${req.headers.host ?? 'localhost'}`
  const fullUrl = new URL(url, origin)
  const request = new Request(fullUrl.href, {
    method: req.method ?? 'GET',
    headers: Object.entries(req.headers).reduce((h, [k, v]) => {
      if (v) h.set(k, Array.isArray(v) ? v.join(', ') : v)
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

// ── AI context generation ─────────────────────────────────────────────────────

/**
 * Generate .pyreon/context.json — project map for AI coding assistants.
 * Delegates to @pyreon/compiler's unified project scanner.
 */
function generateProjectContext(root: string): void {
  try {
    const context = generateContext(root)
    const outDir = pathJoin(root, '.pyreon')
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
    writeFileSync(pathJoin(outDir, 'context.json'), JSON.stringify(context, null, 2), 'utf-8')
  } catch {
    // Silently fail — context generation is best-effort
  }
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
    if (code[j] === '\\') {
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
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return code.slice(start, i)
    } else if (ch === '"' || ch === "'" || ch === '`') {
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
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '"' || ch === "'" || ch === '`') {
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
        prefix: m[1] ?? '',
        name: m[2] ?? '',
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

/** Check if an argument string contains a top-level comma (i.e. has multiple arguments). */
function hasMultipleArgs(args: string): boolean {
  let depth = 0
  for (const ch of args) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    else if (ch === ',' && depth === 0) return true
  }
  return false
}

/**
 * Inject `{ name: "varName" }` into signal() calls that don't already have
 * an options argument. Only runs in dev mode for debugging/devtools.
 *
 * `const count = signal(0)` → `const count = signal(0, { name: "count" })`
 *
 * Module-scope signals rewritten to __hmr_signal() are naturally skipped
 * because the regex matches `signal(` not `__hmr_signal(`.
 */
function injectSignalNames(code: string): string {
  const re = /(?:const|let)\s+(\w+)\s*=\s*signal\(/gm
  const matches: { start: number; end: number; name: string; args: string }[] = []

  let m: RegExpExecArray | null = re.exec(code)
  while (m !== null) {
    const argsStart = m.index + m[0].length
    const args = extractBalancedArgs(code, argsStart)
    if (args !== null && !hasMultipleArgs(args)) {
      matches.push({ start: argsStart, end: argsStart + args.length, name: m[1] ?? '', args })
    }
    m = re.exec(code)
  }
  re.lastIndex = 0

  let output = code
  for (let i = matches.length - 1; i >= 0; i--) {
    const { start, end, name, args } = matches[i] as (typeof matches)[number]
    output = `${output.slice(0, start)}${args}, { name: ${JSON.stringify(name)} }${output.slice(end)}`
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

  output = `${output}\n\n${lines.join('\n')}\n`

  return output
}

// ── Compat attribute transforms ──────────────────────────────────────────────

/**
 * Transform React-style JSX attribute names to standard HTML attribute names.
 * This is a lightweight string transform that runs on JSX source before OXC's
 * JSX transform converts it to jsx() calls.
 *
 * - `className` → `class`
 * - `htmlFor` → `for`
 *
 * Only matches attribute position in JSX (after `<tag ` or whitespace).
 * Does not transform property access (e.g. `props.className` stays as-is since
 * the compat JSX runtime handles that at call time).
 */
function transformCompatAttributes(code: string): string {
  // Match className/htmlFor in JSX attribute position:
  // After < and tag name, or after whitespace between attributes
  // Pattern: word boundary + attribute name + = (with optional whitespace)
  return code
    .replace(/(\s)className(\s*=)/g, '$1class$2')
    .replace(/(\s)htmlFor(\s*=)/g, '$1for$2')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExt(id: string): string {
  const clean = id.split('?')[0] ?? id
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot) : ''
}

/** Skip Vite-handled asset requests (CSS, images, HMR, etc.) */
function isAssetRequest(url: string): boolean {
  return (
    url.startsWith('/@') || // @vite/client, @id, @fs, etc.
    url.startsWith('/__') || // __open-in-editor, etc.
    url.includes('/node_modules/') ||
    /\.(css|js|ts|tsx|jsx|json|ico|png|jpg|jpeg|gif|svg|woff2?|ttf|eot|map)(\?|$)/.test(url)
  )
}

// ── HMR runtime source (served as virtual module) ─────────────────────────────
//
// Inlined here so it's available without a filesystem read. This is the
// compiled-to-JS version of hmr-runtime.ts — kept in sync manually.

// ─── Cross-module signal auto-call helpers ──────────────────────────────────

/**
 * Normalize a Vite module ID by stripping query strings (?v=..., ?t=...)
 * and resolving to an absolute path for consistent registry lookups.
 */
function normalizeModuleId(id: string): string {
  const queryIndex = id.indexOf('?')
  return queryIndex >= 0 ? id.slice(0, queryIndex) : id
}

/**
 * Pre-scan all source files in the project for signal exports.
 *
 * Called from `buildStart` so the registry is fully populated before any
 * transforms run. This solves the build ordering problem where component.tsx
 * is transformed before store.ts — without pre-scanning, the registry would
 * be empty and imported signals would not be auto-called.
 */
async function prescanSignalExports(root: string, registry: Map<string, Set<string>>): Promise<void> {
  const files: string[] = []

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'lib' || entry === 'build') continue
        const full = pathJoin(dir, entry)
        try {
          const stat = statSync(full)
          if (stat.isDirectory()) walk(full)
          else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(full)
        } catch {
          /* permission error, etc. */
        }
      }
    } catch {
      /* dir doesn't exist */
    }
  }

  walk(root)

  for (const file of files) {
    try {
      const code = readFileSync(file, 'utf-8')
      scanSignalExports(code, file, registry)
    } catch {
      /* read error */
    }
  }
}

/**
 * Scan a module's source for exported signal declarations and register them.
 *
 * Detects patterns:
 *   1. `export const x = signal(...)` — inline export
 *   2. `const x = signal(...); export { x }` — separate declaration + named export
 *   3. `export default signal(...)` — default export (tracked as 'default')
 *
 * Re-exports (`export { x } from './signals'`) are NOT detected — the source
 * module must be scanned directly. This is a known limitation.
 *
 * Uses simple regex — no AST parse needed.
 */
function scanSignalExports(code: string, moduleId: string, registry: Map<string, Set<string>>): void {
  const normalizedId = normalizeModuleId(moduleId)
  let match: RegExpExecArray | null
  const signals = new Set<string>()

  // Pattern 1: export const x = signal(...)
  const EXPORT_CONST_RE = /export\s+const\s+(\w+)\s*=\s*signal\s*[<(]/g
  while ((match = EXPORT_CONST_RE.exec(code)) !== null) {
    signals.add(match[1]!)
  }

  // Pattern 2: const x = signal(...) followed by export { x }
  // First, find all local `const x = signal(` declarations (not exported inline)
  const localSignals = new Set<string>()
  const LOCAL_SIGNAL_RE = /(?:^|[\s;])const\s+(\w+)\s*=\s*signal\s*[<(]/gm
  while ((match = LOCAL_SIGNAL_RE.exec(code)) !== null) {
    localSignals.add(match[1]!)
  }

  // Then check named exports: export { x, y as z }
  if (localSignals.size > 0) {
    const NAMED_EXPORT_RE = /export\s*\{([^}]+)\}/g
    while ((match = NAMED_EXPORT_RE.exec(code)) !== null) {
      // Skip re-exports (export { x } from '...')
      const afterBrace = code.slice(match.index + match[0].length).trimStart()
      if (afterBrace.startsWith('from')) continue

      for (const spec of match[1]!.split(',')) {
        const trimmed = spec.trim()
        if (!trimmed) continue
        const parts = trimmed.split(/\s+as\s+/)
        const localName = parts[0]!.trim()
        const exportedName = (parts[1] ?? parts[0])!.trim()
        if (localSignals.has(localName)) {
          signals.add(exportedName)
        }
      }
    }
  }

  // Pattern 3: export default signal(...) — tracked as 'default'
  if (/export\s+default\s+signal\s*[<(]/.test(code)) {
    signals.add('default')
  }

  if (signals.size > 0) {
    registry.set(normalizedId, signals)
  } else {
    // Clean up if module no longer exports signals (e.g. after edit)
    registry.delete(normalizedId)
  }
}

/**
 * Resolve imported signal names from the signal export registry.
 *
 * For each import in the source, resolves the module and checks if it has
 * signal exports in the registry. Returns the local names of imported signals.
 *
 * Handles named imports (`import { x } from ...`) and default imports
 * (`import x from ...` — matched against 'default' in the registry).
 */
async function resolveImportedSignals(
  code: string,
  _moduleId: string,
  registry: Map<string, Set<string>>,
  pluginCtx: { resolve: (id: string, importer?: string, options?: { skipSelf: boolean }) => Promise<{ id: string } | null> },
  resolveCache: Map<string, string | null>,
): Promise<string[]> {
  if (registry.size === 0) return []

  const knownSignals: string[] = []
  let match: RegExpExecArray | null

  /** Resolve a source specifier to a normalized module ID, using the cache. */
  async function resolveSource(source: string): Promise<string | null> {
    const cacheKey = `${_moduleId}::${source}`
    if (resolveCache.has(cacheKey)) return resolveCache.get(cacheKey) ?? null
    let resolvedId: string | null = null
    try {
      const resolved = await pluginCtx.resolve(source, _moduleId, { skipSelf: true })
      resolvedId = resolved?.id ? normalizeModuleId(resolved.id) : null
    } catch {
      /* resolve error */
    }
    resolveCache.set(cacheKey, resolvedId)
    return resolvedId
  }

  // Named imports: import { name1, name2 as alias } from 'source'
  // Excludes `import type { ... }` — type-only imports have no runtime value
  const IMPORT_RE = /import\s+(?!type\s)\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  while ((match = IMPORT_RE.exec(code)) !== null) {
    const specifiers = match[1]!
    const source = match[2]!

    const resolvedId = await resolveSource(source)
    if (!resolvedId) continue
    const exportedSignals = registry.get(resolvedId)
    if (!exportedSignals) continue

    // Parse import specifiers: "count, theme as t, other"
    for (const spec of specifiers.split(',')) {
      const trimmed = spec.trim()
      if (!trimmed) continue

      const parts = trimmed.split(/\s+as\s+/)
      const importedName = parts[0]!.trim()
      const localName = (parts[1] ?? parts[0])!.trim()

      if (exportedSignals.has(importedName)) {
        knownSignals.push(localName)
      }
    }
  }

  // Default imports: import count from './store'
  // Excludes: `import { ... }`, `import type X`, `import * as X`
  const DEFAULT_IMPORT_RE = /import\s+(?!type\s)(\w+)\s+from\s*['"]([^'"]+)['"]/g
  while ((match = DEFAULT_IMPORT_RE.exec(code)) !== null) {
    // Skip if this is actually a `import type X from` pattern
    const fullMatch = match[0]
    if (/import\s+type\s+/.test(fullMatch)) continue

    const localName = match[1]!
    const source = match[2]!

    const resolvedId = await resolveSource(source)
    if (!resolvedId) continue
    const exportedSignals = registry.get(resolvedId)
    if (!exportedSignals) continue

    if (exportedSignals.has('default')) {
      knownSignals.push(localName)
    }
  }

  return knownSignals
}

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
  const s = signalFn(value, { name: name });

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
