/**
 * vite-plugin-site-releases — serves `virtual:pyreon-site-releases`, the
 * release history behind `/releases`.
 *
 * Read ONCE per build process from the repository itself (the same checkout
 * the site is built from), so the page always matches the code it ships
 * with and no visitor's browser calls anything:
 *
 *   - every published package's `CHANGELOG.md` → the latest released versions
 *     (all `@pyreon/*` packages share one fixed version);
 *   - `.changeset/*.md` → what is merged on `main` and not released yet;
 *   - `git log` → the date each version was written (omitted when git or the
 *     history is unavailable, e.g. a shallow clone).
 *
 * Never fails the build, like `open-stats.ts`: any error yields
 * `{ ok: false, reason }` and the page says the history is unavailable.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger, Plugin } from 'vite'
import { mergeReleases, summarizeChangesets, type ReleaseData } from '../src/site/releases/parse'

const VIRTUAL_ID = 'virtual:pyreon-site-releases'
const RESOLVED_ID = `\0${VIRTUAL_ID}`
const RELEASES_SHOWN = 4
/** The changelog whose git history dates a version (every release writes it). */
const DATING_CHANGELOG = 'packages/core/core/CHANGELOG.md'

export default function siteReleasesPlugin(): Plugin {
  let repoRoot = ''
  let logger: Logger | null = null
  let cached: ReleaseData | null = null

  const load = (): ReleaseData => {
    cached ??= collect(repoRoot)
    if (!cached.ok) logger?.warn(`[pyreon-docs] /releases: ${cached.reason}`)
    return cached
  }

  return {
    name: 'pyreon-docs-site-releases',
    configResolved(config) {
      repoRoot = resolve(config.root, '..')
      logger ??= config.logger
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load: {
      filter: { id: /^\0virtual:pyreon-site-releases$/ },
      handler(id) {
        if (id !== RESOLVED_ID) return undefined
        return `export default ${JSON.stringify(load())}`
      },
    },
  }
}

/** Published package directories: `packages/<group>/<name>` with a non-private package.json. */
function publishedChangelogs(root: string): { pkg: string; md: string }[] {
  const out: { pkg: string; md: string }[] = []
  const base = join(root, 'packages')
  for (const group of readdirSync(base, { withFileTypes: true })) {
    if (!group.isDirectory()) continue
    for (const dir of readdirSync(join(base, group.name), { withFileTypes: true })) {
      if (!dir.isDirectory()) continue
      const pkgDir = join(base, group.name, dir.name)
      const manifest = join(pkgDir, 'package.json')
      const changelog = join(pkgDir, 'CHANGELOG.md')
      if (!existsSync(manifest) || !existsSync(changelog)) continue
      const json = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string; private?: boolean }
      if (json.private || !json.name) continue
      out.push({ pkg: json.name, md: readFileSync(changelog, 'utf8') })
    }
  }
  return out
}

function gitDate(root: string, version: string): string | null {
  try {
    const pattern = `^## ${version.replace(/\./g, '\\.')}$`
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '-G', pattern, '--', DATING_CHANGELOG], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
    }).trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null
  } catch {
    return null
  }
}

export function collect(root: string): ReleaseData {
  try {
    const changelogs = publishedChangelogs(root)
    if (changelogs.length === 0) return { ok: false, reason: 'no package CHANGELOG.md found', releases: [], unreleased: null }
    const releases = mergeReleases(changelogs, RELEASES_SHOWN, (v) => gitDate(root, v))
    const csDir = join(root, '.changeset')
    const files = existsSync(csDir)
      ? readdirSync(csDir)
          .filter((f) => f.endsWith('.md') && f !== 'README.md')
          .map((f) => readFileSync(join(csDir, f), 'utf8'))
      : []
    return { ok: true, reason: '', releases, unreleased: summarizeChangesets(files) }
  } catch (err) {
    return { ok: false, reason: (err as Error).message, releases: [], unreleased: null }
  }
}
