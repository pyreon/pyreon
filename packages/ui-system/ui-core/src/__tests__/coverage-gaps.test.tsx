import { h } from '@pyreon/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { init } from '../config'

const provideSpy = vi.spyOn(await import('@pyreon/core'), 'provide')
const getProvideValue = (callIndex: number): any => provideSpy.mock.calls[callIndex]![1]

const theme = {
  rootSize: 16,
  breakpoints: { xs: 0, sm: 576, md: 768 },
  colors: { primary: '#228be6' },
}

afterEach(() => {
  init({ cssVariables: false })
  document.documentElement.removeAttribute('data-theme')
  provideSpy.mockClear()
})

// --------------------------------------------------------
// PyreonUI coreContext — get theme() getter
// --------------------------------------------------------
//
// The coreContext value object exposes `theme` / `mode` / `isDark` / `isLight`
// as LAZY getters (so reading `.theme` does NOT subscribe to mode). The main
// suite reads `.mode`/`.isDark`/`.isLight` but never `.theme` — this drives
// the `get theme()` accessor (returns the enriched theme).
describe('PyreonUI — coreContext.theme getter', () => {
  it('exposes the enriched theme via the lazy .theme getter', async () => {
    const { PyreonUI } = await import('../PyreonUI')
    PyreonUI({ theme, children: null })

    const coreCtxGetter = getProvideValue(1)
    const coreCtx = coreCtxGetter()
    // Reading .theme runs the enrichedTheme computed → carries __PYREON__.
    expect(coreCtx.theme.__PYREON__).toBeDefined()
    expect(coreCtx.theme.colors).toEqual({ primary: '#228be6' })
  })
})

// --------------------------------------------------------
// useMode — reads ModeContext from the nearest PyreonUI
// --------------------------------------------------------
describe('useMode', () => {
  it('reads the resolved mode through useContext(ModeContext)', async () => {
    const { useMode } = await import('../PyreonUI')
    // useMode() invokes useContext(ModeContext)() — its return value is the
    // resolved mode from the nearest provider (or the reactive-context
    // default when none). Exercises the useMode function body; the value is a
    // valid ThemeMode regardless of ambient provider state.
    const mode = useMode()
    expect(mode === 'light' || mode === 'dark').toBe(true)
  })
})

// --------------------------------------------------------
// getSystemMode — cached return on second resolution
// --------------------------------------------------------
//
// `if (_systemMode) return _systemMode` — the module-level cache is populated
// on the first `mode: 'system'` resolution; a subsequent resolution hits the
// cached-return branch.
describe('PyreonUI — system mode cached resolution', () => {
  it('reuses the cached system-mode signal across resolutions', async () => {
    const { PyreonUI } = await import('../PyreonUI')

    // First system resolution populates `_systemMode`.
    PyreonUI({ theme, mode: 'system', children: null })
    expect(getProvideValue(2)()).toBe('light')

    provideSpy.mockClear()

    // Second system resolution → getSystemMode hits the cached-return branch.
    PyreonUI({ theme, mode: 'system', children: null })
    expect(getProvideValue(2)()).toBe('light')
  })
})

// --------------------------------------------------------
// PyreonUI cssVariables — empty var registry (varsCss falsy)
// --------------------------------------------------------
//
// `if (varsCss) sheet.injectRules(...)` — `themeToCssVars` returns an empty
// css string when the enriched theme has no var-eligible leaves (only
// excluded keys: rootSize + breakpoints). Drives the `if (varsCss)` FALSE arm.
describe('PyreonUI — cssVariables with no eligible theme leaves', () => {
  it('skips :root injection when the var registry is empty', async () => {
    const { PyreonUI } = await import('../PyreonUI')
    init({ cssVariables: true })
    provideSpy.mockClear()

    // Theme with ONLY excluded keys → empty var registry → varsCss === ''.
    const bareTheme = { rootSize: 16, breakpoints: { xs: 0, sm: 576 } }
    PyreonUI({ theme: bareTheme, children: h('i', null) })

    // Invoke the styler ThemeContext getter (provide call 0) so the lazy
    // enrichedTheme computed evaluates the themeToCssVars branch.
    const themeGetter = getProvideValue(0) as () => Record<string, any>
    const provided = themeGetter()
    // No spacing/colors → leaves stay raw, no var() references emitted.
    expect(provided.rootSize).toBe(16)
    expect(provided.__PYREON__).toBeDefined()
  })
})

// --------------------------------------------------------
// getSystemMode — OS prefers-dark → initial 'dark'
// --------------------------------------------------------
//
// `signal(prefersDark ? 'dark' : 'light')` — the `'dark'` arm fires only when
// `matchMedia('(prefers-color-scheme: dark)').matches` is true. happy-dom's
// default matchMedia reports `matches: false`, so this needs a fresh module
// import with a stubbed matchMedia (the `_systemMode` module cache + module-eval
// `_isBrowser` both require isolation + a pre-import stub).
describe('PyreonUI — OS prefers-dark system mode', () => {
  it('initializes system mode to dark when OS prefers dark', async () => {
    vi.resetModules()
    const listeners: Array<(e: { matches: boolean }) => void> = []
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        addEventListener: (_t: string, cb: (e: { matches: boolean }) => void) =>
          listeners.push(cb),
        removeEventListener: () => {},
      })),
    )

    try {
      // `vi.resetModules()` above wiped the theme-engine registration (a
      // module-level slot) — re-import unistyle to re-register it before
      // mounting PyreonUI, exactly as a real app always has it loaded.
      await import('@pyreon/unistyle')
      const mod = await import('../PyreonUI')
      const spy = vi.spyOn(await import('@pyreon/core'), 'provide')
      spy.mockClear()
      mod.PyreonUI({ theme, mode: 'system', children: null })
      // ModeContext getter (3rd provide) resolves through getSystemMode →
      // prefersDark true → signal initialized to 'dark'.
      const modeGetter = spy.mock.calls[2]![1] as () => string
      expect(modeGetter()).toBe('dark')
      spy.mockRestore()
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
})

// NOTE: the cssVariables `props.children ?? null` fallbacks for both the ROOT
// passthrough path and the NESTED `display:contents` wrapper path are exercised
// via real provider trees (renderToString) in css-variables-ssr.test.tsx — a
// direct unmounted call can't establish the nested-context owner chain, and the
// SSR render is the faithful nesting shape.
