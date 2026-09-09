// The gate that keeps a silently-skipping spec guard from coming back.
//
// The RULE already existed — `.claude/rules/testing.md` has said "a skipped
// suite must never masquerade as coverage" since the release audit — and four
// more guards were written the quiet way anyway. That is what a documented but
// unenforced invariant does, so this makes it structural.

import { describe, expect, it } from 'vitest'
import { findBareExistsSkips } from '../../../../../scripts/check-skip-guards'

describe('findBareExistsSkips', () => {
  it('flags the shapes a silent guard is actually written in', () => {
    for (const line of [
      "describe.skipIf(!existsSync(PLOT))('x', () => {})",
      "it.skipIf(!existsSync(LIB_INDEX))('x', () => {})",
      "it.skipIf(! existsSync(LIB))('x', () => {})",
      "it.skipIf(!fs.existsSync(LIB))('x', () => {})",
      "it.skipIf(!node.fs.existsSync(LIB))('x', () => {})",
    ]) {
      expect(findBareExistsSkips(line), line).toHaveLength(1)
    }
  })

  it('leaves the loud form, and ordinary existsSync use, alone', () => {
    for (const line of [
      "it.skipIf(!hasBuiltLib(LIB, 'the thing'))('x', () => {})",
      "expect(existsSync(LIB)).toBe(true)",
      "if (!existsSync(p)) return",
      "it.skipIf(!isSwiftcAvailable())('x', () => {})",
      "const present = existsSync(LIB)",
    ]) {
      expect(findBareExistsSkips(line), line).toEqual([])
    }
  })

  it('reports the 1-based line and the offending text, so the fix is one jump away', () => {
    const src = ['// a', '// b', "describe.skipIf(!existsSync(X))('y', () => {})"].join('\n')
    expect(findBareExistsSkips(src)).toEqual([{ line: 3, text: "describe.skipIf(!existsSync(X))('y', () => {})" }])
  })
})
