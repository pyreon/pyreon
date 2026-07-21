import { describe, expect, it, vi } from 'vitest'

/**
 * The theme-engine registration seam breaks the ui-core ↔ unistyle cycle:
 * `@pyreon/unistyle` registers its engine via `setThemeEngine`, `<PyreonUI>`
 * reads it via `getThemeEngine`, and ui-core carries no unistyle dependency.
 */
describe('theme-engine registration seam', () => {
  it('getThemeEngine returns a graceful FALLBACK (not a throw) when no engine is registered', async () => {
    // Fresh module instance (the global one is registered by the test setup's
    // `import "@pyreon/unistyle"`) — this one starts unregistered. Rather than
    // crash `<PyreonUI>`, it degrades to an identity engine (a rocketstyle-only
    // app that never loads unistyle must render, not throw).
    vi.resetModules()
    const te = await import('../theme-engine')
    const engine = te.getThemeEngine()
    // Identity enrich + empty vars + identity cpse.
    const theme = { rootSize: 20 }
    expect(engine.enrichTheme(theme)).toBe(theme)
    expect(engine.themeToCssVars(theme)).toEqual({ vars: {}, css: '' })
  })

  it('setThemeEngine registers an engine that getThemeEngine returns', async () => {
    vi.resetModules()
    const te = await import('../theme-engine')
    const engine = {
      enrichTheme: (t: { rootSize?: number }) => t,
      themeToCssVars: () => ({ vars: {}, css: '' }),
      cpseRewrite: (frag: string) => frag,
    } as unknown as Parameters<typeof te.setThemeEngine>[0]
    te.setThemeEngine(engine)
    expect(te.getThemeEngine()).toBe(engine)
  })

  it('importing @pyreon/unistyle registers a working engine (the real seam)', async () => {
    vi.resetModules()
    await import('@pyreon/unistyle')
    const te = await import('../theme-engine')
    const eng = te.getThemeEngine()
    // The real enrichTheme adds the __PYREON__ responsive block.
    const enriched = eng.enrichTheme({ breakpoints: { xs: 0, sm: 576 } })
    expect(enriched.__PYREON__).toBeDefined()
  })
})
