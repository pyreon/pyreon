/**
 * Publish all @pyreon/* packages via `npm publish --provenance`.
 * Resolves workspace:^ → ^X.Y.Z before publish, restores after.
 * Skips already-published versions.
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")
const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })

const versionMap = new Map<string, string>()
for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkg = JSON.parse(await readFile(join(PACKAGES_DIR, dir.name, "package.json"), "utf-8"))
  if (pkg.name) versionMap.set(pkg.name, pkg.version)
}

function resolveWorkspaceDeps(
  deps: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!deps) return deps
  const resolved = { ...deps }
  for (const [name, range] of Object.entries(resolved)) {
    if (range.startsWith("workspace:")) {
      const version = versionMap.get(name)
      if (!version) {
        console.error(`Cannot resolve ${name}`)
        process.exit(1)
      }
      const prefix = range.replace("workspace:", "")
      resolved[name] = prefix === "*" ? version : `${prefix}${version}`
    }
  }
  return resolved
}

const failed: string[] = []
const published: string[] = []
const skipped: string[] = []

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json")
  const raw = await readFile(pkgPath, "utf-8")
  const pkg = JSON.parse(raw)
  if (pkg.private || !pkg.name) continue

  const check = Bun.spawnSync(["npm", "view", `${pkg.name}@${pkg.version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
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
  }
  await writeFile(pkgPath, `${JSON.stringify(resolved, null, 2)}\n`)

  try {
    const args = [
      "bunx",
      "npm",
      "publish",
      "--access",
      "public",
      "--provenance",
      "--ignore-scripts",
    ]
    if (dryRun) args.push("--dry-run")
    const result = Bun.spawnSync(args, {
      cwd: join(PACKAGES_DIR, dir.name),
      stdout: "inherit",
      stderr: "inherit",
    })
    if (result.exitCode !== 0) {
      console.error(`❌ Failed to publish ${pkg.name}`)
      failed.push(pkg.name)
    } else {
      published.push(pkg.name)
    }
  } finally {
    await writeFile(pkgPath, raw)
  }
}

console.log(`\n📊 Published: ${published.length}, Skipped: ${skipped.length}, Failed: ${failed.length}`)
if (failed.length > 0) {
  console.error(`\n❌ Failed packages: ${failed.join(", ")}`)
  process.exit(1)
}
console.log("✅ Done")
