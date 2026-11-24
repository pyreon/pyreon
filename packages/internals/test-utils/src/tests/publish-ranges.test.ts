/**
 * How internal `@pyreon/*` edges are written into a published manifest.
 *
 * Stable versions (0.x, 1.0.0 and on) publish exactly what publish.ts has
 * always published: `workspace:^` → `^X.Y.Z`, `workspace:*` → `X.Y.Z`.
 * Release candidates (changesets pre mode) pin an edge between two
 * fixed-group members EXACT, because candidates share compiler helpers
 * (`_rp`, `_tpl`) that may change between any two of them, and a caret on a
 * prerelease admits every later candidate and every 1.x stable.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { publishedRange, type DepField } from '../../../../../scripts/publish-ranges'
import type { PreState } from '../../../../../scripts/release-channel'
import { isReleaseInFlightInstallFailure } from '../../../../../scripts/scaffold-smoke'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const RC: PreState = { mode: 'pre', tag: 'rc' }
const RC_EXIT: PreState = { mode: 'exit', tag: 'rc' }
const INSTALL_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'] as const
const ALL_FIELDS: DepField[] = [...INSTALL_FIELDS, 'devDependencies']

/** What publish.ts on main (before release-candidate mode) wrote for a `workspace:` range. */
function mainRange(range: string, version: string): string {
  if (!range.startsWith('workspace:')) return range
  const prefix = range.replace('workspace:', '')

  return prefix === '*' ? version : `${prefix}${version}`
}

const fixedGroup = new Set<string>(JSON.parse(readFileSync(join(ROOT, '.changeset', 'config.json'), 'utf8')).fixed[0])

function publishedManifests(): Array<{ file: string; pkg: Record<string, any> }> {
  const dirs = readdirSync(join(ROOT, 'packages')).flatMap((cat) => {
    const dir = join(ROOT, 'packages', cat)
    try {
      return readdirSync(dir).map((p) => join(dir, p, 'package.json'))
    } catch {
      return []
    }
  })
  const stubs = readdirSync(join(ROOT, 'packages/core/compiler/npm')).map((t) =>
    join(ROOT, 'packages/core/compiler/npm', t, 'package.json'),
  )

  return [...dirs, ...stubs]
    .filter((f) => existsSync(f))
    .map((file) => ({ file, pkg: JSON.parse(readFileSync(file, 'utf8')) }))
    .filter(({ pkg }) => !pkg.private)
}

interface Edge {
  pkg: string
  field: DepField
  dep: string
  range: string
  lockstep: boolean
}

/** Every `workspace:` edge of every published manifest, in all four fields. */
function workspaceEdges(): Edge[] {
  return publishedManifests().flatMap(({ pkg }) =>
    ALL_FIELDS.flatMap((field) =>
      Object.entries<string>(pkg[field] ?? {})
        .filter(([, range]) => range.startsWith('workspace:'))
        .map(([dep, range]) => ({
          pkg: pkg.name as string,
          field,
          dep,
          range,
          lockstep: fixedGroup.has(pkg.name) && fixedGroup.has(dep),
        })),
    ),
  )
}

describe('publishedRange', () => {
  it('a stable version publishes byte-for-byte what main publishes, for every real edge', () => {
    const edges = workspaceEdges()
    const diffs: string[] = []
    for (const version of ['0.54.1', '0.55.0', '1.0.0', '1.2.3']) {
      // No pre.json, pre mode entered but this version is not a candidate yet
      // (the enter PR's own dry runs), and exit mode (the 1.0.0 cut).
      for (const pre of [null, RC, RC_EXIT]) {
        for (const e of edges) {
          const got = publishedRange(e.range, version, { field: e.field, lockstep: e.lockstep, pre })
          const want = mainRange(e.range, version)
          if (got !== want) diffs.push(`${version} ${e.pkg} ${e.field} ${e.dep}: ${got} != ${want}`)
        }
      }
    }
    expect(edges.length).toBeGreaterThan(300)
    expect(diffs).toEqual([])
    // The concrete shape: 0.54.0 shipped `"@pyreon/head": "^0.54.0"`.
    expect(publishedRange('workspace:^', '0.55.0', { field: 'dependencies', lockstep: true, pre: null })).toBe('^0.55.0')
    expect(publishedRange('workspace:^', '1.0.0', { field: 'peerDependencies', lockstep: true, pre: RC_EXIT })).toBe('^1.0.0')
  })

  it('a release candidate pins a lockstep edge exact in every install-time field', () => {
    for (const field of INSTALL_FIELDS) {
      expect(publishedRange('workspace:^', '1.0.0-rc.2', { field, lockstep: true, pre: RC })).toBe('1.0.0-rc.2')
      expect(publishedRange('workspace:*', '1.0.0-rc.2', { field, lockstep: true, pre: RC })).toBe('1.0.0-rc.2')
      expect(publishedRange('workspace:~', '1.0.0-rc.0', { field, lockstep: true, pre: RC })).toBe('1.0.0-rc.0')
    }
  })

  it('a release candidate leaves devDependencies, non-lockstep edges and non-workspace ranges alone', () => {
    expect(publishedRange('workspace:^', '1.0.0-rc.2', { field: 'devDependencies', lockstep: true, pre: RC })).toBe('^1.0.0-rc.2')
    expect(publishedRange('workspace:^', '1.0.0-rc.2', { field: 'dependencies', lockstep: false, pre: RC })).toBe('^1.0.0-rc.2')
    expect(publishedRange('^2.0.0', '1.0.0-rc.2', { field: 'dependencies', lockstep: true, pre: RC })).toBe('^2.0.0')
    expect(publishedRange('workspace:^1.2.0', '1.4.0', { field: 'dependencies', lockstep: false, pre: null })).toBe('^1.2.0')
  })

  it('only the pre-mode rule decides: a prerelease that is not a candidate of the current pre mode is not pinned', () => {
    // A `release/**` snapshot (no pre mode) and a candidate of another tag.
    expect(publishedRange('workspace:^', '0.55.1-alpha-20261124', { field: 'dependencies', lockstep: true, pre: null })).toBe('^0.55.1-alpha-20261124')
    expect(publishedRange('workspace:^', '1.0.0-beta.1', { field: 'dependencies', lockstep: true, pre: RC })).toBe('^1.0.0-beta.1')
  })

  it('every published @pyreon/* edge points INTO the fixed group, so the rule covers all of them', () => {
    const outside: string[] = []
    for (const { pkg } of publishedManifests()) {
      expect(fixedGroup.has(pkg.name), `${pkg.name} is published but not in the fixed group`).toBe(true)
      for (const field of INSTALL_FIELDS) {
        for (const dep of Object.keys(pkg[field] ?? {})) {
          if (dep.startsWith('@pyreon/') && !fixedGroup.has(dep)) outside.push(`${pkg.name} ${field} ${dep}`)
        }
      }
    }
    expect(outside).toEqual([])
  })
})

describe('scaffold-smoke recognises an in-flight release on an exact lockstep edge', () => {
  it('matches the exact-version form bun prints for a transitive pin', () => {
    const line = 'error: No version matching "1.0.0" found for specifier "@pyreon/core" (but package exists)'
    expect(isReleaseInFlightInstallFailure(line, '1.0.0')).toBe(true)
    expect(isReleaseInFlightInstallFailure(line, '0.9.0')).toBe(false)
  })
})
