/**
 * Publish script that resolves workspace:* dependencies before running
 * `changeset publish`, then restores the original package.json files.
 *
 * Usage: bun run scripts/publish.ts [--otp=CODE]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execSync } from "node:child_process"

const root = join(import.meta.dirname, "..")
const packagesDir = join(root, "packages")

// Collect all package versions first
const packages = new Map<string, string>()
const dirs = execSync("ls", { cwd: packagesDir, encoding: "utf8" }).trim().split("\n")

for (const dir of dirs) {
  const pkgPath = join(packagesDir, dir, "package.json")
  if (!existsSync(pkgPath)) continue
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  packages.set(pkg.name, pkg.version)
}

// Save originals and resolve workspace:* deps
const originals = new Map<string, string>()
const depFields = ["dependencies", "peerDependencies", "optionalDependencies"] as const

for (const dir of dirs) {
  const pkgPath = join(packagesDir, dir, "package.json")
  if (!existsSync(pkgPath)) continue

  const raw = readFileSync(pkgPath, "utf8")
  const pkg = JSON.parse(raw)

  let modified = false
  for (const field of depFields) {
    const deps = pkg[field]
    if (!deps) continue
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        const resolvedVersion = packages.get(name)
        if (resolvedVersion) {
          deps[name] = `^${resolvedVersion}`
          modified = true
        }
      }
    }
  }

  if (modified) {
    originals.set(pkgPath, raw)
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
    console.log(`  resolved workspace deps for ${pkg.name}`)
  }
}

// Run changeset publish, forwarding any CLI args (like --otp)
const args = process.argv.slice(2).join(" ")
try {
  execSync(`changeset publish ${args}`, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env },
  })
} finally {
  // Always restore originals
  for (const [path, content] of originals) {
    writeFileSync(path, content)
  }
  console.log("\n  restored workspace:* dependencies in source files")
}
