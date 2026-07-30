/**
 * `atlas dev` — boot the workbench against a project's real components.
 *
 * The gap this closes: every panel Atlas ships was mounted on a workbench that
 * could only be started by hand-wiring a Vite app, which is why the example's
 * own comment said "a real project would generate its catalog via the `atlas
 * dev` CLI" — a promise the CLI did not keep. Until this exists Atlas is a
 * demo, not a tool.
 *
 * Vite is imported DYNAMICALLY and is an optional peer. `atlas scan` must keep
 * working in a project that has no Vite (a library validating its catalog in
 * CI), and a top-level import would drag a dev server into that path — and into
 * anything that imports the CLI at all.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { discoverComponents } from '../discover'
import { atlasDevPlugin, devHtml, type RpcMethod } from './plugin'
import type { CatalogEntrySource } from './catalog-module'

export interface DevServerOptions {
  /** Project root (default `.`). */
  cwd?: string
  /** Directory to scan, relative to the root (default `src`). */
  dir?: string
  /** Port (default 5210). */
  port?: number
  /** Title shown in the workbench chrome. */
  title?: string
  /** Extra RPC methods for node-only panels. */
  methods?: Record<string, RpcMethod>
}

export interface DevServerHandle {
  /** The URL the workbench is served on. */
  url: string
  /** Number of components the catalog was derived from. */
  components: number
  close(): Promise<void>
}

/**
 * Missing-Vite message.
 *
 * Written out rather than letting the raw resolution error surface: "Cannot
 * find package 'vite'" does not tell a library author why a workbench needed
 * one, and the fix (install it) is not obvious from the error.
 */
const NO_VITE =
  '[Pyreon] atlas dev needs Vite, which is not installed in this project.\n' +
  '  Install it as a dev dependency:\n\n' +
  '    bun add -d vite @pyreon/vite-plugin\n\n' +
  '  `atlas scan` does not need Vite and keeps working without it.'

export async function startDevServer(options: DevServerOptions = {}): Promise<DevServerHandle> {
  const root = resolve(options.cwd ?? '.')
  const scanDir = options.dir ?? 'src'
  const scanRoot = resolve(root, scanDir)

  const components = discoverComponents({ cwd: root, dir: scanDir })
  const entries: CatalogEntrySource[] = components
    // A component with no recorded source cannot be imported, so it cannot be
    // rendered. Including it would put an entry in the sidebar that blanks the
    // canvas when selected — worse than not listing it.
    .filter((c) => Boolean(c.source))
    // Skip the workbench's own host component.
    //
    // A project that mounts `<Workbench>` has a component doing so, and
    // discovery finds it like any other. Cataloguing it renders a workbench
    // INSIDE the workbench — every control, panel and sidebar entry duplicated,
    // and every `getByRole` in a user's test suddenly ambiguous. Observed on the
    // workshop example, where `Workshop.tsx` is exactly that host.
    //
    // Detected by import rather than by name: a component that imports
    // `@pyreon/atlas` is workbench infrastructure, whatever it is called. The
    // read is cheap (once per component at boot) and only over files discovery
    // already parsed.
    .filter((c) => {
      try {
        return !readFileSync(resolve(root, c.source!), 'utf8').includes('@pyreon/atlas')
      } catch {
        return true // unreadable — let it through and fail visibly, not silently
      }
    })
    .map((component) => ({
      component,
      file: resolve(root, component.source!),
    }))

  // Typed structurally, NOT as `typeof import('vite')`: naming Vite's types
  // here would put it in the type graph unconditionally, which defeats the
  // point of the dynamic import — `atlas scan` must typecheck and run in a
  // project that has no Vite at all.
  type ViteServer = { listen: () => Promise<unknown>; close: () => Promise<void> }
  type CreateServer = (config: Record<string, unknown>) => Promise<ViteServer>
  let createServer: CreateServer
  try {
    const mod = (await import('vite')) as unknown as { createServer: CreateServer }
    createServer = mod.createServer
  } catch {
    throw new Error(NO_VITE)
  }

  // The Pyreon JSX transform is what makes signal-preserving HMR work. It is
  // optional for the same reason Vite is — but without it the workbench cannot
  // compile the project's `.tsx`, so its absence is fatal HERE while Vite's is
  // merely diagnosable.
  // The try covers ONLY the import: its catch translates "the import failed"
  // into "not installed", and anything else it swallows is masked behind that
  // wrong message. The first cut wrapped the whole block — the explicit
  // did-not-export throw below was eaten by its own catch and reported as a
  // missing install, and a factory that threw when CALLED was reported the same
  // way.
  let mod: { default?: (o?: unknown) => unknown; pyreon?: (o?: unknown) => unknown }
  try {
    mod = (await import('@pyreon/vite-plugin')) as unknown as typeof mod
  } catch {
    throw new Error(
      NO_VITE.replace('atlas dev needs Vite, which is not installed', '@pyreon/vite-plugin is not installed'),
    )
  }
  // The plugin factory is the DEFAULT export; `pyreon` is accepted as a
  // named alias so this keeps working if the package adds one later.
  const factory = mod.default ?? mod.pyreon
  if (typeof factory !== 'function') {
    throw new Error('[Pyreon] atlas dev: @pyreon/vite-plugin did not export a plugin factory')
  }
  // `devErrorPrinter: false` — that feature injects a virtual module importing
  // `@pyreon/compiler/diagnose` into the served app. It is aimed at a user's
  // OWN app, where a thrown component error should print its documented fix;
  // the workbench surfaces component errors in its own canvas instead.
  //
  // It also failed to resolve under this loader (the plugin is imported
  // dynamically, so it resolves through the `bun` condition to source rather
  // than the built `lib/`), and the resulting Vite error OVERLAY covers the
  // page — every click in the workbench is then intercepted by an overlay
  // about a feature the workbench does not use.
  const pyreonPlugin: unknown = factory({ devErrorPrinter: false })

  const html = devHtml(options.title ?? 'atlas')

  const server = await createServer({
    root,
    configFile: false,
    server: { port: options.port ?? 5210, strictPort: true },
    // The workbench entry is VIRTUAL, so Vite must not crawl the project's own
    // `index.html` for dependencies — that file belongs to the consuming app
    // (it may not even exist), and scanning it pre-bundles the wrong graph and
    // reports failures that have nothing to do with the workbench.
    optimizeDeps: { entries: [] },
    plugins: [
      pyreonPlugin,
      atlasDevPlugin({
        root,
        scanRoot,
        entries,
        ...(options.title !== undefined ? { title: options.title } : {}),
        ...(options.methods !== undefined ? { methods: options.methods } : {}),
      }),
      {
        // Serve the workbench shell for any navigation.
        //
        // Registered as a PRE middleware (a direct `use`, not the returned
        // post-hook), because Vite's own html middleware serves the consuming
        // project's `index.html` for `/` — and that file belongs to the app,
        // not the workbench. Post-registration meant the app's page won and the
        // workbench never rendered in any project that has one.
        //
        // Safe as a pre-middleware because it only claims GET navigations: a
        // path containing a dot (a module, an asset) or starting with `/@`
        // (Vite's own namespace) is passed straight through.
        name: 'atlas:dev-html',
        configureServer(inner: {
          middlewares: {
            use: (h: (req: unknown, res: unknown, next: () => void) => void) => void
          }
          transformIndexHtml: (url: string, html: string) => Promise<string>
        }) {
          inner.middlewares.use(async (req, res, next) => {
            const request = req as { url?: string; method?: string }
            const response = res as {
              setHeader: (k: string, v: string) => void
              end: (b: string) => void
            }
            const url = (request.url ?? '/').split('?')[0] ?? '/'
            if (request.method !== 'GET' || url.includes('.') || url.startsWith('/@')) {
              return next()
            }
            response.setHeader('Content-Type', 'text/html')
            response.end(await inner.transformIndexHtml(url, html))
          })
        },
      },
    ],
  })

  await server.listen()
  const port = options.port ?? 5210
  return {
    url: `http://localhost:${port}/`,
    components: entries.length,
    close: () => server.close(),
  }
}
