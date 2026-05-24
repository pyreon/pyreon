/**
 * Lockfile-dedup gate — programmatic API.
 *
 * Audits the consumer's lockfile (`bun.lock` / `package-lock.json` /
 * `pnpm-lock.yaml`) for `@pyreon/*` packages with MORE THAN ONE resolved
 * version installed. Surfaces duplicates BEFORE the runtime sentinel
 * (`@pyreon/reactivity:registerSingleton`, PR A of the bullet-proof
 * cross-module-instance plan) throws on first dual-load.
 *
 * Defense-in-depth Layer 3 — pairs with:
 *   Layer 1 (PR B): `@pyreon/vite-plugin` injects `resolve.dedupe`
 *     (BUNDLER prevention).
 *   Layer 2 (PR A): every `@pyreon/*` package calls `registerSingleton`
 *     at module load (RUNTIME detection).
 *   Layer 3 (THIS): static lockfile scan (CI gate). Catches the
 *     installed-state mismatch before deploy.
 *
 * Each finding names the package + every resolved version, with the
 * concrete fix (lockfile rewrite + reinstall).
 *
 * Pure parser functions are exported as `_internal` for direct unit
 * testing — bypasses filesystem dependencies and lets us exercise
 * synthetic lockfile fixtures without committing them to disk.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Finding, FindingCategory, GateResult } from '../types'

interface ResolvedPackage {
  name: string
  versions: Set<string>
}

/**
 * Parse bun.lock (JSON format, `lockfileVersion` >= 1). Bun's lockfile
 * is a single JSON object with a `packages: { "<key>": [...] }` map.
 *
 * Key format examples:
 *   - `"@pyreon/core"`            — single resolved version
 *   - `"@pyreon/core@1.0.0"`      — one of several resolved versions
 *   - `"some-dep/@pyreon/core"`   — nested resolution
 *
 * The version is always at the start of value[0] in `<name>@<version>`
 * form. Workspace packages are skipped (`workspace:` prefix — they're
 * never duplicated because the workspace resolves them locally).
 */
export const _parseBunLock = (raw: string): Map<string, ResolvedPackage> => {
  const out = new Map<string, ResolvedPackage>()
  let lock: unknown
  try {
    lock = JSON.parse(raw)
  } catch {
    return out
  }
  if (typeof lock !== 'object' || lock === null) return out
  const packages = (lock as { packages?: unknown }).packages
  if (typeof packages !== 'object' || packages === null) return out

  for (const value of Object.values(packages as Record<string, unknown>)) {
    if (!Array.isArray(value) || value.length === 0) continue
    const head = value[0]
    if (typeof head !== 'string') continue
    // head is `"<name>@<version>"` — extract name + version.
    // Scoped packages: name starts with `@`, so use lastIndexOf to find
    // the version separator.
    const at = head.lastIndexOf('@')
    if (at <= 0) continue
    const name = head.slice(0, at)
    const version = head.slice(at + 1)
    if (!name.startsWith('@pyreon/')) continue
    // Skip workspace resolutions — they're never duplicated.
    if (version.startsWith('workspace:')) continue
    let entry = out.get(name)
    if (!entry) {
      entry = { name, versions: new Set() }
      out.set(name, entry)
    }
    entry.versions.add(version)
  }
  return out
}

/**
 * Parse npm package-lock.json v2/v3 format. Keys under `packages` are
 * filesystem paths like `"node_modules/@pyreon/core"` or
 * `"node_modules/some-dep/node_modules/@pyreon/core"`. Values include
 * a `version` field.
 */
export const _parseNpmLock = (raw: string): Map<string, ResolvedPackage> => {
  const out = new Map<string, ResolvedPackage>()
  let lock: unknown
  try {
    lock = JSON.parse(raw)
  } catch {
    return out
  }
  if (typeof lock !== 'object' || lock === null) return out
  const packages = (lock as { packages?: unknown }).packages
  if (typeof packages !== 'object' || packages === null) return out

  for (const [key, value] of Object.entries(
    packages as Record<string, unknown>,
  )) {
    // Extract the package name from the trailing segment.
    const match = key.match(/(?:^|\/)node_modules\/(@?[^/]+(?:\/[^/]+)?)$/)
    if (!match) continue
    const name = match[1]!
    if (!name.startsWith('@pyreon/')) continue
    if (typeof value !== 'object' || value === null) continue
    const version = (value as { version?: unknown }).version
    if (typeof version !== 'string') continue
    let entry = out.get(name)
    if (!entry) {
      entry = { name, versions: new Set() }
      out.set(name, entry)
    }
    entry.versions.add(version)
  }
  return out
}

/**
 * Parse pnpm-lock.yaml format. The `packages:` block has keys like
 * `'/@pyreon/core@1.0.0':` or `/@pyreon/core@1.0.0:` (v9+).
 *
 * Minimal YAML scan — keyed-line regex. Avoids pulling in a YAML
 * parser dep (the doctor gates intentionally have no transitive
 * deps that aren't already in @pyreon/cli).
 */
export const _parsePnpmLock = (raw: string): Map<string, ResolvedPackage> => {
  const out = new Map<string, ResolvedPackage>()
  // Match both pnpm-lock v6 (`'/@pyreon/core@1.0.0':`) and v9+
  // (`/@pyreon/core@1.0.0:`) forms.
  //
  // pnpm v9+ appends a peer-suffix like `(react@19.0.0)` to differentiate
  // installs that share the same version but resolved against different
  // peer deps — e.g. `/@pyreon/core@1.0.0(react@19.0.0):`. The same
  // version with different peer suffixes is NOT a real duplicate (it's
  // the same code, just metadata for pnpm's peer-dep resolution). We
  // strip the `(...)` suffix before counting to avoid false-positive
  // `check-dedup/multiple-versions` findings.
  const re = /^\s*'?\/?(@pyreon\/[a-z0-9-]+)@([^':]+)'?:\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const name = m[1]!
    // Strip pnpm peer-suffix `(react@19.0.0)` so `1.0.0` and
    // `1.0.0(react@19.0.0)` count as the SAME version. Build metadata
    // `1.0.0+build.123` does NOT contain `(`, so it survives unchanged.
    const version = m[2]!.replace(/\(.*$/, '')
    let entry = out.get(name)
    if (!entry) {
      entry = { name, versions: new Set() }
      out.set(name, entry)
    }
    entry.versions.add(version)
  }
  return out
}

/**
 * Find which lockfile to read for a given project root + emit
 * findings for any `@pyreon/*` with >1 resolved version.
 */
export const _detectDuplicates = (
  packages: Map<string, ResolvedPackage>,
  lockfilePath: string,
  cwd: string,
): Finding[] => {
  const findings: Finding[] = []
  for (const pkg of packages.values()) {
    if (pkg.versions.size <= 1) continue
    const versionList = [...pkg.versions].sort().join(', ')
    findings.push({
      category: 'architecture',
      severity: 'error',
      code: 'check-dedup/multiple-versions',
      gate: 'check-dedup',
      message:
        `${pkg.name} resolves to ${pkg.versions.size} distinct versions in the lockfile (${versionList}). ` +
        `Multiple module instances of the same Pyreon package break framework contracts (signal tracking, lifecycle hooks, ` +
        `context propagation). The runtime sentinel will throw on first dual-load.`,
      location: {
        path: lockfilePath,
        relPath: relative(cwd, lockfilePath),
      },
      fix:
        `Pin a single version: \`bun add ${pkg.name}@<version>\` (or \`npm install\` / \`pnpm install\`) and remove the conflicting transitive entries from your lockfile. ` +
        `For workspace projects, ensure every internal consumer uses \`workspace:^\` for the dep. ` +
        `Set PYREON_SINGLE_INSTANCE=warn to demote the runtime throw to a warning while you migrate.`,
    })
  }
  return findings
}

export interface CheckDedupGateOptions {
  /** Repo root to scan. */
  cwd: string
}

const LOCKFILES: ReadonlyArray<{
  file: string
  parse: (raw: string) => Map<string, ResolvedPackage>
}> = [
  { file: 'bun.lock', parse: _parseBunLock },
  { file: 'package-lock.json', parse: _parseNpmLock },
  { file: 'pnpm-lock.yaml', parse: _parsePnpmLock },
]

/**
 * Run the lockfile-dedup gate. Returns findings + metadata.
 *
 * @example
 * const result = await runCheckDedupGate({ cwd: process.cwd() })
 * if (result.findings.length > 0) process.exit(1)
 */
export const runCheckDedupGate = async (
  opts: CheckDedupGateOptions,
): Promise<GateResult> => {
  const start = Date.now()
  const findings: Finding[] = []
  let scanned = 0

  for (const { file, parse } of LOCKFILES) {
    const path = join(opts.cwd, file)
    if (!existsSync(path)) continue
    scanned += 1
    let raw: string
    try {
      raw = readFileSync(path, 'utf8')
    } catch {
      continue
    }
    const packages = parse(raw)
    findings.push(..._detectDuplicates(packages, path, opts.cwd))
  }

  return {
    gate: 'check-dedup',
    category: 'architecture' satisfies FindingCategory,
    findings,
    meta: {
      scanned,
      elapsedMs: Date.now() - start,
    },
  }
}
