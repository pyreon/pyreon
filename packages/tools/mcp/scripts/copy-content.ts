/**
 * copy-content — snapshot the monorepo-sourced content the MCP's doc/content
 * tools serve into a `content/` dir the published package ships (declared in
 * `package.json` `files`). Runs as part of `bun run build`.
 *
 * Why bundle: `get_pattern` / `get_anti_patterns` / `get_changelog` read
 * their data from monorepo files (`docs/src/content/docs/patterns/*.md`,
 * `.claude/rules/anti-patterns.md`, `packages/**​/CHANGELOG.md`). None of
 * those exist in a `bunx @pyreon/mcp` consumer install, so without a
 * bundled snapshot the tools returned empty. The loaders prefer the live
 * monorepo source when present (in-repo dev sees latest) and fall back to
 * this snapshot otherwise — so the snapshot must be regenerated on every
 * build so the shipped tarball's content matches that mcp version.
 *
 * Idempotent: the target dir is wiped + rewritten on each run.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// scripts/ → mcp/ (the package root)
const PKG_ROOT = resolve(HERE, '..')
const CONTENT_DIR = join(PKG_ROOT, 'content')

/** Walk up from the package until we hit the monorepo root (has `.changeset` + `packages`). */
function findMonorepoRoot(start: string): string | null {
  let dir = resolve(start)
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, 'packages')) &&
      existsSync(join(dir, '.changeset'))
    ) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function copyPatterns(root: string): number {
  const src = join(root, 'docs', 'src', 'content', 'docs', 'patterns')
  if (!existsSync(src)) return 0
  const dest = join(CONTENT_DIR, 'patterns')
  mkdirSync(dest, { recursive: true })
  let count = 0
  for (const entry of readdirSync(src)) {
    if (!entry.endsWith('.md')) continue
    if (entry.startsWith('.') || entry === 'README.md' || entry === 'index.md') continue
    cpSync(join(src, entry), join(dest, entry))
    count++
  }
  return count
}

function copyAntiPatterns(root: string): boolean {
  const src = join(root, '.claude', 'rules', 'anti-patterns.md')
  if (!existsSync(src)) return false
  cpSync(src, join(CONTENT_DIR, 'anti-patterns.md'))
  return true
}

/**
 * Snapshot every `packages/**​/CHANGELOG.md`. The package name is the file's
 * own first `# @pyreon/x` heading, so the bundled loader re-derives it — no
 * separate index needed. Filenames are the sanitised name so two packages
 * can't collide.
 */
function copyChangelogs(root: string): number {
  const dest = join(CONTENT_DIR, 'changelogs')
  mkdirSync(dest, { recursive: true })
  const found: string[] = []
  walk(join(root, 'packages'), 0)
  return found.length

  function walk(dir: string, depth: number): void {
    if (depth > 4) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules') continue
      const full = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (!isDir) continue
      const pkgJson = join(full, 'package.json')
      const changelog = join(full, 'CHANGELOG.md')
      if (existsSync(pkgJson) && existsSync(changelog)) {
        let pkgName: string | null = null
        try {
          const parsed = JSON.parse(readFileSync(pkgJson, 'utf8')) as { name?: unknown }
          if (typeof parsed.name === 'string') pkgName = parsed.name
        } catch {
          // ignore malformed
        }
        if (pkgName) {
          const safe = pkgName.replace(/^@/, '').replace(/\//g, '__')
          cpSync(changelog, join(dest, `${safe}.md`))
          found.push(pkgName)
        }
        continue // don't recurse into a package
      }
      if (existsSync(pkgJson)) continue // package w/o changelog — don't recurse
      walk(full, depth + 1)
    }
  }
}

function main(): void {
  const root = findMonorepoRoot(PKG_ROOT)
  if (!root) {
    // Not in the monorepo (e.g. a consumer running a stray build) — nothing
    // to snapshot. Don't fail the build.
    console.warn('[mcp copy-content] monorepo root not found; skipping content snapshot')
    return
  }

  // Idempotent: wipe + rebuild.
  rmSync(CONTENT_DIR, { recursive: true, force: true })
  mkdirSync(CONTENT_DIR, { recursive: true })

  const patterns = copyPatterns(root)
  const antiPatterns = copyAntiPatterns(root)
  const changelogs = copyChangelogs(root)

  console.log(
    `[mcp copy-content] bundled ${patterns} pattern(s), ` +
      `anti-patterns: ${antiPatterns ? 'yes' : 'no'}, ` +
      `${changelogs} changelog(s) → ${CONTENT_DIR}`,
  )
}

main()
