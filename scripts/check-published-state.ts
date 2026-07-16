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
 *       ALSO 1 — MISSING PACKAGE: a publishable package does not exist on npm
 *       at all (first-publish bootstrap pending). OIDC trusted publishing
 *       cannot CREATE a package, so publish.ts warn-and-skips it — correct for
 *       the release run, but 0.46.0 proved the skip is invisible in a 65-pkg
 *       log: @pyreon/rich-text was silently skipped from EVERY release for 3
 *       weeks while the docs advertised it (`npm install` never worked). The
 *       existence sweep turns that standing state into a red, actionable run.
 *   2 — registry/network error (warn, don't false-alarm)
 *
 * Wire-up:
 *   - last step of release.yml (post-publish verify — catches in-run failures;
 *     JS sentinels only, since native binaries publish later via the tag)
 *   - scheduled published-state.yml (daily — passes `--native` so it ALSO
 *     catches a native-binary cascade failure, by which time native has caught
 *     up on npm)
 *
 *   bun scripts/check-published-state.ts [--json] [--native]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const SENTINELS = ['@pyreon/reactivity', '@pyreon/core', '@pyreon/zero'] as const

// Native compiler binaries publish in a SEPARATE workflow (release-native.yml,
// triggered by the `v<version>` tag) AFTER the JS packages — so the in-release
// post-publish check (release.yml) can NOT include them: they aren't on npm yet
// when it runs, and would false-fail. The DAILY scheduled check runs long after,
// when native has caught up, so it passes `--native` to ALSO guard the
// native-binary cascade (JS published, but the tag→native step failed or the tag
// never pushed — the historical skew class where `@pyreon/compiler-*` lagged a
// version behind). One representative binary suffices: all 7 share the
// fixed-group version, bumped in lockstep by `changeset version`.
export const NATIVE_SENTINELS = ['@pyreon/compiler-darwin-arm64'] as const

/**
 * The sentinel set to verify. `--native` adds the native compiler binary(ies)
 * — the daily scheduled run passes it (see the NATIVE_SENTINELS comment).
 */
export function resolveSentinels(includeNative: boolean): readonly string[] {
  return includeNative ? [...SENTINELS, ...NATIVE_SENTINELS] : SENTINELS
}

const repoRoot = new URL('..', import.meta.url).pathname

export function repoVersion(pkg: string, root: string = repoRoot): string {
  const [, name] = pkg.split('/')
  // Resolve via the workspace layout (packages/<cat>/<dir>) — read from the
  // sentinel's own package.json so we never trust a stale node_modules copy.
  const candidates = [
    `packages/core/${name}`,
    `packages/zero/${name}`,
    `packages/fundamentals/${name}`,
    `packages/tools/${name}`,
    `packages/ui-system/${name}`,
    // Native compiler binary stubs: `@pyreon/compiler-<target>` lives at
    // packages/core/compiler/npm/<target>, not packages/core/compiler-<target>.
    // (Harmless for non-native names — the path won't exist and the `p.name ===
    // pkg` guard below rejects any accidental match.)
    `packages/core/compiler/npm/${(name ?? '').replace(/^compiler-/, '')}`,
  ]
  for (const c of candidates) {
    try {
      const p = JSON.parse(readFileSync(join(root, c, 'package.json'), 'utf-8')) as {
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

/**
 * Every publishable (non-private) `@pyreon/*` package in the workspace —
 * `packages/<category>/<dir>/package.json`, two levels exactly. The native
 * compiler binary stubs live a level deeper (`packages/core/compiler/npm/<t>/`)
 * and are deliberately NOT enumerated: they publish via release-native.yml
 * AFTER the JS release, so an existence sweep during release.yml's post-publish
 * step would false-fail on them (same reasoning as the sentinel `--native` gate).
 */
export function enumeratePublishable(root: string = repoRoot): string[] {
  const names: string[] = []
  const packagesDir = join(root, 'packages')
  for (const category of readdirSync(packagesDir)) {
    const catDir = join(packagesDir, category)
    let entries: string[]
    try {
      entries = readdirSync(catDir)
    } catch {
      continue // not a directory
    }
    for (const dir of entries) {
      try {
        const p = JSON.parse(
          readFileSync(join(catDir, dir, 'package.json'), 'utf-8'),
        ) as { name?: string; private?: boolean }
        if (p.name?.startsWith('@pyreon/') && p.private !== true) names.push(p.name)
      } catch {
        /* no package.json at this level — skip */
      }
    }
  }
  return names.sort()
}

/**
 * Pure classification for the existence sweep: packages whose npm lookup
 * returned null have NEVER been published — the first-publish-bootstrap class.
 */
export function classifyExistence(
  results: ReadonlyArray<{ pkg: string; npm: string | null }>,
): { absent: string[] } {
  return { absent: results.filter((r) => r.npm === null).map((r) => r.pkg) }
}

/**
 * The npm package-name grammar (optionally scoped, lowercase, no leading
 * dot/underscore, one `/` only as the scope separator). Validated BEFORE a
 * name read from a local `package.json` is embedded in the registry URL —
 * the URL is then safe by construction (no `..`, `?`, `#`, or extra path
 * segments can reach `fetch`), which is what CodeQL `js/file-access-to-http`
 * flags on this file→network flow. Exported for the unit test.
 */
export const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/

async function npmLatest(pkg: string): Promise<string | null> {
  if (!NPM_NAME_RE.test(pkg)) {
    throw new Error(`invalid npm package name read from a workspace package.json: ${JSON.stringify(pkg)}`)
  }
  const res = await fetch(`https://registry.npmjs.org/${pkg}/latest`, {
    headers: { Accept: 'application/json' },
  })
  if (res.status === 404) return null // never published (first-publish pending)
  if (!res.ok) throw new Error(`registry HTTP ${res.status} for ${pkg}`)
  const body = (await res.json()) as { version?: string }
  return body.version ?? null
}

export function cmpSemver(a: string, b: string): number {
  const pa = a.split('-')[0]!.split('.').map(Number)
  const pb = b.split('-')[0]!.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

if (import.meta.main) {
  const json = process.argv.includes('--json')
  const includeNative = process.argv.includes('--native')
  const sentinels = resolveSentinels(includeNative)

  try {
    const results = await Promise.all(
      sentinels.map(async (pkg) => {
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
      `[check-published-state] OK — npm latest matches the released repo version (${results[0]?.repo}) for ${results.length - unpublished.length}/${results.length} sentinels${includeNative ? ' (incl. native compiler binary)' : ''}.`,
    )

    // ── Existence sweep (the first-publish-bootstrap class) ───────────
    // Every publishable package must EXIST on npm. OIDC cannot create a
    // package, so publish.ts warn-and-skips first-publishes — correct for
    // the release run, but silent: 0.46.0 shipped with @pyreon/rich-text
    // (3 weeks of releases) and @pyreon/testing never on npm while the
    // docs advertised both. This sweep makes that a red, actionable run
    // wherever this script is wired (release.yml post-publish + the daily
    // published-state.yml).
    const all = enumeratePublishable()
    // Bounded concurrency + one retry: 65 simultaneous fetches to the npm
    // registry get ECONNRESET-throttled (observed live) — walk in pools of 8.
    const sweep: Array<{ pkg: string; npm: string | null }> = []
    for (let i = 0; i < all.length; i += 8) {
      const batch = all.slice(i, i + 8)
      sweep.push(
        ...(await Promise.all(
          batch.map(async (pkg) => {
            try {
              return { pkg, npm: await npmLatest(pkg) }
            } catch {
              await new Promise((r) => setTimeout(r, 500))
              return { pkg, npm: await npmLatest(pkg) } // retry once; throw → outer catch (exit 2)
            }
          }),
        )),
      )
    }
    const { absent } = classifyExistence(sweep)
    if (absent.length > 0) {
      console.error(
        `[check-published-state] MISSING PACKAGE(S) — publishable in the repo but do not exist on npm (first-publish bootstrap pending):`,
      )
      for (const pkg of absent) {
        console.error(`  - ${pkg}`)
        console.error(`::warning title=First-publish bootstrap needed::${pkg} is not on npm — OIDC cannot create a package. From its directory: bun publish --access=public (with your npm auth), then add a Trusted Publisher on npmjs.com (GitHub Actions → pyreon/pyreon → release.yml).`)
      }
      console.error(
        `  OIDC trusted publishing cannot CREATE a package. One-time manual fix per package:\n` +
          `    1. from the package directory: bun publish --access=public   (classic/granular npm token or npm login)\n` +
          `    2. on npmjs.com → the package → Settings → add a Trusted Publisher\n` +
          `       (GitHub Actions, repo pyreon/pyreon, workflow release.yml, no environment)\n` +
          `  Subsequent releases publish it via OIDC like the rest of the suite.`,
      )
      process.exit(1)
    }
    console.warn(
      `[check-published-state] existence sweep OK — all ${all.length} publishable packages exist on npm.`,
    )
  } catch (err) {
    console.error(`[check-published-state] registry/lookup error (not failing):`, err)
    process.exit(2)
  }
}
