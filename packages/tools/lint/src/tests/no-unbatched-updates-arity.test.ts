/**
 * A signal write is `sig.set(value)` — exactly one argument. Keyed-collection
 * setters take two, and flagging them produced "unbatched signal updates" in
 * server middleware that contains no signals at all.
 */
import { describe, expect, it } from 'vitest'
import { noUnbatchedUpdates } from '../rules/reactivity/no-unbatched-updates'
import { lintFile } from '../runner'
import type { LintConfig } from '../types'

const RULE_ID = 'pyreon/no-unbatched-updates'
const CONFIG: LintConfig = { rules: { [RULE_ID]: 'warn' } }
const lint = (src: string) =>
  lintFile('/abs/src/x.ts', src, [noUnbatchedUpdates], CONFIG).diagnostics.filter(
    (d) => d.ruleId === RULE_ID,
  )

describe('pyreon/no-unbatched-updates — two-arg setters are not signal writes', () => {
  it('fires on three single-arg signal writes (control)', () => {
    expect(
      lint(`function f() { data.set(1); error.set(2); pending.set(3) }`).length,
    ).toBeGreaterThan(0)
  })

  it('does NOT fire on Headers.set through a member receiver', () => {
    // zero's securityHeaders() middleware — five two-arg sets, zero signals.
    expect(
      lint(`function f(ctx) {
        ctx.headers.set('X-Content-Type-Options', 'nosniff')
        ctx.headers.set('X-Frame-Options', 'DENY')
        ctx.headers.set('X-XSS-Protection', '1; mode=block')
      }`),
    ).toHaveLength(0)
  })

  it('does NOT fire on a Map-like receiver it cannot name-track', () => {
    expect(
      lint(`function f(cache) { cache.set('a', 1); cache.set('b', 2); cache.set('c', 3) }`),
    ).toHaveLength(0)
  })

  it('still fires when a two-arg setter is mixed with real signal writes', () => {
    // The two-arg call is ignored, the three one-arg writes still count.
    expect(
      lint(`function f(cache) { cache.set('a', 1); x.set(1); y.set(2); z.set(3) }`).length,
    ).toBeGreaterThan(0)
  })
})
