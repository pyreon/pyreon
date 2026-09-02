/**
 * `--update` committed a budget derived from a stale `lib/`.
 *
 * It is documented as a RATCHET that "LOWERS one that has shrunk" — correct in
 * principle, and the failure mode in practice. A budget is measured from `lib/`,
 * and a stale or partial `lib/` measures SMALLER than the real package, so a bad
 * measurement can only ever push a budget DOWN. `@pyreon/validate` went
 * 15872 -> 15360, a value implying a ~12288 B measurement for a package that
 * really measures 15330 B locally (after a bootstrap) and 15473 B on CI. The gate
 * then failed on a package neither branch touched — twice, because the wrong
 * value was committed and travelled.
 *
 * The checker already knew this shape ("this budget has too little headroom to be
 * measured reliably"); the WRITER did not. This is the writer's half.
 *
 * Refusing by DIRECTION, not by drop size. My first attempt used a >10% threshold
 * and was wrong: a size test cannot tell a stale build from a genuinely loose
 * budget, and this repo has plenty of the latter — `loom` measures 298 B against a
 * 6144 budget and `testing` 1745 against 5120, both IDENTICAL before and after a
 * full rebuild. The threshold would have refused legitimate tightening while still
 * missing a small stale drop. Direction is the property that actually separates
 * them.
 *
 * Not a platform-variance problem either: after a bootstrap, macOS 15330 vs ubuntu
 * 15473 is 0.9%, consistent with the ~1.1% the gate already documents. An earlier
 * note of mine claiming 3.0% was measured on the stale tree and is retracted.
 */

import { describe, expect, it } from 'vitest'
import { isUpdateMode, shouldLowerUnscoped } from '../../../../../scripts/check-bundle-budgets'

describe('--update lowers only when the package is named', () => {
  it('an UNSCOPED --update never lowers — a stale lib/ can only measure low', () => {
    expect(shouldLowerUnscoped(false)).toBe(false)
  })

  it('a SCOPED --update=@pyreon/pkg lowers — naming it is the deliberate act', () => {
    expect(shouldLowerUnscoped(true)).toBe(true)
  })
})

/**
 * The scoped form is now the ONLY way to lower a budget, so it had better work.
 * It did not: `args.includes('--update')` is an exact match, so
 * `--update=@pyreon/pkg` — the form the script's own doc comment recommends —
 * never enabled update mode and silently ran as a plain check.
 *
 * Latent for its whole life, and invisible to a unit test of the lowering rule:
 * both specs above passed while the feature was unreachable. The end-to-end run
 * is what found it.
 */
describe('--update flag parsing accepts the documented scoped form', () => {
  it('enables update mode for the bare flag', () => {
    expect(isUpdateMode(['--update'])).toBe(true)
  })

  it('enables update mode for --update=@pyreon/pkg (the shape that was broken)', () => {
    expect(isUpdateMode(['--update=@pyreon/validate'])).toBe(true)
  })

  it('stays off for a plain check, and for a flag that merely starts alike', () => {
    expect(isUpdateMode([])).toBe(false)
    expect(isUpdateMode(['--json'])).toBe(false)
    expect(isUpdateMode(['--updated'])).toBe(false)
  })
})
