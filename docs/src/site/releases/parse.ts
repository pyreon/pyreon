/**
 * Release history for `/releases`, read from the repository at build time
 * (`vite-plugins/site-releases.ts`). Pure parsing lives here so it is unit
 * tested; the plugin only reads files.
 *
 *   - Released: every published package keeps a changesets `CHANGELOG.md`
 *     (`## <version>`, then `### Minor Changes` / `### Patch Changes` and one
 *     `- [#PR](…) … - summary` bullet per change). All `@pyreon/*` packages
 *     ship as ONE fixed version group, so the same version appears in many
 *     files; entries are merged by pull request.
 *   - Unreleased: the `.changeset/*.md` files on `main` (front matter of
 *     `"<package>": minor|patch`, then the prose).
 */

export type Bump = 'minor' | 'patch'

export interface ReleaseEntry {
  /** Pull request number, e.g. 3865; null when the bullet links none. */
  pr: number | null
  bump: Bump
  /** The first sentence of the change, inline code kept as `code`. */
  summary: string
  packages: string[]
}

export interface Release {
  version: string
  /** ISO date (YYYY-MM-DD) of the commit that wrote the version, or null when git is unavailable. */
  date: string | null
  minor: number
  patch: number
  /** Minor changes first, then patch; each pull request once; at most `maxEntries` (the counts cover all). */
  entries: ReleaseEntry[]
}

export interface Unreleased {
  count: number
  minor: number
  patch: number
  /** Packages with the most pending changesets, most first. */
  packages: { name: string; count: number }[]
}

export interface ReleaseData {
  ok: boolean
  /** Why the data is missing (the page says so); empty when ok. */
  reason: string
  releases: Release[]
  unreleased: Unreleased | null
}

const VERSION_RE = /^## (\d+\.\d+\.\d+(?:-[\w.]+)?)\s*$/
const KIND_RE = /^### (Major|Minor|Patch) Changes\s*$/
const PR_RE = /^- \[#(\d+)\]\([^)]*\)/

/**
 * The first sentence of a changeset summary: markdown links reduced to their
 * text, bold/italic markers dropped, inline code kept. Capped at 220 chars.
 */
export function firstSentence(text: string): string {
  const flat = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  // A sentence ends at ". " outside inline code.
  let inCode = false
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i]
    if (ch === '`') inCode = !inCode
    else if (!inCode && (ch === '.' || ch === '!' || ch === '?') && (i === flat.length - 1 || flat[i + 1] === ' ')) {
      return cap(flat.slice(0, i + 1))
    }
  }
  return cap(flat)
}

function cap(s: string): string {
  if (s.length <= 220) return s
  const cut = s.slice(0, 217)
  // Never cut inside inline code: drop an unbalanced backtick span.
  const ticks = (cut.match(/`/g) ?? []).length
  const safe = ticks % 2 === 1 ? cut.slice(0, cut.lastIndexOf('`')) : cut
  return `${safe.trimEnd()}…`
}

/** One package CHANGELOG → its versions, each with its change bullets. */
export function parseChangelog(pkg: string, md: string): Map<string, ReleaseEntry[]> {
  const out = new Map<string, ReleaseEntry[]>()
  let version: string | null = null
  let bump: Bump | null = null
  let current: { pr: number | null; lines: string[] } | null = null

  const flush = () => {
    if (current && version && bump) {
      const text = current.lines.join(' ')
      // "Updated dependencies" bullets restate other packages' changes.
      if (!text.startsWith('Updated dependencies')) {
        const summary = firstSentence(text)
        if (summary) out.get(version)?.push({ pr: current.pr, bump, summary, packages: [pkg] })
      }
    }
    current = null
  }

  for (const line of md.split('\n')) {
    const v = VERSION_RE.exec(line)
    if (v) {
      flush()
      version = v[1] ?? null
      bump = null
      if (version && !out.has(version)) out.set(version, [])
      continue
    }
    const k = KIND_RE.exec(line)
    if (k) {
      flush()
      bump = k[1] === 'Patch' ? 'patch' : 'minor'
      continue
    }
    if (line.startsWith('- ')) {
      flush()
      const pr = PR_RE.exec(line)
      // The summary follows the "Thanks [@user]! - " (or the commit link) prefix.
      const dash = line.indexOf(' - ', 2)
      const body = dash >= 0 && (pr || line.includes('Thanks')) ? line.slice(dash + 3) : line.slice(2)
      current = { pr: pr ? Number(pr[1]) : null, lines: [body] }
      continue
    }
    // Continuation paragraphs belong to the bullet but are not the summary.
  }
  flush()
  return out
}

/** Compare two semver strings, newest first. */
export function compareVersionsDesc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Merge every package's changelog into releases, newest first: one entry per
 * pull request (its packages listed), minor changes before patch changes.
 */
export function mergeReleases(
  changelogs: readonly { pkg: string; md: string }[],
  limit: number,
  dateOf: (version: string) => string | null,
  maxEntries = 12,
): Release[] {
  const byVersion = new Map<string, Map<string, ReleaseEntry>>()
  for (const { pkg, md } of changelogs) {
    for (const [version, entries] of parseChangelog(pkg, md)) {
      let merged = byVersion.get(version)
      if (!merged) byVersion.set(version, (merged = new Map()))
      for (const e of entries) {
        const key = e.pr !== null ? `#${e.pr}:${e.summary}` : e.summary
        const seen = merged.get(key)
        if (seen) {
          if (!seen.packages.includes(pkg)) seen.packages.push(pkg)
          if (e.bump === 'minor') seen.bump = 'minor'
        } else merged.set(key, { ...e, packages: [...e.packages] })
      }
    }
  }
  return [...byVersion.keys()]
    .sort(compareVersionsDesc)
    .slice(0, limit)
    .map((version) => {
      const entries = [...(byVersion.get(version)?.values() ?? [])]
        .map((e) => ({ ...e, packages: e.packages.sort() }))
        .sort((a, b) => (a.bump === b.bump ? (b.pr ?? 0) - (a.pr ?? 0) : a.bump === 'minor' ? -1 : 1))
      return {
        version,
        date: dateOf(version),
        minor: entries.filter((e) => e.bump === 'minor').length,
        patch: entries.filter((e) => e.bump === 'patch').length,
        entries: entries.slice(0, maxEntries),
      }
    })
}

/** One `.changeset/*.md` file → its package bumps. */
export function parseChangeset(md: string): { packages: { name: string; bump: Bump | 'major' }[] } | null {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(md)
  if (!m) return null
  const packages: { name: string; bump: Bump | 'major' }[] = []
  for (const line of (m[1] ?? '').split('\n')) {
    const p = /^\s*["']?([^"':]+)["']?\s*:\s*(major|minor|patch)\s*$/.exec(line)
    if (p?.[1] && p[2]) packages.push({ name: p[1].trim(), bump: p[2] as Bump | 'major' })
  }
  return { packages }
}

/** Pending changesets → counts. A changeset with any minor (or major) bump counts as minor. */
export function summarizeChangesets(files: readonly string[], top = 8): Unreleased {
  let minor = 0
  let patch = 0
  let count = 0
  const perPackage = new Map<string, number>()
  for (const md of files) {
    const cs = parseChangeset(md)
    if (!cs || cs.packages.length === 0) continue
    count++
    if (cs.packages.some((p) => p.bump !== 'patch')) minor++
    else patch++
    for (const p of cs.packages) perPackage.set(p.name, (perPackage.get(p.name) ?? 0) + 1)
  }
  const packages = [...perPackage.entries()]
    .map(([name, n]) => ({ name, count: n }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, top)
  return { count, minor, patch, packages }
}
