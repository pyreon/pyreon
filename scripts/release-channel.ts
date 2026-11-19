#!/usr/bin/env bun
/**
 * Which npm dist-tag a version belongs to — the one rule every release
 * consumer shares (publish.ts, check-published-state, heal-release-chain,
 * scaffold-smoke, release-native.yml).
 *
 * Stable versions ship on `latest`. A prerelease version ships ONLY on the
 * dist-tag of the changesets pre mode that produced it (`.changeset/pre.json`
 * → `tag`, e.g. `rc` for `1.0.0-rc.3`). Anything else is refused: npm moves
 * `latest` to whatever is published without `--tag`, so publishing
 * `1.0.0-rc.0` untagged would make `npm i @pyreon/core` resolve to a release
 * candidate. (npm 11 also refuses a prerelease without `--tag`, so the failure
 * would otherwise surface as 75 identical publish errors.)
 *
 * The `release/**` snapshot job passes `--tag next` explicitly; snapshots are
 * not pre-mode versions and never reach `distTagFor`.
 *
 * CLI (release-native.yml uses it to tag the binaries like their parent):
 *   bun scripts/release-channel.ts dist-tag <version>
 *
 * Imports node builtins only: release-native's publish job runs it without
 * `bun install`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface PreState {
  /** `pre` while in pre mode; `exit` after `changeset pre exit`, until the next `changeset version` deletes the file. */
  mode: 'pre' | 'exit'
  /** The prerelease identifier AND the npm dist-tag, e.g. `rc`. */
  tag: string
}

/** A dist-tag is file data that reaches a registry URL and npm argv: keep it to a safe shape. */
export const DIST_TAG_RE = /^[a-z][a-z0-9-]{0,31}$/

/** Parse `.changeset/pre.json` text. Malformed content throws: a release must not guess its channel. */
export function parsePreState(text: string): PreState {
  const raw = JSON.parse(text) as { mode?: unknown; tag?: unknown }
  if (raw.mode !== 'pre' && raw.mode !== 'exit') {
    throw new Error(`[Pyreon] .changeset/pre.json has mode ${JSON.stringify(raw.mode)}; expected "pre" or "exit". Re-run \`bun changeset pre enter <tag>\` or \`bun changeset pre exit\`.`)
  }
  if (typeof raw.tag !== 'string' || !DIST_TAG_RE.test(raw.tag) || raw.tag === 'latest') {
    throw new Error(`[Pyreon] .changeset/pre.json has tag ${JSON.stringify(raw.tag)}; use a lowercase identifier other than "latest", e.g. \`bun changeset pre enter rc\`.`)
  }
  return { mode: raw.mode, tag: raw.tag }
}

/** The pre-mode state of the checkout at `root`, or null outside pre mode. */
export function readPreState(root: string): PreState | null {
  const path = join(root, '.changeset', 'pre.json')
  return existsSync(path) ? parsePreState(readFileSync(path, 'utf8')) : null
}

interface Parsed {
  major: number
  minor: number
  patch: number
  pre: string[]
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export function parseSemver(v: string): Parsed | null {
  const m = SEMVER_RE.exec(v)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] ? m[4].split('.') : [] }
}

export function isPrerelease(version: string): boolean {
  return (parseSemver(version)?.pre.length ?? 0) > 0
}

/**
 * Full semver precedence (semver.org §11): a prerelease sorts BEFORE its
 * release, numeric identifiers compare numerically (`rc.10` > `rc.9`), and a
 * numeric identifier sorts before an alphanumeric one. Unparseable input
 * throws rather than comparing as zero.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) throw new Error(`[Pyreon] not a semver version: ${JSON.stringify(pa ? b : a)}`)
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k]
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) return pb.pre.length - pa.pre.length
  for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x)
    const yn = /^\d+$/.test(y)
    if (xn && yn) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y)
    } else if (xn !== yn) {
      return xn ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** Is `version` a prerelease cut by the pre mode in `pre` (`1.0.0-rc.3` under tag `rc`)? */
export function isPreModeVersion(version: string, pre: PreState | null): boolean {
  if (pre === null) return false
  const p = parseSemver(version)
  return p !== null && p.pre.length === 2 && p.pre[0] === pre.tag && /^\d+$/.test(p.pre[1]!)
}

/** The dist-tag `version` ships on. Throws for a prerelease no pre mode accounts for. */
export function distTagFor(version: string, pre: PreState | null): string {
  if (parseSemver(version) === null) throw new Error(`[Pyreon] not a semver version: ${JSON.stringify(version)}`)
  if (!isPrerelease(version)) return 'latest'
  if (isPreModeVersion(version, pre)) return pre!.tag
  throw new Error(
    `[Pyreon] ${version} is a prerelease, but ${pre ? `.changeset/pre.json is in "${pre.tag}" mode` : 'there is no .changeset/pre.json'}, so its npm dist-tag is unknown. ` +
      'Refusing to publish it to "latest". Release candidates come from `bun changeset pre enter <tag>`; a snapshot passes `--tag next` explicitly.',
  )
}

/** publish.ts's dist-tag: an explicit `--tag` wins, except that a prerelease may never go to `latest`. */
export function resolvePublishTag(version: string, explicit: string | undefined, pre: PreState | null): string {
  if (explicit === undefined) return distTagFor(version, pre)
  if (!DIST_TAG_RE.test(explicit)) throw new Error(`[Pyreon] invalid --tag ${JSON.stringify(explicit)}`)
  if (explicit === 'latest' && isPrerelease(version)) {
    throw new Error(`[Pyreon] refusing to publish prerelease ${version} with --tag latest; it would become the default \`npm i\` version.`)
  }
  return explicit
}

if (import.meta.main) {
  const [cmd, version] = process.argv.slice(2)
  if (cmd !== 'dist-tag' || !version) {
    console.error('usage: bun scripts/release-channel.ts dist-tag <version>')
    process.exit(2)
  }
  try {
    console.log(distTagFor(version, readPreState(join(import.meta.dirname, '..'))))
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
