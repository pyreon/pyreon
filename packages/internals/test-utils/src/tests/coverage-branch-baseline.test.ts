import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRANCH_BASELINE, branchFloorFor } from '../../../../../scripts/check-coverage'

/**
 * The branch ratchet.
 *
 * Branch coverage was collected, stored and PRINTED by the coverage gate for a
 * long time while never being compared to anything — `pass` was
 * `statements >= threshold` alone. So every package's configured `branches`
 * number was an aspiration nothing enforced, and measuring all 72 found 17
 * below their own declared value.
 *
 * `BRANCH_BASELINE` is the floor that closes that, and like every ratchet in
 * this repo its whole value is that it can only move one way. These specs are
 * what stop it drifting back into decoration.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..')

/** The `branches` threshold a package's own vitest config declares. */
function configuredBranches(pkgName: string): number | null {
  const short = pkgName.replace('@pyreon/', '')
  for (const cat of ['core', 'fundamentals', 'tools', 'ui-system', 'zero', 'native', 'internals', 'ui']) {
    const cfg = join(ROOT, 'packages', cat, short, 'vitest.config.ts')
    if (existsSync(cfg)) {
      const m = readFileSync(cfg, 'utf8').match(/branches:\s*(\d+)/)
      return m ? Number(m[1]) : null
    }
  }
  return null
}

describe('branchFloorFor', () => {
  it('uses the configured threshold when a package has no baseline', () => {
    // The default must be the STRICT one. A missing entry meaning "unenforced"
    // would recreate the exact hole this map exists to close.
    expect(branchFloorFor('@pyreon/not-a-real-package', 92)).toBe(92)
  })

  it('uses the baseline when one is recorded', () => {
    expect(branchFloorFor('@pyreon/core', 98)).toBe(BRANCH_BASELINE['@pyreon/core'])
  })
})

describe('BRANCH_BASELINE stays honest', () => {
  it('never sits ABOVE the package it describes', () => {
    // A floor above the target is incoherent — it would fail a package that
    // met its own stated goal.
    const wrong: string[] = []
    for (const [pkg, floor] of Object.entries(BRANCH_BASELINE)) {
      const target = configuredBranches(pkg)
      if (target === null) {
        wrong.push(`${pkg}: baselined but has no configured branches threshold`)
      } else if (floor > target) {
        wrong.push(`${pkg}: floor ${floor} exceeds target ${target}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('only lists packages that actually exist', () => {
    // An entry for a deleted package is a silent hole: it enforces nothing and
    // looks like coverage. Same rot as every other hand-maintained list here.
    const missing = Object.keys(BRANCH_BASELINE).filter((p) => configuredBranches(p) === null)
    expect(missing).toEqual([])
  })

  it('records whole numbers, so run-to-run jitter cannot red CI', () => {
    for (const [pkg, floor] of Object.entries(BRANCH_BASELINE)) {
      expect(Number.isInteger(floor), `${pkg} floor ${floor}`).toBe(true)
    }
  })

  it('does NOT list @pyreon/lint', () => {
    // Deliberate, and load-bearing for merge order: lint measured 88.51
    // against a target of 90 on the commit this baseline was taken from, and
    // is brought to 90.07 by a separate PR. Adding a floor here would bake in
    // the pre-fix number and quietly retire that improvement.
    expect(BRANCH_BASELINE['@pyreon/lint']).toBeUndefined()
  })
})
