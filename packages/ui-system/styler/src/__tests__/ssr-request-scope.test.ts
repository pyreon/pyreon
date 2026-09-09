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

/**
 * The per-request bag scoped the BUFFER and the flush watermark, but the
 * className dedup (`cache`) stayed per-instance — and `insert()` returned on
 * `cache.has(className)` BEFORE any buffer push. So stream A flushed the rule
 * and stream B, rendering the SAME class, flushed `''`: class names with no
 * CSS on every streamed request after the first. Dedup of the SSR buffer has
 * to be scoped like the buffer (`StylerSSRState.seen`).
 *
 * Bisect-verified: with the `pushSSR` re-emit on the cache-hit path removed,
 * the sequential and interleaved specs fail with
 * `expected '' to contain 'color: red'`.
 */
describe('styler SSR state — a class already in the instance cache is still emitted per request', () => {
  function withBags(): { s: StyleSheet; use: (b: Bag) => void } {
    const s = makeSSRSheet()
    let active: Bag
    ;(globalThis as { __PYREON_STYLER_REQUEST_STATE__?: () => Bag }).__PYREON_STYLER_REQUEST_STATE__ =
      () => active
    return { s, use: (b) => (active = b) }
  }

  it('two SEQUENTIAL streaming requests rendering the same class both flush the rule', () => {
    const { s, use } = withBags()
    use({})
    const cls = s.insert('color: red;')
    expect(s.flushSSRPending()).toContain(`.${cls}{color: red;}`)

    use({})
    expect(s.insert('color: red;')).toBe(cls)
    expect(s.flushSSRPending()).toContain(`.${cls}{color: red;}`)
  })

  it('two INTERLEAVED streaming requests both get the rule, each exactly once', () => {
    const { s, use } = withBags()
    const bagA: Bag = {}
    const bagB: Bag = {}
    use(bagA)
    const cls = s.insert('color: red;')
    use(bagB)
    expect(s.insert('color: red;')).toBe(cls)
    use(bagA)
    s.insert('color: red;') // a second reference inside request A — no re-emit
    use(bagB)
    s.insert('color: red;')

    use(bagA)
    const a = s.flushSSRPending()
    expect(a.split('color: red').length - 1).toBe(1)
    expect(s.flushSSRPending()).toBe('')
    use(bagB)
    const b = s.flushSSRPending()
    expect(b.split('color: red').length - 1).toBe(1)
    expect(s.flushSSRPending()).toBe('')
  })

  it('a rule inserted in request A does NOT leak into request B unless B references it', () => {
    const { s, use } = withBags()
    use({})
    s.insert('color: red;')
    use({})
    s.insert('color: blue;')
    const b = s.flushSSRPending()
    expect(b).toContain('color: blue')
    expect(b).not.toContain('color: red')
  })

  it('keyframes and global CSS follow the same per-request rule', () => {
    const { s, use } = withBags()
    use({})
    s.insertKeyframes('spin', 'from{opacity:0}to{opacity:1}')
    s.insertGlobal('body{margin:0}')
    expect(s.flushSSRPending()).toContain('@keyframes spin')

    use({})
    s.insertKeyframes('spin', 'from{opacity:0}to{opacity:1}')
    s.insertGlobal('body{margin:0}')
    const second = s.flushSSRPending()
    expect(second).toContain('@keyframes spin')
    expect(second).toContain('body{margin:0}')
  })

  it('the STRING-mode path (`getStyleTag`, what renderPage collects) is per-request too', () => {
    // The streaming flush is not the only reader of the buffer: `renderPage`'s
    // `collectStyles` defaults to the `__PYREON_STYLER_COLLECT__` seam, which
    // is `getStyleTag()`. Under a per-request scope it had the same hole — a
    // second request rendering an already-cached class produced a `<style>`
    // with the class names in the HTML and no rules in the tag.
    const { s, use } = withBags()
    use({})
    const cls = s.insert('color: red;')
    expect(s.getStyleTag()).toContain(`.${cls}{color: red;}`)

    use({})
    expect(s.insert('color: red;')).toBe(cls)
    const second = s.getStyleTag()
    expect(second).toContain(`.${cls}{color: red;}`)
    // …and exactly once, since `getStyleTag` returns the WHOLE buffer.
    expect(second.split('color: red').length - 1).toBe(1)
  })

  it('injectRules (collapsed rocketstyle bundles) follows the same per-request rule', () => {
    // `injectedBundles` is per-INSTANCE like `cache`, so this path had the
    // identical hole — three lines from the one being fixed. A fix applied to
    // one call site is folklore, not a fix.
    const { s, use } = withBags()
    use({})
    s.injectRules(['.c-x{color:red}'], 'bundle-hash-1')
    expect(s.flushSSRPending()).toContain('.c-x{color:red}')

    use({})
    s.injectRules(['.c-x{color:red}'], 'bundle-hash-1')
    const second = s.flushSSRPending()
    expect(second).toContain('.c-x{color:red}')
    expect(second.split('.c-x{').length - 1).toBe(1)
    // …and still once per request, not once per reference.
    s.injectRules(['.c-x{color:red}'], 'bundle-hash-1')
    expect(s.flushSSRPending()).toBe('')
  })

  it('the instance (no-scope) state still emits once until reset — SSG unchanged', () => {
    const s = makeSSRSheet()
    s.insert('color: red;')
    s.insert('color: red;')
    expect(s.getStyles().split('color: red').length - 1).toBe(1)
    s.reset()
    s.insert('color: red;')
    expect(s.getStyles().split('color: red').length - 1).toBe(1)
  })
})
