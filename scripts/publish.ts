/**
 * Publish all @pyreon/* packages via `npm publish --provenance`.
 * Resolves workspace:^ → ^X.Y.Z before publish, restores after.
 * Skips already-published versions.
 *
 * Usage: bun run scripts/publish.ts [--dry-run] [--tag <tag>] [--otp=<code>]
 *
 *   --tag <tag>   npm dist-tag for the published version. Defaults to
 *                 `latest`. Used by the prerelease workflow to publish
 *                 snapshot builds (e.g. 0.15.1-alpha-XXXX) under the
 *                 `next` tag so consumers can opt in via `@pkg@next`.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { topoSortByWorkspaceDeps } from './publish-order'
import { stripBunCondition, stripSrcFromFiles } from './strip-bun-condition'

const PACKAGES_DIR = join(import.meta.dirname, '..', 'packages')
const dryRun = process.argv.includes('--dry-run')
const otpArg = process.argv.find((a) => a.startsWith('--otp='))
const otp = otpArg?.split('=')[1]
const tagFlagIndex = process.argv.indexOf('--tag')
const tag = tagFlagIndex >= 0 ? process.argv[tagFlagIndex + 1] : undefined

// Per-platform npm stub packages — published exclusively by
// .github/workflows/release-native.yml on tag push (the workflow downloads
// the platform-specific binary, drops it into the stub, and runs `npm
// publish` per cell). Skip them here to avoid duplicate-publish errors
// (npm rejects republishing the same version) and the deeper bug shape
// where this script would publish empty stubs (no binary inside) BEFORE
// the workflow's matrix even starts.
const PLATFORM_STUB_PACKAGES = new Set([
  '@pyreon/compiler-darwin-arm64',
  '@pyreon/compiler-darwin-x64',
  '@pyreon/compiler-linux-arm64-gnu',
  '@pyreon/compiler-linux-arm64-musl',
  '@pyreon/compiler-linux-x64-gnu',
  '@pyreon/compiler-linux-x64-musl',
  '@pyreon/compiler-win32-x64-msvc',
])

// Collect all package directories (packages/*/*)
const packageDirs: { path: string; name: string }[] = []
const categories = await readdir(PACKAGES_DIR, { withFileTypes: true })
for (const cat of categories.filter((d) => d.isDirectory())) {
  const subs = await readdir(join(PACKAGES_DIR, cat.name), { withFileTypes: true })
  for (const sub of subs.filter((d) => d.isDirectory())) {
    packageDirs.push({ path: join(PACKAGES_DIR, cat.name, sub.name), name: sub.name })
  }
}

const versionMap = new Map<string, string>()
for (const dir of packageDirs) {
  try {
    const pkg = JSON.parse(await readFile(join(dir.path, 'package.json'), 'utf-8'))
    if (pkg.name) versionMap.set(pkg.name, pkg.version)
  } catch {
    // skip directories without package.json
  }
}

// The 7 `@pyreon/compiler-<triple>` native stub packages live one level
// DEEPER (`packages/core/compiler/npm/<triple>`) than the `packages/*/*`
// discovery above, so they were absent from `versionMap`. Once PR #644
// started routing `optionalDependencies` through `resolveWorkspaceDeps()`
// (the right fix for the `workspace:^` leak), `@pyreon/compiler`'s
// optional deps had no resolvable version → `resolveWorkspaceDeps`
// hit `Cannot resolve @pyreon/compiler-darwin-arm64` and `process.exit(1)`
// MID-RELEASE, after ~N packages had already published (immutable
// partial release). These stubs are published by `release-native.yml`,
// not here (see PLATFORM_STUB_PACKAGES skip below) — but their versions
// MUST be known so the parent's `optionalDependencies` resolve to
// `^X.Y.Z`. They version-lock to the parent via changesets.
const stubBase = join(PACKAGES_DIR, 'core', 'compiler', 'npm')
try {
  const stubDirs = (await readdir(stubBase, { withFileTypes: true })).filter(
    (d) => d.isDirectory(),
  )
  for (const sub of stubDirs) {
    try {
      const pkg = JSON.parse(
        await readFile(join(stubBase, sub.name, 'package.json'), 'utf-8'),
      )
      if (pkg.name) versionMap.set(pkg.name, pkg.version)
    } catch {
      // skip a stub dir without package.json
    }
  }
} catch {
  // npm/ dir absent (non-monorepo checkout) — nothing to add
}

// Collects failures into `errors` instead of `process.exit(1)`. The old
// exit-on-first-failure ran INSIDE the publish loop, so an unresolvable
// workspace dep on package N aborted AFTER 1..N-1 had already published
// (an immutable partial release — exactly what broke 0.19.0). Phase 1
// below resolves the whole set first and aborts as a batch before any
// `npm publish`, so a pre-detectable manifest problem can never leave a
// partial release.
function resolveWorkspaceDeps(
  deps: Record<string, string> | undefined,
  pkgName: string,
  errors: string[],
): Record<string, string> | undefined {
  if (!deps) return deps
  const resolved = { ...deps }
  for (const [name, range] of Object.entries(resolved)) {
    if (range.startsWith('workspace:')) {
      const version = versionMap.get(name)
      if (!version) {
        errors.push(
          `${pkgName}: cannot resolve workspace dependency "${name}" ` +
            `(no version found in the workspace) — range "${range}"`,
        )
        continue
      }
      const prefix = range.replace('workspace:', '')
      resolved[name] = prefix === '*' ? version : `${prefix}${version}`
    }
  }
  return resolved
}


const failed: string[] = []
const published: string[] = []
const skipped: string[] = []
/**
 * Packages that 404'd on `npm publish` because they don't exist on npm
 * yet — the OIDC trusted-publisher chicken-and-egg constraint:
 * `id-token`-based publish requires the package to already exist on npm
 * with a Trusted Publisher attached. The very first publish of any new
 * scoped package can't go through OIDC and must be bootstrapped
 * manually with a classic npm token.
 *
 * Tracked SEPARATELY from `failed` so the release pipeline can:
 *   1. continue publishing the other packages cleanly,
 *   2. exit 0 (so changesets-action's `outputs.published === 'true'`
 *      gate fires, the umbrella `v<version>` tag pushes, and
 *      `release-native.yml` runs to publish native compiler binaries),
 *   3. surface the bootstrap-needed packages as a clear, actionable
 *      WARNING — not a release-blocking error.
 *
 * This is the systemic fix to the cascade failure observed on PR #1153's
 * release: 3 new packages (@pyreon/validate, @pyreon/primitives,
 * @pyreon/create-multiplatform) needed first-publish bootstrap, the
 * old behavior exited 1 on the first 404 → blocked the umbrella tag →
 * blocked release-native.yml → native binaries stuck at 0.24.2 on npm
 * even though the local source is at 0.26.x. Categorizing 404-on-PUT
 * as "needs manual bootstrap" (not a real failure) breaks the cascade.
 */
const needsBootstrap: string[] = []

// ── Phase 1 — resolve + validate EVERY manifest. No `npm publish`
// happens here. Skip logic (private / stub / already-published) is
// applied so the plan reflects exactly what Phase 2 will publish. Any
// deterministic manifest problem (unresolvable workspace dep, or a
// `workspace:` range surviving resolution) is COLLECTED, not exited on
// — Phase 1 reports every problem at once and aborts the whole release
// BEFORE a single package publishes. This is the structural guarantee
// that a pre-detectable failure can never leave an immutable partial
// release (the failure mode that broke 0.19.0 mid-loop).
type PlanEntry = {
  dirPath: string
  pkgPath: string
  raw: string
  pkg: { name: string; version: string }
  resolved: Record<string, unknown>
}
const plan: PlanEntry[] = []
const resolveErrors: string[] = []

for (const dir of packageDirs) {
  const pkgPath = join(dir.path, 'package.json')
  const raw = await readFile(pkgPath, 'utf-8')
  const pkg = JSON.parse(raw)
  if (pkg.private || !pkg.name) continue
  if (PLATFORM_STUB_PACKAGES.has(pkg.name)) {
    console.log(`⏭️  ${pkg.name}@${pkg.version} — published by release-native.yml`)
    skipped.push(pkg.name)
    continue
  }

  const check = Bun.spawnSync(['npm', 'view', `${pkg.name}@${pkg.version}`, 'version'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (check.stdout.toString().trim() === pkg.version) {
    console.log(`⏭️  ${pkg.name}@${pkg.version} — already published`)
    skipped.push(pkg.name)
    continue
  }

  const resolved = {
    ...pkg,
    // Strip the `bun` condition from `exports` AND `src` from `files`
    // at publish time. See `stripBunCondition` JSDoc for the full
    // rationale — eliminates the dual-resolution module-duplication
    // bug class at the source. Stripping `src` from `files` makes the
    // tarball lean (only `lib/` is reachable post-strip, so shipping
    // `src/` is pure waste).
    ...(pkg.exports ? { exports: stripBunCondition(pkg.exports) } : {}),
    ...(pkg.files ? { files: stripSrcFromFiles(pkg.files) } : {}),
    dependencies: resolveWorkspaceDeps(pkg.dependencies, pkg.name, resolveErrors),
    peerDependencies: resolveWorkspaceDeps(pkg.peerDependencies, pkg.name, resolveErrors),
    devDependencies: resolveWorkspaceDeps(pkg.devDependencies, pkg.name, resolveErrors),
    // `optionalDependencies` is the field that broke the 0.18.0 compiler
    // release (shipped as literal `"workspace:^"` → `npm i` hard-fails
    // with `EUNSUPPORTEDPROTOCOL`). Must be resolved too.
    optionalDependencies: resolveWorkspaceDeps(
      pkg.optionalDependencies,
      pkg.name,
      resolveErrors,
    ),
  }

  // Defense-in-depth: a `workspace:` range surviving into ANY dep field
  // (e.g. a new field added to package.json but not to the resolve list
  // above — exactly how `optionalDependencies` slipped through). Collect,
  // don't exit — batched + aborted in Phase 1 before any publish.
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const) {
    const deps = resolved[field] as Record<string, string> | undefined
    if (!deps) continue
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range === 'string' && range.startsWith('workspace:')) {
        resolveErrors.push(
          `${pkg.name}: unresolved \`workspace:\` range for ${name} in ` +
            `${field} ("${range}") — add ${field} to resolveWorkspaceDeps() ` +
            `in scripts/publish.ts`,
        )
      }
    }
  }

  plan.push({ dirPath: dir.path, pkgPath, raw, pkg, resolved })
}

if (resolveErrors.length > 0) {
  console.error(
    `\n✗ Refusing to publish — ${resolveErrors.length} manifest problem(s) ` +
      `detected BEFORE any package was published. ZERO packages published:\n`,
  )
  for (const e of resolveErrors) console.error(`  • ${e}`)
  console.error(
    `\nFix the above and re-run. publish.ts skips already-published ` +
      `versions, so a re-run resumes cleanly.`,
  )
  process.exit(1)
}

// ── Phase 2 — publish the fully-validated plan LEAF-FIRST. A package is
// published only AFTER every intra-workspace `@pyreon/*` package it depends
// on, so a dependent is never on npm carrying a `^X.Y.Z` range on a sibling
// that hasn't published yet (which made `bun install` unresolvable in the
// window — see scripts/publish-order.ts). Directory/alphabetical order was
// NOT dependency-safe (e.g. `@pyreon/feature` sorts before its dep
// `@pyreon/form`). Only `dependencies` + `peerDependencies` gate the order
// (install-time requirements); devDependencies are stripped from the tarball
// and never affect a consumer's resolution.
const publishOrder = topoSortByWorkspaceDeps(
  plan.map((entry) => {
    const r = entry.resolved as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    const deps = [...Object.keys(r.dependencies ?? {}), ...Object.keys(r.peerDependencies ?? {})]
    return { name: entry.pkg.name, deps, entry }
  }),
).map((node) => node.entry)

// Phase 2 (continued). Every manifest here is guaranteed `workspace:`-free.
// The only failures possible now are network / npm-side (transient) —
// reported via `failed[]` + exit 1, and a re-run resumes (skip-if-published).
// The deterministic manifest-resolution bug class can no longer cause a
// partial release.
for (const { dirPath, pkgPath, raw, pkg, resolved } of publishOrder) {
  console.log(`📦 ${pkg.name}@${pkg.version}`)
  await writeFile(pkgPath, `${JSON.stringify(resolved, null, 2)}\n`)

  try {
    const isCI = !!process.env.CI
    const args = ['bunx', 'npm', 'publish', '--access', 'public', '--ignore-scripts']
    // Provenance attests a real published artifact — it is meaningless for a
    // `--dry-run` (nothing is uploaded to attest) and requires an OIDC token
    // the dry-run gate (Release Build CI job) deliberately does NOT grant.
    // Gate it on a real publish so the dry-run stays auth-free.
    if (isCI && !dryRun) args.push('--provenance')
    if (otp) args.push(`--otp=${otp}`)
    if (dryRun) args.push('--dry-run')
    if (tag) args.push('--tag', tag)
    // `pipe` (not `inherit`) so we can categorize npm errors as
    // "first-publish needs bootstrap" vs real failures. The captured
    // stderr is forwarded verbatim so the user still sees npm's full
    // output in CI logs (no loss of diagnostic info).
    const result = Bun.spawnSync(args, {
      cwd: dirPath,
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdoutText = new TextDecoder().decode(result.stdout)
    const stderrText = new TextDecoder().decode(result.stderr)
    // Forward npm's output so CI logs / interactive runs still show it.
    if (stdoutText) process.stdout.write(stdoutText)
    if (stderrText) process.stderr.write(stderrText)

    if (result.exitCode !== 0) {
      // Categorize: is this an OIDC trusted-publisher chicken-and-egg
      // 404 (the package doesn't exist on npm yet) vs a real publish
      // failure (auth, network, validation, transient registry error)?
      //
      // The 404-on-PUT signature: npm returns
      //   "npm error 404 Not Found - PUT https://registry.npmjs.org/@scope/pkg"
      //   "could not be found or you do not have permission to access it"
      // ONLY when the package doesn't exist AND OIDC can't create it
      // (Trusted Publisher must be configured per-package on npmjs.com).
      //
      // First-publish bootstrap is a maintainer task (classic npm token
      // + manual trusted-publisher setup); it should NOT block the rest
      // of the release. Other failures (5xx, auth, etc.) DO block — they
      // indicate a real registry or workflow problem worth halting on.
      const is404NeedsBootstrap =
        /npm (error|ERR!) 404 Not Found - PUT/i.test(stderrText) &&
        /could not be found or you do not have permission to access/i.test(stderrText)
      if (is404NeedsBootstrap) {
        console.warn(
          `⚠️  ${pkg.name} not on npm yet — needs manual bootstrap (classic npm token publish + Trusted Publisher setup on npmjs.com). Skipping; release continues.`,
        )
        needsBootstrap.push(pkg.name)
      } else {
        console.error(`❌ Failed to publish ${pkg.name}`)
        failed.push(pkg.name)
      }
    } else {
      // Create the local git tag for this package@version. changesets/action
      // parses every `New tag: …` line below, populates outputs.published +
      // outputs.publishedPackages, AND issues `git push origin <name>@<ver>`
      // per parsed entry — expecting the local tag to already exist (this is
      // what `changeset publish` from the CLI does natively). Without the
      // local tag, push fails with `src refspec X does not match any`, the
      // changesets/action step exits non-zero, and the gated umbrella
      // GitHub Release step (which creates v<version> tag → release-native.yml)
      // silently skips. Skip the create if the tag already exists locally
      // (retried run, etc.) — push of an existing tag with the same target
      // is a no-op anyway. Annotated tag (-a -m) so it carries a timestamp
      // and a clear release message, matching the per-package tag style
      // `changesets/cli` emits.
      const tagName = `${pkg.name}@${pkg.version}`
      const exists = Bun.spawnSync(['git', 'tag', '-l', tagName], { stdout: 'pipe' })
      if (exists.stdout.toString().trim() === '') {
        Bun.spawnSync(['git', 'tag', '-a', tagName, '-m', `Release ${tagName}`])
      }

      // Emit the line format changesets/action parses to populate
      // outputs.published + outputs.publishedPackages. The action's
      // src/run.ts matches /New tag:\s+(@[^/]+\/[^@]+|[^/]+)@([^\s]+)/
      // per-line; without this, outputs.published stays 'false' and the
      // umbrella GitHub Release step (gated on it) silently skips.
      console.log(`New tag: ${pkg.name}@${pkg.version}`)
      published.push(pkg.name)
    }
  } finally {
    await writeFile(pkgPath, raw)
  }
}

console.log(
  `\n📊 Published: ${published.length}, Skipped: ${skipped.length}, Failed: ${failed.length}, Needs bootstrap: ${needsBootstrap.length}`,
)

// `needsBootstrap` is non-blocking — surface as a WARNING so the
// maintainer sees the actionable list, but exit 0 (or fall through to
// the real-failure check below). This keeps the umbrella tag step
// firing → release-native.yml runs → native binaries publish, even
// when a brand-new package needs manual bootstrap.
if (needsBootstrap.length > 0) {
  console.warn(`\n⚠️  Needs manual bootstrap (NOT release-blocking):`)
  for (const name of needsBootstrap) {
    console.warn(`   - ${name}`)
  }
  console.warn(
    '\n   For each: from the package directory run `bun publish --access=public`',
  )
  console.warn(
    '   with a classic npm token, then add a Trusted Publisher on npmjs.com',
  )
  console.warn(
    '   (GitHub Actions → pyreon/pyreon → release.yml, no environment).',
  )
  console.warn(
    '   Subsequent publishes go through OIDC like the rest of the suite.',
  )
}

if (failed.length > 0) {
  console.error(`\n❌ Failed packages: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('✅ Done')
