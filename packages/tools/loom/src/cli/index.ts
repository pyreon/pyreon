/**
 * The loom CLI — `loom scan`, `loom dev` and `loom build`. The scan's text
 * output is the deliverable (grouped findings, honest severities);
 * `loom-report.json` is the machine surface. A red workspace is a red exit —
 * wiring `loom scan` into CI gates the dependency fabric.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { version } from '../../package.json' with { type: 'json' }
import { buildReport } from '../core/report'
import {
  loadSharedLoomConfig,
  mergeLoomSettings,
  readManifestLoomSection,
  validateLoomSection,
} from '../core/config'
import type { LoomIssue, LoomReport } from '../core/types'
import { type FlagSpec, type ParsedArgs, parseArgs } from './args'
import type { LoomSettings } from '../core/config'

const HELP = `
  loom <command> [dir] [options]

  Commands:
    scan [dir]          Read the workspace, analyze the dependency fabric, and report:
                        version-sync drift, internal-range lies, runtime cycles,
                        phantom deps, prod-imports-of-dev-deps, peer mismatches,
                        unused declarations. Writes loom-report.json next to the
                        root manifest. Exits non-zero on error-severity findings.
      --strict          Exit non-zero on warnings too.
      --no-imports      Skip the source-import scan (phantom/dev-dep/unused detectors).
      --no-write        Don't write loom-report.json.
      --json            Print the full report as JSON to stdout — and ONLY that, so
                        "loom scan . --json > report.json" is valid JSON (the
                        write notice goes to stderr instead).
    dev [dir]           Serve the observatory UI: layered graph, matrix, cycles,
                        impact ranking, manifests. Needs vite + @pyreon/vite-plugin
                        (optional peers; scan needs none of them).
      --port <n>        Port to listen on (default 5230, or the next free one).
      --no-imports      As for scan.
    build [dir]         Prerender the observatory to a STANDALONE STATIC SITE —
                        one page per view, deployable to any static host or
                        openable from disk. Needs vite + @pyreon/vite-plugin +
                        @pyreon/zero.
      --out <dir>       Output directory (default <dir>/loom-dist).
      --base <path>     Public base path for a subdirectory deploy.
      --no-imports      As for scan.

  Options take a value as "--out x" or "--out=x".

  loom --help | -h      Show this help (also "loom <command> --help").
  loom --version | -v   Print the installed version.

  Configuration (both homes read the same shape; package.json wins per key):
    package.json      "loom": { devPaths, ignore, strict, severity }
    pyreon.config.*   export default { loom: { … } }
                      devPaths  globs that are NOT shipping source
                      ignore    [{ pkg?, dep?, code?, reason }] — reason required
                      strict    exit non-zero on warnings too
                      severity  per-code override: error | warning | info
`

const SPECS: Record<'scan' | 'dev' | 'build', FlagSpec> = {
  scan: { booleans: ['--strict', '--no-imports', '--no-write', '--json', '--help', '-h'], values: [], maxPositionals: 1 },
  dev: { booleans: ['--no-imports', '--help', '-h'], values: ['--port'], maxPositionals: 1 },
  build: { booleans: ['--no-imports', '--help', '-h'], values: ['--out', '--base'], maxPositionals: 1 },
}

function out(text: string): void {
  process.stdout.write(text)
}
function err(text: string): void {
  process.stderr.write(text)
}

const GLYPH = { error: '✗', warning: '▲', info: '·' } as const

function renderIssue(issue: LoomIssue): string {
  const dep = issue.dep ? ` [${issue.dep}]` : ''
  return `  ${GLYPH[issue.severity]} ${issue.code}${dep} — ${issue.message}`
}

function message(error: unknown): string {
  return String((error as Error)?.message ?? error)
}

/** Resolve config and scan. Config is read HERE so `buildReport` stays pure. */
async function scan(dir: string, args: ParsedArgs): Promise<{ report: LoomReport; settings: LoomSettings }> {
  const shared = await loadSharedLoomConfig(dir)
  const manifest = validateLoomSection(readManifestLoomSection(dir), `${dir}/package.json`)
  const settings = mergeLoomSettings(shared, manifest)
  const report = buildReport(dir, { noImports: args.flags.has('--no-imports'), settings })
  const empty = emptyWorkspaceMessage(dir, report)
  if (empty) throw new Error(empty)
  return { report, settings }
}

function readJson(path: string): { workspaces?: unknown } | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as { workspaces?: unknown }
  } catch {
    return undefined
  }
}

/**
 * A scan that found no workspace packages has measured nothing, so it must not
 * read as a clean pass. Running loom from inside a member package is the usual
 * cause, so the nearest ancestor that declares `workspaces` is named.
 */
export function emptyWorkspaceMessage(dir: string, report: LoomReport): string | undefined {
  if (report.stats.internal > 0) return undefined
  const root = resolve(dir)
  const declares = readJson(join(root, 'package.json'))?.workspaces !== undefined
  let lines = declares
    ? `loom: ${root}/package.json declares workspaces, but its globs match no packages.`
    : `loom: ${root} is not a workspace root — its package.json declares no \`workspaces\`.`
  for (let parent = dirname(root); parent !== dirname(parent); parent = dirname(parent)) {
    const manifest = join(parent, 'package.json')
    if (existsSync(manifest) && readJson(manifest)?.workspaces !== undefined) {
      lines += `\n  The workspace root looks like ${parent} — run \`loom scan ${parent}\`.`
      break
    }
  }
  return lines
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    out(HELP)
    return 0
  }
  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    out(`${version}\n`)
    return 0
  }
  if (cmd !== 'scan' && cmd !== 'dev' && cmd !== 'build') {
    err(`loom: unknown command "${cmd}". Try \`loom --help\`.\n`)
    return 1
  }

  const parsed = parseArgs(rest, SPECS[cmd])
  if (!parsed.ok) {
    err(`loom ${cmd}: ${parsed.error} Try \`loom --help\`.\n`)
    return 1
  }
  const args = parsed.args
  if (args.flags.has('--help') || args.flags.has('-h')) {
    out(HELP)
    return 0
  }
  const dir = args.positionals[0] ?? '.'

  if (cmd === 'scan') {
    let report: LoomReport
    let settings: LoomSettings
    try {
      ;({ report, settings } = await scan(dir, args))
    } catch (error) {
      err(`${message(error)}\n`)
      return 1
    }
    const json = args.flags.has('--json')

    if (json) {
      out(JSON.stringify(report, null, 2) + '\n')
    } else {
      const s = report.stats
      out(
        `loom: ${s.internal} workspace package(s), ${s.external} external dep(s), ` +
          `${s.edges} internal edge(s), depth ${s.depth}, ${s.cycles} cycle(s).\n`,
      )
      const bySeverity = (sev: LoomIssue['severity']) => report.issues.filter((i) => i.severity === sev)
      for (const sev of ['error', 'warning', 'info'] as const) {
        const list = bySeverity(sev)
        if (!list.length) continue
        out(`\n${sev.toUpperCase()} · ${list.length}\n`)
        for (const issue of list) out(renderIssue(issue) + '\n')
      }
      if (report.issues.length === 0) out('loom: fabric clean — no findings.\n')
    }

    if (!args.flags.has('--no-write')) {
      const reportPath = join(dir, 'loom-report.json')
      writeFileSync(reportPath, JSON.stringify(report, null, 2))
      // Under `--json`, stdout is a MACHINE channel and may carry nothing but
      // the document — `loom scan . --json > report.json` is the documented
      // machine surface, and a trailing "→ path" line makes that file
      // unparseable by every JSON reader. Narration goes to stderr there, so
      // the notice is still visible in a terminal (both streams land there)
      // while a redirect gets exactly the report. In human mode the narration
      // IS the requested output, so it stays on stdout.
      const notice = `  → ${reportPath}\n`
      if (json) err(notice)
      else out(notice)
    }

    const strict = args.flags.has('--strict') || settings.strict === true
    const red = report.stats.errors > 0 || (strict && report.stats.warnings > 0)
    if (red) {
      err(
        `loom: ${report.stats.errors} error(s)` +
          (strict ? ` + ${report.stats.warnings} warning(s) (strict)` : '') +
          '\n',
      )
      return 1
    }
    return 0
  }

  if (cmd === 'build') {
    let report: LoomReport
    try {
      ;({ report } = await scan(dir, args))
    } catch (error) {
      err(`${message(error)}\n`)
      return 1
    }
    // The default sits next to the scanned workspace, like loom-report.json.
    // An explicit --out is a path the user typed, so it is read against cwd.
    const outOpt = args.values.get('--out') ?? join(dir, 'loom-dist')
    const base = args.values.get('--base')
    try {
      const { buildStaticSite } = await import('../build/static-site')
      const outDir = await buildStaticSite({ report, outDir: outOpt, ...(base ? { base } : {}) })
      out(`loom: ${report.stats.internal} package(s) → ${outDir}\n`)
      return 0
    } catch (error) {
      err(`${message(error)}\n`)
      return 1
    }
  }

  // dev
  const portArg = args.values.get('--port')
  let port: number | undefined
  if (portArg !== undefined) {
    port = Number(portArg)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      err(`loom dev: --port must be a whole number from 1 to 65535 (got "${portArg}").\n`)
      return 1
    }
  }
  let settings: LoomSettings
  try {
    // Scanning first gives the same empty-workspace and config errors as
    // `loom scan`, before a server starts on nothing — and resolves the
    // settings, so the UI reports exactly what `loom scan` reports.
    ;({ settings } = await scan(dir, args))
  } catch (error) {
    err(`${message(error)}\n`)
    return 1
  }
  const { startDevServer } = await import('../dev/server')
  try {
    const handle = await startDevServer({
      cwd: dir,
      noImports: args.flags.has('--no-imports'),
      settings,
      ...(port !== undefined ? { port } : {}),
    })
    out(`loom dev: ${handle.packages} package(s) → ${handle.url}\n`)
    await new Promise<void>(() => {})
    return 0
  } catch (error) {
    err(`${message(error)}\n`)
    return 1
  }
}
