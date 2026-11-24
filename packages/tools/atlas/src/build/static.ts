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
 * ── It is the dev server's app, built ─────────────────────────────────────
 *
 * The workbench is a `@pyreon/zero` app shipped in this package (see
 * `../dev/zero-app`). `atlas dev` serves it; this builds it with zero's SSG
 * pass, every route declared `spa`, and `ssg.paths` naming `/` plus one path
 * per component. zero writes the client shell at each of them, which is what
 * makes `/button/` a real page on a plain file server.
 *
 * Same optional-peer contract as `atlas dev`: Vite, `@pyreon/vite-plugin` and
 * `@pyreon/zero` are imported dynamically, with a written-out message when one
 * is missing, so `atlas scan` keeps working in a project with no bundler.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { runScan } from '../cli/run'
import { discoverComponents } from '../discover'
import { workspaceResolvePlugin } from '../discover/workspace-packages'
import { componentKey, type ComponentIntelligence } from '../core'
import { atlasDevPlugin, builtinMethods, type RpcMethod } from '../dev/plugin'
import { catalogIds, type CatalogEntrySource } from '../dev/catalog-module'
import { appDir, loadZeroStack, missingStackMessage, projectDirs, PYREON_OPTIONS, zeroOptions } from '../dev/zero-app'
import { loadProjectViteConfig, projectConfigFields, tailwindSourcePlugin } from '../dev/project-vite'
import { BAKED_RPC_DIR, bakeRpc, splitBakedRpc } from './bake'
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
   * Must be absolute: the workbench's router and its per-component pages
   * resolve against it.
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
  /** Per-component `<id>/index.html` pages emitted. */
  routedPages: number
}

/** Written into every build output; lets a later build empty the directory. */
export const OUT_MARKER = '.atlas-build-output'
const MARKER_TEXT = 'Written by atlas build. Safe to delete.\n'

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
  const base = options.base ?? '/'
  // Before any work, like the out-dir check below. A relative base used to
  // build a site that worked only at its root; the router and the
  // per-component pages both need an absolute one.
  if (!base.startsWith('/')) {
    throw new Error(
      `[Pyreon] atlas build: --base ${base} is relative. Pass an absolute path — \`/\` or \`/my-repo/\` — ` +
        'the workbench router and its per-component pages resolve against it.',
    )
  }
  // Before any work: the build EMPTIES this directory, so a wrong `--out`
  // would delete whatever is there.
  assertSafeOutDir(outDir, { root, scanRoot, isDefault: options.out === undefined })
  // The CALLER's value, captured before the scan below: that scan runs a Vite
  // server, which sets NODE_ENV=development, so reading it any later would
  // "restore" development onto a caller that never had it set.
  const prevNodeEnv = process.env.NODE_ENV

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
  // Same set the scan resolved with — see `ScanResult.alias`, and `atlas dev`,
  // which puts it back after `configFile: false` for the same reason.
  let alias: readonly { find: string | RegExp; replacement: string }[] = []

  try {
    const scan = await runScan({ cwd: root, dir: scanDir, write: false })
    components = scan.graph.list()
    alias = scan.alias ?? []
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

  const title = options.title ?? configTitle ?? 'Atlas'
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

  // ── 3. Build the workbench app ──────────────────────────────────────────
  // The SAME ids the catalog module generates — `catalogIds` is the one owner.
  // These are slugs (`core-button`), not identity keys (`Core/Button`): the key
  // carries a `/`, so a path derived from it would neither be one page nor
  // match what the workbench looks itself up by.
  const allIds = catalogIds(entries, {
    root: scanRoot,
    ...(pages ? { pages } : {}),
    ...(projects ? { projects } : {}),
  })
  const ids = pageIds(allIds, log)
  const split = splitBakedRpc(baked, root)

  type ViteBuild = (config: Record<string, unknown>) => Promise<unknown>
  let build: ViteBuild
  try {
    build = ((await import('vite')) as unknown as { build: ViteBuild }).build
  } catch {
    throw new Error(missingStackMessage('build', 'Vite'))
  }
  const stack = await loadZeroStack('build')
  const app = appDir()
  const projectVite = await loadProjectViteConfig(root, 'build')
  if (projectVite.warning) log(`atlas build: ${projectVite.warning}`)
  // Realpath'd like the app root (see `appDir`): the html plugin relativizes
  // the output against the root, and a symlinked half escapes upward. The
  // leaf may not exist yet, so its existing parent is the one resolved.
  mkdirSync(dirname(outDir), { recursive: true })
  const realOutDir = join(realpathSync(dirname(outDir)), basename(outDir))

  // `vite build` sets NODE_ENV=production only when it is UNSET, and the scan
  // above ran a Vite server, which sets it to `development`. So every built
  // site shipped Pyreon's dev build: 56 dev-warning strings and the
  // reactive-devtools stack capture, which alone was a 266 ms boot task. A
  // deployed site has no dev variant, so the value is forced for the build
  // and then restored to the value captured at entry; mutating the caller's
  // environment is not ours to keep.
  process.env.NODE_ENV = 'production'
  try {
    await build({
      // The workbench APP is the root — see `../dev/zero-app`. Component
      // imports are absolute, so nothing depends on the root being the project.
      root: app,
      base,
      configFile: false,
      // The project's `.env*`, `public/` (copied into the site) and Atlas's
      // cache dir, as `atlas dev` uses them — see `projectDirs`.
      ...projectDirs(root),
      // The project's own vite config (`resolve` with the scan's alias —
      // without it a `~/…` import fails the build `atlas dev` serves fine —
      // `css`, `define`, `envPrefix`). See `../dev/project-vite`.
      ...projectConfigFields(projectVite, root, { alias: [...alias] }),
      logLevel: 'warn',
      plugins: [
        // Resolve the framework for Atlas's generated modules. They are
        // virtual, so the bundler has no file location to walk up from — and
        // in a monorepo the walk from the project lands on a root that
        // declares none of the framework. Same lookup the module loader uses.
        workspaceResolvePlugin(root),
        stack.pyreon(PYREON_OPTIONS),
        // `/` plus one page per component, each the client shell (every route
        // is `spa`, see `app/src/routes/_layout.tsx`).
        stack.zero(zeroOptions({ base, paths: ['/', ...ids.map((id) => `/${id}`)] })),
        // The project's own plugins, minus its `pyreon()` / `zero()`.
        tailwindSourcePlugin(root),
        ...projectVite.plugins,
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
          // The inline answers go into the page head — before the deferred
          // module script, which is what reads them.
          baked: { inline: split.inline, base },
        }),
        {
          // The marker that lets a later build empty this directory, emitted
          // WITH the client bundle rather than after the whole build: a build
          // that fails in the SSG pass has already replaced the directory's
          // contents, and without the marker the retry refused to touch it.
          name: 'atlas:build-marker',
          generateBundle(this: { emitFile: (file: Record<string, unknown>) => unknown }) {
            this.emitFile({ type: 'asset', fileName: OUT_MARKER, source: MARKER_TEXT })
          },
        },
      ],
      build: {
        outDir: realOutDir,
        emptyOutDir: true,
        // The workbench is a tool, not a page in a bundle-size budget. Keeping
        // the report quiet avoids a scary warning about a chunk nobody ships
        // to end users.
        chunkSizeWarningLimit: 4000,
      },
    })
    // zero leaves two build-internal files for deploy adapters: Vite's
    // `.vite/` manifest directory and `_pyreon-ssg-paths.json`. A static site
    // has no adapter, so neither belongs in what the user deploys.
    rmSync(join(realOutDir, '.vite'), { recursive: true, force: true })
    rmSync(join(realOutDir, '_pyreon-ssg-paths.json'), { force: true })
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prevNodeEnv
  }

  // The per-component answers, fetched on demand (see `splitBakedRpc`).
  const rpcDir = resolve(outDir, BAKED_RPC_DIR)
  mkdirSync(rpcDir, { recursive: true })
  writeFileSync(resolve(rpcDir, 'index.json'), JSON.stringify(split.index), 'utf8')
  for (const [file, content] of split.files) {
    writeFileSync(resolve(rpcDir, file), JSON.stringify(content), 'utf8')
  }
  // Marks the directory as atlas's own, so the next build may empty it.
  writeFileSync(resolve(outDir, OUT_MARKER), MARKER_TEXT, 'utf8')

  // ── 4. Count what was actually written ──────────────────────────────────
  // From the artifact, not from the list handed to zero: a page that was
  // asked for and not written is exactly what this number exists to expose.
  const routed = ids.filter((id) => existsSync(resolve(outDir, id, 'index.html'))).length
  if (routed < ids.length) {
    log(`atlas build: ${ids.length - routed} of ${ids.length} component page(s) were not written.`)
  }

  return { outDir, components: entries.length, warnings, title, routedPages: routed }
}

/**
 * The component ids that may become a page path.
 *
 * Each becomes a DIRECTORY NAME (`<out>/<id>/index.html`), so a separator or a
 * parent reference would write outside the output. The ids come from
 * `componentKey`, which slugifies, so in practice they are safe — checked
 * rather than trusted anyway: the cost is a string test and the failure mode
 * is arbitrary file placement on a CI machine with write access to more than
 * the output directory.
 */
export function pageIds(ids: readonly string[], log: (message: string) => void): string[] {
  return ids.filter((id) => {
    const safe = id.length > 0 && !id.includes('/') && !id.includes('\\') && id !== '.' && id !== '..'
    if (!safe) log(`atlas build: skipped a component page for the unsafe id ${JSON.stringify(id)}`)
    return safe
  })
}
