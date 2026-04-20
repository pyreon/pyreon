import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { describe, expect, it, vi } from 'vitest'
import { PyreonUI, type PyreonUIProps } from '../PyreonUI'

// Spy on provide to verify context provision
const provideSpy = vi.spyOn(await import('@pyreon/core'), 'provide')

/** Get the value argument (2nd arg) from a provide() call by index. */
const getProvideValue = (callIndex: number): any => provideSpy.mock.calls[callIndex]![1]

describe('PyreonUI', () => {
  const theme = {
    rootSize: 16,
    breakpoints: { xs: 0, sm: 576, md: 768 },
    colors: { primary: '#228be6' },
  }

  beforeEach(() => {
    provideSpy.mockClear()
  })

  it('renders children', () => {
    const child = h('div', null, 'hello')
    const result = PyreonUI({ theme, children: child })
    expect(result).toBe(child)
  })

  it('returns null when no children', () => {
    const result = PyreonUI({ theme })
    expect(result).toBeNull()
  })

  it('calls provide three times (ThemeContext, core context, mode context)', () => {
    PyreonUI({ theme, children: null })
    expect(provideSpy).toHaveBeenCalledTimes(3)
  })

  it('defaults mode to light', () => {
    PyreonUI({ theme, children: null })

    // Core context (2nd call) — ReactiveContext getter function
    const coreCtxGetter = getProvideValue(1)
    expect(typeof coreCtxGetter).toBe('function')
    const coreCtx = coreCtxGetter()
    expect(coreCtx.mode).toBe('light')
    expect(coreCtx.isLight).toBe(true)
    expect(coreCtx.isDark).toBe(false)

    // Mode context (3rd call) — getter function
    const modeGetter = getProvideValue(2)
    expect(typeof modeGetter).toBe('function')
    expect(modeGetter()).toBe('light')
  })

  it('provides dark mode', () => {
    PyreonUI({ theme, mode: 'dark', children: null })

    const coreCtxGetter = getProvideValue(1)
    const coreCtx = coreCtxGetter()
    expect(coreCtx.mode).toBe('dark')
    expect(coreCtx.isDark).toBe(true)
    expect(coreCtx.isLight).toBe(false)

    const modeGetter = getProvideValue(2)
    expect(modeGetter()).toBe('dark')
  })

  it('inverts mode when inversed=true', () => {
    PyreonUI({ theme, mode: 'light', inversed: true, children: null })
    expect(getProvideValue(2)()).toBe('dark')
  })

  it('inverts dark to light', () => {
    PyreonUI({ theme, mode: 'dark', inversed: true, children: null })
    expect(getProvideValue(2)()).toBe('light')
  })

  it('enriches theme with __PYREON__ before providing', () => {
    PyreonUI({ theme, children: null })

    // ThemeContext is reactive — the provided value is an accessor.
    const providedThemeGetter = getProvideValue(0)
    const providedTheme = providedThemeGetter()
    expect(providedTheme.__PYREON__).toBeDefined()
    expect(providedTheme.__PYREON__.sortedBreakpoints).toEqual(['xs', 'sm', 'md'])
    expect(providedTheme.colors).toEqual({ primary: '#228be6' })
  })

  it('works with system mode (resolves to light in happy-dom)', () => {
    PyreonUI({ theme, mode: 'system', children: null })
    expect(getProvideValue(2)()).toBe('light')
  })

  it('mode context is a getter function (reactive-ready)', () => {
    PyreonUI({ theme, mode: 'dark', children: null })
    const modeGetter = getProvideValue(2)
    // Mode context is a function, not a static value — consumers call it
    // inside their own reactive scopes for reactive mode switching.
    expect(typeof modeGetter).toBe('function')
    expect(modeGetter()).toBe('dark')
  })

  // ─── Reactivity regression tests ──────────────────────────────────────────
  // Components run ONCE in Pyreon. Destructuring props at setup captures
  // values statically, breaking reactivity. PyreonUI used to destructure
  // `{ theme, mode, inversed, children }` which made `inversed` permanently
  // static — toggling it in a parent had no effect.
  //
  // The fix: read `props.X` lazily inside `resolveMode()`. With reactive
  // props (signal-backed via the compiler's _rp() wrapping, or signal
  // reads inside a getter prop), the computed correctly tracks the
  // dependencies and re-evaluates on change.
  //
  // These tests use real signals to simulate the compiler-emitted reactive
  // prop pattern: `<PyreonUI inversed={isInversed()}>` becomes
  // `_rp(() => isInversed())` which is converted to a getter by
  // makeReactiveProps. The getter reads the signal each time, registering
  // it as a dependency of any reactive scope (like our `computed`).

  it('inversed mode reacts when backed by a signal (regression for destructuring bug)', () => {
    const inversed = signal(false)
    // Simulate makeReactiveProps output: define `inversed` as a getter
    // that reads the signal. This matches what the compiler emits for
    // reactive props in real usage.
    const props = {} as PyreonUIProps
    Object.assign(props, { theme, mode: 'light' as const, children: null })
    Object.defineProperty(props, 'inversed', {
      get: () => inversed(),
      enumerable: true,
      configurable: true,
    })

    PyreonUI(props)
    const modeGetter = getProvideValue(2)

    // Initial: inversed=false, mode=light → resolved=light
    expect(modeGetter()).toBe('light')

    // Toggle inversed via the signal — mimics a parent's signal change
    // that would, in real usage, drive a re-render's reactive prop.
    inversed.set(true)

    // The mode getter MUST see the new value. If destructured (the old
    // bug), the local `inversed` boolean was captured at setup and this
    // would still return 'light'.
    expect(modeGetter()).toBe('dark')

    // And back
    inversed.set(false)
    expect(modeGetter()).toBe('light')
  })

  it('mode reacts when backed by a signal getter (no destructuring)', () => {
    // The function form (mode={() => signal()}) is the documented way
    // to make mode reactive. The destructuring bug never broke this
    // form because `typeof mode === 'function'` correctly called it
    // each time. But this test guards against future regressions.
    const mode = signal<'light' | 'dark'>('light')
    PyreonUI({ theme, mode: () => mode(), children: null })
    const modeGetter = getProvideValue(2)

    expect(modeGetter()).toBe('light')

    mode.set('dark')

    expect(modeGetter()).toBe('dark')
  })

  it('inversed false → true → false toggles correctly through the full cycle', () => {
    // Full cycle: verifies the inverted-mode dependency chain
    // (mode + inversed both feeding into resolveMode) reacts correctly
    // to multiple toggles of the signal.
    const inversed = signal(false)
    const props = {} as PyreonUIProps
    Object.assign(props, { theme, mode: 'dark' as const, children: null })
    Object.defineProperty(props, 'inversed', {
      get: () => inversed(),
      enumerable: true,
      configurable: true,
    })

    PyreonUI(props)
    const modeGetter = getProvideValue(2)

    expect(modeGetter()).toBe('dark') // dark + not inversed → dark

    inversed.set(true)
    expect(modeGetter()).toBe('light') // dark + inversed → light

    inversed.set(false)
    expect(modeGetter()).toBe('dark') // dark + not inversed → dark again
  })
})
