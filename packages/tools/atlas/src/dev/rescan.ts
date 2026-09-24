/**
 * Re-running the scan for `atlas dev` — in a CHILD PROCESS.
 *
 * ## Why not in-process
 *
 * The scan is not re-entrant. It installs a shared DOM environment, boots a
 * module loader whose Vite graph owns its own copy of the framework, and
 * leaves module-level state behind in both (singleton sentinels, the verify
 * DOM, per-instance registries). A SECOND scan in the same process mounts the
 * catalog against that residue. Measured on `@pyreon/ui-components` (108
 * components, 489 scenarios), two consecutive in-process scans:
 *
 *     run 1:  4.6s   489 verified, 0 failing    654 MB RSS
 *     run 2: 30.5s   469 verified, 20 failing  1076 MB RSS
 *
 * — seven times slower, twenty FALSE failures, and +420 MB that never comes
 * back. Every save in `atlas dev` paid that and pushed the workbench further
 * from what `atlas scan` publishes.
 *
 * Resetting "all module-level state" is not a fix anyone can verify: the state
 * lives in Atlas, in happy-dom, in Vite and in every framework package the
 * project loads, and missing one is the same bug again. A fresh process has
 * none of it by construction, so each rescan is exactly as correct and as fast
 * as the boot scan.
 *
 * The child runs the SAME `runScan` the CLI ships (resolved through the
 * package's own `./cli` export, so it is `lib/` under node and `src/` under
 * bun, whichever the parent is running) and hands the catalog back as the
 * JSON the catalog file already uses.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ComponentIntelligence } from '../core'

/** What the child hands back — the parts of a `ScanResult` the workbench reads. */
export interface ChildScanPayload {
  components: ComponentIntelligence[]
  configPath?: string
  presets?: import('../ui/catalog').WorkbenchPresets
  pages?: Record<string, import('../discover/config').PageMeta>
  parts?: Record<string, string>
  /** As the scan reports them — dirs RELATIVE to the scan's cwd. */
  projects?: { name: string; dir: string }[]
  title?: string
}

export interface ChildScanOptions {
  /** Absolute project root. */
  cwd: string
  /** Directory to scan, relative to `cwd`. */
  dir: string
  /**
   * Module URLs the child imports. Default: the package's own `./cli` and
   * `./core` exports, resolved the way the parent resolves them.
   */
  moduleUrls?: { cli: string; core: string }
  /** The runtime to spawn (default: the parent's, `process.execPath`). */
  execPath?: string
  /**
   * Flags for that runtime (default: the parent's `execArgv`) — so a parent
   * started with `--expose-gc` gives the child the same GC hook, and the leak
   * check means the same thing on a rescan as it did at boot.
   */
  execArgv?: readonly string[]
}

/** The child script. Plain ESM, so it runs unchanged under node and bun. */
export function childScanScript(urls: { cli: string; core: string }, out: string): string {
  return [
    `import { renameSync, writeFileSync } from 'node:fs'`,
    `const { runScan } = await import(${JSON.stringify(urls.cli)})`,
    `const { catalogReplacer } = await import(${JSON.stringify(urls.core)})`,
    `const [cwd, dir] = process.argv.slice(2)`,
    `const scan = await runScan({ cwd, dir, write: false })`,
    // JSON crossing: the component FUNCTION is dropped (the workbench imports
    // it itself), and a derived scenario's args lose whatever JSON cannot
    // carry — exactly the keys the catalog module's `linkableArgs` drops from
    // an in-process scan, so the two paths generate the same module. Authored
    // args keep their marker strings: those are re-read live from the config.
    `const sameAsJson = (v) => JSON.stringify(v, catalogReplacer) === JSON.stringify(v)`,
    `const components = scan.graph.list().map(({ component, ...rest }) => ({`,
    `  ...rest,`,
    `  scenarios: rest.scenarios.map((s) => s.source === 'authored' ? s : {`,
    `    ...s, args: Object.fromEntries(Object.entries(s.args ?? {}).filter(([, v]) => sameAsJson(v))),`,
    `  }),`,
    `}))`,
    `const payload = {`,
    `  components,`,
    `  configPath: scan.configPath, presets: scan.presets, pages: scan.pages,`,
    `  parts: scan.parts, projects: scan.projects, title: scan.title,`,
    `}`,
    // Written, not printed: stdout is shared with whatever the project's code
    // logs while it is imported, and a catalog interleaved with that is not
    // parseable. Tmp-then-rename so the parent never reads half a file.
    `writeFileSync(${JSON.stringify(`${out}.tmp`)}, JSON.stringify(payload, catalogReplacer))`,
    `renameSync(${JSON.stringify(`${out}.tmp`)}, ${JSON.stringify(out)})`,
    // Explicit: a loader's watcher or a dep optimizer can keep the loop alive
    // after the work is done, which would read as a hung rescan.
    `process.exit(0)`,
    '',
  ].join('\n')
}

/** The package's own export, resolved as the running module resolves it. */
function defaultModuleUrls(): { cli: string; core: string } | undefined {
  try {
    return {
      cli: import.meta.resolve('@pyreon/atlas/cli'),
      core: import.meta.resolve('@pyreon/atlas/core'),
    }
  } catch {
    return undefined
  }
}

/** Run one scan in a fresh process and return its catalog. */
export async function scanInChild(options: ChildScanOptions): Promise<ChildScanPayload> {
  const urls = options.moduleUrls ?? defaultModuleUrls()
  if (!urls) {
    throw new Error('[Pyreon] atlas dev: could not resolve @pyreon/atlas/cli to run the rescan in a child process')
  }
  const work = mkdtempSync(join(tmpdir(), 'atlas-rescan-'))
  const out = join(work, 'catalog.json')
  const script = join(work, 'scan.mjs')
  writeFileSync(script, childScanScript(urls, out))
  try {
    const stderr = await new Promise<string>((resolvePromise, reject) => {
      const child = spawn(
        options.execPath ?? process.execPath,
        [...(options.execArgv ?? process.execArgv), script, options.cwd, options.dir],
        { cwd: options.cwd, stdio: ['ignore', 'ignore', 'pipe'] },
      )
      let err = ''
      child.stderr?.on('data', (chunk: Buffer) => {
        // Bounded: a component that logs in a loop must not grow this forever.
        if (err.length < 64_000) err += String(chunk)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolvePromise(err)
        else reject(new Error(`[Pyreon] atlas dev: the rescan process exited with code ${code}${err ? `:\n${err.trim().slice(-2000)}` : ''}`))
      })
    })
    let raw: string
    try {
      raw = readFileSync(out, 'utf8')
    } catch {
      throw new Error(`[Pyreon] atlas dev: the rescan process wrote no catalog${stderr ? `:\n${stderr.trim().slice(-2000)}` : ''}`)
    }
    return JSON.parse(raw) as ChildScanPayload
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
