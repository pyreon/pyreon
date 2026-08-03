// The Kotlin runtime's gate-coverage assertion.
//
// `verify-kotlin.ts` checks ONE service at a time, and the SET of services is a
// hand-written list repeated across three package.json scripts. A
// hand-maintained input list fails in a specific, silent way: it is wrong
// exactly when a file is ADDED — the moment it has something new to check.
//
// The router package had the same shape as a hardcoded six-file array, and the
// seventh file (`PyreonDeepLink.kt`) was excluded the day it was added. That one
// was LOUD only by luck: an existing file referenced the new class, so kotlinc
// failed on an unresolved reference. A new file that nothing references yet
// would simply have gone unchecked in silence — and a scan of the runtime
// package found six sources in exactly that state.

import { describe, expect, it } from 'vitest'
import {
  coveredServices,
  findCoverageGaps,
  sourceNames,
} from '../../../../native/runtime-kotlin/scripts/check-service-coverage'

const VERIFY_DEFAULT = `const SERVICE =
  process.argv.find((a) => a.startsWith('--service=')) ?.split('=')[1] ?? 'PyreonStorage'`

describe('coveredServices', () => {
  it('collects every --service= flag', () => {
    const pkg = `"build": "bun scripts/verify-kotlin.ts --service=PyreonFetch && bun scripts/verify-kotlin.ts --service=PyreonForm --typecheck-only"`
    expect([...coveredServices(pkg, VERIFY_DEFAULT)].sort()).toEqual([
      'PyreonFetch',
      'PyreonForm',
    ])
  })

  it("counts a BARE invocation as the script's own default", () => {
    // `bun scripts/verify-kotlin.ts` with no flag runs the default service, so
    // that file IS gated even though no --service= names it.
    const pkg = `"build": "bun scripts/verify-kotlin.ts && bun scripts/verify-kotlin.ts --service=PyreonFetch"`
    expect([...coveredServices(pkg, VERIFY_DEFAULT)].sort()).toEqual([
      'PyreonFetch',
      'PyreonStorage',
    ])
  })

  it('reads the default from the script rather than assuming it', () => {
    // A hardcoded 'PyreonStorage' here would silently drift the day the
    // default changed — the exact failure mode this gate exists to prevent.
    const renamed = VERIFY_DEFAULT.replace("'PyreonStorage'", "'PyreonSomethingElse'")
    expect([...coveredServices(`"build": "bun scripts/verify-kotlin.ts"`, renamed)]).toEqual([
      'PyreonSomethingElse',
    ])
  })

  it('ignores segments that do not invoke the verify script', () => {
    const pkg = `"build": "bun scripts/check-duplicate-declarations.ts && echo skipping"`
    expect(coveredServices(pkg, VERIFY_DEFAULT).size).toBe(0)
  })

  it('does not confuse a service name that is a prefix of another', () => {
    const pkg = `"build": "bun scripts/verify-kotlin.ts --service=PyreonStorageAndroid"`
    const covered = coveredServices(pkg, VERIFY_DEFAULT)
    expect(covered.has('PyreonStorageAndroid')).toBe(true)
    expect(covered.has('PyreonStorage')).toBe(false)
  })

  it('handles a service name containing digits', () => {
    // `[A-Za-z]+` truncates PyreonI18n to "PyreonI" and reports a false gap.
    const pkg = `"build": "bun scripts/verify-kotlin.ts --service=PyreonI18n"`
    expect(coveredServices(pkg, VERIFY_DEFAULT).has('PyreonI18n')).toBe(true)
  })
})

describe('sourceNames', () => {
  it('strips the .kt suffix and ignores anything else', () => {
    expect(sourceNames(['PyreonFetch.kt', 'README.md', 'PyreonAuth.kt'])).toEqual([
      'PyreonAuth',
      'PyreonFetch',
    ])
  })
})

describe('findCoverageGaps', () => {
  const exempt = { PyreonWebView: 'needs android.webkit stubs' }

  it('reports a source that no invocation names', () => {
    const out = findCoverageGaps(
      ['PyreonFetch', 'PyreonBrandNew'],
      new Set(['PyreonFetch']),
      {},
    )
    expect(out.uncovered).toEqual(['PyreonBrandNew'])
    expect(out.staleExempt).toEqual([])
  })

  it('accepts a source that is knowingly exempt', () => {
    const out = findCoverageGaps(['PyreonFetch', 'PyreonWebView'], new Set(['PyreonFetch']), exempt)
    expect(out.uncovered).toEqual([])
  })

  it('flags an EXEMPT entry that is now covered — the list may only shrink', () => {
    const out = findCoverageGaps(
      ['PyreonFetch', 'PyreonWebView'],
      new Set(['PyreonFetch', 'PyreonWebView']),
      exempt,
    )
    expect(out.staleExempt).toEqual(['PyreonWebView'])
  })

  it('flags an EXEMPT entry whose file is gone', () => {
    const out = findCoverageGaps(['PyreonFetch'], new Set(['PyreonFetch']), exempt)
    expect(out.staleExempt).toEqual(['PyreonWebView'])
  })

  it('is clean when every source is covered or exempt', () => {
    const out = findCoverageGaps(['PyreonFetch', 'PyreonWebView'], new Set(['PyreonFetch']), exempt)
    expect(out).toEqual({ uncovered: [], staleExempt: [] })
  })
})
