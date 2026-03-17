/**
 * Publish all @pyreon/* packages using `bun publish`.
 *
 * `bun publish` resolves workspace:^ → ^X.Y.Z automatically.
 * Skips private packages and already-published versions.
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 */

import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")
const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkg = JSON.parse(await readFile(join(PACKAGES_DIR, dir.name, "package.json"), "utf-8"))
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

  const args = ["bun", "publish", "--access", "public", "--ignore-scripts"]
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
