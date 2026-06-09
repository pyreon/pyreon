/**
 * Tests for `sheet.flushSSRPending()` — the streaming-SSR watermark
 * that lets `@pyreon/runtime-server`'s streaming pipeline emit `<style>`
 * tags inline next to each Suspense boundary's resolved HTML.
 *
 * Bisect-verifies the watermark semantics: each flush must return ONLY
 * rules added since the previous flush, advance the watermark
 * idempotently, and reset cleanly on `reset()` / `clearAll()` /
 * `resetSSRBuffer()`.
 *
 * Mirrors `sheet-ssr-paths.test.ts`'s `makeSSRSheet()` shape — we
 * construct a StyleSheet instance while `document` is undefined so
 * `isSSR === true` and `insert()` actually populates the SSR buffer
 * (under happy-dom the live-DOM path bypasses the buffer).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StyleSheet } from '../sheet'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeSSRSheet(): StyleSheet {
  const originalDoc = globalThis.document
  Object.defineProperty(globalThis, 'document', {
    value: undefined,
    configurable: true,
    writable: true,
  })
  const s = new StyleSheet()
  Object.defineProperty(globalThis, 'document', {
    value: originalDoc,
    configurable: true,
    writable: true,
  })
  return s
}

describe('sheet.flushSSRPending — streaming SSR watermark', () => {
  let s: StyleSheet

  beforeEach(() => {
    s = makeSSRSheet()
  })

  it('returns empty string when no rules have been inserted', () => {
    expect(s.flushSSRPending()).toBe('')
  })

  it('returns inserted rules on first flush', () => {
    s.insert('color: red;')
    const out = s.flushSSRPending()
    expect(out).toContain('color: red')
  })

  it('idempotent — flush after flush with no new rules returns empty string', () => {
    s.insert('color: red;')
    s.flushSSRPending()
    expect(s.flushSSRPending()).toBe('')
  })

  it('returns ONLY newly inserted rules between flushes', () => {
    s.insert('color: red;')
    s.flushSSRPending()

    s.insert('color: blue;')
    const second = s.flushSSRPending()

    // The second flush must NOT re-emit the first rule.
    expect(second).toContain('color: blue')
    expect(second).not.toContain('color: red')
  })

  it('emits @layer ordering on the first flush when layered rules are present', () => {
    s.injectRules(['@layer elements{.foo{color:red}}'], 'k1')
    const first = s.flushSSRPending()
    expect(first).toContain('@layer elements, rocketstyle;')

    s.injectRules(['@layer elements{.bar{color:blue}}'], 'k2')
    const second = s.flushSSRPending()
    // Second flush must NOT re-emit the ordering declaration.
    expect(second).not.toContain('@layer elements, rocketstyle;')
    expect(second).toContain('.bar')
  })

  it('does NOT emit @layer ordering when no layered rules are present', () => {
    s.insert('color: red;')
    const out = s.flushSSRPending()
    expect(out).not.toContain('@layer elements, rocketstyle;')
    expect(out).toContain('color: red')
  })

  it('reset() resets the watermark so a re-rendered page starts fresh', () => {
    s.insert('color: red;')
    s.flushSSRPending()
    expect(s.flushSSRPending()).toBe('')

    s.reset()
    // Insert the SAME rule (cache cleared, so it actually goes into buffer again)
    s.insert('color: red;')
    const out = s.flushSSRPending()
    expect(out).toContain('color: red')
  })

  it('resetSSRBuffer() resets the watermark without dropping the dedup cache', () => {
    s.insert('color: red;')
    s.flushSSRPending()

    s.resetSSRBuffer()
    // After resetSSRBuffer, the buffer is empty AND the watermark is 0.
    expect(s.flushSSRPending()).toBe('')

    // The dedup cache survives, so re-inserting the same CSS hits the
    // cache and does NOT re-buffer the rule.
    s.insert('color: red;')
    // Buffer was empty + cache hit → flush still empty.
    expect(s.flushSSRPending()).toBe('')
  })

  it('clearAll() resets the watermark alongside the buffer', () => {
    s.insert('color: red;')
    s.flushSSRPending()
    // clearAll resets everything — buffer, cache, watermark
    s.clearAll()
    s.insert('color: red;')
    const out = s.flushSSRPending()
    expect(out).toContain('color: red')
  })

  it('many flushes in sequence each return only the delta', () => {
    s.insert('color: red;')
    expect(s.flushSSRPending()).toContain('color: red')

    s.insert('color: blue;')
    expect(s.flushSSRPending()).toContain('color: blue')

    s.insert('color: green;')
    const out3 = s.flushSSRPending()
    expect(out3).toContain('color: green')
    expect(out3).not.toContain('color: red')
    expect(out3).not.toContain('color: blue')

    // Drain — nothing pending
    expect(s.flushSSRPending()).toBe('')
  })

  it('returns the raw CSS body — caller is responsible for </style> escaping', () => {
    // The flush returns the raw CSS body; the runtime-server consumer
    // wraps it in `<style>` and escapes `</style` to prevent early
    // close. Per `flushSSRPending` JSDoc, the body is NOT pre-escaped.
    s.insert('content: "</style>";')
    const out = s.flushSSRPending()
    expect(out).toMatch(/<\/style>/)
  })

  it('cumulative flush totals match getStyleTag content (correctness lock)', () => {
    s.insert('color: red;')
    s.insert('color: blue;')
    s.insert('color: green;')

    // The cumulative output of flushSSRPending must equal the body
    // getStyleTag would emit (modulo the <style> wrapper) — they read
    // from the same buffer.
    const full1 = s.flushSSRPending()
    expect(s.flushSSRPending()).toBe('')
    // getStyleTag still returns ALL rules (regardless of watermark)
    const fullTag = s.getStyleTag()
    expect(fullTag).toContain('color: red')
    expect(fullTag).toContain('color: blue')
    expect(fullTag).toContain('color: green')
    expect(full1).toContain('color: red')
    expect(full1).toContain('color: blue')
    expect(full1).toContain('color: green')
  })
})

describe('sheet.flushSSRPending — globalThis registration', () => {
  it('skips registration when document is defined (client-side)', () => {
    // The singleton `sheet` module-init registration is gated on
    // `typeof document === 'undefined'`. Under happy-dom, document is
    // defined, so the hook is NOT registered.
    const hook = (globalThis as { __PYREON_STYLER_FLUSH__?: () => string })
      .__PYREON_STYLER_FLUSH__
    expect(hook).toBeUndefined()
  })
})
