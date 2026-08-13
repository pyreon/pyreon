/**
 * `WEB_ONLY_PACKAGES` in native-audit.ts is a hand-maintained mirror of each
 * package's declared `multiplatform: { tier }`. Nothing asserted that, and it
 * went stale: elements / styler / rocketstyle / coolgrid gained native frontends
 * and moved to tier `shared`, but stayed on the list — so the audit reported the
 * tri-target examples that exist to PROVE ui-system on native as hazards.
 *
 * A hand-maintained mirror without a drift test is a convention, not a guard.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')

function listedWebOnly(): string[] {
  const src = readFileSync(join(REPO_ROOT, 'packages/core/compiler/src/native-audit.ts'), 'utf8')
  const block = /const WEB_ONLY_PACKAGES = new Set<string>\(\[(.*?)\]\)/s.exec(src)
  expect(block, 'WEB_ONLY_PACKAGES block not found').toBeTruthy()
  return [...block![1].matchAll(/'(@pyreon\/[a-z-]+)'/g)].map((m) => m[1]!)
}

function declaredTier(pkg: string): string | null {
  const name = pkg.split('/')[1]!
  for (const cat of ['core', 'fundamentals', 'ui-system', 'tools', 'zero', 'native']) {
    const f = join(REPO_ROOT, 'packages', cat, name, 'src', 'manifest.ts')
    if (existsSync(f)) {
      const m = /tier: '([a-z-]+)'/.exec(readFileSync(f, 'utf8'))
      return m ? m[1]! : null
    }
  }
  return null
}

describe('native-audit WEB_ONLY_PACKAGES ⇄ manifest tier', () => {
  it('every listed package declares tier web-only (or has no manifest)', () => {
    const wrong = listedWebOnly()
      .map((p) => ({ p, tier: declaredTier(p) }))
      .filter((x) => x.tier !== null && x.tier !== 'web-only')
    expect(
      wrong.map((x) => `${x.p} is tier '${x.tier}'`),
      'listed as web-only but the manifest says otherwise',
    ).toEqual([])
  })

  it('the list is non-empty (a cleared list would silently disable the audit)', () => {
    expect(listedWebOnly().length).toBeGreaterThan(5)
  })
})
