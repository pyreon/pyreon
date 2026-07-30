/**
 * The `atlas` CLI — point Atlas at a project and get a verified catalog + an AI
 * agent guide, from one command. Uses real file-scanning discovery (#discover)
 * + the recommended plugin pipeline + the AI-assets generator, end-to-end.
 *
 * Output uses `process.stdout`/`stderr` (not `console`) so it stays lint-clean
 * outside the CLI-package allowlist. `runScan` is pure (returns data + writes
 * files); `runCli` is the thin arg-parsing + printing layer a bin invokes.
 */
import { renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createAtlas } from '../index'
import type { AgentAsset } from '../plugins'
import { aiAssetsPlugin, mountPlugin, recommendedPlugins } from '../plugins'
import {
  componentLoaderPlugin,
  createModuleLoader,
  type DiscoverOptions,
  fileDiscoveryPlugin,
  loadAtlasConfig,
  loadRuntime,
  type ModuleLoader,
} from '../discover'

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
  /** scenarios nothing examined. Not a pass; most scenarios are here today. */
  unverified: number
  guide: string
  llms: string
  catalogPath?: string
  guidePath?: string
}

/** Discover a project's components, build the verified catalog, emit assets. */
export async function runScan(options: ScanOptions = {}): Promise<ScanResult> {
  const cwd = options.cwd ?? '.'
  const mount = options.mount !== false
  // One module pipeline for both the components and the config, so a config
  // written in JSX compiles exactly the way the components it wraps do.
  const loader: ModuleLoader | undefined = mount
    ? await createModuleLoader(resolve(cwd))
    : undefined
  // The project's own providers. Only meaningful when scenarios are actually
  // mounted, so it is not loaded — and its absence is not reported — otherwise.
  const loaded = loader ? await loadAtlasConfig(cwd, loader) : { config: {} }
  // Mount with the framework the COMPONENTS were compiled against — see
  // `loadRuntime`. Undefined means Atlas resolves its own, which is right only
  // when nothing else has loaded a copy.
  const runtime = loader ? await loadRuntime(loader) : undefined
  let asset: AgentAsset | undefined
  try {
    return await buildScan()
  } finally {
    // A middleware-mode Vite server holds a watcher and an optimizer; leaving
    // it open keeps the process alive after `atlas scan` has printed its
    // summary, which reads as a hang.
    await loader?.close()
  }

  async function buildScan(): Promise<ScanResult> {
    const graph = await createAtlas({
      cwd,
      plugins: [
        fileDiscoveryPlugin({
        ...options,
        cwd,
        // Rocketstyle components are a call chain, not a typed function, so the
        // static scan cannot see them at all. Detecting them needs the module
        // loaded — the same loader the mount checks use.
        ...(loader ? { rocketstyle: { loader, theme: loaded.config.theme } } : {}),
      }),
        // Between discovery and the recommended bundle: discovery is static, and
        // this is what turns a scanned name into a function the verify stage can
        // MOUNT. Without it every runtime check skips, which is honest but
        // useless — the harness would have no on-ramp.
        ...(loader ? [componentLoaderPlugin(loader)] : []),
        ...recommendedPlugins({ mount: false }),
        // Appended AFTER the bundle so it can carry the project's wrapper. The
        // bundle's own entry is disabled above rather than duplicated.
        ...(mount ? [mountPlugin({ ...loaded.config, ...(runtime ? { runtime } : {}) })] : []),
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
    // still a common state while three of the five checks are stubs.
    const verified = scenarios.filter((s) => s.verify?.ok === true).length
    const failing = scenarios
      .filter((s) => s.verify && !s.verify.ok && s.verify.checked > 0)
      .map((s) => s.id)
    const result: ScanResult = {
      components: graph.size(),
      scenarios: scenarios.length,
      verified,
      failed: failing.length,
      failing,
      unverified: scenarios.length - verified - failing.length,
      guide: asset ? asset.guide : graph.toAgentGuide(),
      llms: asset ? asset.llms : graph.toLlmsText(),
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

const HELP = `atlas — component workshop + catalog for the Pyreon ecosystem

Usage:
  atlas dev [dir]     start the workbench against <dir>'s real components —
                      catalog derived from source, no stories to write
  atlas scan [dir]    discover components under <dir>/src, build a verified
                      catalog, and write atlas-catalog.json + atlas-agent-guide.md;
                      exits non-zero when any scenario FAILS a check
    --no-mount        purely static scan — never imports (= executes) the
                      project's modules; runtime checks report skip
  atlas --help        show this help
`

function out(text: string): void {
  process.stdout.write(text)
}
function err(text: string): void {
  process.stderr.write(text)
}

/** Parse argv + run a command. Returns the process exit code. */
export async function runCli(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    out(HELP)
    return 0
  }

  if (cmd === 'scan') {
    const dir = rest.find((a) => !a.startsWith('-'))
    // Importing a project's modules runs its top-level code — a decision the
    // loader's own docs assign to the user, so the CLI has to actually offer
    // it. `--no-mount` keeps the scan purely static.
    const mount = !rest.includes('--no-mount')
    const result = await runScan({ cwd: dir ?? '.', mount })
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
    if (result.catalogPath) out(`  → ${result.catalogPath}\n  → ${result.guidePath}\n`)
    if (result.failed > 0) {
      // A red scan is a red exit — otherwise wiring `atlas scan` into CI gates
      // nothing. The ids make the failure actionable without opening the JSON.
      err(`atlas: ${result.failed} failing scenario(s): ${result.failing.join(', ')}\n`)
      return 1
    }
    return 0
  }

  if (cmd === 'dev') {
    const dir = rest.find((a) => !a.startsWith('-'))
    const portArg = rest.find((a) => a.startsWith('--port='))
    const port = portArg ? Number(portArg.slice('--port='.length)) : undefined
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

  err(`atlas: unknown command "${cmd}". Try \`atlas --help\`.\n`)
  return 1
}
