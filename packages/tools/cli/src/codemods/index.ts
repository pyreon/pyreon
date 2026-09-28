/**
 * The codemod registry `pyreon upgrade` runs. A breaking (0.x minor)
 * changeset for `@pyreon/zero` must name one of these ids — or explain why
 * no codemod is possible — which `scripts/check-breaking-changeset-codemod.ts`
 * enforces.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Codemod } from './types'
import { zeroRemoveViteOption } from './zero-remove-vite-option'

export type { Codemod } from './types'

export const CODEMODS: readonly Codemod[] = [zeroRemoveViteOption]

function versionKey(v: string): number[] {
  return (/^(\d+)\.(\d+)\.(\d+)/.exec(v) ?? [0, 0, 0, 0]).slice(1).map(Number)
}

/** -1 / 0 / 1 for release versions (prerelease tags ignored). */
export function compareRelease(a: string, b: string): number {
  const ka = versionKey(a)
  const kb = versionKey(b)
  for (let i = 0; i < 3; i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/**
 * Codemods an upgrade from `from` to `to` crosses (`from < introducedIn <= to`),
 * oldest first so later migrations see earlier ones' output.
 */
export function selectCodemods(from: string, to: string, all: readonly Codemod[] = CODEMODS): Codemod[] {
  return all
    .filter((c) => compareRelease(from, c.introducedIn) < 0 && compareRelease(c.introducedIn, to) <= 0)
    .sort((a, b) => compareRelease(a.introducedIn, b.introducedIn) || a.id.localeCompare(b.id))
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', '.netlify', '.wrangler', 'coverage', 'lib'])

/** Project files (repo-relative, `/`-separated) a codemod could apply to. */
export function projectFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const abs = join(dir, name)
      const st = statSync(abs)
      if (st.isDirectory()) walk(abs)
      else if (/\.[mc]?[jt]sx?$/.test(name)) out.push(relative(root, abs).split('\\').join('/'))
    }
  }
  walk(root)
  return out.sort()
}

export interface CodemodResult {
  id: string
  /** Files the codemod changed (or would change, in a dry run). */
  files: { path: string; next: string }[]
}

/** Run `codemods` over the project at `root`. Pure w.r.t. the filesystem: returns new contents. */
export function runCodemods(root: string, codemods: readonly Codemod[]): CodemodResult[] {
  const files = projectFiles(root)
  const current = new Map<string, string>()
  const results: CodemodResult[] = []
  for (const cm of codemods) {
    const changed: { path: string; next: string }[] = []
    for (const path of files) {
      if (!cm.matches(path)) continue
      const source = current.get(path) ?? readFileSync(join(root, path), 'utf-8')
      const next = cm.transform(source, path)
      if (next !== null && next !== source) {
        current.set(path, next)
        changed.push({ path, next })
      }
    }
    results.push({ id: cm.id, files: changed })
  }
  return results
}
