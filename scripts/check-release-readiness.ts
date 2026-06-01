/**
 * CI gate: structural sanity check on the release pipeline.
 *
 * Runs on every PR that touches `packages/**` and verifies the
 * configuration invariants that, if violated, would cascade-break
 * the release:
 *
 *   1. **publishConfig.access coverage** — every non-private,
 *      non-stub `@pyreon/*` package must declare
 *      `publishConfig.access: "public"`. The `scripts/publish.ts`
 *      already passes `--access=public` on the CLI, but the
 *      `publishConfig` is the npm-canonical safety net + protects
 *      against manual `npm publish` accidentally treating the
 *      package as private. PR #1160 closed 4 historical drift sites
 *      under `packages/zero/`; this gate prevents the same drift
 *      from re-appearing.
 *
 *   2. **Changeset-group coverage** — every non-private,
 *      non-stub `@pyreon/*` package must be in ONE of:
 *
 *        - the `fixed[0]` group (synced version trajectory with the
 *          rest of the framework, the default for publishable
 *          packages),
 *        - the `ignore` array (e.g. example apps that ship to git
 *          only, never to npm).
 *
 *      A third "independent versioning" state silently happens when a
 *      new package is added but neither array is updated; the next
 *      mainline release then bumps everything else but leaves this
 *      one frozen — silent version drift. PR #1160 reclassified 4
 *      packages out of this third state; this gate prevents new
 *      drift from accumulating.
 *
 *   3. **Stub binaries** are exempt from #1 + #2 because they're
 *      published by `release-native.yml` not the main publish
 *      script, and they're in the `fixed` group so version-skew is
 *      structurally impossible there.
 *
 * Bypass: `skip-release-readiness` label, intended for cases where
 * a package is deliberately staying outside the `fixed` group during
 * an early-stage rollout. Use sparingly — the default expectation is
 * that every publishable Pyreon package ships together.
 *
 * Output: prints every violation (file:reason) and exits non-zero if
 * any are present. Exits 0 if clean OR the PR doesn't touch
 * publishable manifests.
 *
 * Mirrors the shape of `check-changeset.yml` + `check-diagnose-catalog.ts`:
 * standalone script + lightweight workflow + label-based bypass.
 */

import { readFile, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const REPO_ROOT = resolve(import.meta.dir, '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')
const CHANGESET_CONFIG = join(REPO_ROOT, '.changeset', 'config.json')

const HAS_SKIP_LABEL = process.env['HAS_SKIP_LABEL'] === 'true'

interface PackageManifest {
  name?: string
  version?: string
  private?: boolean
  publishConfig?: { access?: string }
}

interface ChangesetConfig {
  fixed?: string[][]
  ignore?: string[]
}

interface Violation {
  package: string
  path: string
  reason: string
  fix: string
}

// ─── Discovery ──────────────────────────────────────────────────────────────

/**
 * Walk `packages/<category>/<pkg>/package.json` AND
 * `packages/core/compiler/npm/<triple>/package.json` — the latter is
 * where the per-platform native stubs live (one level deeper than the
 * normal walk).
 */
async function discoverPackages(): Promise<
  { path: string; manifest: PackageManifest }[]
> {
  const results: { path: string; manifest: PackageManifest }[] = []
  const categories = await readdir(PACKAGES_DIR, { withFileTypes: true })

  for (const cat of categories.filter((d) => d.isDirectory())) {
    const catPath = join(PACKAGES_DIR, cat.name)
    const subs = await readdir(catPath, { withFileTypes: true })
    for (const sub of subs.filter((d) => d.isDirectory())) {
      const pkgPath = join(catPath, sub.name, 'package.json')
      try {
        const raw = await readFile(pkgPath, 'utf-8')
        results.push({ path: pkgPath, manifest: JSON.parse(raw) })
      } catch {
        // skip directories without package.json
      }
    }
  }

  // Compiler native stubs live one level deeper.
  const stubBase = join(PACKAGES_DIR, 'core', 'compiler', 'npm')
  try {
    const stubs = await readdir(stubBase, { withFileTypes: true })
    for (const sub of stubs.filter((d) => d.isDirectory())) {
      const pkgPath = join(stubBase, sub.name, 'package.json')
      try {
        const raw = await readFile(pkgPath, 'utf-8')
        results.push({ path: pkgPath, manifest: JSON.parse(raw) })
      } catch {
        // skip
      }
    }
  } catch {
    // stub dir absent — fine
  }

  return results
}

async function loadChangesetConfig(): Promise<ChangesetConfig> {
  const raw = await readFile(CHANGESET_CONFIG, 'utf-8')
  return JSON.parse(raw)
}

// ─── Checks ─────────────────────────────────────────────────────────────────

/**
 * Per-platform binary stubs are published by release-native.yml on `v*`
 * tag push. They're in the `fixed` group (so version-skew is impossible)
 * AND legitimately need `publishConfig.access: "public"` like any other
 * scoped package — the workflow's `npm publish` honors it.
 */
const PLATFORM_STUB_NAMES = new Set([
  '@pyreon/compiler-darwin-arm64',
  '@pyreon/compiler-darwin-x64',
  '@pyreon/compiler-linux-arm64-gnu',
  '@pyreon/compiler-linux-arm64-musl',
  '@pyreon/compiler-linux-x64-gnu',
  '@pyreon/compiler-linux-x64-musl',
  '@pyreon/compiler-win32-x64-msvc',
])

function checkPublishConfig(
  packages: { path: string; manifest: PackageManifest }[],
): Violation[] {
  const out: Violation[] = []
  for (const { path, manifest } of packages) {
    if (!manifest.name?.startsWith('@pyreon/')) continue
    if (manifest.private === true) continue
    if (manifest.publishConfig?.access === 'public') continue

    out.push({
      package: manifest.name,
      path: path.slice(REPO_ROOT.length + 1),
      reason: 'missing `publishConfig.access: "public"`',
      fix: 'Add `"publishConfig": { "access": "public" }` to the package.json. Other publishable @pyreon/* packages use this convention; without it, a manual `npm publish` (no `--access` flag) could silently treat the package as private.',
    })
  }
  return out
}

function checkFixedGroupCoverage(
  packages: { path: string; manifest: PackageManifest }[],
  changeset: ChangesetConfig,
): Violation[] {
  const fixedSet = new Set<string>()
  for (const group of changeset.fixed ?? []) {
    for (const name of group) fixedSet.add(name)
  }
  const ignoreSet = new Set<string>(changeset.ignore ?? [])

  const out: Violation[] = []
  for (const { path, manifest } of packages) {
    if (!manifest.name?.startsWith('@pyreon/')) continue
    if (manifest.private === true) continue
    if (PLATFORM_STUB_NAMES.has(manifest.name)) continue
    // Already covered:
    if (fixedSet.has(manifest.name)) continue
    if (ignoreSet.has(manifest.name)) continue

    out.push({
      package: manifest.name,
      path: path.slice(REPO_ROOT.length + 1),
      reason:
        'not in the changeset `fixed` group nor `ignore` array — would version-drift on the next release (other packages bump to e.g. 0.27.0, this one stays frozen).',
      fix: `Add "${manifest.name}" to the \`fixed[0]\` array in \`.changeset/config.json\` (default for publishable framework packages) OR to the \`ignore\` array (for packages that ship to git only, never to npm). If this is deliberate — an early-stage package on its own version line — add the \`skip-release-readiness\` label.`,
    })
  }
  return out
}

// ─── Run ────────────────────────────────────────────────────────────────────

const packages = await discoverPackages()
const changeset = await loadChangesetConfig()

const violations: Violation[] = [
  ...checkPublishConfig(packages),
  ...checkFixedGroupCoverage(packages, changeset),
]

if (violations.length === 0) {
  const publishableCount = packages.filter(
    (p) =>
      p.manifest.name?.startsWith('@pyreon/') &&
      p.manifest.private !== true &&
      !PLATFORM_STUB_NAMES.has(p.manifest.name),
  ).length
  console.log(
    `[check-release-readiness] OK — ${publishableCount} publishable @pyreon/* packages all carry publishConfig.access=public AND are in the changeset \`fixed\` group (or \`ignore\` array).`,
  )
  process.exit(0)
}

if (HAS_SKIP_LABEL) {
  console.log(
    `[check-release-readiness] skip-release-readiness label present — bypassing the gate.`,
  )
  console.log(
    `[check-release-readiness] (would-be-${violations.length}-violations:)`,
  )
  for (const v of violations) {
    console.log(`  ${v.package} — ${v.reason}`)
  }
  process.exit(0)
}

console.error(
  `[check-release-readiness] FAILED — ${violations.length} configuration drift(s) detected that would cascade-break the next release:\n`,
)
for (const v of violations) {
  console.error(`  ${v.package} (${v.path})`)
  console.error(`    ${v.reason}`)
  console.error(`    Fix: ${v.fix}`)
  console.error('')
}
console.error(
  'These checks exist because PR #1153 and the subsequent cascade demonstrated',
)
console.error(
  'how subtle configuration drift (a new package missing from `fixed`; a new',
)
console.error(
  'package.json missing `publishConfig.access`) silently makes the release pipeline',
)
console.error(
  'fail in opaque ways. Closing each violation up-front prevents that.',
)
console.error('')
console.error(
  'If a package is INTENTIONALLY outside the fixed group during an early-stage',
)
console.error('rollout, add the `skip-release-readiness` label to bypass.')
process.exit(1)
