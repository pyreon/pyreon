#!/usr/bin/env bun
/**
 * check-license-coverage — every workspace carries the project's licence.
 *
 * This is an IP gate, not a tidiness one. Three failure modes it prevents,
 * each of which has already happened in this repo:
 *
 *  1. A workspace with NO `LICENSE` file. A published package without one is
 *     distributed with no stated terms; an example without one is code people
 *     copy out of the repo with no idea what they may do with it.
 *  2. A `package.json` with no `license` field. npm, GitHub and every SBOM
 *     scanner read that field, not the file — a package whose file says MIT and
 *     whose manifest says nothing is reported as UNLICENSED.
 *  3. A `LICENSE` whose text has DRIFTED from the root. Nine had, carrying
 *     three different copyright years ("2025", "2025-present", "2026") across
 *     packages of one project. Divergent notices are the kind of ambiguity that
 *     costs real time to unpick later.
 *
 * The root `LICENSE` is the single source of truth: every workspace copy must
 * match it BYTE FOR BYTE, so a year bump is one edit plus `--fix`.
 *
 * Usage:
 *   bun scripts/check-license-coverage.ts          # verify
 *   bun scripts/check-license-coverage.ts --fix    # copy/normalise + add fields
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CANON = join(REPO_ROOT, 'LICENSE')

/**
 * Roots to scan for workspaces, with how deep a `package.json` sits under each.
 * A plain walk rather than a glob library so this module stays importable by
 * the unit tests — a `bun`-only import made the pure logic untestable.
 */
const WORKSPACE_ROOTS: Array<{ dir: string; depth: number }> = [
  { dir: 'packages', depth: 2 },
  { dir: 'examples', depth: 1 },
  { dir: 'docs', depth: 0 },
  { dir: 'contrib', depth: 2 },
]

export interface LicenseFinding {
  path: string
  kind: 'missing-file' | 'drifted-file' | 'missing-field' | 'wrong-field'
  detail: string
}

/** Compare a workspace against the canonical licence. Pure — no I/O policy. */
export function auditWorkspace(
  pkgJsonPath: string,
  pkgJsonRaw: string,
  licenseText: string | null,
  canonicalText: string,
): LicenseFinding[] {
  const out: LicenseFinding[] = []
  const dir = dirname(pkgJsonPath)

  if (licenseText === null) {
    out.push({ path: dir, kind: 'missing-file', detail: 'no LICENSE file' })
  } else if (licenseText !== canonicalText) {
    out.push({
      path: dir,
      kind: 'drifted-file',
      detail: 'LICENSE differs from the root LICENSE',
    })
  }

  let license: unknown
  try {
    license = (JSON.parse(pkgJsonRaw) as { license?: unknown }).license
  } catch {
    return out
  }
  if (license === undefined) {
    out.push({ path: pkgJsonPath, kind: 'missing-field', detail: 'no "license" field' })
  } else if (license !== 'MIT') {
    out.push({
      path: pkgJsonPath,
      kind: 'wrong-field',
      detail: `"license": ${JSON.stringify(license)} — expected "MIT"`,
    })
  }
  return out
}

function workspaces(): string[] {
  const found: string[] = []
  const visit = (abs: string, depth: number): void => {
    if (depth === 0) {
      const pj = join(abs, 'package.json')
      if (existsSync(pj)) found.push(pj)
      return
    }
    let entries: string[]
    try {
      entries = readdirSync(abs)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === 'node_modules' || e.startsWith('.')) continue
      const child = join(abs, e)
      if (statSync(child).isDirectory()) visit(child, depth - 1)
    }
  }
  for (const { dir, depth } of WORKSPACE_ROOTS) visit(join(REPO_ROOT, dir), depth)
  return found.sort()
}

/** Insert a `"license": "MIT"` line after `version` (or `name`), preserving formatting. */
export function withLicenseField(raw: string): string {
  const m = /("(?:version|name)"\s*:\s*"[^"]*",?)/.exec(raw)
  if (!m) return raw
  const line = m[1]!
  const sep = line.endsWith(',') ? '' : ','
  return raw.replace(line, `${line}${sep}\n  "license": "MIT",`).replace(',,\n  "license"', ',\n  "license"')
}

function main(argv: string[]): number {
  const fix = argv.includes('--fix')
  const canonical = readFileSync(CANON, 'utf8')
  const findings: LicenseFinding[] = []

  for (const pj of workspaces()) {
    const dir = dirname(pj)
    const licPath = join(dir, 'LICENSE')
    const licText = existsSync(licPath) ? readFileSync(licPath, 'utf8') : null
    const raw = readFileSync(pj, 'utf8')
    const found = auditWorkspace(pj, raw, licText, canonical)

    if (fix && found.length > 0) {
      if (found.some((f) => f.kind === 'missing-file' || f.kind === 'drifted-file')) {
        copyFileSync(CANON, licPath)
      }
      if (found.some((f) => f.kind === 'missing-field')) {
        const next = withLicenseField(raw)
        try {
          JSON.parse(next)
          writeFileSync(pj, next)
        } catch {
          findings.push({ path: pj, kind: 'missing-field', detail: 'could not insert automatically' })
        }
      }
      if (found.some((f) => f.kind === 'wrong-field')) {
        findings.push(...found.filter((f) => f.kind === 'wrong-field'))
      }
      continue
    }
    findings.push(...found)
  }

  if (findings.length > 0) {
    console.error(`[check-license-coverage] ✗ ${findings.length} issue(s):`)
    for (const f of findings) {
      console.error(`  ${relative(REPO_ROOT, f.path)} — ${f.detail}`)
    }
    console.error('')
    console.error('Every workspace must carry the root LICENSE byte-for-byte and declare')
    console.error('"license": "MIT". Run `bun scripts/check-license-coverage.ts --fix`.')
    return 1
  }

  const n = workspaces().length
  console.log(`[check-license-coverage] ✓ ${n} workspace(s) carry the root LICENSE + an MIT field`)
  return 0
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
