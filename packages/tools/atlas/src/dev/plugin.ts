/**
 * The `atlas dev` Vite plugin — serves the workbench, the derived catalog, and
 * the node-only RPC channel.
 *
 * Three virtual modules, so a consuming project needs no files of its own:
 *
 *   `virtual:atlas/catalog` — the derived catalog (see ./catalog-module)
 *   `virtual:atlas/entry`   — mounts `<Workbench>` with it
 *   the served `index.html` — points at the entry
 *
 * ── The RPC channel, designed before its first payload ────────────────────
 *
 * Several panels worth building are NODE-ONLY: the Reactivity Lens needs the
 * TypeScript compiler API and oxc; a lint panel needs `@pyreon/lint`. None can
 * run in the browser, so they need a channel — and a channel retrofitted after
 * the first panel is written tends to take that panel's shape rather than the
 * general one.
 *
 * So it is defined here, once: `POST /__atlas/rpc` with `{ method, params }`,
 * answering `{ ok: true, result }` or `{ ok: false, error }`. Methods are
 * registered in a map, so adding one is a data entry rather than another
 * middleware. It ships with `source` — a real method, not a placeholder — which
 * the docs and Lens panels both need, so the channel is exercised from day one
 * rather than being a promise.
 */
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'
import type { ComponentIntelligence } from '../core'
import { generateCatalogModule, type CatalogEntrySource } from './catalog-module'
import { lensMethod } from './lens'

export const CATALOG_ID = 'virtual:atlas/catalog'
export const ENTRY_ID = 'virtual:atlas/entry'
export const RPC_PATH = '/__atlas/rpc'

/** Vite requires resolved virtual ids to be prefixed with a NUL byte. */
const resolved = (id: string) => `\0${id}`

/**
 * A method the browser may call over the channel.
 *
 * May be async — and the handler MUST await it. The first version of this
 * channel did not: `JSON.stringify({ result: fn(params) })` on a Promise
 * serialises as `{}`, so an async method answered `{"ok":true,"result":{}}`
 * — a successful-looking response carrying nothing. Caught by the Lens, the
 * first async method to use the channel.
 */
export type RpcMethod = (
  params: Record<string, unknown>,
) => unknown | Promise<unknown>

export interface RpcContext {
  /** Absolute project root — every path is resolved against it. */
  root: string
  /** The components discovered for this session. */
  components: readonly ComponentIntelligence[]
}

/**
 * The built-in methods.
 *
 * `source` reads a component's file. It is path-guarded: the parameter is
 * resolved against the project root and rejected if it escapes, because this
 * server is a local dev tool whose port is reachable from anything else on the
 * machine, and "read any file" is not a capability it should hand out.
 */
export function builtinMethods(ctx: RpcContext): Record<string, RpcMethod> {
  return {
    /** `{ component }` → `{ path, source }` for a discovered component. */
    source: (params) => {
      const name = String(params.component ?? '')
      const found = ctx.components.find((c) => c.name === name)
      if (!found?.source) throw new Error(`[Pyreon] atlas dev: no source on record for component "${name}"`)

      const abs = isAbsolute(found.source) ? found.source : resolve(ctx.root, found.source)
      // Path guard: the recorded path came from OUR scan, but treating it as
      // trusted would make any future caller-supplied path a traversal. The
      // separator is part of the check — a bare prefix admits a SIBLING dir
      // (`/proj-evil` passes for root `/proj`).
      if (abs !== ctx.root && !abs.startsWith(ctx.root + sep))
        throw new Error('[Pyreon] atlas dev: refusing to read outside the project root')

      return { path: abs, source: readFileSync(abs, 'utf8') }
    },

    /** `{}` → the discovered component names. Cheap probe that the channel works. */
    components: () => ctx.components.map((c) => c.name),

    /**
     * `{ component }` → the compiler's per-expression live/static verdict for
     * that component's source. Node-only by necessity (TS compiler API + oxc),
     * which is the reason this channel exists.
     */
    lens: lensMethod(ctx),
  }
}

export interface AtlasDevPluginOptions {
  /** Absolute project root. */
  root: string
  /** Absolute path of the scanned directory (used for grouping). */
  scanRoot: string
  /** Discovered components, paired with the file to import them from. */
  entries: readonly CatalogEntrySource[]
  /**
   * Absolute path of the project's `atlas.config.*` — set only when it exports
   * a `wrapper`. The generated catalog imports it in the browser and wraps
   * every render with it (the project's providers around the preview).
   */
  configPath?: string
  /** Validated addon presets from atlas.config.ts (plain JSON — serialized into the catalog). */
  presets?: import('../ui/catalog').WorkbenchPresets
  /** Title shown in the workbench chrome. */
  title?: string
  /** Extra RPC methods (a plugin's node-only half registers here). */
  methods?: Record<string, RpcMethod>
}

/** Minimal Vite plugin shape — typed locally so this module needs no vite import. */
export interface VitePluginLike {
  name: string
  resolveId(id: string): string | undefined
  load(id: string): string | undefined
  configureServer(server: {
    middlewares: {
      use: (
        path: string,
        handler: (req: unknown, res: unknown, next: () => void) => void,
      ) => void
    }
  }): void
  transformIndexHtml?: (html: string) => string
}

export function atlasDevPlugin(options: AtlasDevPluginOptions): VitePluginLike {
  const methods = {
    ...builtinMethods({ root: options.root, components: options.entries.map((e) => e.component) }),
    ...options.methods,
  }

  return {
    name: 'atlas:dev',

    resolveId(id) {
      if (id === CATALOG_ID || id === ENTRY_ID) return resolved(id)
      return undefined
    },

    load(id) {
      if (id === resolved(CATALOG_ID)) {
        return generateCatalogModule(options.entries, {
          root: options.scanRoot,
          ...(options.configPath ? { configPath: options.configPath } : {}),
          ...(options.presets ? { presets: options.presets } : {}),
        })
      }
      if (id === resolved(ENTRY_ID)) {
        return [
          `import { mount } from '@pyreon/runtime-dom'`,
          `import { h } from '@pyreon/core'`,
          // ONLY the PURE half of the coverage kit crosses this import: the
          // node array it scores comes from the page's own
          // `__PYREON_DEVTOOLS__.reactive` bridge (installed by mount — the
          // same reactivity instance the components run on). Importing the
          // STATEFUL half (start/take) here would read THIS import's registry,
          // which Vite's dep graph can resolve to a second instance that never
          // saw a single node — the leak check hit the same split.
          `import { computeReactiveCoverage } from '@pyreon/reactivity/coverage'`,
          `import { Workbench } from '@pyreon/atlas/ui'`,
          `import { catalog } from ${JSON.stringify(CATALOG_ID)}`,
          '',
          // The browser-verify bridge: the runner drives scenarios and reads
          // reactive coverage THROUGH THE PAGE's own module graph — the same
          // instances the components run on. A dev server is a dev tool;
          // exposing its own instrumentation is the point, not a leak.
          `globalThis.__ATLAS_VERIFY__ = { computeReactiveCoverage }`,
          '',
          `const root = document.getElementById('atlas-root')`,
          `if (root) {`,
          `  mount(h(Workbench, { catalog, title: ${JSON.stringify(options.title ?? 'atlas')} }), root)`,
          `}`,
          '',
        ].join('\n')
      }
      return undefined
    },

    configureServer(server) {
      server.middlewares.use(RPC_PATH, (req, res, next) => {
        const request = req as { method?: string; on: (e: string, cb: (c?: unknown) => void) => void }
        const response = res as {
          setHeader: (k: string, v: string) => void
          statusCode: number
          end: (body: string) => void
        }
        if (request.method !== 'POST') return next()

        let body = ''
        request.on('data', (chunk) => {
          body += String(chunk)
        })
        request.on('end', () => {
          // The body handler is deliberately an async IIFE rather than an async
          // listener: an async listener's rejection is unhandled, and would take
          // the dev server down instead of answering with an error.
          void (async () => {
            response.setHeader('Content-Type', 'application/json')
            try {
              const parsed = JSON.parse(body || '{}') as {
                method?: string
                params?: Record<string, unknown>
              }
              const fn = parsed.method ? methods[parsed.method] : undefined
              if (!fn) {
                response.statusCode = 404
                // Naming the known methods turns a typo into a one-step fix.
                response.end(
                  JSON.stringify({
                    ok: false,
                    error: `Unknown method "${parsed.method ?? ''}". Known: ${Object.keys(methods).sort().join(', ')}`,
                  }),
                )
                return
              }
              response.statusCode = 200
              // AWAITED — see the note on `RpcMethod`.
              const result = await fn(parsed.params ?? {})
              response.end(JSON.stringify({ ok: true, result }))
            } catch (err) {
              // A failing method must not take the dev server down.
              response.statusCode = 500
              response.end(
                JSON.stringify({ ok: false, error: String((err as Error)?.message ?? err) }),
              )
            }
          })()
        })
      })
    },
  }
}

/** The HTML shell. Kept here so a consuming project needs no `index.html`. */
/** The five characters that matter in an HTML text/attribute context. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function devHtml(title = 'atlas'): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    // Escaped even though the only caller today passes a programmatic option:
    // an interpolation into HTML is an injection seam the moment a `--title`
    // flag (or any other user-controlled source) reaches it.
    `    <title>${escapeHtml(title)}</title>`,
    // The workbench's typography depends on these three families; without
    // them every `font: inherit` fell back to the BROWSER default (Times) —
    // the single biggest "unstyled" impression the workbench could give.
    '    <link rel="preconnect" href="https://fonts.googleapis.com" />',
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    '    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />',
    '  </head>',
    '  <body>',
    '    <div id="atlas-root"></div>',
    `    <script type="module" src="/@id/${resolved(ENTRY_ID).replace('\0', '__x00__')}"></script>`,
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}
