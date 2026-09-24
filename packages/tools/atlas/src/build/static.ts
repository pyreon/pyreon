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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { runScan } from '../cli/run'
import { discoverComponents } from '../discover'
import { workspaceResolvePlugin } from '../discover/workspace-packages'
import { componentKey, type ComponentIntelligence } from '../core'
import {
  atlasDevPlugin,
  builtinMethods,
  CATALOG_ID,
  routesFlagScript,
  type RpcMethod,
} from '../dev/plugin'
import { catalogIds, type CatalogEntrySource } from '../dev/catalog-module'
import { BAKED_RPC_DIR, bakedRpcScript, bakedRpcUrlScript, bakeRpc, splitBakedRpc, type BakedRpc } from './bake'
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
  /** Per-component `<id>/index.html` pages emitted (0 for a relative base). */
  routedPages: number
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

/** Written into every build output; lets a later build empty the directory. */
export const OUT_MARKER = '.atlas-build-output'

/**
 * Refuse an output directory whose emptying would destroy the user's work.
 *
 * The build empties `outDir` first, and Vite's own guard is off for a
 * directory outside its root, which the output always is. So `--out .`
 * deleted the project, `--out src` replaced the components with the site, and
 * `--out ../anything` emptied a sibling directory. A directory is safe to empty
 * when it is new, empty, or carries the marker a previous build wrote. The
 * default `atlas-dist` and any earlier atlas output (`isEarlierAtlasBuild`)
 * are also accepted, since builds before the marker existed wrote there.
 */
/**
 * Output from a build that predates the marker: its shell mounts into
 * `#atlas-root`, which nothing else writes. Accepting it keeps an upgrade from
 * refusing a directory atlas itself filled.
 */
function isEarlierAtlasBuild(outDir: string): boolean {
  try {
    return readFileSync(resolve(outDir, 'index.html'), 'utf8').includes('id="atlas-root"')
  } catch {
    return false
  }
}

export function assertSafeOutDir(
  outDir: string,
  context: { root: string; scanRoot: string; isDefault: boolean },
): void {
  const inside = (child: string, parent: string) => {
    const rel = relative(parent, child)
    return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && rel !== '..')
  }
  const refuse = (why: string): never => {
    throw new Error(
      `[Pyreon] atlas build: refusing to write to ${outDir} — ${why}. ` +
        'The build empties its output directory first. Choose a new or empty directory, e.g. --out atlas-dist.',
    )
  }
  if (inside(context.root, outDir)) refuse('it contains the project')
  if (inside(outDir, context.scanRoot) || inside(context.scanRoot, outDir)) {
    refuse('it overlaps the component source directory')
  }
  if (context.isDefault || !existsSync(outDir)) return
  let entries: string[]
  try {
    entries = readdirSync(outDir)
  } catch {
    return refuse('it is not a directory')
  }
  if (entries.length > 0 && !entries.includes(OUT_MARKER) && !isEarlierAtlasBuild(outDir)) {
    refuse('it is not empty and was not written by atlas build')
  }
}

export async function buildStatic(options: BuildOptions = {}): Promise<BuildResult> {
  const root = resolve(options.cwd ?? '.')
  const scanDir = options.dir ?? 'src'
  const scanRoot = resolve(root, scanDir)
  const outDir = resolve(root, options.out ?? 'atlas-dist')
  const log = options.onLog ?? (() => {})
  // Before any work: the build EMPTIES this directory, so a wrong `--out`
  // would delete whatever is there.
  assertSafeOutDir(outDir, { root, scanRoot, isDefault: options.out === undefined })

  // ── 1. Derive the catalog ───────────────────────────────────────────────
  // The same pipeline `atlas dev` boots from, for the same reason: one
  // discovery owner. A site built from a different catalog than the dev server
  // shows is a difference nobody would think to look for.
  let components: readonly ComponentIntelligence[]
  let configPath: string | undefined
  let presets: import('../ui/catalog').WorkbenchPresets | undefined
  let configTitle: string | undefined
  let pages: Record<string, import('../discover/config').PageMeta> | undefined
  let parts: Record<string, string> | undefined
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
    parts = scan.parts
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
  const split = splitBakedRpc(baked, root)
  const base = options.base ?? '/'
  writeFileSync(resolve(workDir, 'index.html'), staticHtml(title, split.inline, base), 'utf8')

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

  // `vite build` sets NODE_ENV=production only when it is UNSET, and the scan
  // above ran a Vite server, which sets it to `development`. So every built
  // site shipped Pyreon's dev build: 56 dev-warning strings and the
  // reactive-devtools stack capture, which alone was a 266 ms boot task. A
  // deployed site has no dev variant, so the value is forced for the build
  // and then restored; mutating the caller's environment is not ours to keep.
  const prevNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
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
          ...(parts ? { parts } : {}),
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
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prevNodeEnv
    // The generated input has served its purpose. Left behind it would be
    // picked up by the next `vite dev` glob in some projects, and it is
    // regenerated from scratch on every build anyway.
    rmSync(workDir, { recursive: true, force: true })
  }

  // The per-component answers, fetched on demand (see `splitBakedRpc`).
  const rpcDir = resolve(outDir, BAKED_RPC_DIR)
  mkdirSync(rpcDir, { recursive: true })
  writeFileSync(resolve(rpcDir, 'index.json'), JSON.stringify(split.index), 'utf8')
  for (const [file, content] of split.files) {
    writeFileSync(resolve(rpcDir, file), JSON.stringify(content), 'utf8')
  }
  // Marks the directory as atlas's own, so the next build may empty it.
  writeFileSync(resolve(outDir, OUT_MARKER), 'Written by atlas build. Safe to delete.\n', 'utf8')

  // ── 5. A directory per component ────────────────────────────────────────
  // The SAME ids the catalog module generates — `catalogIds` is the one owner.
  // These are slugs (`core-button`), not identity keys (`Core/Button`): the key
  // carries a `/`, so deriving directories from it would both write outside the
  // component's folder and never match what the page looks itself up by.
  const routed = emitComponentPages(
    outDir,
    catalogIds(entries, {
      root: scanRoot,
      ...(pages ? { pages } : {}),
      ...(projects ? { projects } : {}),
    }),
    options.base ?? '/',
    log,
  )

  return { outDir, components: entries.length, warnings, title, routedPages: routed }
}

/**
 * Emit `<outDir>/<id>/index.html` for every component.
 *
 * Why a copy of the shell rather than anything cleverer: the workbench is
 * client-rendered, so every component page IS the same document — what differs
 * is which component it selects, and it learns that from its own path (see
 * `componentFromPath`). Copying costs a few hundred KB of identical HTML and
 * buys a URL you can paste into a chat, bookmark, or link from a design doc,
 * on a plain file server with no rewrite rules.
 *
 * What this does NOT buy, and the comment exists so nobody assumes it does:
 * the emitted HTML has an EMPTY body until JavaScript runs. These are real
 * URLs, not prerendered pages — a crawler sees the shell's title and nothing
 * else. Rendering the component into the HTML needs SSR, which is a different
 * and much larger change.
 *
 * Skipped for a RELATIVE base. Vite rewrites the shell's asset URLs against
 * the base, and a relative one (`./assets/…`) resolves against the DIRECTORY
 * the document is in — correct at the root, broken one level down. Rather than
 * emit pages that silently fail to load their own JavaScript, this says so and
 * emits none.
 */
export function emitComponentPages(
  outDir: string,
  ids: readonly string[],
  base: string,
  log: (message: string) => void,
): number {
  if (!base.startsWith('/')) {
    log(
      `atlas build: --base ${base} is relative, so per-component pages were NOT emitted ` +
        `(their assets would resolve against the wrong directory). The site works at its ` +
        `root; use an absolute --base to get /<component>/ URLs.`,
    )
    return 0
  }

  let shell: string
  try {
    shell = readFileSync(resolve(outDir, 'index.html'), 'utf8')
  } catch {
    // The build just wrote it, so this is a genuinely broken state rather than
    // a case to paper over.
    log('atlas build: could not read the built index.html — per-component pages were not emitted.')
    return 0
  }

  let written = 0
  for (const id of ids) {
    // The ids come from `componentKey`, which slugifies — but this value
    // becomes a DIRECTORY NAME, so a separator or a parent reference would
    // write outside `outDir`. Checked rather than trusted: the cost is a
    // string test and the failure mode is arbitrary file placement.
    if (id.length === 0 || id.includes('/') || id.includes('\\') || id === '.' || id === '..') {
      log(`atlas build: skipped a component page for the unsafe id ${JSON.stringify(id)}`)
      continue
    }
    const dir = resolve(outDir, id)
    mkdirSync(dir, { recursive: true })
    writeFileSync(resolve(dir, 'index.html'), shell, 'utf8')
    written += 1
  }
  return written
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
export function staticHtml(title: string, baked: BakedRpc, base = '/'): string {
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
    `    ${bakedRpcUrlScript(base)}`,
    `    ${routesFlagScript()}`,
    '  </head>',
    '  <body>',
    '    <div id="atlas-root"></div>',
    '    <script type="module" src="./entry.js"></script>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}
