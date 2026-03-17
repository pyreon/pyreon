/**
 * Publish all @pyreon/* packages to npm using `bun publish`.
 *
 * `bun publish` natively resolves workspace:^ → ^X.Y.Z during pack,
 * so no manual package.json rewriting is needed.
 *
 * Packages are published in topological order (leaves first) to ensure
 * dependencies are available on npm before their dependents.
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 */

import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")

// ── Load all packages ────────────────────────────────────────────────────────

interface PkgInfo {
  dir: string
  name: string
  version: string
  internalDeps: string[]
}

const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })
const packages = new Map<string, PkgInfo>()

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json")
  const parsed = JSON.parse(await readFile(pkgPath, "utf-8"))
  if (parsed.private || !parsed.name) continue
  packages.set(parsed.name, {
    dir: dir.name,
    name: parsed.name,
    version: parsed.version,
    internalDeps: [],
  })
}

for (const pkg of packages.values()) {
  const pkgPath = join(PACKAGES_DIR, pkg.dir, "package.json")
  const parsed = JSON.parse(await readFile(pkgPath, "utf-8"))
  const deps = parsed.dependencies ?? {}
  for (const dep of Object.keys(deps)) {
    if (packages.has(dep)) pkg.internalDeps.push(dep)
  }
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────

function topoSort(pkgs: Map<string, PkgInfo>): PkgInfo[] {
  const inDegree = new Map<string, number>()
  for (const name of pkgs.keys()) inDegree.set(name, 0)
  for (const pkg of pkgs.values()) {
    for (const dep of pkg.internalDeps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1)
    }
  }

  const queue: string[] = []
  for (const [name, degree] of inDegree) {
    if (degree === 0) queue.push(name)
  }

  const sorted: PkgInfo[] = []
  while (queue.length > 0) {
    const name = queue.shift()
    if (!name) break
    const pkg = pkgs.get(name)
    if (!pkg) continue
    sorted.push(pkg)
    for (const dep of pkg.internalDeps) {
      const newDegree = (inDegree.get(dep) ?? 1) - 1
      inDegree.set(dep, newDegree)
      if (newDegree === 0) queue.push(dep)
    }
  }

  return sorted.reverse()
}

// ── Publish ──────────────────────────────────────────────────────────────────

for (const pkg of topoSort(packages)) {
  const check = Bun.spawnSync(["npm", "view", `${pkg.name}@${pkg.version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
  })

  if (check.stdout.toString().trim() === pkg.version) {
    console.log(`⏭️  ${pkg.name}@${pkg.version} — already published`)
    continue
  }

  console.log(`📦 ${pkg.name}@${pkg.version} — publishing...`)

  const args = ["bun", "publish", "--access", "public", "--ignore-scripts"]
  if (dryRun) args.push("--dry-run")

  const result = Bun.spawnSync(args, {
    cwd: join(PACKAGES_DIR, pkg.dir),
    stdout: "inherit",
    stderr: "inherit",
  })

  if (result.exitCode !== 0) {
    console.error(`❌ Failed to publish ${pkg.name}`)
    process.exit(1)
  }
}

console.log("\n✅ Done")
