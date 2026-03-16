/**
 * Publish script that uses `bun publish` instead of `npm publish`.
 *
 * `bun publish` natively resolves workspace:^ → ^X.Y.Z, so internal
 * dependencies are correct in the published package. `changeset publish`
 * delegates to `npm publish` which doesn't understand workspace protocol.
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 *
 * Publishes every package under packages/* whose version is not yet on npm.
 */

import { readdir } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")

const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json")
  const pkg = await Bun.file(pkgPath).json()

  if (pkg.private) continue

  // Check if this version is already published
  const check = Bun.spawnSync(["npm", "view", `${pkg.name}@${pkg.version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const published = check.stdout.toString().trim()

  if (published === pkg.version) {
    console.log(`⏭️  ${pkg.name}@${pkg.version} — already published`)
    continue
  }

  console.log(`📦 ${pkg.name}@${pkg.version} — publishing...`)

  const args = ["bun", "publish", "--access", "public"]
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
}

console.log("\n✅ Done")
