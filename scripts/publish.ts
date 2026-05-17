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

function resolveWorkspaceDeps(
  deps: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!deps) return deps
  const resolved = { ...deps }
  for (const [name, range] of Object.entries(resolved)) {
    if (range.startsWith('workspace:')) {
      const version = versionMap.get(name)
      if (!version) {
        console.error(`Cannot resolve ${name}`)
        process.exit(1)
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

  console.log(`📦 ${pkg.name}@${pkg.version}`)

  const resolved = {
    ...pkg,
    dependencies: resolveWorkspaceDeps(pkg.dependencies),
    peerDependencies: resolveWorkspaceDeps(pkg.peerDependencies),
    devDependencies: resolveWorkspaceDeps(pkg.devDependencies),
  }
  await writeFile(pkgPath, `${JSON.stringify(resolved, null, 2)}\n`)

  try {
    const isCI = !!process.env.CI
    const args = ['bunx', 'npm', 'publish', '--access', 'public', '--ignore-scripts']
    if (isCI) args.push('--provenance')
    if (otp) args.push(`--otp=${otp}`)
    if (dryRun) args.push('--dry-run')
    if (tag) args.push('--tag', tag)
    const result = Bun.spawnSync(args, {
      cwd: dir.path,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    if (result.exitCode !== 0) {
      console.error(`❌ Failed to publish ${pkg.name}`)
      failed.push(pkg.name)
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
  `\n📊 Published: ${published.length}, Skipped: ${skipped.length}, Failed: ${failed.length}`,
)
if (failed.length > 0) {
  console.error(`\n❌ Failed packages: ${failed.join(', ')}`)
  process.exit(1)
}
console.log('✅ Done')
