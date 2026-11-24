/**
 * `atlas dev` — boot the workbench against a project's real components.
 *
 * The gap this closes: every panel Atlas ships was mounted on a workbench that
 * could only be started by hand-wiring a Vite app, which is why the example's
 * own comment said "a real project would generate its catalog via the `atlas
 * dev` CLI" — a promise the CLI did not keep. Until this exists Atlas is a
 * demo, not a tool.
 *
 * The workbench is a `@pyreon/zero` app shipped in this package (see
 * `./zero-app`): this runs it under Vite's dev server with zero's dev mode,
 * the Pyreon compiler, and `atlasDevPlugin` supplying the derived catalog.
 *
 * Vite, `@pyreon/vite-plugin` and `@pyreon/zero` are imported DYNAMICALLY and
 * are optional peers. `atlas scan` must keep working in a project that has no
 * bundler (a library validating its catalog in CI), and a top-level import
 * would drag a dev server into that path — and into anything that imports the
 * CLI at all.
 */
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { discoverComponents } from '../discover'
import { workspaceDirsFor, workspaceResolvePlugin } from '../discover/workspace-packages'
import { collectPyreonPackages } from './pyreon-singletons'
import { collectEntries } from '../build/entries'
import { runScan } from '../cli/run'
import { configCandidatePaths } from '../discover/config'
import { scanInChild } from './rescan'
import type { ComponentIntelligence } from '../core'
import { atlasDevPlugin, type RpcMethod } from './plugin'
import { appDir, loadZeroStack, missingStackMessage, projectDirs, PYREON_OPTIONS, zeroOptions } from './zero-app'
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

// Re-exported, NOT redefined. It lives with `collectEntries`, which is the only
// thing that calls it; a second copy here is how the dev server and the static
// build would come to disagree about which components are infrastructure.
export { importsAtlas } from '../build/entries'

/**
 * What a save must touch to re-derive the catalog: the scan root, EVERY
 * project directory (a monorepo's components live there, not under
 * `<root>/src`), and every config-file candidate — including ones that do not
 * exist yet, so creating `atlas.config.ts` mid-session is picked up too.
 */
export function watchTargets(
  root: string,
  scanRoot: string,
  projects: readonly { dir: string }[] | undefined,
): { dirs: string[]; files: string[] } {
  return {
    dirs: [...new Set([scanRoot, ...(projects ?? []).map((p) => p.dir)])],
    files: configCandidatePaths(root),
  }
}

export async function startDevServer(options: DevServerOptions = {}): Promise<DevServerHandle> {
  const root = resolve(options.cwd ?? '.')
  const scanDir = options.dir ?? 'src'
  const scanRoot = resolve(root, scanDir)

  // The dev catalog IS the scan's catalog — ONE discovery owner. Running the
  // full pipeline at boot buys the workbench everything the old static walk
  // could not see: rocketstyle chains, the config's theme + wrapper, and the
  // DERIVED SCENARIOS with their verify verdicts — so the sidebar shows the
  // same states, with the same pass/fail labels, that `atlas scan` publishes.
  // The scan's short-lived module loader closes before the dev server boots.
  //
  // A pipeline that fails to run degrades to the static scan — stated on
  // stderr, never silent.
  let components: readonly ComponentIntelligence[]
  let configPath: string | undefined
  let presets: import('../ui/catalog').WorkbenchPresets | undefined
  let pages: Record<string, import('../discover/config').PageMeta> | undefined
  let parts: Record<string, string> | undefined
  let projects: readonly { name: string; dir: string }[] | undefined
  let configProblem: string | undefined
  let configTitle: string | undefined
  // Same set the scan resolved with — see `ScanResult.alias`. Recomputing it
  // here would let the workbench and the catalog disagree about what resolves.
  let alias: readonly { find: string | RegExp; replacement: string }[] = []
  try {
    const scan = await runScan({ cwd: root, dir: scanDir, write: false })
    components = scan.graph.list()
    configPath = scan.configPath
    presets = scan.presets
    pages = scan.pages
    parts = scan.parts
    // Absolute dirs: grouping resolves each component against ITS OWN project
    // root, which a relative path cannot express once there are several roots.
    projects = scan.projects?.map((pr) => ({ name: pr.name, dir: resolve(root, pr.dir) }))
    configTitle = scan.title
    alias = scan.alias ?? []
    // A config that exists and cannot be read is reported once, here: the
    // consequence (aliased imports fail) shows up as a broken component, and
    // pointing at the cause beats leaving that to be guessed.
    if (scan.aliasWarning) process.stderr.write(`atlas: ${scan.aliasWarning}\n`)
    // A config that was found and could not be used explains the absence of
    // everything it would have configured; silence here reads as "my config
    // does nothing" with no way to find out why.
    if (scan.configError) configProblem = scan.configError
  } catch (err) {
    process.stderr.write(
      `[Pyreon] atlas dev: the scan pipeline failed — falling back to the static walk (no rocketstyle discovery, no scenarios, no atlas.config.ts): ${err instanceof Error ? err.message : String(err)}\n`,
    )
    components = discoverComponents({ cwd: root, dir: scanDir })
  }

  if (configProblem) process.stderr.write(`[Pyreon] atlas dev: ${configProblem}\n`)

  // Shared with `atlas build` — see `../build/entries`. The filtering used to
  // live inline here, which meant the static build would have had to restate
  // it, and a restated filter is a filter that diverges.
  const entries: CatalogEntrySource[] = collectEntries(root, components)

  // Typed structurally, NOT as `typeof import('vite')`: naming Vite's types
  // here would put it in the type graph unconditionally, which defeats the
  // point of the dynamic import — `atlas scan` must typecheck and run in a
  // project that has no Vite at all.
  type ViteServer = { listen: () => Promise<unknown>; close: () => Promise<void> }
  type CreateServer = (config: Record<string, unknown>) => Promise<ViteServer>
  let vite: { createServer: CreateServer; searchForWorkspaceRoot: (dir: string) => string }
  try {
    vite = (await import('vite')) as unknown as typeof vite
  } catch {
    throw new Error(missingStackMessage('dev', 'Vite'))
  }
  const stack = await loadZeroStack('dev')
  const app = appDir()

  // Explicit option wins over the config, which wins over the default — the
  // same precedence `atlas build --title` follows, so a project cannot end up
  // with one title in the dev workbench and another on its deployed site.
  const title = options.title ?? configTitle ?? 'Atlas'

  // Every `@pyreon/*` package any workspace package declares or links — see
  // `./pyreon-singletons` (#3846). The Pyreon plugin only excludes the ones the
  // ROOT manifest declares, so a package only a component package depends on
  // (`@pyreon/store`) was optimized on a cold start while already loaded raw.
  const singletons = collectPyreonPackages(workspaceDirsFor(root))

  const server = await vite.createServer({
    // The workbench APP is the root (zero routes `<root>/src/routes`); the
    // project is reached by absolute path — see `./zero-app`.
    root: app,
    configFile: false,
    // The project's `.env*`, `public/` and PostCSS config — see `projectDirs`.
    ...projectDirs(root),
    // The project's own `resolve.alias`, put back after `configFile: false`
    // removed it. Without this a single `~/components/…` import fails to
    // resolve and the dev overlay covers the WHOLE workbench, not just that
    // component's card (#2744).
    //
    // `dedupe` pins every `@pyreon/*` to one copy however the import chain
    // reaches it (direct, transitive, from a workspace package's own link).
    resolve: {
      ...(alias.length > 0 ? { alias: [...alias] } : {}),
      ...(singletons.length > 0 ? { dedupe: singletons } : {}),
    },
    // An explicit port is a requirement; the default is a preference. Failing
    // because 5210 is taken — by another workbench, say — made a second
    // `atlas dev` refuse to start with nothing else wrong.
    server: {
      port: options.port ?? 5210,
      strictPort: options.port !== undefined,
      // The project's files are served from outside the root (`/@fs/…`), so
      // its workspace is allowed explicitly, alongside the app's own. From the
      // REAL path: Vite checks the realpath of what it serves, and a project
      // under a symlink (`/tmp`, `/var` on macOS) was otherwise refused.
      fs: {
        allow: [...new Set([vite.searchForWorkspaceRoot(realpathSync(root)), vite.searchForWorkspaceRoot(app)])],
      },
    },
    // Its own dependency cache. Sharing the project's `node_modules/.vite`
    // made the workbench and the project's own dev server invalidate each
    // other on every start ("Re-optimizing dependencies because vite config
    // has changed"), a full re-optimize for both.
    cacheDir: resolve(root, 'node_modules', '.cache', 'atlas-vite'),
    // No crawl: the app's entry reaches the catalog through virtual modules
    // the optimizer's scanner cannot load, and the project's own `index.html`
    // belongs to the project, not the workbench.
    //
    // `exclude` keeps the framework out of the optimizer ENTIRELY, so no
    // import can ever be served both raw and optimized (two instances — the
    // singleton sentinel refuses that, and only on a cold cache).
    optimizeDeps: { entries: [], exclude: singletons },
    plugins: [
      // The workbench entry and catalog are VIRTUAL modules, so their imports
      // are resolved against the Vite root — the project root, which in a
      // monorepo declares none of the framework. Without this the shell served
      // HTTP 200 while the catalog module failed with `Failed to resolve import
      // "@pyreon/core"`, so the page rendered an error rather than components:
      // a dev server that looks up and is not.
      //
      // Same resolver the static build and the module loader use.
      workspaceResolvePlugin(root),
      stack.pyreon(PYREON_OPTIONS),
      stack.zero(zeroOptions({ port: options.port ?? 5210 })),
      atlasDevPlugin({
        root,
        scanRoot,
        entries,
        // The same scan the boot ran, on demand — see `AtlasDevPluginOptions.rescan`.
        //
        // In a CHILD process, not here: a second in-process scan mounts the
        // catalog against the first one's leftover module state — measured 7×
        // slower, with twenty false failures and +420 MB (see `./rescan`).
        rescan: async () => {
          const scan = await scanInChild({ cwd: root, dir: scanDir })
          const nextProjects = scan.projects?.map((pr) => ({ name: pr.name, dir: resolve(root, pr.dir) }))
          return {
            entries: collectEntries(root, scan.components),
            configPath: scan.configPath,
            presets: scan.presets,
            pages: scan.pages,
            parts: scan.parts,
            projects: nextProjects,
            watch: watchTargets(root, scanRoot, nextProjects),
          }
        },
        watch: watchTargets(root, scanRoot, projects),
        // The config file PATH, not the loaded value: the wrapper must wrap
        // the preview in the BROWSER, so the generated module imports it there
        // (through the project's own plugin chain) rather than serializing a
        // Node-loaded function. The scan sets it only when a wrapper actually
        // exists — importing a wrapper-less config into the browser bundle
        // buys nothing and risks dragging node-only code into it.
        ...(configPath ? { configPath } : {}),
        ...(presets ? { presets } : {}),
        ...(pages ? { pages } : {}),
        ...(parts ? { parts } : {}),
        ...(projects ? { projects } : {}),
        title,
        ...(options.methods !== undefined ? { methods: options.methods } : {}),
      }),
    ],
  })

  await server.listen()
  const bound = (server as { resolvedUrls?: { local?: string[] } }).resolvedUrls?.local?.[0]
  return {
    url: bound ?? `http://localhost:${options.port ?? 5210}/`,
    components: entries.length,
    close: () => server.close(),
  }
}
