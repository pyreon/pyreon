/**
 * Publish-state verification — the structural fix for the silent-dead-release
 * class (v0.31.0: the version PR merged, the publish step died on a GHA OOM,
 * and npm `latest` silently stayed at 0.30.0 for a week — shipping users a
 * version missing HIGH-severity fixes, with no alarm anywhere).
 *
 * Compares the repo's fixed-group version against npm `dist-tags.latest` for
 * a set of SENTINEL packages (cheap — N registry lookups, not 60).
 *
 * Exit codes:
 *   0 — npm latest matches the last RELEASED repo version (or repo is ahead
 *       only by pending changesets, which is the normal between-releases state)
 *   1 — DEAD RELEASE: a `chore: version packages` commit landed but npm
 *       latest is ≥1 version behind the repo's package.json version → the
 *       publish step never completed. Loud, actionable failure.
 *   2 — registry/network error (warn, don't false-alarm)
 *
 * Wire-up:
 *   - last step of release.yml (post-publish verify — catches in-run failures)
 *   - scheduled workflow (catches the class where the whole workflow crashed)
 *
 *   bun scripts/check-published-state.ts [--json]
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SENTINELS = ['@pyreon/reactivity', '@pyreon/core', '@pyreon/zero'] as const

const repoRoot = new URL('..', import.meta.url).pathname
const json = process.argv.includes('--json')

function repoVersion(pkg: string): string {
  const [, name] = pkg.split('/')
  // Resolve via the workspace layout (packages/<cat>/<dir>) — read from the
  // sentinel's own package.json so we never trust a stale node_modules copy.
  const candidates = [
    `packages/core/${name}`,
    `packages/zero/${name}`,
    `packages/fundamentals/${name}`,
    `packages/tools/${name}`,
    `packages/ui-system/${name}`,
  ]
  for (const c of candidates) {
    try {
      const p = JSON.parse(readFileSync(join(repoRoot, c, 'package.json'), 'utf-8')) as {
        name: string
        version: string
      }
      if (p.name === pkg) return p.version
    } catch {
      /* try next */
    }
  }
  throw new Error(`[check-published-state] cannot locate ${pkg} in the workspace`)
}

async function npmLatest(pkg: string): Promise<string | null> {
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return null // never published (first-publish pending)
  if (!res.ok) throw new Error(`registry HTTP ${res.status} for ${pkg}`)
  const body = (await res.json()) as { version?: string }
  return body.version ?? null
}

function cmpSemver(a: string, b: string): number {
  const pa = a.split('-')[0]!.split('.').map(Number)
  const pb = b.split('-')[0]!.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

try {
  const results = await Promise.all(
    SENTINELS.map(async (pkg) => {
      const repo = repoVersion(pkg)
      const npm = await npmLatest(pkg)
      return { pkg, repo, npm }
    }),
  )

  // DEAD-RELEASE detection: the repo's package.json version is only ever
  // bumped by a MERGED `chore: version packages` commit — i.e. a release
  // that was CUT. If npm latest is behind that version, the publish never
  // landed. (Repo == npm is the healthy released state; pending changesets
  // don't move package.json until versioning, so "work merged but not yet
  // versioned" still reports healthy here — that's `changeset status`'s
  // job, not this gate's.)
  const dead = results.filter((r) => r.npm !== null && cmpSemver(r.repo, r.npm!) > 0)
  const unpublished = results.filter((r) => r.npm === null)

  if (json) {
    console.warn(JSON.stringify({ results, dead, unpublished }, null, 2))
  }

  if (dead.length > 0) {
    console.error(
      `[check-published-state] DEAD RELEASE DETECTED — the repo carries a versioned release that npm never received:`,
    )
    for (const r of dead) {
      console.error(`  ${r.pkg}: repo=${r.repo} but npm latest=${r.npm}`)
    }
    console.error(
      `  A "chore: version packages" commit merged but the publish step did not complete.\n` +
        `  Users on npm are missing released fixes. Re-run the release workflow\n` +
        `  (scripts/publish.ts is idempotent — already-published versions are skipped),\n` +
        `  or cut the next release. See CLAUDE.md "Release Readiness".`,
    )
    process.exit(1)
  }

  for (const r of unpublished) {
    console.warn(
      `[check-published-state] note: ${r.pkg} has never been published (first-publish bootstrap pending)`,
    )
  }
  console.warn(
    `[check-published-state] OK — npm latest matches the released repo version (${results[0]?.repo}) for ${results.length - unpublished.length}/${results.length} sentinels.`,
  )
} catch (err) {
  console.error(`[check-published-state] registry/lookup error (not failing):`, err)
  process.exit(2)
}
