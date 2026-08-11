// The Kotlin runtime's verdict-cache key.
//
// A verification is a pure function of (compiler, harness, source, mode), so a
// cache hit can only skip re-deriving a verdict — never change one. That
// property lives entirely in the KEY, and every part of it earns its place by
// being a thing whose change would legitimately change the answer.
//
// The mode component is the one that matters most. `--typecheck-only` is
// strictly weaker than a full build-and-run: if it shared a key with the full
// mode, a typecheck-only pass would be served to a full run and a broken smoke
// `main()` would never be caught again. That is the single mistake that would
// turn this speedup into a hole, so it is asserted first.
//
// Verified end-to-end against the real harness as well: a full run over a
// typecheck-warmed cache reused exactly 16 verdicts — precisely the
// TYPECHECK_ONLY set, whose full mode IS a typecheck — and recompiled the other
// 29. Editing one source recompiled exactly that one; editing the harness (where
// the stubs live) recompiled all 45.
import { describe, expect, it } from 'vitest'
import { verdictKey } from '../../../../native/runtime-kotlin/scripts/verdict-cache'

const BASE = {
  compilerVersion: 'kotlinc-jvm 2.3.21',
  harness: 'const STUBS = "..."',
  source: 'package com.pyreon.runtime\nval x = 1\n',
  test: 'fun main() {}',
  typecheckOnly: false,
}

describe('verdictKey', () => {
  it('is stable for identical inputs', () => {
    expect(verdictKey(BASE)).toBe(verdictKey({ ...BASE }))
  })

  it('DIFFERS by mode — a typecheck-only pass must never satisfy a full run', () => {
    expect(verdictKey({ ...BASE, typecheckOnly: true })).not.toBe(verdictKey(BASE))
  })

  it('differs when the SOURCE changes', () => {
    expect(verdictKey({ ...BASE, source: `${BASE.source}// edit\n` })).not.toBe(verdictKey(BASE))
  })

  it('differs when the TEST file changes', () => {
    // The smoke `main()` is part of what a full verification proves.
    expect(verdictKey({ ...BASE, test: 'fun main() { error("x") }' })).not.toBe(verdictKey(BASE))
  })

  it('differs when the HARNESS changes — the stubs live inside it', () => {
    // The load-bearing one its sibling calls out: a subset stub manufactures
    // failures and a superset stub MASKS real breakage, so a key blind to stub
    // edits would serve a stale `ok` and silently defeat the gate.
    expect(verdictKey({ ...BASE, harness: 'const STUBS = "different"' })).not.toBe(verdictKey(BASE))
  })

  it('differs when the COMPILER changes', () => {
    // A compiler upgrade can legitimately change a verdict — which is why the
    // nightly deliberately runs uncached.
    expect(verdictKey({ ...BASE, compilerVersion: 'kotlinc-jvm 2.4.0' })).not.toBe(verdictKey(BASE))
  })

  it('does not collide when two components swap content', () => {
    // Null-separated, so `source:"ab", test:"c"` cannot hash the same as
    // `source:"a", test:"bc"` — the classic concatenation bug.
    expect(verdictKey({ ...BASE, source: 'ab', test: 'c' })).not.toBe(
      verdictKey({ ...BASE, source: 'a', test: 'bc' }),
    )
  })
})
