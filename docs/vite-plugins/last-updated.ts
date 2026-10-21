/**
 * vite-plugin-last-updated — generates a per-page last-modified
 * timestamp map from `git log` and exposes it on the client as
 * `globalThis.__PYREON_DOCS_LAST_UPDATED__`.
 *
 * The map is built once at config-resolve time + refreshed on HMR
 * when any .md file changes. The map is injected via an `html-tags`
 * `transformIndexHtml` hook so the entry HTML carries:
 *
 *   <script>window.__PYREON_DOCS_LAST_UPDATED__ = { ... }</script>
 *
 * Mirrors VitePress's `lastUpdated: true` config — same data source
 * (git log), same per-page granularity.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

interface LastUpdatedPluginOptions {
  /** Directory containing `.md` files (relative to the project root). */
  contentDir: string
}

export default function lastUpdatedPlugin(
  options: LastUpdatedPluginOptions,
): Plugin {
  let projectRoot = ''
  let registry: Record<string, string> = {}

  const rebuild = () => {
    registry = buildRegistry(projectRoot, options.contentDir)
  }

  return {
    name: 'pyreon-docs-last-updated',
    enforce: 'pre',

    configResolved(config) {
      projectRoot = config.root
      rebuild()
    },

    handleHotUpdate(ctx) {
      if (ctx.file.endsWith('.md') || ctx.file.endsWith('.mdx')) {
        rebuild()
      }
      return undefined
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          children: `window.__PYREON_DOCS_LAST_UPDATED__ = ${JSON.stringify(registry)};`,
          injectTo: 'head' as const,
        },
      ]
    },
  }
}

function buildRegistry(
  projectRoot: string,
  contentDir: string,
): Record<string, string> {
  const absContentDir = join(projectRoot, contentDir)
  const files: string[] = []
  walk(absContentDir, files)
  const latest = latestCommitDates(absContentDir)
  const out: Record<string, string> = {}
  for (const file of files) {
    const rel = relative(absContentDir, file).split(sep).join('/')
    const ts = latest.get(rel)
    // Untracked files have no history and are skipped, as before.
    if (ts) out[rel.replace(/\.(md|mdx)$/, '')] = ts
  }
  return out
}

/**
 * Author date of the most recent commit touching each file under `dir`,
 * keyed by path relative to `dir`.
 *
 * ONE `git log` over the directory instead of a `git log -1 -- <file>` per
 * page: the per-file form spawned a process per document (200+ of them,
 * ~7.8s of a docs build). `git log` lists commits newest-first, so the first
 * time a path appears is its latest change, which is what `-1 -- <file>`
 * returned. `--relative` keys paths to `dir` (no worry about how the repo
 * root is spelled), and `core.quotePath=false` keeps non-ASCII names
 * verbatim instead of octal-quoted.
 */
function latestCommitDates(dir: string): Map<string, string> {
  const latest = new Map<string, string>()
  let log: string
  try {
    log = execFileSync(
      'git',
      ['-c', 'core.quotePath=false', 'log', '--format=%x00%aI', '--name-only', '--relative', '--', '.'],
      { encoding: 'utf8', cwd: dir, maxBuffer: 256 * 1024 * 1024 },
    )
  } catch {
    // Not a git checkout, or git unavailable — no dates, as before.
    return latest
  }
  let date = ''
  for (const line of log.split('\n')) {
    if (line.startsWith('\0')) date = line.slice(1)
    else if (line !== '' && !latest.has(line)) latest.set(line, date)
  }
  return latest
}

function walk(dir: string, out: string[]): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      walk(full, out)
      continue
    }
    if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(full)
  }
}
