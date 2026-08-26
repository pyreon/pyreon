/**
 * Per-request SSR scope: the styler `sheet` is a module singleton, so two
 * CONCURRENT streaming renders used to share one SSR rule buffer + flush
 * watermark — request A's per-boundary flush advanced the watermark past
 * request B's rules (FOUC / cross-request CSS). runtime-server now provides an
 * opaque per-request bag via `globalThis.__PYREON_STYLER_REQUEST_STATE__`; the
 * styler stashes its state there. This locks the isolation, and the fallback
 * (no scope → instance state → unchanged behaviour).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { StyleSheet } from '../sheet'

type Bag = Record<string, unknown> | undefined

function makeSSRSheet(): StyleSheet {
  const originalDoc = globalThis.document
  Object.defineProperty(globalThis, 'document', { value: undefined, configurable: true, writable: true })
  const s = new StyleSheet()
  Object.defineProperty(globalThis, 'document', { value: originalDoc, configurable: true, writable: true })
  return s
}

afterEach(() => {
  delete (globalThis as { __PYREON_STYLER_REQUEST_STATE__?: unknown }).__PYREON_STYLER_REQUEST_STATE__
})

describe('styler SSR state — per-request isolation', () => {
  it('two request scopes get ISOLATED buffers + watermarks (concurrent streaming)', () => {
    const s = makeSSRSheet()
    let active: Bag
    ;(globalThis as { __PYREON_STYLER_REQUEST_STATE__?: () => Bag }).__PYREON_STYLER_REQUEST_STATE__ =
      () => active
    const bagA: Bag = {}
    const bagB: Bag = {}

    active = bagA
    s.insert('color: red;')
    active = bagB
    s.insert('color: blue;')

    // Each request's flush sees ONLY its own rules — not the interleaved other.
    active = bagA
    const a = s.flushSSRPending()
    expect(a).toContain('color: red')
    expect(a).not.toContain('color: blue')

    active = bagB
    const b = s.flushSSRPending()
    expect(b).toContain('color: blue')
    expect(b).not.toContain('color: red')

    // Watermarks advanced independently: a second flush on each is empty.
    active = bagA
    expect(s.flushSSRPending()).toBe('')
    active = bagB
    expect(s.flushSSRPending()).toBe('')
  })

  it('falls back to instance state when no request scope is active (unchanged)', () => {
    const s = makeSSRSheet()
    s.insert('color: green;')
    expect(s.flushSSRPending()).toContain('color: green')
  })
})
