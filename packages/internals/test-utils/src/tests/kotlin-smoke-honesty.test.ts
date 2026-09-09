import { describe, expect, it } from 'vitest'
import { verdictKey } from '../../../../native/runtime-kotlin/scripts/verdict-cache'
import {
  kotlinOutcomeLabel,
  SMOKE_SKIPPED_MARKER,
  smokeSkipped,
} from '../../../../native/runtime-kotlin/scripts/smoke-marker'

// A Kotlin co-source verification can COMPILE the behaviour test and never run
// it — `verify-kotlin` degrades to compile-only when no JDK is on PATH and
// still exits 0. The gate has to be able to say that, and must not cache the
// two outcomes under one key.

describe('the reported outcome comes from what happened', () => {
  it('a compiled-but-unrun test does not report as run', () => {
    // The shipped line was `test ? ' (compiled + ran test)' : ' (typecheck-only)'`
    // — derived from the EXISTENCE of a `*Test.kt`, so it claimed a behaviour
    // pass on every machine without a JVM.
    expect(kotlinOutcomeLabel({ hasTest: true, smokeSkipped: true })).not.toContain('ran test')
    expect(kotlinOutcomeLabel({ hasTest: true, smokeSkipped: true })).toContain('SKIPPED')
  })

  it('a test that ran, and no test at all, stay distinguishable from it', () => {
    const ran = kotlinOutcomeLabel({ hasTest: true, smokeSkipped: false })
    const none = kotlinOutcomeLabel({ hasTest: false, smokeSkipped: false })
    const skipped = kotlinOutcomeLabel({ hasTest: true, smokeSkipped: true })
    expect(new Set([ran, none, skipped]).size, 'two outcomes report identically').toBe(3)
    expect(ran).toContain('ran test')
    expect(none).toContain('typecheck-only')
  })

  it('detects the marker verify-kotlin actually prints, mid-stream', () => {
    const stdout = [
      '[verify-kotlin] mode: full (build + smoke)',
      `${SMOKE_SKIPPED_MARKER} — \`java\` not on PATH (typecheck only).`,
      'done',
    ].join('\n')
    expect(smokeSkipped(stdout)).toBe(true)
    expect(smokeSkipped('[verify-kotlin] ✓ smoke: all assertions passed')).toBe(false)
  })
})

describe('the verdict cache cannot replay a compile as a run', () => {
  const base = {
    compilerVersion: 'kotlinc 2.0.0',
    harness: 'h',
    source: 'src-bytes',
    test: 'test-bytes',
    typecheckOnly: false,
  }

  it('the same inputs hash differently when the smoke did not run', () => {
    // Without this the two share a key, so ONE JDK-less run writes an "ok" that
    // every later run replays — including runs on a machine that could have
    // executed the test. The cache is restored across CI runs, so a single
    // JDK-less runner would retire the behaviour test permanently.
    const ran = verdictKey({ ...base, smokeRuns: true })
    const compiledOnly = verdictKey({ ...base, smokeRuns: false })
    expect(ran, 'a compile-only verdict is replayable as a behaviour pass').not.toBe(compiledOnly)
  })

  it('omitting the field keeps the ran-it meaning', () => {
    expect(verdictKey(base)).toBe(verdictKey({ ...base, smokeRuns: true }))
  })
})
