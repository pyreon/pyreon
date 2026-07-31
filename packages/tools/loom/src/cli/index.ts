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
      --json            Print the full report as JSON to stdout (implies --no-write is OFF).
  loom --help           Show this help.
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
    try {
      report = buildReport(dir, { noImports: rest.includes('--no-imports') })
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
      out(`  → ${reportPath}\n`)
    }

    const red = report.stats.errors > 0 || (rest.includes('--strict') && report.stats.warnings > 0)
    if (red) {
      err(
        `loom: ${report.stats.errors} error(s)` +
          (rest.includes('--strict') ? ` + ${report.stats.warnings} warning(s) (--strict)` : '') +
          '\n',
      )
      return 1
    }
    return 0
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
