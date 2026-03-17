/**
 * Publish all @pyreon/* packages using `bun publish`.
 * Resolves workspace:^ automatically. Skips already-published versions.
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")
const isCI = !!process.env.CI
const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })

// Build version map for workspace resolution in CI
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
    continue
  }

  console.log(`📦 ${pkg.name}@${pkg.version}`)

  if (isCI) {
    // CI: use npm publish with --provenance (OIDC auth), resolve workspace deps manually
    const resolved = {
      ...pkg,
      dependencies: resolveWorkspaceDeps(pkg.dependencies),
      peerDependencies: resolveWorkspaceDeps(pkg.peerDependencies),
    }
    await writeFile(pkgPath, `${JSON.stringify(resolved, null, 2)}\n`)
    try {
      const args = ["npm", "publish", "--access", "public", "--provenance", "--ignore-scripts"]
      if (dryRun) args.push("--dry-run")
      const result = Bun.spawnSync(args, {
        cwd: join(PACKAGES_DIR, dir.name),
        stdout: "inherit",
        stderr: "inherit",
      })
      if (result.exitCode !== 0) {
        console.error(`Failed to publish ${pkg.name}`)
        process.exit(1)
      }
    } finally {
      await writeFile(pkgPath, raw)
    }
  } else {
    // Local: bun publish handles workspace resolution natively
    const args = ["bun", "publish", "--access", "public", "--ignore-scripts"]
    if (dryRun) args.push("--dry-run")
    const result = Bun.spawnSync(args, {
      cwd: join(PACKAGES_DIR, dir.name),
      stdout: "inherit",
      stderr: "inherit",
    })
    if (result.exitCode !== 0) {
      console.error(`Failed to publish ${pkg.name}`)
      process.exit(1)
    }
  }
}

console.log("\n✅ Done")
