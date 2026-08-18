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

// The string-mode (non-streaming) twin of the hook above. `renderPage`
// (@pyreon/server) defaults `collectStyles` to this global, which is what
// stops a consumer from shipping styler class names with no CSS — the
// silent first-paint defect zero's dev SSR middleware and its production
// `createServer` both had, because `collectStyles` was opt-in and only the
// SSG entry ever passed one.
describe('sheet — SSR string-mode collect global (node env)', () => {
  type Seam = { __PYREON_STYLER_COLLECT__?: (nonce?: string) => string }

  it('registers __PYREON_STYLER_COLLECT__ on the singleton sheet', () => {
    expect(typeof (globalThis as Seam).__PYREON_STYLER_COLLECT__).toBe('function')
  })

  it('the registered global returns the full buffered <style> tag', () => {
    sheet.reset()
    sheet.injectRules(['.pyr-collect{color:blue}'], 'collect-global-key')
    const collect = (globalThis as Seam).__PYREON_STYLER_COLLECT__!
    const out = collect()
    expect(out).toContain('<style data-pyreon-styler')
    expect(out).toContain('.pyr-collect{color:blue}')
    // Unlike the streaming flush this is NOT watermarked — string-mode SSR
    // emits one consolidated tag per page, so a second call repeats it.
    expect(collect()).toContain('.pyr-collect{color:blue}')
  })

  it('forwards a CSP nonce onto the emitted tag', () => {
    sheet.reset()
    sheet.injectRules(['.pyr-nonce{color:green}'], 'collect-nonce-key')
    const collect = (globalThis as Seam).__PYREON_STYLER_COLLECT__!
    expect(collect('n0nce')).toContain('nonce="n0nce"')
  })

  // The two seams must stay independent: a mixed process (a streaming app
  // with an `isr` route forced to string mode) drives both. `getStyleTag()`
  // must never move the streaming watermark.
  it('collecting does not disturb the streaming flush watermark', () => {
    sheet.reset()
    sheet.injectRules(['.pyr-both{color:red}'], 'collect-both-key')
    const collect = (globalThis as Seam).__PYREON_STYLER_COLLECT__!
    const flush = (globalThis as { __PYREON_STYLER_FLUSH__?: () => string }).__PYREON_STYLER_FLUSH__!
    expect(collect()).toContain('.pyr-both{color:red}')
    // The flush still sees the rule as pending — collect() consumed nothing.
    expect(flush()).toContain('.pyr-both{color:red}')
    expect(flush()).toBe('')
  })
})
