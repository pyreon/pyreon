import { describe, expect, it } from 'vitest'
import { diagnoseError } from '../diagnose'

// Router 0.54: `router.preload` / `router.runServerLoaders` became free
// functions (`preloadRoute`, `runServerLoaders`) or `router.preloadComponents`.
// The messages are the REAL runtime text: the TypeError an old call site throws
// (V8 and JavaScriptCore wording) and the router's dev warning, captured from
// the router source.
describe('diagnoseError — router preload / runServerLoaders (0.54)', () => {
  it('explains router.preload is not a function (V8 and JSC) and names both replacements', () => {
    for (const msg of [
      'TypeError: router.preload is not a function',
      `router.preload is not a function. (In 'router.preload("/x", {})', 'router.preload' is undefined)`,
      'TypeError: app.router.preload is not a function',
    ]) {
      const d = diagnoseError(msg)
      expect(d?.cause).toContain('preloadRoute')
      expect(d?.fixCode).toContain('preloadRoute(router, path, request)')
      expect(d?.fixCode).toContain('router.preloadComponents(path)')
    }
  })

  it('explains router.runServerLoaders is not a function', () => {
    const d = diagnoseError(
      `router.runServerLoaders is not a function. (In 'router.runServerLoaders("/x")', 'router.runServerLoaders' is undefined)`,
    )
    expect(d?.fixCode).toBe('const result = await runServerLoaders(router, path, request)')
  })

  it('explains the preloadComponents extra-arguments warning', () => {
    const d = diagnoseError(
      '[Pyreon Router] router.preloadComponents(path) takes one argument and never runs loaders. To resolve a route for SSR (components AND loaders, with the request), call `preloadRoute(router, path, request)` from @pyreon/router.',
    )
    expect(d?.fixCode).toBe('await preloadRoute(router, path, request)')
  })

  it("does not fire on another object's preload (a lazy component's, say)", () => {
    // Another catalog entry may still explain a generic "is not a function";
    // this one must not claim it.
    expect(diagnoseError('TypeError: Comp.preload is not a function')?.cause ?? '').not.toContain('preloadRoute')
  })
})
