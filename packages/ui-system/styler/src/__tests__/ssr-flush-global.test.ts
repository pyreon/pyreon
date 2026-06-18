// @vitest-environment node
//
// In a `node` environment `typeof document === 'undefined'`, so sheet.ts's
// module-init block registers `globalThis.__PYREON_STYLER_FLUSH__` — the
// streaming-SSR hook `@pyreon/runtime-server` reads (without a hard
// `runtime-server → styler` dependency). This test exercises that registered
// callback (the `() => sheet.flushSSRPending()` arrow), which the happy-dom
// suite cannot reach because `document` is defined there so registration is
// skipped.
import { describe, expect, it } from 'vitest'
import { sheet } from '../sheet'

describe('sheet — SSR streaming flush global (node env)', () => {
  it('registers __PYREON_STYLER_FLUSH__ on the singleton sheet', () => {
    const flush = (globalThis as { __PYREON_STYLER_FLUSH__?: () => string }).__PYREON_STYLER_FLUSH__
    expect(typeof flush).toBe('function')
  })

  it('the registered global flushes the singleton sheet buffer', () => {
    // Reset so the watermark + buffer start clean for this assertion.
    sheet.reset()
    sheet.injectRules(['.pyr-flush{color:red}'], 'flush-global-key')
    const flush = (globalThis as { __PYREON_STYLER_FLUSH__?: () => string }).__PYREON_STYLER_FLUSH__!
    const out = flush()
    expect(out).toContain('.pyr-flush{color:red}')
    // Idempotent watermark — a second flush returns nothing new.
    expect(flush()).toBe('')
  })
})
