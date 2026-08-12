/**
 * The loom CLI — `loom scan [dir]` today, `loom dev [dir]` when the
 * observatory UI lands. The scan's text output is the deliverable (grouped
 * findings, honest severities); `loom-report.json` is the machine surface.
 * A red workspace is a red exit — wiring `loom scan` into CI gates the
 * dependency fabric.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildReport } from '../core/report'
import {
  loadSharedLoomConfig,
  mergeLoomSettings,
  readManifestLoomSection,
  validateLoomSection,
} from '../core/config'
import type { LoomIssue } from '../core/types'

const HELP = `
  loom <command> [options]

  Commands:
    scan [dir]          Read the workspace, analyze the dependency fabric, and report:
                        version-sync drift, internal-range lies, runtime cycles,
                        phantom deps, prod-imports-of-dev-deps, peer mismatches,
                        unused declarations. Writes loom-report.json next to the
                        root manifest. Exits non-zero on error-severity findings.
      --strict          Exit non-zero on warnings too.
      --no-imports      Skip the source-import scan (phantom/dev-dep/unused detectors).
      --no-write        Don't write loom-report.json.
    build [dir]         Prerender the observatory to a STANDALONE STATIC SITE —
                        one page per view, deployable to any static host or
                        openable from disk. Needs vite + @pyreon/vite-plugin +
                        @pyreon/zero (optional peers; scan needs none of them).
      --out=<dir>       Output directory (default loom-dist).
      --base=<path>     Public base path for a subdirectory deploy.
      --json            Print the full report as JSON to stdout — and ONLY that, so
                        "loom scan . --json > report.json" is valid JSON (the
                        write notice goes to stderr instead). Still writes the
                        report unless --no-write.
  loom --help           Show this help.

  Configuration (both homes read the same shape; package.json wins per key):
    package.json      "loom": { devPaths, ignore, strict, severity }
    pyreon.config.*   export default { loom: { … } }
                      devPaths  globs that are NOT shipping source
                      ignore    [{ pkg?, dep?, code?, reason }] — reason required
                      strict    exit non-zero on warnings too
                      severity  per-code override: error | warning | info
`

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

export async function runCli(argv: readonly string[]): Promise<number> {
  const [cmd, ...rest] = argv

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    out(HELP)
    return 0
  }

  if (cmd === 'scan') {
    const dir = rest.find((a) => !a.startsWith('-')) ?? '.'
    let report
    let settings
    try {
      // Config is resolved HERE, before the synchronous analysis, so
      // `buildReport` stays a pure function of (workspace, options). The root
      // manifest's `loom` key wins per-key over the shared file.
      const shared = await loadSharedLoomConfig(dir)
      const manifest = validateLoomSection(readManifestLoomSection(dir), `${dir}/package.json`)
      settings = mergeLoomSettings(shared, manifest)
      report = buildReport(dir, { noImports: rest.includes('--no-imports'), settings })
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }

    if (rest.includes('--json')) {
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

    if (!rest.includes('--no-write')) {
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
      if (rest.includes('--json')) err(notice)
      else out(notice)
    }

    const strict = rest.includes('--strict') || settings.strict === true
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
    const positional = rest.filter((a) => !a.startsWith('-'))
    const dir = positional[0] ?? '.'
    const outArg = rest.find((a) => a.startsWith('--out='))
    const baseArg = rest.find((a) => a.startsWith('--base='))
    const outOpt = outArg ? outArg.slice('--out='.length) : 'loom-dist'

    let report
    try {
      const shared = await loadSharedLoomConfig(dir)
      const manifest = validateLoomSection(readManifestLoomSection(dir), `${dir}/package.json`)
      const settings = mergeLoomSettings(shared, manifest)
      report = buildReport(dir, { noImports: rest.includes('--no-imports'), settings })
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }

    try {
      const { buildStaticSite } = await import('../build/static-site')
      const outDir = await buildStaticSite({
        report,
        outDir: outOpt,
        ...(baseArg ? { base: baseArg.slice('--base='.length) } : {}),
      })
      out(`loom: ${report.stats.internal} package(s) → ${outDir}\n`)
      return 0
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }
  }

  if (cmd === 'dev') {
    const dir = rest.find((a) => !a.startsWith('-')) ?? '.'
    const portArg = rest.find((a) => a.startsWith('--port='))
    const port = portArg ? Number(portArg.slice('--port='.length)) : undefined
    const { startDevServer } = await import('../dev/server')
    try {
      const handle = await startDevServer({ cwd: dir, ...(port !== undefined ? { port } : {}) })
      out(`loom dev: ${handle.packages} package(s) → ${handle.url}\n`)
      await new Promise<void>(() => {})
      return 0
    } catch (error) {
      err(`${String((error as Error)?.message ?? error)}\n`)
      return 1
    }
  }

  err(`loom: unknown command "${cmd}". Try \`loom --help\`.\n`)
  return 1
}
