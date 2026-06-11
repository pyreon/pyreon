/**
 * Post-version hook: downgrade any `0.x.y → 1.0.0` cascade bumps back
 * to the next minor (`0.(x+1).0`) after `changeset version` runs.
 *
 * Pyreon is a 0.x project; the companion `cap-changeset-bumps.ts`
 * (pre-version hook) downgrades EXPLICIT `: major` lines in changeset
 * frontmatter to `: minor`. But @changesets/cli still produces 1.0.0
 * bumps via the **peer-dependency cascade** (`@changesets/assemble-
 * release-plan` → `shouldBumpMajor`): when a 0.x package's minor bump
 * leaves the peer-dependent's `^0.x.y` range, the dependent gets a
 * cascaded major. With peer-deps on `@pyreon/{reactivity,core,
 * runtime-dom}` declared across the framework (PR #1139), this
 * cascade hits ~30+ packages every release.
 *
 * The cascade is technically-correct semver: a minor bump in 0.x DOES
 * break peer-dependents per strict semver. But Pyreon is explicitly
 * pre-production-ready in 0.x — accidentally hitting 1.0.0 contradicts
 * that policy. This script keeps everything in 0.x.
 *
 * Runs in .github/workflows/release.yml AFTER the changesets/action
 * step (or after `bun changeset version` locally). Walks every
 * packages/<asterisk><asterisk>/package.json and CHANGELOG.md:
 *
 * - If a package's version jumped from 0.x.y (per git's HEAD~) to
 *   1.0.0 (in the working tree), rewrite to 0.(x+1).0 and amend the
 *   matching "## 1.0.0" heading in CHANGELOG.md to "## 0.(x+1).0".
 * - Internal workspace:* deps resolve at publish time to the actual
 *   workspace version, so they update automatically — nothing to patch
 *   on the dep-range side.
 *
 * Idempotent: if no `0.x.y → 1.0.0` bumps are present, the script is
 * a no-op and exits 0.
 *
 * Companion to:
 * - `scripts/cap-changeset-bumps.ts` — pre-version, catches explicit
 *   major-in-frontmatter
 * - `scripts/check-no-major-changesets.ts` — CI gate at PR time
 *
 * See PR #1139 for the peer-dep migration that motivated this hook,
 * and PR #1137 for the root-cause investigation of the cascade.
 */

import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const PKGS_ROOT = join(ROOT, 'packages')

/**
 * Find every package.json under packages/, skipping node_modules and
 * the npm-published-only compiler-platform shims (which live under
 * packages/core/compiler/npm/ and have synthetic platform-specific
 * versions that should match the parent compiler's bump exactly).
 */
function walkPackageJsons(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    let s
    try {
      s = statSync(full)
    } catch {
      continue
    }
    if (s.isDirectory()) {
      out.push(...walkPackageJsons(full))
    } else if (entry === 'package.json') {
      out.push(full)
    }
  }
  return out
}

interface BumpDowngrade {
  pkgJson: string
  pkgName: string
  oldVersion: string
  cascadedTo: string
  rewrittenTo: string
}

/**
 * Get the pre-bump version of a package.json from git show HEAD~.
 *
 * Uses spawnSync with argv form (not execSync with string interpolation)
 * so the path is passed as a separate argument — no shell, no
 * meta-character escaping concerns. Defensive against the
 * "Shell command built from environment values" class even though
 * walkPackageJsons only sees filesystem paths the repo itself owns.
 */
function getPreVersion(pkgJsonRelPath: string): string | null {
  // Defense-in-depth: reject anything that doesn't look like a
  // plain `<dir>/<dir>/.../package.json` under the repo. Belt + brace.
  if (
    pkgJsonRelPath.includes('..') ||
    pkgJsonRelPath.startsWith('/') ||
    !pkgJsonRelPath.endsWith('package.json')
  ) {
    return null
  }
  const result = spawnSync('git', ['show', `HEAD~:${pkgJsonRelPath}`], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
  })
  if (result.status !== 0 || result.error) return null
  try {
    const pkg = JSON.parse(result.stdout)
    return pkg.version ?? null
  } catch {
    return null
  }
}

/** Compare two 0.x.0 versions by minor (positive when a > b). */
function cmpMinor(a: string, b: string): number {
  const ma = a.match(/^0\.(\d+)\./)
  const mb = b.match(/^0\.(\d+)\./)
  return Number.parseInt(ma?.[1] ?? '0', 10) - Number.parseInt(mb?.[1] ?? '0', 10)
}

/** Compute the next-minor of a 0.x.y version. */
function nextMinor(version: string): string | null {
  const m = version.match(/^0\.(\d+)\.(\d+)$/)
  if (!m) return null
  const minor = Number.parseInt(m[1] as string, 10)
  return `0.${minor + 1}.0`
}

const pkgJsons = walkPackageJsons(PKGS_ROOT)
const downgrades: BumpDowngrade[] = []

// ── Fixed-group LOCKSTEP capping ─────────────────────────────────────────
// The fixed group must release at ONE version. Per-package next-minor
// capping silently broke that for members whose pre-version lags the
// group: @pyreon/zero-content (first-publish at 0.1.0) would have been
// capped to 0.2.0 while the rest of the suite shipped 0.32.0 — defeating
// the whole point of the fixed group. Two passes: (1) collect every
// capped candidate + compute the GROUP target = the MAX next-minor among
// fixed-group members; (2) rewrite — fixed members get the group target,
// non-group packages (private natives with their own changesets) keep
// per-package capping.
const fixedGroup = new Set<string>(
  (
    JSON.parse(readFileSync(join(ROOT, '.changeset', 'config.json'), 'utf8')) as {
      fixed?: string[][]
    }
  ).fixed?.[0] ?? [],
)

interface CapCandidate {
  pkgPath: string
  relPath: string
  content: string
  name: string
  oldVersion: string
  ownTarget: string
}
const candidates: CapCandidate[] = []
let groupTarget: string | null = null

for (const pkgPath of pkgJsons) {
  const content = readFileSync(pkgPath, 'utf8')
  let pkg: { name?: string; version?: string }
  try {
    pkg = JSON.parse(content)
  } catch {
    continue
  }
  if (!pkg.name || !pkg.name.startsWith('@pyreon/') || pkg.version !== '1.0.0') {
    continue
  }
  const relPath = pkgPath.slice(ROOT.length + 1)
  const oldVersion = getPreVersion(relPath)
  if (!oldVersion) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[cap-version] ${pkg.name}: cannot read pre-version from git (HEAD~ doesn't have this file?). Skipping — manual review needed.`,
    )
    continue
  }
  const ownTarget = nextMinor(oldVersion)
  if (!ownTarget) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[cap-version] ${pkg.name}: pre-version "${oldVersion}" is not 0.x.y. Cannot compute next-minor. Skipping.`,
    )
    continue
  }
  candidates.push({ pkgPath, relPath, content, name: pkg.name, oldVersion, ownTarget })
  if (fixedGroup.has(pkg.name)) {
    if (groupTarget === null || cmpMinor(ownTarget, groupTarget) > 0) {
      groupTarget = ownTarget
    }
  }
}

for (const cand of candidates) {
  const { pkgPath, content, name } = cand
  const targetVersion =
    fixedGroup.has(name) && groupTarget !== null ? groupTarget : cand.ownTarget

  // Rewrite package.json version
  const newContent = content.replace(
    /"version":\s*"1\.0\.0"/,
    `"version": "${targetVersion}"`,
  )
  writeFileSync(pkgPath, newContent)

  // Rewrite the matching CHANGELOG.md heading
  const changelogPath = join(pkgPath, '..', 'CHANGELOG.md')
  try {
    const cl = readFileSync(changelogPath, 'utf8')
    // Only the FIRST `## 1.0.0` (the just-added entry from changeset version)
    const newCl = cl.replace(/^## 1\.0\.0$/m, `## ${targetVersion}`)
    if (newCl !== cl) {
      writeFileSync(changelogPath, newCl)
    }
  } catch {
    // CHANGELOG might not exist (very new packages); skip silently
  }

  downgrades.push({
    pkgJson: cand.relPath,
    pkgName: name,
    oldVersion: cand.oldVersion,
    cascadedTo: '1.0.0',
    rewrittenTo: targetVersion,
  })
}

if (downgrades.length === 0) {
  // oxlint-disable-next-line no-console
  console.log('[cap-version] no 1.0.0 cascade bumps to cap — clean')
} else {
  // oxlint-disable-next-line no-console
  console.log(
    `[cap-version] capped ${downgrades.length} cascaded 1.0.0 bump(s) back to next-minor:`,
  )
  for (const d of downgrades) {
    // oxlint-disable-next-line no-console
    console.log(
      `  ${d.pkgName.padEnd(40)}  ${d.oldVersion} → 1.0.0 [cascade] → ${d.rewrittenTo} [capped]`,
    )
  }
}
