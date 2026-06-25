/**
 * `pyreon upgrade` — align every `@pyreon/*` dependency to ONE version.
 *
 * Pyreon ships its packages on one synced version trajectory (changesets
 * fixed-group), so a project's `@pyreon/*` deps should all be the same
 * version. When they drift, the `registerSingleton` duplicate-instance guard
 * can fire at runtime. `pyreon info` DETECTS that skew; `pyreon upgrade` FIXES
 * it — rewriting the project's `package.json` ranges to a single target.
 *
 * Dry-run by default (prints the plan); `--write` applies. The pure core
 * (`resolveTarget` / `computeUpgradePlan` / `rewriteDeps`) is exported +
 * fixture-tested; `upgrade()` handles flags + rendering + the file write.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bold, colorEnabled, cyan, gray, green } from '@pyreon/ansi'
import { detectSkew, scanInstalledPyreon } from './info'

export interface UpgradeChange {
  name: string
  /** Current declared range, e.g. `^0.30.0`. */
  from: string
  /** New declared range, e.g. `^0.37.0` (or `0.37.0` with --exact). */
  to: string
}

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+].*)?$/

/** Strip a leading range operator (`^`/`~`/`>=`/`=`) to bare `x.y.z`. */
export function cleanVersion(range: string): string | null {
  const m = range.match(/\d+\.\d+\.\d+(?:[-+][\w.]+)?/)
  return m ? m[0] : null
}

/** Compare two `x.y.z[-pre]` versions. -1 / 0 / 1 (a vs b). Prereleases sort below release. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split('-', 2)
    const nums = (core ?? '0').split('.').map((n) => Number.parseInt(n, 10) || 0)
    return { nums, pre: pre ?? null }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  if (pa.pre === pb.pre) return 0
  if (pa.pre === null) return 1 // release > prerelease
  if (pb.pre === null) return -1
  return pa.pre < pb.pre ? -1 : 1
}

/**
 * Resolve the alignment target. Explicit `--to` wins (must be a bare version);
 * otherwise the HIGHEST version seen across declared ranges + installed
 * packages (align laggards up). Returns null when nothing is resolvable.
 */
export function resolveTarget(versions: string[], explicit?: string): string | null {
  if (explicit) {
    const cleaned = cleanVersion(explicit)
    return cleaned && VERSION_RE.test(cleaned) ? cleaned : null
  }
  const cleaned = versions.map(cleanVersion).filter((v): v is string => v !== null)
  if (cleaned.length === 0) return null
  return cleaned.reduce((max, v) => (compareVersions(v, max) > 0 ? v : max))
}

/**
 * Compute which declared `@pyreon/*` deps need rewriting to reach `target`.
 * Skips deps already at the target range; preserves the caret unless `exact`.
 */
export function computeUpgradePlan(
  declared: Record<string, string>,
  target: string,
  exact: boolean,
): UpgradeChange[] {
  const want = exact ? target : `^${target}`
  const changes: UpgradeChange[] = []
  for (const [name, range] of Object.entries(declared)) {
    if (!name.startsWith('@pyreon/')) continue
    // Leave non-version specifiers (workspace:, link:, file:, git, npm:alias) alone.
    if (!/\d/.test(range) || range.includes(':')) continue
    if (range === want) continue
    changes.push({ name, from: range, to: want })
  }
  return changes.sort((a, b) => a.name.localeCompare(b.name))
}

/** Apply changes to a parsed package.json object (deps + devDeps). Returns a new object. */
export function rewriteDeps(
  pkg: Record<string, unknown>,
  changes: UpgradeChange[],
): Record<string, unknown> {
  const byName = new Map(changes.map((c) => [c.name, c.to]))
  const next = { ...pkg }
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg[field]
    if (!deps || typeof deps !== 'object') continue
    const updated: Record<string, unknown> = {}
    for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
      updated[name] = byName.get(name) ?? range
    }
    next[field] = updated
  }
  return next
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function collectDeclared(pkg: Record<string, unknown> | null): Record<string, string> {
  const declared: Record<string, string> = {}
  for (const field of ['dependencies', 'devDependencies'] as const) {
    const deps = pkg?.[field]
    if (deps && typeof deps === 'object') {
      for (const [name, range] of Object.entries(deps as Record<string, unknown>)) {
        if (name.startsWith('@pyreon/') && typeof range === 'string') declared[name] = range
      }
    }
  }
  return declared
}

export interface UpgradeOptions {
  cwd?: string
  // Explicit `| undefined` — assigned from `getFlagValue` under exactOptionalPropertyTypes.
  to?: string | undefined
  exact?: boolean
  write?: boolean
  json?: boolean
}

/** `pyreon upgrade` entry. Returns an exit code (0 ok; 1 unresolvable target). */
export function upgrade(options: UpgradeOptions = {}): number {
  const cwd = options.cwd ?? process.cwd()
  const c = colorEnabled
  const pkgPath = join(cwd, 'package.json')
  const pkg = readJson(pkgPath)
  const declared = collectDeclared(pkg)
  const installed = scanInstalledPyreon(cwd)

  const candidateVersions = [
    ...Object.values(declared),
    ...installed.map((p) => p.version),
  ]
  const target = resolveTarget(candidateVersions, options.to)

  if (!target) {
    if (options.json) {
      console.log(JSON.stringify({ ok: false, reason: 'no-target', changes: [] }, null, 2))
    } else {
      console.error(
        options.to
          ? `  ! --to "${options.to}" is not a valid version (expected x.y.z)`
          : '  ! No @pyreon/* dependencies found to align — nothing to upgrade.',
      )
    }
    return 1
  }

  const changes = computeUpgradePlan(declared, target, options.exact ?? false)

  if (options.json) {
    console.log(JSON.stringify({ ok: true, target, write: !!options.write, changes }, null, 2))
    if (options.write && changes.length > 0 && pkg) {
      writeFileSync(pkgPath, `${JSON.stringify(rewriteDeps(pkg, changes), null, 2)}\n`)
    }
    return 0
  }

  const head = (s: string) => (c ? bold(s) : s)
  const muted = (s: string) => (c ? gray(s) : s)
  const skew = detectSkew(installed)

  if (changes.length === 0) {
    const ok = c ? green('✓') : '✓'
    console.log(`\n  ${ok} All @pyreon/* dependencies already on ${target}.`)
    if (skew.hasSkew) {
      console.log(
        muted(
          `    (node_modules still shows ${skew.versions.length} installed versions — run your package manager's install to apply.)`,
        ),
      )
    }
    console.log('')
    return 0
  }

  console.log(`\n  ${head('pyreon upgrade')} → align ${changes.length} package(s) to ${c ? cyan(target) : target}`)
  console.log('')
  const widest = Math.max(...changes.map((ch) => ch.name.length))
  for (const ch of changes) {
    const arrow = c ? gray('→') : '→'
    console.log(`    ${ch.name.padEnd(widest)}  ${muted(ch.from)} ${arrow} ${c ? green(ch.to) : ch.to}`)
  }
  console.log('')

  if (!options.write) {
    console.log(muted('  Dry run. Re-run with --write to apply, then install:'))
    console.log(muted('    pyreon upgrade --write && bun install'))
    console.log('')
    return 0
  }

  if (pkg) {
    writeFileSync(pkgPath, `${JSON.stringify(rewriteDeps(pkg, changes), null, 2)}\n`)
    const ok = c ? green('✓') : '✓'
    console.log(`  ${ok} Wrote package.json. Now run your install to apply:`)
    console.log(muted('    bun install   # or npm/pnpm/yarn install'))
    console.log('')
  }
  return 0
}
