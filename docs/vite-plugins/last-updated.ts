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
import { execSync } from 'node:child_process'
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
  const out: Record<string, string> = {}
  for (const file of files) {
    const rel = relative(absContentDir, file).split(sep).join('/')
    const slug = rel.replace(/\.(md|mdx)$/, '')
    try {
      const ts = execSync(
        `git log -1 --format=%aI -- "${file}"`,
        { encoding: 'utf8', cwd: projectRoot },
      ).trim()
      if (ts) out[slug] = ts
    } catch {
      // Untracked file or git unavailable — skip silently.
    }
  }
  return out
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
