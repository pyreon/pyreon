/**
 * Internal `@pyreon/*` edges between fixed-group members publish EXACT.
 *
 * Published `lib/` output calls sibling packages' compiler-emitted helpers
 * (`_rp`, `_tpl`, …), an ABI guaranteed only within one version. publish.ts
 * used to write `workspace:^` as `^X.Y.Z`: harmless in 0.x (`^0.53.0` is
 * 0.53.x only) but at 1.0 it lets `@pyreon/elements@1.0.0` resolve against
 * `@pyreon/core@1.4.0`, and `@pyreon/compiler@1.2.0` against a 1.1.0 native
 * binary.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { publishedRange } from '../../../../../scripts/publish-ranges'
import { isReleaseInFlightInstallFailure } from '../../../../../scripts/scaffold-smoke'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')

describe('publishedRange', () => {
  it('a lockstep edge is exact in every install-time field, whatever the workspace prefix', () => {
    for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'] as const) {
      expect(publishedRange('workspace:^', '1.0.0', { field, lockstep: true })).toBe('1.0.0')
      expect(publishedRange('workspace:*', '1.0.0-rc.2', { field, lockstep: true })).toBe('1.0.0-rc.2')
      expect(publishedRange('workspace:~', '1.0.0', { field, lockstep: true })).toBe('1.0.0')
    }
  })

  it('devDependencies and non-lockstep targets keep the range they asked for', () => {
    expect(publishedRange('workspace:^', '1.0.0', { field: 'devDependencies', lockstep: true })).toBe('^1.0.0')
    expect(publishedRange('workspace:^', '0.9.0', { field: 'dependencies', lockstep: false })).toBe('^0.9.0')
    expect(publishedRange('workspace:*', '0.9.0', { field: 'dependencies', lockstep: false })).toBe('0.9.0')
    expect(publishedRange('workspace:^1.2.0', '1.4.0', { field: 'dependencies', lockstep: false })).toBe('^1.2.0')
    expect(publishedRange('^2.0.0', '1.0.0', { field: 'dependencies', lockstep: true })).toBe('^2.0.0')
  })

  it('every published @pyreon/* edge points INTO the fixed group, so the rule covers all of them', () => {
    const fixed = new Set<string>(JSON.parse(readFileSync(join(ROOT, '.changeset', 'config.json'), 'utf8')).fixed[0])
    const outside: string[] = []
    const manifests = readdirSync(join(ROOT, 'packages')).flatMap((cat) => {
      const dir = join(ROOT, 'packages', cat)
      try {
        return readdirSync(dir).map((p) => join(dir, p, 'package.json'))
      } catch {
        return []
      }
    })
    for (const file of [...manifests, ...readdirSync(join(ROOT, 'packages/core/compiler/npm')).map((t) => join(ROOT, 'packages/core/compiler/npm', t, 'package.json'))]) {
      if (!existsSync(file)) continue
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      if (pkg.private) continue
      expect(fixed.has(pkg.name), `${pkg.name} is published but not in the fixed group`).toBe(true)
      for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const dep of Object.keys(pkg[field] ?? {})) {
          if (dep.startsWith('@pyreon/') && !fixed.has(dep)) outside.push(`${pkg.name} ${field} ${dep}`)
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
