/**
 * Publish script that resolves workspace:^ before npm publish.
 *
 * Bun workspaces use `workspace:^` for internal dependencies, but
 * `npm publish` doesn't understand workspace protocol. This script:
 *   1. Reads each package.json and builds a dependency graph
 *   2. Publishes in topological order (leaves first)
 *   3. Resolves `workspace:^` → `^X.Y.Z` in a temporary rewrite
 *   4. Runs `npm publish --ignore-scripts` (build is done upfront)
 *   5. Restores the original package.json
 *
 * Usage: bun run scripts/publish.ts [--dry-run]
 */

import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"

const PACKAGES_DIR = join(import.meta.dirname, "..", "packages")
const dryRun = process.argv.includes("--dry-run")

// ── Load all packages ────────────────────────────────────────────────────────

interface PkgInfo {
  dir: string
  name: string
  version: string
  content: string
  parsed: Record<string, unknown>
  internalDeps: string[]
}

const dirs = await readdir(PACKAGES_DIR, { withFileTypes: true })
const packages = new Map<string, PkgInfo>()

for (const dir of dirs.filter((d) => d.isDirectory())) {
  const pkgPath = join(PACKAGES_DIR, dir.name, "package.json")
  const content = await readFile(pkgPath, "utf-8")
  const parsed = JSON.parse(content)
  if (parsed.private || !parsed.name) continue
  packages.set(parsed.name, {
    dir: dir.name,
    name: parsed.name,
    version: parsed.version,
    content,
    parsed,
    internalDeps: [],
  })
}

// Build internal dependency edges
for (const pkg of packages.values()) {
  const deps = (pkg.parsed as Record<string, Record<string, string>>).dependencies ?? {}
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

  // Start with leaves (no dependents within the monorepo)
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

  // Reverse: we want deps published before dependents
  return sorted.reverse()
}

const ordered = topoSort(packages)

// ── Version map for workspace resolution ─────────────────────────────────────

const versionMap = new Map<string, string>()
for (const pkg of packages.values()) {
  versionMap.set(pkg.name, pkg.version)
}

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
      const prefix = range.replace("workspace:", "")
      resolved[name] = prefix === "*" ? version : `${prefix}${version}`
    }
  }
  return resolved
}

// ── Publish ──────────────────────────────────────────────────────────────────

for (const pkg of ordered) {
  const pkgPath = join(PACKAGES_DIR, pkg.dir, "package.json")

  // Check if already published
  const check = Bun.spawnSync(["npm", "view", `${pkg.name}@${pkg.version}`, "version"], {
    stdout: "pipe",
    stderr: "pipe",
  })

  if (check.stdout.toString().trim() === pkg.version) {
    console.log(`⏭️  ${pkg.name}@${pkg.version} — already published`)
    continue
  }

  console.log(`📦 ${pkg.name}@${pkg.version} — publishing...`)

  const resolved = {
    ...pkg.parsed,
    dependencies: resolveDeps((pkg.parsed as Record<string, Record<string, string>>).dependencies),
    peerDependencies: resolveDeps(
      (pkg.parsed as Record<string, Record<string, string>>).peerDependencies,
    ),
    optionalDependencies: resolveDeps(
      (pkg.parsed as Record<string, Record<string, string>>).optionalDependencies,
    ),
  }
  await writeFile(pkgPath, `${JSON.stringify(resolved, null, 2)}\n`)

  try {
    const args = ["npm", "publish", "--access", "public", "--ignore-scripts"]
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
  } finally {
    await writeFile(pkgPath, pkg.content)
  }
}

console.log("\n✅ Done")
