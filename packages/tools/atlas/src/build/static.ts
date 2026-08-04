/**
 * `atlas build` — compile the workbench into a static, deployable site.
 *
 * `atlas dev` needs a machine with the project checked out and Node running.
 * That is the wrong shape for the thing a design system actually needs: a URL
 * a designer, a reviewer, or an agent can open. This produces that URL's
 * contents — a plain directory of static files, deployable to Pages, Netlify,
 * S3, or anything else that serves files.
 *
 * ── What makes this different from "run vite build" ───────────────────────
 *
 * The workbench is not purely a client app. Two of its panels are answered by
 * NODE over the dev RPC channel, and a static site has no Node. Building
 * without addressing that produces a site that LOOKS complete while its Docs
 * source block and Reactivity Lens are permanently dark — the silent-degradation
 * class. So the build BAKES those answers (see `./bake`) and ships them as data.
 *
 * ── Vite is optional, and this is where it stops being optional ───────────
 *
 * Same contract as `atlas dev`: imported dynamically, with a written-out message
 * when it is missing, so `atlas scan` keeps working in a project that has no
 * bundler at all.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runScan } from '../cli/run'
import { discoverComponents } from '../discover'
import { workspaceResolvePlugin } from '../discover/workspace-packages'
import { componentKey, type ComponentIntelligence } from '../core'
import { atlasDevPlugin, builtinMethods, CATALOG_ID, type RpcMethod } from '../dev/plugin'
import type { CatalogEntrySource } from '../dev/catalog-module'
import { bakedRpcScript, bakeRpc } from './bake'
import { collectEntries } from './entries'

export interface BuildOptions {
  /** Project root (default `.`). */
  cwd?: string
  /** Directory to scan, relative to the root (default `src`). */
  dir?: string
  /** Output directory, relative to the root (default `atlas-dist`). */
  out?: string
  /** Site title — wins over `atlas.config.ts`'s `title`. */
  title?: string
  /**
   * Public base path, for a site served from a subdirectory (GitHub Pages
   * project sites are the common case: `--base /my-repo/`). Defaults to `/`.
   */
  base?: string
  /** Receives progress + warning lines (defaults to silence). */
  onLog?: (message: string) => void
}

export interface BuildResult {
  /** Absolute path of the emitted directory. */
  outDir: string
  /** Components the site documents. */
  components: number
  /** Per-component RPC answers that could NOT be baked, with reasons. */
  warnings: readonly string[]
  /** The resolved site title. */
  title: string
}

const NO_VITE =
  '[Pyreon] atlas build needs Vite, which is not installed in this project.\n' +
  '  Install it as a dev dependency:\n\n' +
  '    bun add -d vite @pyreon/vite-plugin\n\n' +
  '  `atlas scan` does not need Vite and keeps working without it.'

/**
 * Where the generated entry lives.
 *
 * Under `node_modules/` on purpose: it is the conventional home for generated
 * build inputs (`.vite`, `.cache`), every project already ignores it, and it
 * disappears with a `rm -rf node_modules`. Writing to the project root instead
 * would leave a stray directory in someone's working tree when a build crashes.
 */
const WORK_DIR = 'node_modules/.atlas-build'

export async function buildStatic(options: BuildOptions = {}): Promise<BuildResult> {
  const root = resolve(options.cwd ?? '.')
  const scanDir = options.dir ?? 'src'
  const scanRoot = resolve(root, scanDir)
  const outDir = resolve(root, options.out ?? 'atlas-dist')
  const log = options.onLog ?? (() => {})

  // ── 1. Derive the catalog ───────────────────────────────────────────────
  // The same pipeline `atlas dev` boots from, for the same reason: one
  // discovery owner. A site built from a different catalog than the dev server
  // shows is a difference nobody would think to look for.
  let components: readonly ComponentIntelligence[]
  let configPath: string | undefined
  let presets: import('../ui/catalog').WorkbenchPresets | undefined
  let configTitle: string | undefined
  let pages: Record<string, import('../discover/config').PageMeta> | undefined
  let projects: readonly { name: string; dir: string }[] | undefined
  let configProblem: string | undefined

  try {
    const scan = await runScan({ cwd: root, dir: scanDir, write: false })
    components = scan.graph.list()
    configPath = scan.configPath
    presets = scan.presets
    configTitle = scan.title
    // A config that was found and could not be used explains the absence of
    // everything it would have configured; silence here reads as "my config
    // does nothing" with no way to find out why.
    if (scan.configError) configProblem = scan.configError
    pages = scan.pages
    // Absolute dirs: grouping resolves each component against ITS OWN project
    // root, which a relative path cannot express once there are several roots.
    projects = scan.projects?.map((pr) => ({ name: pr.name, dir: resolve(root, pr.dir) }))
  } catch (err) {
    // Same degradation contract as `atlas dev`: a failed pipeline falls back to
    // the static walk and SAYS SO, rather than emitting a thin site that looks
    // like the project simply has few components.
    log(
      `atlas build: the scan pipeline failed — falling back to the static walk ` +
        `(no rocketstyle discovery, no scenarios, no atlas.config.ts): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    )
    components = discoverComponents({ cwd: root, dir: scanDir })
  }

  if (configProblem) log(`atlas build: ${configProblem}`)

  const title = options.title ?? configTitle ?? 'atlas'
  const entries: readonly CatalogEntrySource[] = collectEntries(root, components)

  if (entries.length === 0) {
    // A hard failure, not an empty site. An empty site is indistinguishable
    // from a working one whose components all failed to discover, and it would
    // deploy cleanly — the same false-green an empty scan produces.
    throw new Error(
      `[Pyreon] atlas build: no components found under ${resolve(root, scanDir)}. ` +
        'Check `--dir`.',
    )
  }

  // ── 2. Bake the node-only answers ───────────────────────────────────────
  const warnings: string[] = []
  const methods: Record<string, RpcMethod> = builtinMethods({
    root,
    components: entries.map((e) => e.component),
  })
  const baked = await bakeRpc({
    methods,
    // Baked by identity KEY, because the KEY is what the page asks with. Baking
    // by name would key two packages' `Button`s to the same slot — the second
    // overwriting the first, so one component's page would show the other's
    // source on the deployed site with nothing to indicate it.
    components: entries.map((e) => componentKey(e.component)),
    onWarn: (message) => {
      warnings.push(message)
      log(message)
    },
  })

  // ── 3. Generate the build input ─────────────────────────────────────────
  const workDir = resolve(root, WORK_DIR)
  rmSync(workDir, { recursive: true, force: true })
  mkdirSync(workDir, { recursive: true })

  writeFileSync(resolve(workDir, 'entry.js'), staticEntry(title), 'utf8')
  writeFileSync(resolve(workDir, 'index.html'), staticHtml(title, baked), 'utf8')

  // ── 4. Build ────────────────────────────────────────────────────────────
  type ViteBuild = (config: Record<string, unknown>) => Promise<unknown>
  let build: ViteBuild
  try {
    const mod = (await import('vite')) as unknown as { build: ViteBuild }
    build = mod.build
  } catch {
    throw new Error(NO_VITE)
  }

  const factory = await loadPyreonPlugin()

  try {
    await build({
      // Root is the GENERATED directory, not the project.
      //
      // Vite derives an html output's path from its location relative to the
      // root, so building the project as root would emit the page at
      // `dist/node_modules/.atlas-build/index.html`. Rooting at the generated
      // directory puts it at `dist/index.html`, which is the only path a static
      // host will serve as the site. Component imports are absolute and node
      // resolution walks UP into the project's own `node_modules`, so nothing
      // else depends on the root being the project.
      root: workDir,
      base: options.base ?? '/',
      configFile: false,
      logLevel: 'warn',
      plugins: [
        workspaceResolvePlugin(root),
        // Resolve the framework for the GENERATED entry.
        //
        // `entry.js` is written into `<project>/node_modules/.atlas-build/`, so
        // the bundler resolves its imports by walking up from there — and in a
        // monorepo that lands on the repo root, which declares none of the
        // framework. The build then died with `Rolldown failed to resolve
        // import "@pyreon/runtime-dom"`, on an ordinary installed project.
        //
        // Same lookup the module loader uses, and the same argument: the
        // workspace declares where its packages are, so this is not a guess.
        // Atlas's own directory is included because the entry is Atlas's UI
        // code — in a matched install both answers are the same copy anyway.
        factory({ devErrorPrinter: false }),
        atlasDevPlugin({
          root,
          // The SCANNED directory, not the project root — groups are derived
          // relative to it. Passing the root here prefixed every group with the
          // scan directory's own name (`Src/Components` instead of
          // `Components`), so the built site's sidebar disagreed with the dev
          // server's for the same project.
          scanRoot,
          entries,
          ...(configPath ? { configPath } : {}),
          ...(presets ? { presets } : {}),
          ...(pages ? { pages } : {}),
          ...(projects ? { projects } : {}),
          title,
        }),
      ],
      build: {
        outDir,
        emptyOutDir: true,
        // The workbench is a tool, not a page in a bundle-size budget. Keeping
        // the report quiet avoids a scary warning about a chunk nobody ships
        // to end users.
        chunkSizeWarningLimit: 4000,
      },
    })
  } finally {
    // The generated input has served its purpose. Left behind it would be
    // picked up by the next `vite dev` glob in some projects, and it is
    // regenerated from scratch on every build anyway.
    rmSync(workDir, { recursive: true, force: true })
  }

  return { outDir, components: entries.length, warnings, title }
}

/** Resolve `@pyreon/vite-plugin`'s factory, with a written-out failure. */
async function loadPyreonPlugin(): Promise<(options?: unknown) => unknown> {
  let mod: { default?: (o?: unknown) => unknown; pyreon?: (o?: unknown) => unknown }
  try {
    mod = (await import('@pyreon/vite-plugin')) as unknown as typeof mod
  } catch {
    throw new Error(
      NO_VITE.replace(
        'atlas build needs Vite, which is not installed',
        '@pyreon/vite-plugin is not installed',
      ),
    )
  }
  const factory = mod.default ?? mod.pyreon
  if (typeof factory !== 'function') {
    throw new Error('[Pyreon] atlas build: @pyreon/vite-plugin did not export a plugin factory')
  }
  return factory
}

/**
 * The built site's entry.
 *
 * A REAL file rather than the dev server's virtual module: an html `<script
 * src>` is resolved by Vite's html plugin as a path relative to the page, and a
 * virtual id has no path to be relative to. The catalog it imports stays
 * virtual — that one is reached by a normal import specifier, which the plugin
 * resolves in build exactly as it does in dev.
 */
export function staticEntry(title: string): string {
  return [
    `import { mount } from '@pyreon/runtime-dom'`,
    `import { h } from '@pyreon/core'`,
    `import { Workbench } from '@pyreon/atlas/ui'`,
    `import { catalog } from ${JSON.stringify(CATALOG_ID)}`,
    '',
    `const root = document.getElementById('atlas-root')`,
    `if (root) {`,
    `  mount(h(Workbench, { catalog, title: ${JSON.stringify(title)} }), root)`,
    `}`,
    '',
  ].join('\n')
}

/** The five characters that matter in an HTML text/attribute context. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * The built site's shell.
 *
 * Deliberately NOT `devHtml`: that one points at a Vite-internal `/@id/` URL
 * that exists only while a dev server is running, and it has no baked payload.
 * Sharing them would mean one of the two is always carrying the other's
 * accidents.
 */
export function staticHtml(title: string, baked: Parameters<typeof bakedRpcScript>[0]): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtml(title)}</title>`,
    '    <link rel="preconnect" href="https://fonts.googleapis.com" />',
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    '    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Public+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />',
    // Before the module script, which is deferred — see `bakedRpcScript`.
    `    ${bakedRpcScript(baked)}`,
    '  </head>',
    '  <body>',
    '    <div id="atlas-root"></div>',
    '    <script type="module" src="./entry.js"></script>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}
