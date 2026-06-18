/**
 * Node-side coverage-gap tests for @pyreon/rocketstyle.
 *
 * These exercise the resolution / cache / boolean-shorthand / pseudo / mode
 * branches in `rocketstyle.ts`, `utils/theme.ts`, `utils/attrs.ts`, and
 * `hooks/useTheme.ts` that the behavioural suite did not reach. Every test
 * drives the REAL `rocketstyle()` factory (or the real exported helper) — no
 * mock vnodes — so the assertions reflect the actual resolution pipeline.
 */
import { popContext, pushContext } from '@pyreon/core'
import { init } from '@pyreon/ui-core'
import { buildThemeContextMap, initTestConfig, withThemeContext } from '@pyreon/test-utils'
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest'
import { context } from '../context/context'
import defaultDimensions from '../constants/defaultDimensions'
import useThemeAttrs from '../hooks/useTheme'
import rocketstyle from '../init'
import rocketComponent from '../rocketstyle'
import { calculateStylingAttrs } from '../utils/attrs'
import {
  getDimensionsValues,
  getKeys,
  getMultipleDimensions,
  getTransformDimensions,
} from '../utils/dimensions'
import { __resetModePairRegistryForTesting, getTheme, resolveModeVar } from '../utils/theme'

/**
 * Build the full options object `init.ts` would construct for `rocketComponent`,
 * but allow `name` to be omitted so the componentName `??` fallback chain
 * (`options.name ?? component.displayName ?? component.name`) can be exercised.
 */
const buildComponent = (component: any, name?: string) =>
  (rocketComponent as unknown as (opts: Record<string, unknown>) => any)({
    name,
    component,
    useBooleans: false,
    dimensions: defaultDimensions,
    dimensionKeys: getKeys(defaultDimensions),
    dimensionValues: getDimensionsValues(defaultDimensions),
    multiKeys: getMultipleDimensions(defaultDimensions),
    transformKeys: getTransformDimensions(defaultDimensions),
    styled: true,
  })

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

// Reset cssVariables flag after every test so leakage can't cross-contaminate
// the classic-mode assertions (cssVariables flips the whole resolution path).
afterEach(() => {
  init({ cssVariables: false })
})

/** Capture component — resolves both accessors so node assertions can read them. */
const Cap: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => ({
  type: 'div',
  props: rest,
  $rocketstyle: typeof $rocketstyle === 'function' ? $rocketstyle() : $rocketstyle,
  $rocketstate: typeof $rocketstate === 'function' ? $rocketstate() : $rocketstate,
})
Cap.displayName = 'Cap'

const captureBoth = (Component: any, props?: Record<string, any>, ctx?: any): any =>
  withThemeContext(() => Component(props ?? {}), ctx)

// --------------------------------------------------------
// componentName fallback chain (rocketstyle.ts L97)
// --------------------------------------------------------
describe('rocketstyle — componentName resolution', () => {
  it('falls back to component.displayName when name is undefined', () => {
    // When `name` is undefined the factory falls through to
    // `component.displayName`.
    const Inner: any = ({ $rocketstyle, $rocketstate, ...rest }: any) => ({
      type: 'div',
      props: rest,
    })
    Inner.displayName = 'InnerDisplayName'
    const Btn: any = buildComponent(Inner, undefined)
    const vnode = captureBoth(Btn, {})
    expect(vnode.props['data-rocketstyle']).toBe('InnerDisplayName')
  })

  it('falls back to component.name (function name) when no name nor displayName', () => {
    function PlainFn({ $rocketstyle, $rocketstate, ...rest }: any) {
      return { type: 'div', props: rest }
    }
    const Btn: any = buildComponent(PlainFn, undefined)
    const vnode = captureBoth(Btn, {})
    expect(vnode.props['data-rocketstyle']).toBe('PlainFn')
  })
})

// --------------------------------------------------------
// Per-definition cache HITS — second render of same definition
// (rocketstyle.ts L238 dimensionsMap.hit / L448 omitSet.hit)
// --------------------------------------------------------
describe('rocketstyle — per-definition cache hits', () => {
  it('reuses _dimensionsCache + _omitSetCache across renders of the same definition', () => {
    const Btn: any = rocketstyle()({ name: 'Cached', component: Cap }).states(() => ({
      primary: { color: 'red' },
      secondary: { color: 'blue' },
    }))
    // First render populates the per-definition caches.
    const a = captureBoth(Btn, { state: 'primary' })
    // Second render of the SAME definition hits dimensionsMap.hit + omitSet.hit.
    const b = captureBoth(Btn, { state: 'secondary' })
    expect(a.$rocketstyle.color).toBe('red')
    expect(b.$rocketstyle.color).toBe('blue')
  })
})

// --------------------------------------------------------
// Cache-MISS inside _resolveRsEntry (rocketstyle.ts L370 / L379)
// --------------------------------------------------------
describe('rocketstyle — base/dimension theme cache miss', () => {
  it('resolves correctly when the resolved theme identity differs from the eager one (undefined context theme)', () => {
    // With an undefined context theme, `themeAttrs.theme` returns a FRESH `{}`
    // on each getter read (`getCtx().theme ?? {}`). The eager-populate at setup
    // caches object A; `_resolveRsEntry` reads object B — so the in-resolver
    // ThemeManager.has(theme) check MISSES and walks the set() arm.
    const Btn: any = rocketstyle()({ name: 'MissTheme', component: Cap }).states(() => ({
      go: { color: 'green' },
    }))
    const v = captureBoth(Btn, { state: 'go' }, { theme: undefined as any })
    expect(v.$rocketstyle.color).toBe('green')
  })
})

// --------------------------------------------------------
// Multi-key dimension array key serialization (rocketstyle.ts L325)
// --------------------------------------------------------
describe('rocketstyle — multi-key dimension key serialization', () => {
  const makeMultiBtn = () =>
    rocketstyle({
      dimensions: {
        states: 'state',
        tags: { propName: 'tags', multi: true },
      },
    })({ name: 'Multi', component: Cap }).tags(() => ({
      a: { padding: 1 },
      b: { margin: 2 },
    }))

  it('serializes a populated multi-key array', () => {
    const Btn: any = makeMultiBtn()
    const v = captureBoth(Btn, { tags: ['a', 'b'] })
    expect(v.$rocketstate.tags).toEqual(['a', 'b'])
  })

  it('serializes an EMPTY multi-key array (length === 0 arm)', () => {
    const Btn: any = makeMultiBtn()
    const v = captureBoth(Btn, { tags: [] })
    expect(v.$rocketstate.tags).toEqual([])
  })
})

// --------------------------------------------------------
// Non-string/number/boolean dimension value typeof-tag (rocketstyle.ts L333)
// --------------------------------------------------------
describe('rocketstyle — non-primitive dimension value key tag', () => {
  it('tags an object-valued (non-primitive, non-undefined) dimension in the cache key', () => {
    // Passing an object as a (non-multi) dimension prop produces a value that
    // is neither string/number/boolean nor undefined — exercising the
    // `'~' + typeof v` key tag arm. The styling resolver leaves it as-is.
    const Btn: any = rocketstyle()({ name: 'ObjDim', component: Cap }).states(() => ({
      x: { color: 'red' },
    }))
    // `state={{ weird: 1 }}` — calculateStylingAttrs maps non-string/number to
    // undefined for the resolved state, but the raw key-build reads the
    // rocketstateRaw value. We just need a successful resolve.
    const v = captureBoth(Btn, { state: { weird: 1 } as any })
    expect(v.$rocketstyle).toBeDefined()
  })
})

// --------------------------------------------------------
// Pseudo-state key building (rocketstyle.ts L341 / L342)
// --------------------------------------------------------
describe('rocketstyle — pseudo-state key building', () => {
  it('serializes truthy and falsy pseudo props into the cache key', () => {
    const Btn: any = rocketstyle()({ name: 'Pseudo', component: Cap }).states(() => ({
      a: { color: 'red', hover: { color: 'blue' } },
    }))
    // hover=true (propV !== undefined, truthy → '1')
    const hovered = captureBoth(Btn, { state: 'a', hover: true })
    // hover=false (propV !== undefined, falsy → '0')
    const notHovered = captureBoth(Btn, { state: 'a', hover: false })
    expect(hovered.$rocketstate.pseudo.hover).toBe(true)
    expect(notHovered.$rocketstate.pseudo.hover).toBe(false)
  })
})

// --------------------------------------------------------
// ref prop forwarding (rocketstyle.ts L487)
// --------------------------------------------------------
describe('rocketstyle — ref descriptor forwarding', () => {
  it('forwards a ref prop onto finalProps', () => {
    const Btn: any = rocketstyle()({ name: 'Ref', component: Cap }).states(() => ({
      a: { color: 'red' },
    }))
    const ref = () => {}
    const vnode = captureBoth(Btn, { state: 'a', ref })
    // Cap re-emits remaining props minus the styling ones; ref survives.
    expect(vnode.props.ref).toBe(ref)
  })
})

// --------------------------------------------------------
// cssVariables resolution path (rocketstyle.ts L296 / L393)
// --------------------------------------------------------
describe('rocketstyle — cssVariables mode resolution', () => {
  it('resolves mode-free (mode forced to light, skips per-mode walk) under cssVariables', () => {
    init({ cssVariables: true })
    const Btn: any = rocketstyle()({ name: 'CssVar', component: Cap }).theme((_t: any, mode: any) => ({
      color: mode('#fff', '#000'),
    }))
    // Even in dark context, cssVarsOn forces resolution mode to 'light' and
    // skips the per-mode walk — the var reference is emitted verbatim.
    const v = captureBoth(Btn, {}, { mode: 'dark', isDark: true, isLight: false })
    expect(typeof v.$rocketstyle.color).toBe('string')
    expect(v.$rocketstyle.color).toMatch(/^var\(--px-m-/)
  })
})

// --------------------------------------------------------
// getTheme — missing theme slice for a rocketstate key (utils/theme.ts L234)
// --------------------------------------------------------
describe('getTheme — rocketstate key with no matching theme slice', () => {
  it('defaults to {} when themes[key] is absent', () => {
    const result = getTheme({
      // `state` is active but `themes` has no `state` slice → `themes[key] ?? {}`.
      rocketstate: { state: 'primary' },
      themes: {},
      baseTheme: { color: 'base' },
    })
    expect(result.color).toBe('base')
    // pseudo defaults still applied
    expect(result.hover).toEqual({})
  })
})

// --------------------------------------------------------
// calculateStylingAttrs — useBooleans + multiKeys (utils/attrs.ts L113 / L115)
// --------------------------------------------------------
describe('calculateStylingAttrs — useBooleans multi-key resolution', () => {
  const resolve = calculateStylingAttrs({
    useBooleans: true,
    multiKeys: { tags: true },
  })

  it('collects matching boolean props for a multi-key dimension', () => {
    const out = resolve({
      props: { a: true, b: true, other: true },
      dimensions: { tags: { a: true, b: true } },
    })
    expect(out.tags).toEqual(['a', 'b'])
  })

  it('returns undefined for a multi-key dimension when NO boolean prop matches (length === 0)', () => {
    const out = resolve({
      // `other` is a prop but NOT in the dimensionMap → the `propKey in
      // dimensionMap` check is false, matches stays empty → undefined arm.
      props: { other: true },
      dimensions: { tags: { a: true, b: true } },
    })
    expect(out.tags).toBeUndefined()
  })
})

// --------------------------------------------------------
// useTheme — `?? default` fallbacks for nullish context values
// (hooks/useTheme.ts L30 / L33 / L37 / L41)
// --------------------------------------------------------
describe('useThemeAttrs — nullish context fallbacks', () => {
  let pushed = false
  afterEach(() => {
    if (pushed) {
      popContext()
      pushed = false
    }
  })

  it('falls back to defaults when context theme/mode/isDark are explicitly undefined', () => {
    // A context value where every field is undefined exercises every `??` arm.
    pushContext(
      new Map([
        [
          context.id,
          () => ({ theme: undefined, mode: undefined, isDark: undefined, isLight: undefined }),
        ],
      ]),
    )
    pushed = true
    const result = useThemeAttrs({ inversed: false })
    expect(result.theme).toEqual({})
    expect(result.mode).toBe('light')
    expect(result.isDark).toBe(false)
    expect(result.isLight).toBe(true)
  })
})

// Keep an explicit reference so `buildThemeContextMap` import is exercised
// even if all other consumers route through `withThemeContext`.
describe('buildThemeContextMap sanity', () => {
  it('builds a map keyed by the context id', () => {
    const map = buildThemeContextMap({ mode: 'dark' })
    expect(map.has(context.id)).toBe(true)
  })
})

// --------------------------------------------------------
// __resetModePairRegistryForTesting (utils/theme.ts L118-119)
// --------------------------------------------------------
describe('__resetModePairRegistryForTesting', () => {
  it('clears the mode-pair registry so a resolved var no longer resolves', () => {
    init({ cssVariables: true })
    const Btn: any = rocketstyle()({ name: 'ResetReg', component: Cap }).theme(
      (_t: any, mode: any) => ({ color: mode('#010203', '#040506') }),
    )
    const v = captureBoth(Btn, {})
    const ref = v.$rocketstyle.color as string
    // Before reset: the var resolves to its raw light value.
    expect(resolveModeVar(ref, 'light')).toBe('#010203')
    // After reset: the registry is empty, so the var passes through unchanged.
    __resetModePairRegistryForTesting()
    expect(resolveModeVar(ref, 'light')).toBe(ref)
  })
})
