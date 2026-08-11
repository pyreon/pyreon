// The Kotlin runtime's gate-coverage assertion.
//
// `verify-kotlin.ts` checks ONE service at a time, and the SET of services used
// to be a hand-written list repeated across three package.json scripts. A
// hand-maintained input list fails in a specific, silent way: it is wrong
// exactly when a file is ADDED — the moment it has something new to check.
//
// It had already failed that way. Eight services were missing from at least one
// of the three chains; seven (PyreonBiometrics, PyreonFilePicker,
// PyreonHaptics, PyreonImagePicker, PyreonLinking, PyreonNotifications,
// PyreonShare) were verified by `test` but by neither `build` nor `typecheck`.
// The gate reported ✓ throughout, because it grepped the WHOLE package.json and
// so could only answer "verified somewhere?" — not "verified by the script I am
// running?".
//
// The list is now DERIVED from the sources (`services.ts`), which makes that
// class impossible: a new `.kt` file is in the plan the moment it exists. What
// still needs asserting is what derivation cannot give you — that EXEMPT stays a
// ratchet, and that an empty or all-exempt scan is never a vacuous pass.

import { describe, expect, it } from 'vitest'
import {
  coveredServices,
  findCoverageGaps,
  sourceNames,
} from '../../../../native/runtime-kotlin/scripts/check-service-coverage'
import { planServices } from '../../../../native/runtime-kotlin/scripts/services'

describe('planServices — the derivation', () => {
  const files = ['PyreonFetch.kt', 'PyreonJson.kt', 'PyreonAssets.kt', 'README.md', 'PyreonForm.kt']
  const exempt = { PyreonAssets: 'needs stubs' }

  it('derives one entry per .kt source, minus EXEMPT, sorted', () => {
    expect(planServices(files, 'full', exempt).map((s) => s.name)).toEqual([
      'PyreonFetch',
      'PyreonForm',
      'PyreonJson',
    ])
  })

  it('covers a NEW source with no list to edit — the whole point', () => {
    const plan = planServices([...files, 'PyreonBrandNew.kt'], 'full', exempt)
    expect(plan.map((s) => s.name)).toContain('PyreonBrandNew')
  })

  it('marks a service typecheck-only when it cannot run its smoke main()', () => {
    // PyreonJson is in TYPECHECK_ONLY; PyreonFetch is not.
    const plan = planServices(files, 'full', exempt)
    expect(plan.find((s) => s.name === 'PyreonJson')?.typecheckOnly).toBe(true)
    expect(plan.find((s) => s.name === 'PyreonFetch')?.typecheckOnly).toBe(false)
  })

  it('forces EVERY service typecheck-only in typecheck mode', () => {
    expect(planServices(files, 'typecheck', exempt).every((s) => s.typecheckOnly)).toBe(true)
  })

  it('ignores non-Kotlin files', () => {
    expect(planServices(['notes.md', 'build.gradle'], 'full', exempt)).toEqual([])
  })
})

describe('coveredServices', () => {
  it('reports exactly what the runner will execute', () => {
    // The gate and the runner read the SAME derivation, so they cannot
    // disagree — which is the failure the old package.json grep allowed.
    const files = ['PyreonFetch.kt', 'PyreonAssets.kt', 'PyreonWebView.kt']
    expect([...coveredServices(files)]).toEqual(['PyreonFetch'])
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
