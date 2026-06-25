/**
 * `pyreon info` — environment + installed @pyreon/* versions + version-skew detection.
 *
 * Pyreon ships its packages on ONE synced version trajectory (changesets
 * fixed-group). When a project's installed @pyreon/* packages span more than
 * one version, the `registerSingleton` duplicate-instance guard can fire at
 * runtime (`[Pyreon] Duplicate @pyreon/X detected`) and context/reactivity
 * split across instances. `pyreon info` surfaces that skew before it bites,
 * alongside a standard environment report (cf. `astro info` / `next info`).
 *
 * The data-collection core (`collectInfo`) is pure-given-a-cwd (reads fs, no
 * process exit / no console) so it's unit-testable against fixture dirs; the
 * `info()` entry handles flags + rendering + exit code.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bold, colorEnabled, cyan, gray, green, yellow } from '@pyreon/ansi'
import cliPkg from '../package.json' with { type: 'json' }

export interface InstalledPyreonPkg {
  name: string
  version: string
}

export interface SkewReport {
  /** Distinct installed @pyreon/* versions, descending by package count. */
  versions: string[]
  /** True when more than one distinct version is installed. */
  hasSkew: boolean
  /** version → the package names installed at that version. */
  byVersion: Record<string, string[]>
  /** The version the most packages are on (the alignment target). */
  dominant: string | null
}

export interface InfoReport {
  cliVersion: string
  runtime: {
    node: string
    bun: string | null
    platform: string
    arch: string
  }
  project: {
    name: string | null
    /** Declared @pyreon/* dependency ranges from package.json (deps + devDeps). */
    declared: Record<string, string>
    /** True when @pyreon/zero is a declared dependency. */
    isZero: boolean
  }
  installed: InstalledPyreonPkg[]
  skew: SkewReport
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Scan `<cwd>/node_modules/@pyreon/*` for installed package names + versions. */
export function scanInstalledPyreon(cwd: string): InstalledPyreonPkg[] {
  const scopeDir = join(cwd, 'node_modules', '@pyreon')
  if (!existsSync(scopeDir)) return []
  const out: InstalledPyreonPkg[] = []
  let entries: string[]
  try {
    entries = readdirSync(scopeDir)
  } catch {
    return []
  }
  for (const dir of entries) {
    if (dir.startsWith('.')) continue
    const pkg = readJson(join(scopeDir, dir, 'package.json'))
    const name = typeof pkg?.name === 'string' ? pkg.name : `@pyreon/${dir}`
    const version = typeof pkg?.version === 'string' ? pkg.version : null
    if (version) out.push({ name, version })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** Group installed packages by version; flag skew when >1 distinct version. */
export function detectSkew(installed: InstalledPyreonPkg[]): SkewReport {
  const byVersion: Record<string, string[]> = {}
  for (const { name, version } of installed) {
    ;(byVersion[version] ??= []).push(name)
  }
  // Order versions by how many packages sit on each (most → least), so the
  // first is the dominant alignment target and the report reads top-down.
  const versions = Object.keys(byVersion).sort(
    (a, b) => (byVersion[b]?.length ?? 0) - (byVersion[a]?.length ?? 0),
  )
  return {
    versions,
    hasSkew: versions.length > 1,
    byVersion,
    dominant: versions[0] ?? null,
  }
}

/** Collect the full info report for a project directory. Reads fs; no I/O side effects. */
export function collectInfo(cwd: string): InfoReport {
  const projectPkg = readJson(join(cwd, 'package.json'))
  const declared: Record<string, string> = {}
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = projectPkg?.[field]
    if (deps && typeof deps === 'object') {
      for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
        if (name.startsWith('@pyreon/') && typeof range === 'string') declared[name] = range
      }
    }
  }
  const installed = scanInstalledPyreon(cwd)
  return {
    cliVersion: cliPkg.version,
    runtime: {
      node: process.versions.node,
      bun: process.versions.bun ?? null,
      platform: process.platform,
      arch: process.arch,
    },
    project: {
      name: typeof projectPkg?.name === 'string' ? projectPkg.name : null,
      declared,
      isZero: '@pyreon/zero' in declared,
    },
    installed,
    skew: detectSkew(installed),
  }
}

/** Render the info report as a human-readable, brand-colored block. */
export function formatInfo(report: InfoReport): string {
  const c = colorEnabled
  const head = (s: string) => (c ? bold(s) : s)
  const muted = (s: string) => (c ? gray(s) : s)
  const lines: string[] = []
  const pad = (k: string) => k.padEnd(9)

  lines.push('')
  lines.push(`  ${head('Pyreon')} ${c ? cyan(`v${report.cliVersion}`) : `v${report.cliVersion}`}`)
  lines.push('')
  lines.push(`  ${head('Runtime')}`)
  lines.push(`    ${pad('node')} ${muted(`v${report.runtime.node}`)}`)
  if (report.runtime.bun) lines.push(`    ${pad('bun')} ${muted(`v${report.runtime.bun}`)}`)
  lines.push(`    ${pad('platform')} ${muted(`${report.runtime.platform} ${report.runtime.arch}`)}`)
  lines.push('')

  const projLabel = report.project.name
    ? `${report.project.name}${report.project.isZero ? muted('  (zero app)') : ''}`
    : muted('(no package.json name)')
  lines.push(`  ${head('Project')}: ${projLabel}`)
  lines.push('')

  if (report.installed.length === 0) {
    lines.push(muted('  No @pyreon/* packages installed in node_modules.'))
    const declaredNames = Object.keys(report.project.declared)
    if (declaredNames.length > 0) {
      lines.push(
        muted(`  (${declaredNames.length} declared in package.json — run install to populate)`),
      )
    }
    lines.push('')
    return lines.join('\n')
  }

  lines.push(`  ${head(`Installed @pyreon packages (${report.installed.length})`)}`)
  const widest = Math.max(...report.installed.map((p) => p.name.length))
  for (const p of report.installed) {
    const onDominant = p.version === report.skew.dominant
    const ver = c && report.skew.hasSkew && !onDominant ? yellow(p.version) : muted(p.version)
    lines.push(`    ${p.name.padEnd(widest)}  ${ver}`)
  }
  lines.push('')

  if (!report.skew.hasSkew) {
    const ok = c ? green('✓') : '✓'
    lines.push(`  ${ok} All @pyreon packages on ${report.skew.dominant}`)
  } else {
    const warn = c ? yellow('!') : '!'
    lines.push(`  ${warn} Version skew — ${report.skew.versions.length} versions installed:`)
    for (const v of report.skew.versions) {
      const names = report.skew.byVersion[v] ?? []
      const shown = names.length > 4 ? `${names.slice(0, 4).join(', ')}, +${names.length - 4} more` : names.join(', ')
      lines.push(`      ${c ? yellow(v) : v}: ${muted(shown)}`)
    }
    lines.push('')
    lines.push(
      muted(
        '    Mismatched @pyreon versions can trigger the duplicate-instance guard',
      ),
    )
    lines.push(muted("    (`[Pyreon] Duplicate @pyreon/X detected`). Align them to one version."))
  }
  lines.push('')
  return lines.join('\n')
}

export interface InfoOptions {
  cwd?: string
  json?: boolean
}

/** `pyreon info` entry. Returns an exit code (0 always — info is non-gating). */
export function info(options: InfoOptions = {}): number {
  const report = collectInfo(options.cwd ?? process.cwd())
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(formatInfo(report))
  }
  return 0
}
