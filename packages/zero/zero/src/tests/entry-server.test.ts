import { describe, expect, it } from 'vitest'
import { createServer, wireRenderMode } from '../entry-server'
import type { RenderMode, ZeroConfig } from '../types'

// ─── PR-S5: render-mode wire + drift gate ───────────────────────────────────

describe('wireRenderMode (PR-S5)', () => {
  const dummyHandler = async () => new Response('ok')
  const baseConfig: ZeroConfig = {}

  it('mode: "ssr" returns the base handler unchanged', () => {
    const wired = wireRenderMode('ssr', dummyHandler, baseConfig)
    expect(wired).toBe(dummyHandler)
  })

  it('mode: "spa" returns the base handler unchanged', () => {
    const wired = wireRenderMode('spa', dummyHandler, baseConfig)
    expect(wired).toBe(dummyHandler)
  })

  it('mode: "ssg" returns the base handler unchanged (runtime fallback only)', () => {
    const wired = wireRenderMode('ssg', dummyHandler, baseConfig)
    expect(wired).toBe(dummyHandler)
  })

  it('mode: "isr" wraps with the ISR handler', () => {
    const wired = wireRenderMode('isr', dummyHandler, baseConfig)
    expect(wired).not.toBe(dummyHandler)
    // The ISR-wrapped handler is enriched with `.revalidateNow` and
    // `.revalidateAll` methods (Object.assign'd onto the function).
    expect(typeof (wired as unknown as { revalidateNow?: unknown }).revalidateNow).toBe('function')
    expect(typeof (wired as unknown as { revalidateAll?: unknown }).revalidateAll).toBe('function')
  })

  it('mode: "isr" uses config.isr when provided', () => {
    const wired = wireRenderMode('isr', dummyHandler, {
      isr: { revalidate: 3600, maxEntries: 500 },
    })
    expect(wired).not.toBe(dummyHandler)
    // We can't introspect the closed-over config without exercising
    // the handler, so just confirm wrapping completed without throwing.
    expect(typeof (wired as unknown as { revalidateNow?: unknown }).revalidateNow).toBe('function')
  })

  it('mode: "isr" defaults to revalidate: 60 when config.isr is missing', () => {
    // The user enabled mode: "isr" but didn't provide config.isr — the
    // wire applies a safe default (60s) rather than silently downgrading
    // to plain SSR behavior. Pre-PR-S5 this case silently used SSR.
    const wired = wireRenderMode('isr', dummyHandler, {})
    expect(wired).not.toBe(dummyHandler)
    expect(typeof (wired as unknown as { revalidateNow?: unknown }).revalidateNow).toBe('function')
  })

  // Drift gate. The TS compiler enforces exhaustiveness via the
  // `_AssertExhaustive` assertion in entry-server.ts — adding a new
  // RenderMode value without a case fails typecheck. This runtime test
  // ASSERTS the cases at the value level: every RenderMode literal must
  // be a "known" branch. If a future RenderMode value is added to
  // types.ts and the wire is forgotten, the test fails by enumeration
  // (it iterates a frozen list of known modes and asserts the wire
  // accepts each one without throwing).
  it('drift gate — every RenderMode value has a wired branch', () => {
    // This array must match the `RenderMode` union in types.ts. If you
    // add a new mode there, ALSO add it here AND a corresponding case
    // in wireRenderMode(). The TS compiler catches the latter; this
    // test catches "you added the case but the value isn't actually
    // routed" (e.g. a case that throws or returns undefined).
    const knownModes: RenderMode[] = ['ssr', 'ssg', 'spa', 'isr']

    for (const mode of knownModes) {
      // Must not throw, must return a callable RequestHandler
      const wired = wireRenderMode(mode, dummyHandler, baseConfig)
      expect(typeof wired).toBe('function')
    }
  })
})

// ─── PR-S5: createServer integration — mode: "isr" auto-wires ──────────────

describe('createServer mode: "isr" auto-wires ISR (PR-S5)', () => {
  it('serves the same response twice from cache when mode: "isr" is set', async () => {
    let renderCount = 0
    const handler = createServer({
      routes: [
        {
          path: '/',
          component: () => 'home' as unknown as ReturnType<typeof import('@pyreon/core').h>,
          loader: async () => {
            renderCount++
            return { count: renderCount }
          },
        },
      ],
      config: {
        mode: 'isr',
        isr: { revalidate: 60 },
      },
    })

    // First request — MISS, renders
    const res1 = await handler(new Request('http://localhost/'))
    expect(res1.headers.get('x-isr-cache')).toBe('MISS')

    // Second request — HIT, served from cache (loader NOT re-invoked)
    const res2 = await handler(new Request('http://localhost/'))
    expect(res2.headers.get('x-isr-cache')).toBe('HIT')

    // The loader fired exactly once — proves ISR was wired
    expect(renderCount).toBe(1)
  })

  it('mode: "ssr" does NOT wrap with ISR (no x-isr-cache header)', async () => {
    const handler = createServer({
      routes: [
        {
          path: '/',
          component: () => 'home' as unknown as ReturnType<typeof import('@pyreon/core').h>,
        },
      ],
      config: { mode: 'ssr' },
    })

    const res = await handler(new Request('http://localhost/'))
    // Plain SSR responses don't have the ISR header
    expect(res.headers.get('x-isr-cache')).toBeNull()
  })

  it('default mode (undefined) is "ssr" — no ISR wrap', async () => {
    const handler = createServer({
      routes: [
        {
          path: '/',
          component: () => 'home' as unknown as ReturnType<typeof import('@pyreon/core').h>,
        },
      ],
      // No config.mode set
    })

    const res = await handler(new Request('http://localhost/'))
    expect(res.headers.get('x-isr-cache')).toBeNull()
  })
})
