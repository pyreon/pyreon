/**
 * The `atlas` CLI — point Atlas at a project and get a verified catalog + an AI
 * agent guide, from one command. Uses real file-scanning discovery (#discover)
 * + the recommended plugin pipeline + the AI-assets generator, end-to-end.
 *
 * Output uses `process.stdout`/`stderr` (not `console`) so it stays lint-clean
 * outside the CLI-package allowlist. `runScan` is pure (returns data + writes
 * files); `runCli` is the thin arg-parsing + printing layer a bin invokes.
 */
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createAtlas } from '../index'
import type { CatalogGraph, ComponentIntelligence, Scenario } from '../core'
import { focusComponents } from '../verify/focus'
import { diffVerdicts, formatDiff, readBaselineScenarios, summarizeDiff } from '../verify/diff'
import {
  buildVerifyReport,
  formatCheckTally,
  formatFailures,
  formatNotRun,
} from '../verify/report'
import type { WorkbenchPresets } from '../ui/catalog'
import type { AgentAsset } from '../plugins'
import {
  aiAssetsPlugin,
  authoredScenariosPlugin,
  mountPlugin,
  recommendedPlugins,
  ssrParityPlugin,
} from '../plugins'
import {
  componentLoaderPlugin,
  createModuleLoader,
  type DiscoverOptions,
  fileDiscoveryPlugin,
  buildPackageMap,
  findUnmatched,
  formatUnmatched,
  loadAtlasConfig,
  listComponentFiles,
  dualInstanceDetail,
  isDualInstanceFailure,
  loadRuntime,
  type ModuleLoader,
  type PageMeta,
  type ProjectRoot,
  workspacePackageDirs,
  mergeAlias,
  normalizeAlias,
  projectAlias,
  classifyLoadErrors,
  formatBrokenImports,
  formatPluginVirtuals,
} from '../discover'
import { type DetectedProject, detectProjects } from '../discover/workspace'

export interface ScanOptions extends DiscoverOptions {
  /** output directory for the catalog + guide, relative to cwd (default '.') */
  out?: string
  /** write atlas-catalog.json + atlas-agent-guide.md (default true) */
  write?: boolean
  /**
   * Import each discovered module so runtime checks can mount it (default
   * true). Set false to keep the scan purely static — importing a project's
   * source runs its top-level code.
   */
  mount?: boolean
  /**
   * Verify ONE component (key or bare name) instead of the whole catalog.
   *
   * Discovery still walks everything — a component's file is not known until it
   * does — but decoration and verification, which is where the cost is, run
   * only for the match. An unmatched or ambiguous name is reported on
   * `focusError` rather than silently producing an empty, green scan.
   */
  only?: string
}

export interface ScanResult {
  components: number
  scenarios: number
  /** scenarios a check actually PASSED — not merely produced */
  verified: number
  /** scenarios where a check ran and FAILED */
  failed: number
  /** ids of the failing scenarios, so a red scan names what to look at */
  failing: readonly string[]
  /**
   * Set when `only` matched nothing, or matched ambiguously.
   *
   * A separate field rather than an empty result, because the two are opposite
   * findings that look identical in the counts: a scoped scan that matched
   * nothing reports zero scenarios and zero failures, which reads as a pass.
   */
  focusError?: string
  /** Set when `only` resolved by something other than an exact match. */
  focusNote?: string
  /**
   * The module aliases this scan resolved with — the project's own
   * `resolve.alias` plus any declared in `atlas.config.ts`.
   *
   * Exposed so `atlas dev` and `atlas build` configure their Vite contexts
   * identically. Three servers computing this separately is how the workbench
   * comes to render a component the scan could not load.
   */
  alias?: readonly { find: string | RegExp; replacement: string }[]
  /** Set when the project's vite config exists but could not be read. */
  aliasWarning?: string
  /** scenarios nothing examined. Not a pass; most scenarios are here today. */
  unverified: number
  guide: string
  llms: string
  catalogPath?: string
  guidePath?: string
  /** The built graph itself — `atlas dev` derives the workbench catalog from it. */
  graph: CatalogGraph
  /** The project's atlas.config path, set only when it exports a `wrapper`. */
  configPath?: string
  /** Validated addon presets from atlas.config.ts, when it exports any. */
  presets?: WorkbenchPresets
  /** The site title from atlas.config.ts, when it exports one. */
  title?: string
  /** Per-component presentation overrides from atlas.config.ts, when it exports any. */
  pages?: Record<string, PageMeta>
  /** Monorepo roots from atlas.config.ts, when it declares any. */
  projects?: readonly ProjectRoot[]
  /**
   * Set when an atlas.config.* EXISTS but could not be used, or one of its
   * exports was malformed. Surfaced rather than swallowed: a config that is
   * silently ignored produces a puzzling round of "why is nothing wrapped /
   * grouped / titled?" with nothing to point at.
   */
  configError?: string
  /**
   * The config file that was FOUND, whether or not it loaded.
   *
   * Distinct from `configPath`, which is set only when a config supplies a
   * `wrapper` (the dev server reloads on it). This one answers the plainer
   * question the CLI has to answer before it can tell a reader there is no
   * config: is there a file here at all?
   */
  configFound?: string
  /**
   * Atlas and the project hold DIFFERENT copies of the framework, so nothing
   * was mounted and every scenario is `unverified`.
   *
   * Reported rather than worked around: mounting across two copies produces
   * verdicts about the mismatch, not about the components.
   */
  dualInstance?: boolean
  /**
   * The sentinel's own `A: <path> (vX)` / `B: <path> (vY)` lines — the two
   * resolved module locations. Threaded through so the CLI can print them:
   * the summary alone says WHAT happened, these say WHERE the second copy
   * lives, which is the difference between a one-line fix and lockfile
   * archaeology.
   */
  dualInstanceDetail?: string
  /**
   * Files that export something PascalCase and produced NO component.
   *
   * The catalog cannot report a component it never found, so without this a
   * discovery gap is pure absence — indistinguishable from a project that
   * simply has fewer components.
   */
  unmatched?: readonly import('../discover').UnmatchedFile[]
  /**
   * Files the rocketstyle pass could not LOAD.
   *
   * Separate from `unmatched`, which is about files that loaded and produced
   * nothing. These produced nothing because they THREW, which is a different
   * finding with a different fix — and reporting them as merely "unmatched"
   * would send the reader after the wrong thing.
   */
  loadErrors?: readonly { file: string; message: string }[]
  /**
   * Packages found by scanning the workspace because nothing was configured
   * and the default root was empty.
   *
   * Reported rather than applied silently: a catalog that appeared out of
   * nowhere is a surprise, and the reader needs to know it came from a guess
   * they can pin with `atlas init`.
   */
  autoDetected?: readonly DetectedProject[]
}

/**
 * Detect a monorepo's packages, but ONLY when there is nothing else to scan.
 *
 * The guard is the whole design. Auto-detection that could fire on a project
 * which already works would silently change its catalog — new groups, new keys,
 * a reshuffled sidebar — on an upgrade nobody asked for. So it runs only when
 * the ordinary single-root scan finds ZERO components, which today produces
 * `no components found under ./src` and nothing else.
 *
 * That makes this purely additive: the only behaviour it can change is the
 * behaviour that was already a dead end.
 */
export function autoDetectProjects(
  cwd: string,
  dir: string,
  declared: readonly ProjectRoot[] | undefined,
  deps: {
    hasComponents?: (cwd: string, dir: string) => boolean
    detect?: typeof detectProjects
  } = {},
): DetectedProject[] {
  // An explicit list is the author's decision and is never second-guessed.
  if (declared && declared.length > 0) return []

  const hasComponents =
    deps.hasComponents ?? ((c: string, d: string) => listComponentFiles({ cwd: c, dir: d }).length > 0)
  if (hasComponents(cwd, dir)) return []

  return (deps.detect ?? detectProjects)(cwd, { dir })
}

/**
 * The `{ dir, project }` pairs to scan.
 *
 * `projects` in the config wins over `--dir`: a monorepo that has declared its
 * packages means it, and quietly scanning `src` instead would produce an empty
 * site with nothing to explain it.
 */
export function scanRoots(
  options: Pick<DiscoverOptions, 'dir'>,
  projects: readonly ProjectRoot[] | undefined,
): { dir: string; project?: string }[] {
  if (projects && projects.length > 0) {
    return projects.map((p) => ({ dir: p.dir, project: p.name }))
  }
  // `dir` left undefined rather than defaulted here — `discoverComponents`
  // owns that default, and restating it is how the two come to disagree.
  return [options.dir === undefined ? {} : { dir: options.dir }] as { dir: string }[]
}

/** Discover a project's components, build the verified catalog, emit assets. */
export async function runScan(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? '.'
  const mount = options.mount !== false
  // One module pipeline for both the components and the config, so a config
  // written in JSX compiles exactly the way the components it wraps do.
  // ONE package map for the whole scan, built BEFORE the loader because the
  // loader needs it: a config at the repo root importing the project's own
  // theme is not resolvable by ordinary node resolution (a package manager
  // links a workspace member only into packages that declare it, and the root
  // declares none of them). See `createModuleLoader`.
  //
  // It also feeds prop-type resolution, where a component importing its props
  // from a SIBLING package is the dominant monorepo shape.
  const packages = buildPackageMap(workspacePackageDirs(resolve(cwd)))
  // The project's `resolve.alias`, read from its own vite config BEFORE the
  // loader exists — because the loader is what fails without it. A component
  // importing `~/components/…` does not load, which drops it from the catalog
  // silently, and in `atlas dev` puts an overlay over the whole workbench.
  //
  // Discovered first, config-declared aliases layered on below: the config is
  // itself loaded THROUGH this loader, so its own `alias` cannot be known yet.
  const discoveredAlias = await projectAlias(resolve(cwd))
  let loader: ModuleLoader | undefined = mount
    ? await createModuleLoader(resolve(cwd), packages, discoveredAlias.alias)
    : undefined
  // The project's own config. ALWAYS loaded — not only when mounting.
  //
  // This used to be `loader ? await loadAtlasConfig(...) : { config: {} }`, on
  // the reasoning that a config is "only meaningful when scenarios are actually
  // mounted". That is true of `wrapper` and `theme` and false of everything
  // else: under `--no-mount` the config's `projects`, `title`, `pages` and
  // authored `scenarios` were all silently discarded, so a monorepo scan found
  // nothing and reported it as a project with no components. Without a module
  // loader `loadAtlasConfig` falls back to its runtime loader, which is exactly
  // the degradation that path already documents.
  const loaded = await loadAtlasConfig(cwd, loader)
  // A config that declares its OWN aliases has to reach the loader too, and
  // the loader that read the config was built before those were known. So the
  // loader is rebuilt — only when the config actually adds something, which is
  // the escape-hatch path, not the common one. The alternative (explicit
  // aliases apply to the workbench but not the scan) would mean `atlas dev`
  // renders a component that `atlas scan` cannot find.
  const explicitAlias = normalizeAlias(loaded.config.alias, resolve(cwd))
  const alias = mergeAlias(discoveredAlias.alias, explicitAlias)
  if (loader && explicitAlias.length > 0) {
    await loader.close()
    loader = await createModuleLoader(resolve(cwd), packages, alias)
  }
  // Mount with the framework the COMPONENTS were compiled against — see
  // `loadRuntime`. Undefined means Atlas resolves its own, which is right only
  // when nothing else has loaded a copy.
  let runtimeFailure: string | undefined
  const runtime = loader
    ? await loadRuntime(loader, (message) => {
        runtimeFailure = message
      })
    : undefined
  // Atlas and the project holding different framework copies is not a reason to
  // mount anyway. Mounting still "succeeds" in that state — it just mounts
  // components compiled against one copy using another — so every check reports
  // on the mismatch instead of on the component. Measured on a real workspace,
  // that produced 2051 failing scenarios, none of which were about the code.
  //
  // `unverified` is the truthful answer here, and Atlas already models it as a
  // real state rather than a weak pass, so the honest move is to decline.
  const dualInstance = runtimeFailure !== undefined && isDualInstanceFailure(runtimeFailure)
  // The caught sentinel error already NAMES both module locations + versions —
  // extract them here so the re-report below doesn't drop the one fact that
  // makes the condition diagnosable (see `dualInstanceDetail`'s doc).
  const dualDetail = dualInstance ? dualInstanceDetail(runtimeFailure as string) : undefined
  const canMount = mount && !dualInstance
  // Only when the ordinary root scan finds nothing — see `autoDetectProjects`.
  const autoDetected = autoDetectProjects(cwd, options.dir ?? 'src', loaded.config.projects)
  const effectiveProjects: readonly ProjectRoot[] | undefined =
    loaded.config.projects ?? (autoDetected.length > 0 ? autoDetected : undefined)
  let asset: AgentAsset | undefined
  // Files the rocketstyle pass could not LOAD. Collected rather than logged
  // per-file: one broken import upstream makes every file in a package throw,
  // and 67 identical lines is noise where one line naming the cause is a
  // finding. See `discoverRocketstyle`'s `onLoadError`.
  const rocketstyleLoadErrors: { file: string; message: string }[] = []
  try {
    return await buildScan()
  } finally {
    // A middleware-mode Vite server holds a watcher and an optimizer; leaving
    // it open keeps the process alive after `atlas scan` has printed its
    // summary, which reads as a hang.
    await loader?.close()
  }

  async function buildScan(): Promise<ScanResult> {
    // Recorded by the focus filter below, read after the build. A closure
    // rather than a return value because `createAtlas` owns the pipeline and
    // the outcome is a CLI concern — the same shape `onAsset`/`onLoadError`
    // already use here.
    let focusError: string | undefined
    let focusNote: string | undefined
    const graph = await createAtlas({
      cwd,
      ...(options.only !== undefined
        ? {
            focus: (discovered: readonly ComponentIntelligence[]) => {
              const outcome = focusComponents(discovered, options.only!)
              if (outcome.kind === 'matched') {
                focusNote = outcome.note
                return outcome.components
              }
              focusError = outcome.message
              // Nothing verified, and `focusError` is what stops that reading
              // as a clean run. Returning the full set instead would verify the
              // whole catalog for someone who asked about one component.
              return []
            },
          }
        : {}),
      // The scan assembles the WHOLE pipeline itself — without this,
      // `createAtlas` appends the recommended bundle a SECOND time, including a
      // bare `mountPlugin()` whose default runtime reads Atlas's OWN (empty)
      // reactive graph. Every scenario then mounted twice, and the second
      // instance's all-zero leak reading overwrote the real one — a real leak
      // verified as `pass`. Exposed by the leak check; the double mount itself
      // was invisible while both instances produced identical verdicts.
      preset: 'none',
      plugins: [
        // ONE discovery plugin per root. A monorepo config (`projects`) fans
        // out; everything else is the single default root, unchanged.
        //
        // Several discovery plugins are safe here BECAUSE each stamps its
        // `project`, so the graph keys their components apart. Without that
        // stamp two roots exporting the same name would collapse in the graph's
        // map — which is exactly the bug this fans out to support.
        ...scanRoots(options, effectiveProjects).map((root) =>
          fileDiscoveryPlugin({
            ...options,
            ...root,
            cwd,
            // Rocketstyle components are a call chain, not a typed function, so
            // the static scan cannot see them at all. Detecting them needs the
            // module loaded — the same loader the mount checks use.
            ...(packages.size > 0 ? { packages } : {}),
            ...(loader
              ? {
                  rocketstyle: {
                    loader,
                    theme: loaded.config.theme,
                    onLoadError: (file: string, message: string) => {
                      rocketstyleLoadErrors.push({ file, message })
                    },
                  },
                }
              : {}),
          }),
        ),
        // Between discovery and the recommended bundle: discovery is static, and
        // this is what turns a scanned name into a function the verify stage can
        // MOUNT. Without it every runtime check skips, which is honest but
        // useless — the harness would have no on-ramp.
        ...(loader ? [componentLoaderPlugin(loader)] : []),
        // BEFORE the generators: an authored scenario wins over a generated one
        // with the same id (the generators' dedup skips existing ids).
        ...(loaded.config.scenarios ? [authoredScenariosPlugin(loaded.config.scenarios)] : []),
        ...recommendedPlugins({ mount: false }),
        // Appended AFTER the bundle so it can carry the project's wrapper. The
        // bundle's own entry is disabled above rather than duplicated.
        ...(canMount ? [mountPlugin({ ...loaded.config, ...(runtime ? { runtime } : {}) })] : []),
        // Same gate and same wrapper as the mount check — a scenario that
        // cannot be mounted cannot be hydrated either, and one rendered
        // WITHOUT the project's providers would report a parity failure that is
        // really a missing theme.
        ...(canMount
          ? [ssrParityPlugin({ ...loaded.config, ...(runtime ? { runtime } : {}) })]
          : []),
        aiAssetsPlugin({
          onAsset: (a) => {
            asset = a
          },
        }),
      ],
    }).build()

    const scenarios = graph.scenarios()
    // Three states, not two. `verify.ok` means a check RAN and passed; a verdict
    // with `checked: 0` is unverified, which is neither a pass nor a failure —
    // still a real state while two of the five checks are stubs.
    const verified = scenarios.filter((s) => s.verify?.ok === true).length
    const failing = scenarios
      .filter((s) => s.verify && !s.verify.ok && s.verify.checked > 0)
      .map((s) => s.id)
    // Which files were LOOKED at and produced nothing. Computed from the same
    // roots discovery walked, minus the files that yielded a component — so it
    // is a difference, not a second opinion.
    const producing = new Set(
      graph
        .list()
        .map((c) => c.source)
        .filter((s): s is string => Boolean(s))
        .map((s) => resolve(cwd, s)),
    )
    const scanned = scanRoots(options, effectiveProjects).flatMap((root) =>
      listComponentFiles({ cwd, ...(root.dir !== undefined ? { dir: root.dir } : {}) }).map((f) =>
        resolve(cwd, f),
      ),
    )
    const unmatched = findUnmatched(scanned, producing, {
      readSource: (file) => readFileSync(file, 'utf8'),
    }).map((entry) => ({ ...entry, file: relative(cwd, entry.file) }))

    const result: ScanResult = {
      components: graph.size(),
      scenarios: scenarios.length,
      verified,
      failed: failing.length,
      failing,
      unverified: scenarios.length - verified - failing.length,
      guide: asset ? asset.guide : graph.toAgentGuide(),
      llms: asset ? asset.llms : graph.toLlmsText(),
      graph,
      ...(loaded.config.wrapper && loaded.path ? { configPath: loaded.path } : {}),
      ...(loaded.config.presets ? { presets: loaded.config.presets } : {}),
      ...(loaded.config.title ? { title: loaded.config.title } : {}),
      ...(loaded.config.pages ? { pages: loaded.config.pages } : {}),
      ...(effectiveProjects ? { projects: effectiveProjects } : {}),
      ...(autoDetected.length > 0 ? { autoDetected } : {}),
      ...(loaded.error ? { configError: loaded.error } : {}),
      ...(loaded.path ? { configFound: loaded.path } : {}),
      ...(dualInstance ? { dualInstance: true } : {}),
      ...(dualDetail ? { dualInstanceDetail: dualDetail } : {}),
      ...(unmatched.length > 0 ? { unmatched } : {}),
      ...(rocketstyleLoadErrors.length > 0 ? { loadErrors: rocketstyleLoadErrors } : {}),
      ...(focusError ? { focusError } : {}),
      ...(focusNote ? { focusNote } : {}),
      ...(alias.length > 0 ? { alias } : {}),
      ...(discoveredAlias.warning ? { aliasWarning: discoveredAlias.warning } : {}),
    }

    if (options.write !== false && graph.size() > 0) {
      const outDir = join(cwd, options.out ?? '.')
      result.catalogPath = join(outDir, 'atlas-catalog.json')
      result.guidePath = join(outDir, 'atlas-agent-guide.md')
      // Atomic per file: the two files are consumed as a coherent set (the MCP
      // tools read both), and a plain write exposes a half-written window.
      writeAtomic(result.catalogPath, JSON.stringify(graph.toJSON(), null, 2))
      writeAtomic(result.guidePath, result.guide)
    }
    return result
  }
}

/**
 * Compare a run against the COMMITTED catalog and report the delta.
 *
 * The baseline is `atlas-catalog.json` itself rather than a second file: the
 * catalog is already the record of what was verified, and a parallel baseline
 * would be one more artifact to keep in sync — with the two disagreeing as the
 * failure mode.
 *
 * Returns the exit code. A MISSING or unreadable baseline is exit 0 with a
 * note: nothing to compare is not a regression, and making the first `--check`
 * run red for everybody is how a ratchet gets disabled on day one.
 */
function reportRatchet(catalogPath: string, current: readonly Scenario[]): number {
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(catalogPath, 'utf8'))
  } catch {
    err(
      `atlas: no readable baseline at ${catalogPath} — nothing to compare against. ` +
        `Run \`atlas scan\` and commit the catalog to enable --check.\n`,
    )
    return 0
  }
  const baseline = readBaselineScenarios(raw)
  if (!baseline) {
    err(`atlas: ${catalogPath} is not a readable catalog — skipping the comparison.\n`)
    return 0
  }
  const diff = diffVerdicts(baseline, current)
  out(`atlas --check: ${summarizeDiff(diff)}\n`)
  for (const line of formatDiff(diff)) out(`  ${line}\n`)
  // Only a REGRESSION is a red exit. An improvement is information, and an
  // unchanged run is the common case — neither should fail a build.
  return diff.regressed ? 1 : 0
}

/** Write via tmp-then-rename — a reader sees the old file or the whole new one. */
function writeAtomic(path: string, content: string): void {
  const tmp = `${path}.tmp.${process.pid}`
  writeFileSync(tmp, content)
  try {
    renameSync(tmp, path)
  } catch (error) {
    try {
      unlinkSync(tmp)
    } catch {
      // best-effort cleanup; the rename error is the one worth reporting
    }
    throw error
  }
}

/**
 * How many failing scenarios a whole-catalog scan prints in full.
 *
 * One broken provider fails every scenario in the catalog, and a thousand
 * identical rows bury the summary that explains them. `atlas verify <Component>`
 * is the un-capped view of any one component.
 */
const FAILURE_PRINT_LIMIT = 20

const HELP = `atlas — component workshop + catalog for the Pyreon ecosystem

Usage:
  atlas init [dir]    detect this workspace's packages and write atlas.config.ts —
                      the ONLY file you write; components, controls and
                      scenarios are derived from source, so there are no
                      story files to create or keep in sync
    --force           overwrite an existing config
    --dry-run         print it instead of writing it
    --title <text>    site title (default: the root package name)
  atlas check <Component> [json]
                      validate a proposed usage against the derived contract —
                      catches the value that renders silently wrong
                      (state="primry"). Exits non-zero on findings, so it
                      works in a hook or a CI step
  atlas dev [dir]     start the workbench against <dir>'s real components —
                      catalog derived from source, no stories to write
  atlas scan [dir]    discover components under <dir>/src, build a verified
                      catalog, and write atlas-catalog.json + atlas-agent-guide.md;
                      exits non-zero when any scenario FAILS a check
    --no-mount        purely static scan — never imports (= executes) the
                      project's modules; runtime checks report skip
    --check           RATCHET: compare against the committed atlas-catalog.json
                      instead of rewriting it, and exit non-zero on a
                      REGRESSION. A check that stopped RUNNING counts as one —
                      losing coverage makes the counts improve, which is the
                      one way to "fix" a red catalog that must never read as
                      green
  atlas build [dir]   compile the workbench into a STATIC, deployable site —
                      the same catalog atlas dev serves, with the node-only
                      answers (source, Reactivity Lens) baked in as data
    --out <dir>       output directory (default atlas-dist)
    --title <text>    site title (wins over atlas.config.ts's \`title\`)
    --base <path>     public base path for a subdirectory deploy,
                      e.g. --base /my-repo/ for GitHub Pages
  atlas verify [Component] [dir]
                      re-check ONE component and report WHICH check failed and
                      why — the fast write → verify → fix loop. Only the match
                      is mounted, exercised and hydrated, so this is a question
                      about one component rather than a whole-catalog scan.
                      Omit the name to report every component. Exits non-zero
                      on any failing check, or on a name that matched nothing
    --json            machine-readable report (for agents and CI)
    --check           RATCHET: also report what MOVED since the committed
                      catalog, and exit non-zero on a regression
  atlas verify-browser [dir]
                      run the browser half of verification in real Chromium —
                      reactive coverage measured on the client build, and a
                      per-scenario visual snapshot vs ./atlas-snapshots.
                      Needs playwright-core (optional peer). Merges verdicts
                      into atlas-catalog.json; exits non-zero on visual diffs
    --update-snapshots  re-baseline: overwrite stored snapshots with current
  atlas --help        show this help
`

function out(text: string): void {
  process.stdout.write(text)
}
/**
 * The dual-instance refusal notice, with the two resolved copies named.
 *
 * The locations are the actionable half of this message — without them "align
 * the versions" sends the reader into node_modules archaeology for paths the
 * caught sentinel error already carried (upstream-reported: a manifest revert
 * and a --force reinstall before finding the second copy). `detail` is the
 * sentinel's own `A:`/`B:` lines (see `dualInstanceDetail`); absent, the
 * summary stands alone.
 */
export function formatDualInstanceNotice(detail: string | undefined): string {
  const where = detail
    ? `  The two copies:\n${detail
        .split('\n')
        .map((line) => `    ${line}`)
        .join('\n')}\n`
    : ''
  return (
    `atlas: Atlas and this project hold DIFFERENT copies of the Pyreon framework, ` +
    `so nothing was mounted — every scenario is reported as unverified.\n` +
    where +
    `  Mounting across two copies would produce verdicts about the mismatch ` +
    `rather than about your components, which is worse than no verdict.\n` +
    `  Align the versions (Atlas ships in the same release group as the framework) ` +
    `and re-run to get real verify results.\n`
  )
}

function err(text: string): void {
  process.stderr.write(text)
}

/**
 * Read `--flag=value` or `--flag value`.
 *
 * Both forms, because both are typed by real people and supporting only one
 * means the other silently becomes a positional argument — `atlas build --out
 * docs` would have taken `docs` as the project directory and written the site
 * to the default location, with nothing to indicate the flag was ignored.
 *
 * Reading the value here is only HALF of that, which is worth stating because
 * the half looked like the whole: the positional finder is a separate pass, and
 * it went on claiming `docs` as the directory as well. See `positionalDir`.
 */
export function flagValue(args: readonly string[], flag: string): string | undefined {
  const inline = args.find((a) => a.startsWith(`${flag}=`))
  if (inline) return inline.slice(flag.length + 1)
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const next = args[index + 1]
  // A following flag means the value is missing; treating it as the value would
  // set `--out` to `--title`.
  return next && !next.startsWith('-') ? next : undefined
}

/**
 * Flags that take a VALUE as the next argument.
 *
 * Needed by `positional` below, which otherwise cannot tell `--out dist` (a
 * flag and its value) from `dist` (the directory to scan).
 */
const VALUE_FLAGS = new Set([
  '--out',
  '--title',
  '--base',
  '--dir',
  '--port',
  '--project',
  '--catalog',
  // `--cwd` was missing, and every command that reads a positional alongside it
  // took the PATH as that positional: `atlas check Button --cwd ./ui` parsed
  // `./ui` as the component's args JSON and reported "could not parse the args"
  // for a command line that is entirely correct.
  '--cwd',
])

/**
 * The first positional argument — the directory — skipping flag VALUES.
 *
 * `rest.find((a) => !a.startsWith('-'))` looks right and is wrong: in
 * `atlas build --out dist/atlas` the first non-dash argument is `dist/atlas`,
 * the value of `--out`, so the build scanned its own output directory and
 * reported `no components found under dist/atlas/src` — for a completely
 * ordinary invocation, with nothing in the message pointing at the real cause.
 *
 * All five commands shared the line, so all five shared the bug.
 */
export function positionalArgs(args: readonly string[]): string[] {
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === undefined) continue
    if (arg.startsWith('-')) {
      // `--out=dist` carries its value inline; only the spaced form consumes
      // the NEXT argument.
      if (VALUE_FLAGS.has(arg)) i++
      continue
    }
    positional.push(arg)
  }
  return positional
}

export function positionalDir(args: readonly string[]): string | undefined {
  return positionalArgs(args)[0]
}

/** `{ key: value }` only when set — `exactOptionalPropertyTypes` rejects `undefined`. */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>)
}

/** Parse argv + run a command. Returns the process exit code. */
export async function runCli(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    out(HELP)
    return 0
  }

  if (cmd === 'scan') {
    // `--check` compares against the COMMITTED catalog and does not rewrite it:
    // a ratchet that overwrites its own baseline compares a run to itself and
    // can never report a regression again.
    const ratchet = rest.includes('--check')
    const dir = positionalDir(rest)
    // Importing a project's modules runs its top-level code — a decision the
    // loader's own docs assign to the user, so the CLI has to actually offer
    // it. `--no-mount` keeps the scan purely static.
    const mount = !rest.includes('--no-mount')
    // `--check` must NOT write: a ratchet that overwrites its own baseline
    // compares a run against itself and can never report a regression again.
    const result = await runScan({ cwd: dir ?? '.', mount, ...(ratchet ? { write: false } : {}) })
    // Before the summary: a config that was found and could not be used
    // explains most of what follows (no groups, no title, no projects), and
    // reading it after the counts is reading it too late.
    if (result.configError) err(`atlas: ${result.configError}\n`)
    // Before the summary, for the same reason: it explains why every scenario
    // below says `unverified`, and reading that after the counts is too late.
    if (result.dualInstance) {
      err(formatDualInstanceNotice(result.dualInstanceDetail))
    }
    // A catalog that appeared without any configuration is a surprise unless it
    // says where it came from — and the reader's next question is always "can I
    // change that list?", which `atlas init` answers by writing it down.
    if (result.autoDetected && result.autoDetected.length > 0) {
      // Three states reach here, and "no atlas.config.ts" is true of exactly
      // one of them. It used to be printed for all three: a project whose
      // config had just failed was told it had no config (contradicting the
      // error one line above) and sent off to write a file it already wrote,
      // and a project whose config loaded fine but simply lists no `projects`
      // was told the same. Auto-detection is what fills the gap in every case;
      // WHY the gap exists is what changes the reader's next move.
      const lead = result.configError
        ? `atlas: falling back to auto-detection because the config above did not load`
        : result.configFound
          ? `atlas: your config sets no \`projects\``
          : `atlas: no atlas.config.ts`
      const next = result.configError
        ? `  Fix the config to get your theme, wrapper and groups back.\n`
        : `  Run \`atlas init\` to write that list down and edit it.\n`
      err(
        `${lead} — detected ${result.autoDetected.length} workspace package(s): ` +
          `${result.autoDetected.map((p) => p.name).join(', ')}.\n${next}`,
      )
    }
    if (result.components === 0) {
      err(`atlas: no components found under ${join(dir ?? '.', 'src')}\n`)
      return 1
    }
    // Reports what was actually established. The previous line called every
    // scenario "verified" regardless of whether anything checked it, which is
    // the same claim the catalog and agent guide were fixed for.
    out(
      `atlas: discovered ${result.components} component(s), ${result.scenarios} scenario(s) ` +
        `— ${result.verified} verified, ${result.failed} failing, ` +
        `${result.unverified} unverified.\n`,
    )
    // WHICH check, not how many. Six checks run per scenario, and the one that
    // failed is the whole content of the message — without this line, answering
    // it meant opening the catalog JSON and walking it by hand.
    const report = buildVerifyReport(result.graph.scenarios())
    out(`  checks: ${formatCheckTally(report.tallies)}\n`)
    for (const line of formatNotRun(report.tallies)) out(`  ${line}\n`)
    if (result.catalogPath) out(`  → ${result.catalogPath}\n  → ${result.guidePath}\n`)
    // What the scan LOOKED at and could not catalogue. Not a failure — a
    // provider or a schema belongs in that list too — but a component you
    // expected and cannot find will be in it, and without this the only
    // evidence of a discovery gap is a number that is quietly too small.
    // BEFORE the unmatched list: a file that threw is reported there too (as
    // "a chained/member call … needs `theme`"), and that reading sends the
    // reader to their config when the real cause is an import that does not
    // resolve. The load error is the actionable one, so it goes first.
    if (result.loadErrors && result.loadErrors.length > 0) {
      // Split by KIND, not just grouped by message. A `virtual:` id is a module
      // a build plugin synthesises — the import is correct and only
      // unresolvable because Atlas does not run that plugin — so the old
      // blanket "fix the import and re-run" was wrong advice, printed on every
      // scan of every zero app. See `classifyLoadErrors`.
      const groups = classifyLoadErrors(result.loadErrors)
      for (const line of formatBrokenImports(groups)) err(`${line}\n`)
      for (const line of formatPluginVirtuals(groups)) err(`${line}\n`)
    }
    if (result.unmatched && result.unmatched.length > 0) {
      err(`${formatUnmatched(result.unmatched).join('\n')}\n`)
    }
    if (ratchet) {
      // Reported BEFORE the absolute failures below: a reader running --check
      // is asking "did I change anything", and the answer has to lead.
      const code = reportRatchet(
        join(dir ?? '.', 'atlas-catalog.json'),
        result.graph.scenarios(),
      )
      if (code !== 0) return code
    }
    if (result.failed > 0) {
      // A red scan is a red exit — otherwise wiring `atlas scan` into CI gates
      // nothing. The FINDINGS make the failure actionable without opening the
      // JSON; a bare id list named the scenario and withheld the diagnosis.
      //
      // Capped, because a systemic failure produces one row per scenario and a
      // thousand of them buries the summary that explains them. The cap reports
      // itself — a silently truncated list reads as a complete one.
      err(`atlas: ${result.failed} failing scenario(s):\n`)
      for (const line of formatFailures(report.failures, FAILURE_PRINT_LIMIT)) err(`  ${line}\n`)
      err(`  Run \`atlas verify <Component>\` to re-check one component on its own.\n`)
      return 1
    }
    return 0
  }

  if (cmd === 'verify') {
    // `atlas verify Button` — the write → verify → fix loop.
    //
    // Positional component + `--cwd`, matching `atlas check`, which is the
    // closest sibling: both answer a question about ONE named component.
    const positional = positionalArgs(rest)
    const [name] = positional
    const json = rest.includes('--json')
    const result = await runScan({
      cwd: flagValue(rest, '--cwd') ?? '.',
      ...(name !== undefined ? { only: name } : {}),
      // NEVER writes. A scoped run holds one component, and writing that as
      // `atlas-catalog.json` would replace the whole catalog with a
      // one-component view — silently breaking the agent guide, the MCP tools
      // and `atlas check` for every other component until the next full scan.
      write: false,
    })

    // A name that matched nothing is the failure this command most has to get
    // right: the counts for "your typo matched no components" and "everything
    // passed" are identical, and the wrong one is green.
    if (result.focusError) {
      if (json) out(`${JSON.stringify({ ok: false, error: result.focusError }, null, 2)}\n`)
      else err(`atlas: ${result.focusError}\n`)
      return 1
    }

    const report = buildVerifyReport(result.graph.scenarios())
    if (json) {
      out(
        `${JSON.stringify(
          {
            ok: report.failed === 0 && report.verified > 0,
            component: name ?? null,
            ...(result.focusNote ? { note: result.focusNote } : {}),
            ...report,
          },
          null,
          2,
        )}\n`,
      )
    } else {
      if (result.focusNote) err(`atlas: ${result.focusNote}\n`)
      out(
        `atlas verify${name ? ` ${name}` : ''}: ${result.components} component(s), ` +
          `${report.scenarios} scenario(s)\n`,
      )
      out(`  checks: ${formatCheckTally(report.tallies)}\n`)
      for (const line of formatNotRun(report.tallies)) out(`  ${line}\n`)
      // UNCAPPED, unlike the whole-catalog scan: this is a question about one
      // component, and truncating its answer would defeat the command.
      if (report.failures.length > 0) {
        err('\n')
        for (const line of formatFailures(report.failures)) err(`${line}\n`)
      }
      out(
        `\n${report.failed} failing · ${report.verified} verified · ` +
          `${report.unverified} unverified\n`,
      )
    }

    // The ratchet, scoped to the same component. Reported before the absolute
    // verdict for the same reason as `scan --check`: "did I help" is the
    // question, and the answer must lead.
    if (rest.includes('--check') && !json) {
      const code = reportRatchet(
        join(flagValue(rest, '--cwd') ?? '.', 'atlas-catalog.json'),
        result.graph.scenarios(),
      )
      if (code !== 0) return code
    }
    if (report.failed > 0) return 1
    // Nothing verified is NOT a pass. A dual-instance workspace, a component
    // that cannot mount, a scan that found no scenarios — each produces zero
    // failures, and exiting 0 would report "green" for a run that established
    // nothing. That is the false-green this whole catalog is written against.
    if (report.verified === 0) {
      if (!json) {
        err(
          `atlas: nothing was verified — ${report.scenarios} scenario(s), none of which a check ` +
            `could examine. This is not a pass; see the reasons above.\n`,
        )
      }
      return 1
    }
    return 0
  }

  if (cmd === 'verify-browser') {
    const dir = positionalDir(rest)
    const { runBrowserVerify } = await import('../verify-browser/runner')
    try {
      const summary = await runBrowserVerify({
        cwd: dir ?? '.',
        ...(rest.includes('--update-snapshots') ? { updateSnapshots: true } : {}),
      })
      out(
        `atlas verify-browser: ${summary.scenarios} scenario(s) — ` +
          `coverage measured on ${summary.coverageMeasured}, ` +
          `${summary.snapshotsCreated} baseline(s) created, ` +
          `${summary.snapshotsFailed} visual diff(s).\n`,
      )
      if (summary.notDriven.length > 0) {
        out(
          `  ${summary.notDriven.length} scenario(s) not drivable (workbench-host components; ` +
            `browser verdicts stay skip): ${summary.notDriven.join(', ')}\n`,
        )
      }
      if (summary.catalogPath) out(`  → ${summary.catalogPath}\n`)
      return summary.snapshotsFailed > 0 ? 1 : 0
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }
  }

  if (cmd === 'dev') {
    const dir = positionalDir(rest)
    // Both flag forms, via the same reader every other flag uses. This read
    // only `--port=5199`, so `--port 5199` — the form people type, and the one
    // `--out` and `--title` accept — was silently ignored and the server came
    // up on the default port. A flag that is quietly dropped is worse than one
    // that is rejected.
    const portArg = flagValue(rest, '--port')
    const port = portArg !== undefined ? Number(portArg) : undefined
    // Imported lazily: the dev server pulls in Vite, and `atlas scan` must keep
    // working (and starting fast) in a project that has none.
    const { startDevServer } = await import('../dev/server')
    try {
      const handle = await startDevServer({
        cwd: dir ?? '.',
        ...(port !== undefined ? { port } : {}),
      })
      if (handle.components === 0) {
        // Not a hard failure — the server is up and says so — but silence here
        // would look like a broken workbench rather than an empty scan.
        err(
          `atlas: no components found under ${join(dir ?? '.', 'src')}. The workbench is running but empty.\n`,
        )
      }
      out(`atlas dev: ${handle.components} component(s) → ${handle.url}\n`)
      // Resolve never: the server owns the process until interrupted.
      await new Promise<void>(() => {})
      return 0
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }
  }

  if (cmd === 'init') {
    const dir = positionalDir(rest)
    const { runInit } = await import('./init')
    const result = runInit({
      cwd: dir ?? '.',
      force: rest.includes('--force'),
      dryRun: rest.includes('--dry-run'),
      ...optional('title', flagValue(rest, '--title')),
    })

    if (result.kind === 'exists') {
      // Not an error — re-running `init` in a configured project is a
      // reasonable thing to do, and the answer is "you already have one".
      err(
        `atlas: ${result.path} already exists. Pass --force to overwrite it ` +
          `(it is hand-edited — your wrapper, theme and authored scenarios live there).\n`,
      )
      return 1
    }
    if (result.kind === 'nothing-found') {
      err(
        `atlas: found no components under ${result.searched}, and no workspace packages containing any.\n` +
          `  Point it somewhere else: atlas init <dir>\n`,
      )
      return 1
    }

    if (result.kind === 'dry-run') {
      out(`# ${result.path}\n${result.source}`)
      return 0
    }
    out(
      `atlas init: wrote ${result.path}\n` +
        `  title: ${result.title}\n` +
        (result.projects.length > 0
          ? result.projects.map((p) => `  · ${p.name} → ${p.dir}\n`).join('')
          : '  (single package — no `projects` needed)\n') +
        `\nNo story files: components, controls and scenarios are derived from your\n` +
        `source. Run \`atlas dev\` to see them.\n`,
    )
    return 0
  }

  if (cmd === 'check') {
    // `atlas check Button '{"state":"primry"}'` — the catalog as a guardrail.
    //
    // Reads the CATALOG rather than rescanning: checking a usage should be
    // instant, and the answer must be the same one the workbench and the agent
    // guide give. Rescanning here would also make the check disagree with the
    // catalog an agent was handed moments earlier.
    const positional = positionalArgs(rest)
    const [name, argsJson] = positional
    if (!name) {
      err('atlas: usage — atlas check <Component> \'{"prop":"value"}\'\n')
      return 1
    }
    const { runCheck } = await import('./check')
    const result = runCheck({
      cwd: flagValue(rest, '--cwd') ?? '.',
      component: name,
      ...(argsJson !== undefined ? { argsJson } : {}),
    })
    if (result.kind === 'no-catalog') {
      err(`atlas: no atlas-catalog.json found near ${result.searched}. Run \`atlas scan\` first.\n`)
      return 1
    }
    if (result.kind === 'bad-json') {
      err(`atlas: could not parse the args — ${result.reason}\n`)
      return 1
    }
    if (result.kind === 'unknown-component') {
      err(`atlas: ${result.message}\n`)
      return 1
    }
    out(`${result.text}\n`)
    // Non-zero on findings: this is meant to be usable in a hook or a CI step,
    // where "it printed a problem" has to mean "it failed".
    return result.ok ? 0 : 1
  }

  if (cmd === 'build') {
    const dir = positionalDir(rest)
    // Imported lazily, same reason as `dev`: this path pulls in Vite, and
    // `atlas scan` must keep working — and starting fast — without it.
    const { buildStatic } = await import('../build/static')
    try {
      const result = await buildStatic({
        cwd: dir ?? '.',
        ...optional('out', flagValue(rest, '--out')),
        ...optional('title', flagValue(rest, '--title')),
        ...optional('base', flagValue(rest, '--base')),
        onLog: (message) => err(`${message}\n`),
      })
      out(
        `atlas build: ${result.components} component(s) → ${result.outDir}\n` +
          `  title: ${result.title}\n`,
      )
      if (result.warnings.length > 0) {
        // Named, not counted. A site missing one component's Lens is fine; a
        // site missing ALL of them means the compiler is not installed, and the
        // difference is only visible if the reasons are printed.
        err(
          `atlas build: ${result.warnings.length} panel answer(s) could not be baked — ` +
            `those views will report themselves unavailable on the built site.\n`,
        )
      }
      return 0
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }
  }

  err(`atlas: unknown command "${cmd}". Try \`atlas --help\`.\n`)
  return 1
}
