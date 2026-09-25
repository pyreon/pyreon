// @vitest-environment node
/**
 * Per-request SSR CSS collection — the edges of the scoped buffer that the
 * end-to-end isolation suite (`ssr-request-isolation.test.ts`) does not reach:
 * cache-hit re-pushes, define-without-use, ambient re-declaration, ambient
 * bundles, eviction of an ambient key, an empty request, and concurrent
 * streaming flush watermarks.
 *
 * Every spec uses its own `createSheet()` instance so the process-singleton
 * `sheet` (and the other suites that share it) is never disturbed. The request
 * scope is the REAL one runtime-server opens (`runWithRequestContext`), which
 * is what the styler reads through `__PYREON_STYLER_REQUEST_STATE__`.
 */
import { runWithRequestContext } from '@pyreon/runtime-server'
import { defineTheme } from '../define-theme'
import { createSheet } from '../sheet'

/** Count non-overlapping occurrences of `needle` in `hay`. */
const count = (hay: string, needle: string): number => hay.split(needle).length - 1

describe('styler — scoped SSR collection edges', () => {
  it('an empty request emits an empty style tag and no flush output', async () => {
    const s = createSheet()
    const [tag, flushed, styles] = await runWithRequestContext(async () => [
      s.getStyleTag(),
      s.flushSSRPending(),
      s.getStyles(),
    ])
    expect(tag).toBe('<style data-pyreon-styler=""></style>')
    expect(flushed).toBe('')
    expect(styles).toBe('')
  })

  it('a class inserted twice in one request is emitted once', async () => {
    const s = createSheet()
    const tag = await runWithRequestContext(async () => {
      const a = s.insert('color: red;')
      const b = s.insert('color: red;') // insertCache hit → re-push, deduped by `seen`
      expect(b).toBe(a)
      return s.getStyleTag()
    })
    expect(count(tag, 'color: red;')).toBe(1)
  })

  it('a cache hit in a LATER request still reaches that request', async () => {
    const s = createSheet()
    const cls = s.insert('color: teal;')
    const tag = await runWithRequestContext(async () => {
      expect(s.insert('color: teal;')).toBe(cls)
      return s.getStyleTag()
    })
    expect(tag).toContain(`.${cls}{color: teal;}`)
  })

  it('the same CSS under another insert layer reuses the class and is emitted once', async () => {
    const s = createSheet()
    s.insert('color: sienna;') // caches the class under the plain insert key
    const tag = await runWithRequestContext(async () => {
      // Different insertCache key (layer), same hash → the className-cache path.
      const cls = s.insert('color: sienna;', false, 'elements')
      s.insert('color: sienna;', false, 'rocketstyle', false) // define-only: no push
      return [cls, s.getStyleTag()] as const
    })
    expect(count(tag[1], 'color: sienna;')).toBe(1)
    expect(tag[1]).toContain(`.${tag[0]}{color: sienna;}`)
  })

  it('define-only inserts (`use = false`) never enter the request buffer', async () => {
    const s = createSheet()
    const tag = await runWithRequestContext(async () => {
      s.insert('color: olive;', false, undefined, false)
      // …including on the insertCache-hit path.
      s.insert('color: olive;', false, undefined, false)
      return s.getStyleTag()
    })
    expect(tag).not.toContain('olive')
    // …but `markUsed` pulls a defined class into the request that renders it.
    const used = await runWithRequestContext(async () => {
      s.markUsed(s.insert('color: olive;', false, undefined, false))
      return s.getStyleTag()
    })
    expect(count(used, 'color: olive;')).toBe(1)
  })

  it('markUsed is a no-op for an empty or unknown key', async () => {
    const s = createSheet()
    const tag = await runWithRequestContext(async () => {
      s.markUsed('')
      s.markUsed('pyr-does-not-exist')
      return s.getStyleTag()
    })
    expect(tag).toBe('<style data-pyreon-styler=""></style>')
  })

  it('a static global re-declared as ambient is emitted once per request', async () => {
    const s = createSheet()
    s.insertGlobal('body { margin: 0; }', true)
    s.insertGlobal('body { margin: 0; }', true) // cache hit, already ambient
    const [a, b] = await Promise.all([
      runWithRequestContext(async () => s.getStyleTag()),
      runWithRequestContext(async () => s.getStyleTag()),
    ])
    expect(count(a, 'margin: 0')).toBe(1)
    expect(b).toBe(a)
  })

  it('a non-ambient global is only in the request that used it', async () => {
    const s = createSheet()
    const withIt = await runWithRequestContext(async () => {
      s.insertGlobal('html { color: navy; }')
      s.insertGlobal('html { color: navy; }') // cache-hit re-push, deduped
      return s.getStyleTag()
    })
    const without = await runWithRequestContext(async () => s.getStyleTag())
    expect(count(withIt, 'color: navy')).toBe(1)
    expect(without).not.toContain('navy')
  })

  it('an ambient injected bundle reaches every request exactly once', async () => {
    const s = createSheet()
    s.injectRules(['.pyr-bundle{color: plum;}'], 'k1', true)
    s.injectRules(['.pyr-bundle{color: plum;}'], 'k1', true) // idempotent re-inject
    const tags = await Promise.all([
      runWithRequestContext(async () => s.getStyleTag()),
      runWithRequestContext(async () => {
        s.injectRules(['.pyr-bundle{color: plum;}'], 'k1', true)
        return s.getStyleTag()
      }),
    ])
    for (const t of tags) expect(count(t, 'color: plum;')).toBe(1)
  })

  it('a non-ambient bundle re-injected in a later request reaches that request', async () => {
    const s = createSheet()
    await runWithRequestContext(async () => s.injectRules(['.pyr-b2{color: gold;}'], 'k2'))
    const later = await runWithRequestContext(async () => {
      s.injectRules(['.pyr-b2{color: gold;}'], 'k2') // injectedBundles hit
      return s.getStyleTag()
    })
    expect(count(later, 'color: gold;')).toBe(1)
  })

  it('an evicted ambient key is skipped, not emitted as undefined', async () => {
    const s = createSheet({ maxCacheSize: 10 })
    s.insertGlobal('body { background: black; }', true) // oldest → evicted first
    for (let i = 0; i < 12; i++) s.insert(`width: ${i}px;`)
    const tag = await runWithRequestContext(async () => {
      s.insert('height: 1px;')
      return s.getStyleTag()
    })
    expect(tag).not.toContain('background: black')
    expect(tag).not.toContain('undefined')
    expect(tag).toContain('height: 1px;')
  })

  it('concurrent streams keep independent flush watermarks', async () => {
    const s = createSheet()
    s.insertKeyframes('fade', 'from{opacity:0}to{opacity:1}')
    const gate = (() => {
      let open!: () => void
      const p = new Promise<void>((r) => {
        open = r
      })
      return { p, open }
    })()
    const a = runWithRequestContext(async () => {
      s.insert('color: crimson;')
      const first = s.flushSSRPending()
      await gate.p // B inserts + flushes while A is suspended
      s.insert('margin: 3px;')
      return [first, s.flushSSRPending(), s.flushSSRPending()] as const
    })
    const b = runWithRequestContext(async () => {
      s.insert('color: indigo;')
      const out = s.flushSSRPending()
      gate.open()
      return out
    })
    const [[a1, a2, a3], b1] = await Promise.all([a, b])
    // Ambient keyframes go out once per STREAM, ahead of its own rules.
    expect(a1.indexOf('@keyframes fade')).toBe(0)
    expect(a1).toContain('crimson')
    expect(a1).not.toContain('indigo')
    expect(b1.indexOf('@keyframes fade')).toBe(0)
    expect(b1).toContain('indigo')
    expect(b1).not.toContain('crimson')
    // A's second flush carries only what A added since — B's flush did not move it.
    expect(a2).toContain('margin: 3px;')
    expect(a2).not.toContain('@keyframes')
    expect(a2).not.toContain('crimson')
    expect(a3).toBe('')
  })

  it('a configured layer with layered rules emits the framework ordering once', async () => {
    const s = createSheet({ layer: 'app' })
    const [first, second] = await runWithRequestContext(async () => {
      s.insert('color: salmon;', false, 'elements')
      const f = s.flushSSRPending()
      s.insert('color: khaki;', false, 'rocketstyle')
      return [f, s.flushSSRPending()]
    })
    expect(first.startsWith('@layer elements, rocketstyle;')).toBe(true)
    expect(first).toContain('@layer elements{')
    expect(count(second, '@layer elements, rocketstyle;')).toBe(0)
    expect(second).toContain('@layer rocketstyle{')
  })
})

describe('defineTheme', () => {
  it('returns the theme object itself (typing helper, no copy)', () => {
    const theme = { color: { primary: '#123' }, spacing: { xl: '2rem' } }
    expect(defineTheme(theme)).toBe(theme)
  })
})
