import { fill } from '../site/content/channels'
import type { OpenChannel, OpenStatId, OpenTile } from '../site/content/types-site'
import { formatCount, formatDay, type OpenStats, type Stat } from './stats'

/**
 * What `/open` shows, computed from the build's numbers and the page copy:
 * every tile either has a formatted value or says it is unavailable (with
 * the reason as a tooltip). A missing number never renders as 0, and a hint
 * that needs a missing number is left out rather than printed half-filled.
 */
export interface TileView {
  label: string
  /** The formatted number, or `null` when the source was unavailable. */
  value: string | null
  reason: string | undefined
  hint: string | undefined
  href: string | undefined
}

export function statOf(stats: OpenStats, id: OpenStatId): Stat<number> {
  const gh = stats.github
  const repo = stats.repo
  switch (id) {
    case 'commits':
    case 'mergedPrs':
    case 'releases':
    case 'stars':
    case 'forks':
    case 'contributors':
    case 'openIssues':
    case 'closedIssues':
      return gh[id]
    case 'publishedPackages':
    case 'testFiles':
    case 'lintRules':
    case 'mcpTools':
    case 'docPages':
      return repo.ok ? { ok: true, value: repo.value[id] } : repo
    default: {
      const never: never = id
      return never
    }
  }
}

/** Values a tile hint may name; absent when their source is down. */
function hintValues(stats: OpenStats): Record<string, string> {
  const out: Record<string, string> = {}
  const release = stats.github.latestRelease
  if (release.ok) {
    out['latestTag'] = release.value.tag
    out['latestDate'] = formatDay(release.value.date)
  }
  if (stats.repo.ok) {
    out['browserTestFiles'] = formatCount(stats.repo.value.browserTestFiles)
    out['lintCategories'] = String(stats.repo.value.lintCategories)
  }
  return out
}

/** Fill a hint, or drop it when one of its numbers is missing. */
export function fillHint(template: string | undefined, values: Readonly<Record<string, string>>): string | undefined {
  if (template === undefined) return undefined
  const keys = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string)
  return keys.every((k) => values[k] !== undefined) ? fill(template, values) : undefined
}

export function tileView(stats: OpenStats, tile: OpenTile): TileView {
  const stat = statOf(stats, tile.stat)
  const release = stats.github.latestRelease
  // The releases tile links to the latest release when there is one.
  const href = tile.stat === 'releases' && release.ok ? release.value.url : tile.href
  return {
    label: tile.label,
    value: stat.ok ? formatCount(stat.value) : null,
    reason: stat.ok ? undefined : stat.reason,
    hint: fillHint(tile.hint, hintValues(stats)),
    href,
  }
}

/** The npm tiles: weekly downloads, the last 30 days underneath. */
export function downloadTiles(stats: OpenStats, copy: OpenChannel): TileView[] {
  return stats.npm.packages.map((p) => ({
    label: p.name,
    value: p.weekly.ok ? formatCount(p.weekly.value) : null,
    reason: p.weekly.ok ? undefined : p.weekly.reason,
    hint: p.monthly.ok ? fill(copy.downloads.monthly, { count: formatCount(p.monthly.value) }) : undefined,
    href: `https://www.npmjs.com/package/${p.name}`,
  }))
}
