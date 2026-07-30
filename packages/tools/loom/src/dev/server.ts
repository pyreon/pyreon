/**
 * `loom dev` — the observatory over a real Vite server.
 *
 * Much simpler than the Atlas dev server it is modeled on: Loom never
 * compiles the TARGET project's code. The scan runs in Node at boot (and on
 * every report request — a manifest edit + reload shows fresh truth), and
 * Vite only compiles Loom's OWN UI source through `@pyreon/vite-plugin`.
 * Vite + the plugin are therefore optional peers exactly like Atlas's:
 * `loom scan` works without them, `loom dev` names the install when missing.
 */
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReport } from '../core/report'

export interface DevServerOptions {
  /** Workspace root (default `.`). */
  cwd?: string
  /** Port (default 5230). */
  port?: number
  /** Brand label in the header (default `loom`). */
  brand?: string
}

export interface DevServerHandle {
  url: string
  packages: number
  close(): Promise<void>
}

const NO_VITE =
  '[Pyreon] loom dev needs Vite, which is not installed in this project.\n' +
  '  Install it as a dev dependency:\n\n' +
  '    bun add -d vite @pyreon/vite-plugin\n\n' +
  '  `loom scan` does not need Vite and keeps working without it.'

const ENTRY_ID = 'virtual:loom/entry'

/**
 * The UI module's ABSOLUTE path, resolved from THIS module's location — never
 * the bare `@pyreon/loom/ui` specifier. The target workspace being scanned
 * does NOT generally depend on loom (an `npx`-run tool must not require
 * installing itself into the project), so a bare specifier resolves nowhere.
 * From `lib/dev.js` the UI sits at `lib/ui.js` (sibling entry); running from
 * source (bun) it is `src/ui.ts`, which the injected @pyreon/vite-plugin
 * compiles like any project file. The UI's own `@pyreon/*` imports resolve
 * upward from the UI FILE's location — loom's own node_modules — so this
 * works identically installed-in-project, npx-fetched, or in-workspace.
 */
function uiModulePath(): string {
  // Climb from this module's location to the package root — the build may
  // place this function in `lib/_chunks/<hash>.js`, so a fixed sibling path
  // is wrong; the package root is wherever `lib/ui.js` or `src/ui.ts` lives.
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 5; i += 1) {
    const built = join(dir, 'lib', 'ui.js')
    if (existsSync(built)) return built
    const sibling = join(dir, 'ui.js')
    if (existsSync(sibling)) return sibling
    const source = join(dir, 'src', 'ui.ts')
    if (existsSync(source)) return source
    dir = dirname(dir)
  }
  throw new Error('[Pyreon] loom dev: could not locate the observatory UI module next to the loom install')
}
const REPORT_PATH = '/@loom/report.json'
const resolved = (id: string) => `\0${id}`

function devHtml(title: string): string {
  return [
    '<!doctype html>',
    '<html><head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${title}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />',
    '</head><body>',
    '<div id="loom-root"></div>',
    // `src="/@id/…"`, never an inline `import 'virtual:…'` — Vite does not
    // import-analyse inline transformIndexHtml scripts, so the bare virtual
    // specifier would reach the browser and fail with an unsupported scheme
    // (the documented dev-error-printer injection trap).
    `<script type="module" src="/@id/${resolved(ENTRY_ID).replace('\0', '__x00__')}"></script>`,
    '</body></html>',
  ].join('\n')
}

export async function startDevServer(options: DevServerOptions = {}): Promise<DevServerHandle> {
  const root = resolve(options.cwd ?? '.')
  const brand = options.brand ?? 'loom'

  // Boot-time scan: fail LOUDLY here (a dev server over a non-workspace is a
  // misconfiguration, not a state to render).
  const first = buildReport(root)

  type ViteServer = { listen: () => Promise<unknown>; close: () => Promise<void> }
  type CreateServer = (config: Record<string, unknown>) => Promise<ViteServer>
  let createServer: CreateServer
  try {
    const mod = (await import('vite')) as unknown as { createServer: CreateServer }
    createServer = mod.createServer
  } catch {
    throw new Error(NO_VITE)
  }

  let pluginMod: { default?: (o?: unknown) => unknown; pyreon?: (o?: unknown) => unknown }
  try {
    pluginMod = (await import('@pyreon/vite-plugin')) as unknown as typeof pluginMod
  } catch {
    throw new Error(NO_VITE.replace('loom dev needs Vite, which is not installed', '@pyreon/vite-plugin is not installed'))
  }
  const factory = pluginMod.default ?? pluginMod.pyreon
  if (typeof factory !== 'function') {
    throw new Error('[Pyreon] loom dev: @pyreon/vite-plugin did not export a plugin factory')
  }

  const html = devHtml(brand)
  const port = options.port ?? 5230

  const server = await createServer({
    root,
    configFile: false,
    server: { port, strictPort: true },
    optimizeDeps: { entries: [] },
    plugins: [
      factory({ devErrorPrinter: false }),
      {
        name: 'loom:dev',
        resolveId(id: string) {
          if (id === ENTRY_ID) return resolved(id)
          return undefined
        },
        load(id: string) {
          if (id !== resolved(ENTRY_ID)) return undefined
          return [
            `import { mountObservatory } from ${JSON.stringify(uiModulePath())}`,
            '',
            `const res = await fetch(${JSON.stringify(REPORT_PATH)})`,
            `const report = await res.json()`,
            `const root = document.getElementById('loom-root')`,
            `if (root) mountObservatory(root, report, { brand: ${JSON.stringify(brand)} })`,
            '',
          ].join('\n')
        },
        configureServer(inner: {
          middlewares: { use: (h: (req: unknown, res: unknown, next: () => void) => void) => void }
          transformIndexHtml: (url: string, html: string) => Promise<string>
        }) {
          inner.middlewares.use((req, res, next) => {
            const request = req as { url?: string; method?: string }
            const response = res as {
              setHeader: (k: string, v: string) => void
              statusCode: number
              end: (b: string) => void
            }
            const url = (request.url ?? '/').split('?')[0] ?? '/'
            if (url === REPORT_PATH) {
              // Re-scan per request: a manifest edit + browser reload shows
              // fresh truth without restarting the server.
              try {
                response.setHeader('Content-Type', 'application/json')
                response.end(JSON.stringify(buildReport(root)))
              } catch (error) {
                response.statusCode = 500
                response.end(JSON.stringify({ error: String((error as Error)?.message ?? error) }))
              }
              return
            }
            if (request.method !== 'GET' || url.includes('.') || url.startsWith('/@')) return next()
            void inner.transformIndexHtml(url, html).then((page) => {
              response.setHeader('Content-Type', 'text/html')
              response.end(page)
            })
          })
        },
      },
    ],
  })

  await server.listen()
  return {
    url: `http://localhost:${port}/`,
    packages: first.model.packages.length,
    close: () => server.close(),
  }
}
