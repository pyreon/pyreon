/**
 * vite-plugin-open-stats — serves `virtual:pyreon-open-stats`, the numbers
 * behind `/open`.
 *
 * Fetched ONCE per build process (the SSG sub-build reuses this plugin
 * instance, so it reuses the promise too) and baked into the page as plain
 * data: no visitor's browser ever calls GitHub or npm. The daily `Deploy Docs`
 * run is what refreshes them.
 *
 * Never fails the build. A source that is down or rate-limited comes back as
 * an "unavailable" stat (see `src/open/stats.ts`), and the page says so.
 *
 * - `GITHUB_TOKEN` raises GitHub's rate limit when set (CI passes the workflow
 *   token); without it, public reads still work.
 * - `PYREON_OPEN_STATS_OFFLINE=1` skips the network entirely, for offline
 *   builds and tests: every network number renders as unavailable.
 */
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Logger, Plugin } from 'vite'
import { countRepo } from '../../packages/tools/cli/src/doctor/gates/doc-claims'
import { fetchOpenStats, type OpenStats } from '../src/open/stats'

const VIRTUAL_ID = 'virtual:pyreon-open-stats'
const RESOLVED_ID = `\0${VIRTUAL_ID}`

export default function openStatsPlugin(): Plugin {
  let repoRoot = ''
  let logger: Logger | null = null
  let pending: Promise<OpenStats> | null = null

  const load = (): Promise<OpenStats> => {
    pending ??= collect(repoRoot).then((stats) => {
      report(stats, logger)
      return stats
    })
    return pending
  }

  return {
    name: 'pyreon-docs-open-stats',
    configResolved(config) {
      repoRoot = resolve(config.root, '..')
      logger ??= config.logger
    },
    // Start fetching as the build starts, so the requests overlap with the
    // transform work instead of stalling the one module that imports them.
    buildStart() {
      void load()
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined
    },
    load: {
      filter: { id: /^\0virtual:pyreon-open-stats$/ },
      async handler(id) {
        if (id !== RESOLVED_ID) return undefined
        const stats = await load()
        return `export default ${JSON.stringify(stats)}`
      },
    },
  }
}

async function collect(repoRoot: string): Promise<OpenStats> {
  const offline = process.env.PYREON_OPEN_STATS_OFFLINE === '1'
  const fetchFn = offline
    ? () => Promise.reject(new Error('offline build'))
    : (input: string, init?: RequestInit) => fetch(input, init)

  const stats = await fetchOpenStats(
    { fetch: fetchFn, githubToken: process.env.GITHUB_TOKEN },
    () => {
      const counts = countRepo(repoRoot)
      return {
        publishedPackages: counts.publishedPackages,
        lintRules: counts.lintRules,
        lintCategories: counts.lintCategories,
        mcpTools: counts.mcpTools,
        docPages: counts.docPages,
        testFiles: countTestFiles(repoRoot),
      }
    },
  )
  return stats
}

function report(stats: OpenStats, logger: Logger | null): void {
  const missing: string[] = []
  for (const [key, stat] of Object.entries(stats.github)) {
    if (!stat.ok) missing.push(`github.${key} (${stat.reason})`)
  }
  for (const p of stats.npm.packages) {
    if (!p.weekly.ok) missing.push(`npm ${p.name} (${p.weekly.reason})`)
  }
  if (!stats.repo.ok) missing.push(`repo counts (${stats.repo.reason})`)
  if (missing.length === 0) logger?.info('[open-stats] every number fetched')
  else logger?.warn(`[open-stats] rendering as unavailable: ${missing.join(', ')}`)
}

const TEST_FILE = /\.(test|spec)\.tsx?$/
const SKIP_DIRS = new Set(['node_modules', 'lib', 'dist', 'build', 'coverage'])

/** Test files in the repo — `*.test.ts(x)` and `*.spec.ts(x)`, outside build output. */
export function countTestFiles(repoRoot: string): number {
  let count = 0
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      if (entry.isDirectory()) walk(join(dir, entry.name))
      else if (entry.isFile() && TEST_FILE.test(entry.name)) count++
    }
  }
  for (const top of ['packages', 'examples', 'e2e', 'docs', 'scripts']) walk(join(repoRoot, top))
  return count
}
