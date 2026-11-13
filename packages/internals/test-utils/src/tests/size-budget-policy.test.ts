/**
 * The rules the three size gates share (`scripts/size-budget-policy.ts`).
 *
 * What they replace, and why each test here exists. Until 2026-11 every size
 * was compared with one absolute number on every pull request. Branch
 * protection does not require a branch to be up to date, so several pull
 * requests each added bytes against their own base, each stayed under the
 * number, and their sum did not: main went over a budget no pull request had
 * crossed, and every open pull request then failed `Build` for bytes it never
 * added. A "minimum headroom" rule failed pull requests the same way when an
 * unrelated merge used the headroom up.
 *
 * So: a pull request is judged on its own growth, the absolute ceiling is
 * judged where the sum is visible, and neither rule may weaken the other.
 */

import { describe, expect, it } from 'vitest'

import {
  ceilingFor,
  formatVerdicts,
  growthAllowance,
  judgeEntry,
  judgeFamily,
  movesLibSizes,
  movesRouteSizes,
  nextCeiling,
  NOISE_BYTES,
  resolveBasePath,
  resolveSizeMode,
  ROUTE_NOISE_BYTES,
} from '../../../../../scripts/size-budget-policy'

const entry = (size: number, ceiling: number | undefined) => ({ id: '@pyreon/x', size, ceiling })

describe('pr mode: a change is judged on the bytes IT adds', () => {
  it('growth over the allowance FAILS, however much room the ceiling has', () => {
    // 10000 → 10300 is +3%; the allowance is 2% (200 B). The ceiling is miles away.
    const v = judgeEntry('pr', entry(10300, 50000), { size: 10000, ceiling: 50000 })
    expect(v.fail).toBe(true)
    expect(v.code).toBe('growth')
    expect(v.message).toContain('+300 B')
    expect(v.message).toContain('--update=@pyreon/x')
  })

  it('a change that DOUBLES a package fails (no loss of protection)', () => {
    expect(judgeEntry('pr', entry(20000, 50000), { size: 10000, ceiling: 50000 }).code).toBe('growth')
    // … and a tiny one too: the floor is bytes, not a way around the rule.
    expect(judgeEntry('pr', entry(600, 5000), { size: 300, ceiling: 5000 }).code).toBe('growth')
  })

  it('growth inside the allowance passes with no edit to any ceiling', () => {
    const v = judgeEntry('pr', entry(10200, 50000), { size: 10000, ceiling: 50000 })
    expect(v.fail).toBe(false)
    expect(v.code).toBe('ok')
  })

  it('the same over-allowance growth PASSES when the change sets the ceiling', () => {
    // The pull request's diff contains this entry's ceiling line: that edit is
    // the acceptance, and it is what a reviewer sees.
    const v = judgeEntry('pr', entry(10300, 11330), { size: 10000, ceiling: 10500 })
    expect(v.fail).toBe(false)
    expect(v.code).toBe('accepted')
  })

  it('acceptance works downward too: a loose ceiling tightened to the new size', () => {
    // 300 B against a ceiling of 8740 doubles to 600; `--update` writes 660,
    // which is LOWER than before. It is still this change's explicit edit.
    expect(judgeEntry('pr', entry(600, 660), { size: 300, ceiling: 8740 }).code).toBe('accepted')
  })

  it('an accepted ceiling still has to hold the size', () => {
    const v = judgeEntry('pr', entry(10300, 10100), { size: 10000, ceiling: 10500 })
    expect(v.fail).toBe(true)
    expect(v.code).toBe('over-ceiling')
  })

  it('drift from OTHER merges does not fail a change that added nothing', () => {
    // Over the ceiling on the base already; this change did not move it.
    const v = judgeEntry('pr', entry(10600, 10500), { size: 10600, ceiling: 10500 })
    expect(v.fail).toBe(false)
    expect(v.code).toBe('base-over-ceiling')
    // A release only re-inlines version strings: a few bytes is not growth.
    expect(judgeEntry('pr', entry(10600 + NOISE_BYTES, 10500), { size: 10600, ceiling: 10500 }).fail).toBe(false)
    // A change that SHRINKS an over-ceiling entry is never the one to blame.
    expect(judgeEntry('pr', entry(10550, 10500), { size: 10600, ceiling: 10500 }).fail).toBe(false)
  })

  it('unused headroom on the base is irrelevant: only the delta counts', () => {
    // The old "minimum headroom" rule failed this: 1 B under the ceiling.
    expect(judgeEntry('pr', entry(10499, 10500), { size: 10499, ceiling: 10500 }).fail).toBe(false)
    expect(judgeEntry('pr', entry(10500, 10500), { size: 10450, ceiling: 10500 }).fail).toBe(false)
  })

  it('a change that ADDS to an over-ceiling entry fails, even within the allowance', () => {
    // Crossing it …
    const crossing = judgeEntry('pr', entry(10550, 10500), { size: 10450, ceiling: 10500 })
    expect(crossing.fail).toBe(true)
    expect(crossing.code).toBe('over-ceiling')
    // … or piling on while main is already over: the entry is frozen for
    // growth until the ceiling is settled, which is how a breach cannot be
    // ignored without blocking changes that do not touch the entry.
    expect(judgeEntry('pr', entry(10700, 10500), { size: 10600, ceiling: 10500 }).fail).toBe(true)
  })

  it('a change may not set a ceiling below the measured size', () => {
    const v = judgeEntry('pr', entry(10000, 9000), { size: 10000, ceiling: 10500 })
    expect(v.fail).toBe(true)
    expect(v.message).toContain('sets the ceiling below')
  })

  it('a new entry has no growth to judge: its ceiling is the rule', () => {
    expect(judgeEntry('pr', entry(5000, 5500), { size: undefined, ceiling: undefined }).fail).toBe(false)
    expect(judgeEntry('pr', entry(5000, 4000), { size: undefined, ceiling: undefined }).fail).toBe(true)
    expect(judgeEntry('pr', entry(5000, undefined), { size: undefined, ceiling: undefined }).code).toBe('missing-ceiling')
  })

  it('a base without ceilings (before the per-owner layout) judges growth as accepted', () => {
    // The base has sizes but no ceiling for the entry: the ceiling is new on
    // this change, so the ceiling is the rule.
    expect(judgeEntry('pr', entry(10300, 11000), { size: 10000, ceiling: undefined }).fail).toBe(false)
  })
})

describe('the noise band is per family', () => {
  it('a route over its ceiling on the base is not failed for build-directory jitter', () => {
    // One commit built in two directories measured 1 to 5 B apart per route:
    // more than the package band, and the base is always built elsewhere.
    const drifted = { id: 'app:/', size: 57643, ceiling: 57000 }
    expect(judgeEntry('pr', drifted, { size: 57638, ceiling: 57000 }).fail).toBe(true)
    expect(judgeEntry('pr', drifted, { size: 57638, ceiling: 57000 }, ROUTE_NOISE_BYTES).fail).toBe(false)
    // Real growth on top of the breach still fails.
    const grown = { ...drifted, size: 57638 + ROUTE_NOISE_BYTES + 1 }
    expect(judgeEntry('pr', grown, { size: 57638, ceiling: 57000 }, ROUTE_NOISE_BYTES).fail).toBe(true)
  })
})

describe('main mode: the ceiling bites where the sum of merges is visible', () => {
  it('an entry over its ceiling is RED', () => {
    const v = judgeEntry('main', entry(10600, 10500))
    expect(v.fail).toBe(true)
    expect(v.code).toBe('over-ceiling')
    expect(v.message).toContain('over its ceiling of 10500 B by 100 B')
  })

  it('at the ceiling, and inside the noise band, passes; one byte past it fails', () => {
    expect(judgeEntry('main', entry(10500, 10500)).fail).toBe(false)
    expect(judgeEntry('main', entry(10500 + NOISE_BYTES, 10500)).fail).toBe(false)
    expect(judgeEntry('main', entry(10500 + NOISE_BYTES + 1, 10500)).fail).toBe(true)
  })

  it('an entry without a ceiling fails in EVERY mode', () => {
    for (const mode of ['pr', 'main', 'local'] as const) {
      expect(judgeEntry(mode, entry(100, undefined), { size: 100, ceiling: undefined }).code).toBe('missing-ceiling')
    }
  })
})

describe('local mode: reports, leaves the verdict to CI', () => {
  it('an over-ceiling entry is a note, not a failure', () => {
    // A local run cannot tell its own growth from main's drift (it has no base
    // measurement). Failing here made every worktree red whenever main was,
    // and each one then "fixed" the same line with a different number.
    const v = judgeEntry('local', entry(10600, 10500))
    expect(v.fail).toBe(false)
    expect(v.code).toBe('local-over-ceiling')
  })
})

describe('judgeFamily', () => {
  const entries = [
    { id: 'a', size: 1000, ceiling: 2000 },
    { id: 'b', size: 5000, ceiling: 9000 },
  ]

  it('pr mode without a base THROWS: a gate that passes on missing input is not a gate', () => {
    expect(() => judgeFamily('pr', entries, undefined)).toThrow(/needs the base measurement/)
  })

  it('`sizes: null` means the base builds to the same bytes: nothing grew', () => {
    const verdicts = judgeFamily('pr', entries, { sizes: null, ceilings: { a: 2000, b: 9000 } })
    expect(verdicts.every((v) => !v.fail)).toBe(true)
    expect(verdicts.map((v) => v.baseSize)).toEqual([1000, 5000])
  })

  it('judges each entry against ITS base, so one grown entry does not fail the rest', () => {
    const verdicts = judgeFamily('pr', entries, {
      sizes: { a: 1000, b: 2500 },
      ceilings: { a: 2000, b: 9000 },
    })
    expect(verdicts.map((v) => [v.id, v.fail])).toEqual([
      ['a', false],
      ['b', true],
    ])
  })

  it('an entry absent from the base sizes is new', () => {
    const [v] = judgeFamily('pr', [entries[0]!], { sizes: {}, ceilings: {} })
    expect(v?.fail).toBe(false)
    expect(v?.message).toContain('new entry')
  })

  it('main and local ignore the base', () => {
    expect(judgeFamily('main', entries, undefined).every((v) => !v.fail)).toBe(true)
    expect(judgeFamily('local', entries, undefined).every((v) => !v.fail)).toBe(true)
  })
})

describe('the allowance and the ceiling are functions of the bytes', () => {
  it('2% of the base, never under 64 B', () => {
    expect(growthAllowance(10000)).toBe(200)
    expect(growthAllowance(498046)).toBe(9960)
    expect(growthAllowance(683)).toBe(64)
    expect(growthAllowance(0)).toBe(64)
  })

  it('two people accepting the same measurement write the same ceiling', () => {
    // Hand-picked values for one entry have been 17119 and 17500, in two pull
    // requests, and conflicted.
    expect(ceilingFor(16620)).toBe(18282)
    expect(ceilingFor(16620)).toBe(ceilingFor(16620))
    expect(ceilingFor(1000)).toBe(1100)
  })

  it('nextCeiling: seed, raise when over, keep when under, lower only when named', () => {
    expect(nextCeiling(undefined, 1000, false)).toEqual({ value: 1100, action: 'seed' })
    expect(nextCeiling(900, 1000, false)).toEqual({ value: 1100, action: 'raise' })
    // Under the ceiling, unnamed: byte-identical, even though 1100 > 1050.
    expect(nextCeiling(1050, 1000, false)).toEqual({ value: 1050, action: 'keep' })
    expect(nextCeiling(3000, 1000, false)).toEqual({ value: 3000, action: 'refused' })
    expect(nextCeiling(3000, 1000, true)).toEqual({ value: 1100, action: 'lower' })
    // Named, under the ceiling: this is how growth below the ceiling is accepted.
    expect(nextCeiling(1050, 1000, true)).toEqual({ value: 1100, action: 'raise' })
    expect(nextCeiling(1100, 1000, true)).toEqual({ value: 1100, action: 'keep' })
  })
})

describe('mode and base resolution', () => {
  it('reads the flag first, then the environment, and defaults to local', () => {
    expect(resolveSizeMode([], {})).toBe('local')
    expect(resolveSizeMode([], { PYREON_SIZE_MODE: 'pr' })).toBe('pr')
    expect(resolveSizeMode(['--mode=main'], { PYREON_SIZE_MODE: 'pr' })).toBe('main')
    expect(resolveBasePath(['--base=/a.json'], { PYREON_SIZE_BASE: '/b.json' })).toBe('/a.json')
    expect(resolveBasePath([], { PYREON_SIZE_BASE: '/b.json' })).toBe('/b.json')
    expect(resolveBasePath([], { PYREON_SIZE_BASE: '' })).toBeUndefined()
  })

  it('rejects an unknown mode instead of quietly running as local', () => {
    // `PYREON_SIZE_MODE=PR` falling back to local would report and pass.
    expect(() => resolveSizeMode([], { PYREON_SIZE_MODE: 'PR' })).toThrow(/unknown mode/)
  })
})

describe('which changed paths make the base worth rebuilding', () => {
  it('package sources, manifests, the lockfile, tsconfigs, the bootstrap script, the bundler pin', () => {
    for (const path of [
      'packages/core/core/src/index.ts',
      'packages/core/core/package.json',
      'packages/tools/cli/src/doctor/gates/bundle-budgets.ts',
      'bun.lock',
      'package.json',
      'tsconfig.json',
      '.bun-version',
      'scripts/bootstrap.ts',
    ]) {
      expect(movesLibSizes(path), path).toBe(true)
    }
  })

  it('not prose, CI config, the gates themselves or the ceilings', () => {
    // The gates run from the HEAD checkout over both trees, so a change to how
    // sizes are measured applies to both sides and is not growth.
    for (const path of [
      'packages/core/core/README.md',
      '.github/workflows/ci.yml',
      'scripts/check-bundle-budgets.ts',
      'scripts/size-budgets/packages/core.json',
      'docs/src/content/docs/cli.md',
      'examples/ssr-showcase/src/routes/index.tsx',
    ]) {
      expect(movesLibSizes(path), path).toBe(false)
    }
  })

  it('an example source moves route sizes, and so does anything that moves a lib/', () => {
    expect(movesRouteSizes('examples/ssr-showcase/src/routes/index.tsx')).toBe(true)
    expect(movesRouteSizes('packages/core/router/src/index.ts')).toBe(true)
    expect(movesRouteSizes('scripts/size-budgets/apps/ssr-showcase.json')).toBe(false)
  })
})

describe('formatVerdicts', () => {
  it('lists failures and notes, counts the rest, and names the rule that was applied', () => {
    const verdicts = judgeFamily(
      'pr',
      [
        { id: 'grew', size: 2000, ceiling: 9000 },
        { id: 'drift', size: 9100, ceiling: 9000 },
        { id: 'fine', size: 100, ceiling: 200 },
      ],
      { sizes: { grew: 1000, drift: 9100, fine: 100 }, ceilings: { grew: 9000, drift: 9000, fine: 200 } },
    )
    const { lines, failed } = formatVerdicts('bundle sizes', 'pr', verdicts)
    expect(failed).toBe(1)
    expect(lines.filter((l) => l.startsWith('  ✗'))).toHaveLength(1)
    expect(lines.filter((l) => l.startsWith('  ·'))).toHaveLength(1)
    expect(lines.at(-1)).toContain('1 of 3 entries failed')
    expect(lines.at(-1)).toContain("this change's own growth")
  })
})
