/**
 * Publish script that resolves workspace:^ before npm publish.
 *
 * Bun workspaces use `workspace:^` for internal dependencies, but
 * `npm publish` doesn't understand workspace protocol. This script:
 *   1. Reads each package.json
 *   2. Resolves `workspace:^` → `^X.Y.Z` using versions from the monorepo
 *   3. Writes the resolved package.json
 *   4. Runs `npm publish`
 *   5. Restores the original package.json
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")

// Build a map of package name → version from the monorepo
const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })
const versionMap = new Map<string, string>()

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json")
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"))
  if (pkg.name) versionMap.set(pkg.name, pkg.version)
}

// Resolve workspace:^ in a dependency map
function resolveDeps(deps: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!deps) return deps
  const resolved = { ...deps }
  for (const [name, range] of Object.entries(resolved)) {
    if (range.startsWith("workspace:")) {
      const version = versionMap.get(name)
      if (!version) {
        console.error(`❌ Cannot resolve ${name} — not found in monorepo`)
        process.exit(1)
      }
      // workspace:^ → ^X.Y.Z, workspace:~ → ~X.Y.Z, workspace:* → X.Y.Z
      const prefix = range.replace("workspace:", "")
      resolved[name] = prefix === "*" ? version : `${prefix}${version}`
    }
  }
  return resolved
}

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json")
  const originalContent = await readFile(pkgPath, "utf-8")
  const pkg = JSON.parse(originalContent)

  if (pkg.private) continue

  // Check if this version is already published
  const check = Bun.spawnSync(["npm", "view", `${pkg.name}@${pkg.version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
  })

  if (check.stdout.toString().trim() === pkg.version) {
    console.log(`⏭️  ${pkg.name}@${pkg.version} — already published`)
    continue
  }

  console.log(`📦 ${pkg.name}@${pkg.version} — publishing...`)

  // Resolve workspace deps and write temporary package.json
  const resolved = {
    ...pkg,
    dependencies: resolveDeps(pkg.dependencies),
    devDependencies: resolveDeps(pkg.devDependencies),
    peerDependencies: resolveDeps(pkg.peerDependencies),
    optionalDependencies: resolveDeps(pkg.optionalDependencies),
  }
  await writeFile(pkgPath, `${JSON.stringify(resolved, null, 2)}\n`)

  try {
    const args = ["npm", "publish", "--access", "public"]
    if (dryRun) args.push("--dry-run")

    const result = Bun.spawnSync(args, {
      cwd: join(PACKAGES_DIR, dir.name),
      stdout: "inherit",
      stderr: "inherit",
    })

    if (result.exitCode !== 0) {
      console.error(`❌ Failed to publish ${pkg.name}`)
      process.exit(1)
    }
  } finally {
    // Always restore original package.json
    await writeFile(pkgPath, originalContent)
  }
}

console.log("\n✅ Done")
