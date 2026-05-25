import { compose, config, hoistNonReactStatics, omit, pick, render } from '@pyreon/ui-core'
import { LocalThemeManager } from './cache'
import { CONFIG_KEYS, PSEUDO_AND_META_KEYS, PSEUDO_KEYS, STYLING_KEYS } from './constants'
import createLocalProvider from './context/createLocalProvider'
import { useLocalContext } from './context/localContext'
import { rocketstyleAttrsHoc } from './hoc'
import { useTheme } from './hooks'
import type { Configuration, ExtendedConfiguration } from './types/configuration'
import type { RocketComponent } from './types/rocketComponent'
import type { InnerComponentProps, RocketStyleComponent } from './types/rocketstyle'
import type { ComponentFn } from './types/utils'
import {
  calculateChainOptions,
  calculateStylingAttrs,
  mergeDescriptors,
  pickStyledAttrs,
} from './utils/attrs'
import { chainOptions, chainOrOptions, chainReservedKeyOptions } from './utils/chaining'
import { calculateHocsFuncs } from './utils/compose'
import { getDimensionsMap } from './utils/dimensions'
import { createStaticsChainingEnhancers, createStaticsEnhancers } from './utils/statics'
import { calculateStyles } from './utils/styles'
import { getDimensionThemes, getTheme, getThemeByMode, getThemeFromChain } from './utils/theme'

// Dev-time counter sink — see packages/internals/perf-harness for contract.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

/**
 * Core rocketstyle component factory. Creates a fully-featured Pyreon component
 * that integrates theme management (with light/dark mode support), multi-tier
 * WeakMap caching, dimension-based styling props, pseudo-state detection, and
 * chainable static methods (`.attrs()`, `.theme()`, `.styles()`, `.config()`, etc.).
 *
 * In Pyreon, components are plain functions that run once per mount.
 * No forwardRef, useMemo, useState — ref flows as a normal prop.
 */

// --------------------------------------------------------
// cloneAndEnhance
// --------------------------------------------------------
type CloneAndEnhance = (
  defaultOpts: Configuration,
  opts: Partial<ExtendedConfiguration>,
) => ReturnType<typeof rocketComponent>

/**
 * Clones the current configuration and merges new options, returning a fresh
 * rocketComponent.
 *
 * Component-swap reset: when `opts.component` is set AND differs from the
 * current `defaultOpts.component`, the prior `attrs`, `priorityAttrs`,
 * `filterAttrs`, and `compose` chains are dropped — they were tailored to the
 * previous component's prop shape, and applying them to a different component
 * silently leaks invalid props through to the DOM (e.g. `disabled` on an
 * `<a>`). Callers who want to preserve them must re-chain explicitly:
 *
 *   const NewBtn = Button.config({ component: 'a' }).attrs(sharedAttrs)
 */
const cloneAndEnhance: CloneAndEnhance = (defaultOpts, opts) => {
  const componentChanged =
    opts.component != null && opts.component !== defaultOpts.component

  return rocketComponent({
    ...defaultOpts,
    attrs: componentChanged
      ? chainOptions(opts.attrs, [])
      : chainOptions(opts.attrs, defaultOpts.attrs),
    filterAttrs: componentChanged
      ? [...(opts.filterAttrs ?? [])]
      : [...(defaultOpts.filterAttrs ?? []), ...(opts.filterAttrs ?? [])],
    priorityAttrs: componentChanged
      ? chainOptions(opts.priorityAttrs, [])
      : chainOptions(opts.priorityAttrs, defaultOpts.priorityAttrs),
    statics: { ...defaultOpts.statics, ...opts.statics },
    compose: componentChanged
      ? { ...opts.compose }
      : { ...defaultOpts.compose, ...opts.compose },
    ...chainOrOptions(CONFIG_KEYS, opts, defaultOpts),
    ...chainReservedKeyOptions([...defaultOpts.dimensionKeys, ...STYLING_KEYS], opts, defaultOpts),
  } as Parameters<typeof rocketComponent>[0])
}

// --------------------------------------------------------
// rocketComponent
// --------------------------------------------------------
// @ts-expect-error
const rocketComponent: RocketComponent = (options) => {
  const { component, styles } = options
  const { styled } = config

  const _calculateStylingAttrs = calculateStylingAttrs({
    multiKeys: options.multiKeys,
    useBooleans: options.useBooleans,
  })

  const componentName = options.name ?? options.component.displayName ?? options.component.name

  // Create styled component with all options.styles if available.
  // Rocketstyle CSS lives in `@layer rocketstyle`, which is declared
  // AFTER `@layer elements` in the cascade ordering (see sheet.ts).
  // This ensures rocketstyle theme styles always override element base
  // styles regardless of source order.
  const STYLED_COMPONENT =
    (component.IS_ROCKETSTYLE ?? options.styled !== true)
      ? component
      : styled(component, { layer: 'rocketstyle' })`
          ${calculateStyles(styles)};
        `

  // --------------------------------------------------------
  // COMPONENT - Final component to be rendered
  // --------------------------------------------------------
  const RenderComponent: ComponentFn<any> = options.provider
    ? createLocalProvider(STYLED_COMPONENT)
    : STYLED_COMPONENT

  // --------------------------------------------------------
  // THEME - Cached & Calculated theme(s)
  // --------------------------------------------------------
  const ThemeManager = new LocalThemeManager()

  // ── Per-definition caches (shared across all instances) ──────────────
  // getDimensionsMap + Object.keys(reservedPropNames) are theme-independent
  // (dimension structure comes from .sizes()/.states()/.variants() chain,
  // not from runtime theme values). Cache them so 50 instances of the same
  // component definition skip the rebuild entirely.
  const _dimensionsCache = new WeakMap<
    object,
    { keysMap: Record<string, unknown>; keywords: Record<string, true | undefined> }
  >()
  const _reservedKeysCache = new WeakMap<object, string[]>()

  // Reuse the module-scope pre-merged constant. Cast away `readonly` for
  // the downstream consumers that take a plain `string[]`. Saves the
  // 6-element array allocation that fired once per `rocketstyle()`
  // definition. Ported from vitus-labs `00fdadc2`.
  const ALL_PSEUDO_KEYS = PSEUDO_AND_META_KEYS as unknown as string[]
  // Static portion of omit keys — PSEUDO_KEYS + filterAttrs + 'pseudo' are definition-scoped.
  // RESERVED_STYLING_PROPS_KEYS is dimension-dependent but also cached per definition.
  // 'pseudo' is included here so we can skip the destructuring spread of mergeProps.
  const STATIC_OMIT_KEYS = ['pseudo', ...PSEUDO_KEYS, ...(options.filterAttrs ?? [])]
  // Pre-built Set for omit() — avoids per-call Set allocation. Built once the
  // dimension-dependent reserved keys are known (first mount), then reused.
  const _omitSetCache = new WeakMap<string[], Set<string>>()

  // ── Dimension-prop memo (per-definition) ─────────────────────────────
  // Keyed on theme identity → Map<keyString, { rocketstyle, rocketstate }>.
  // The accessors below build a key from (mode, dimension prop tuple,
  // pseudo state tuple) and look up here. On hit they return the SAME
  // object identities for both `$rocketstyle` and `$rocketstate`, which
  // lets the styler's existing `classCache` (keyed on those identities)
  // skip the entire CSS resolve pipeline. On miss they compute fresh
  // and store the result.
  //
  // Why this matters: B-FINDING.md (PR #342) showed every Button mount
  // fires 22 styler.resolve calls even when the styler-sheet cache hits
  // — the cache catches at the LAST step (insert dedup), but the resolve
  // pipeline still runs to compute the hash. Stable accessor identities
  // mean the styler's classCache hits earlier and the resolves don't run.
  //
  // LRU bound prevents unbounded growth from prop-tuple churn (e.g. a
  // table where every cell has a unique state). 128 entries per theme
  // covers the E2 perf-dashboard reference workload AND high-cardinality
  // surfaces (data tables, design systems with many tokens crossed with
  // size/variant axes, dashboards rendering many small interactive
  // components). The previous cap of 32 was sized for the reference
  // workload only and thrashed at higher cardinalities — measured 45%
  // cache-miss rate (888/2000 lookups) on a 60-unique-tuple Button
  // mount loop, 46% wall-clock regression vs the cap-fits-workload
  // case. The rs-precompute spike (closed PR #761, results live on
  // `spike/rocketstyle-precompute`) bisect-verified that raising the cap
  // 32 → 128 zeroes the cold-resolves counter for that 60-tuple
  // workload at zero implementation cost. Memory: ~12KB per definition
  // per theme at 128 entries × ~100 bytes per entry — negligible vs
  // the 46% runtime win.
  type RsMemoEntry = { readonly rocketstyle: object; readonly rocketstate: object }
  const _rsMemo = new WeakMap<object, Map<string, RsMemoEntry>>()
  const RS_MEMO_CAP = 128

  // --------------------------------------------------------
  // COMPOSE - high-order components
  // --------------------------------------------------------
  const hocsFuncs = [rocketstyleAttrsHoc(options), ...calculateHocsFuncs(options.compose)]

  // --------------------------------------------------------
  // ENHANCED COMPONENT
  // --------------------------------------------------------
  // In Pyreon, components are plain functions — no forwardRef needed.
  // Ref flows as a normal prop through the chain.
  const EnhancedComponent: ComponentFn<InnerComponentProps> = (props) => {
    // --------------------------------------------------
    // hover - focus - pressed state passed via context from parent component
    // --------------------------------------------------
    const localCtx = useLocalContext(options.consumer)

    // --------------------------------------------------
    // general theme and theme mode dark / light passed in context
    // --------------------------------------------------
    // IMPORTANT: Do NOT destructure — useTheme returns getter properties.
    // Destructuring calls getters once and captures static values.
    // Keep the object reference so mode/isDark/isLight re-evaluate lazily.
    const themeAttrs = useTheme(options)

    // --------------------------------------------------
    // Dimension KEY structure is theme-independent — dimension names (e.g.
    // `level3`, `primary`) come from the .sizes()/.states()/.variants()
    // callback structure at component-definition time, not from theme values.
    // Compute reservedPropNames + dimensions once using the initial theme;
    // they remain stable across theme swaps.
    //
    // Dimension VALUES (used in $rocketstyleAccessor) DO depend on theme and
    // are resolved inside the accessor on each tracked invocation — allowing
    // whole-theme swaps (user preference themes) to re-resolve CSS without
    // remounting. WeakMap caches in ThemeManager keep the common static-theme
    // case O(1).
    // --------------------------------------------------
    const initialTheme = themeAttrs.theme
    const initialBaseTheme = (() => {
      const helper = ThemeManager.baseTheme
      if (!helper.has(initialTheme)) {
        helper.set(initialTheme, getThemeFromChain(options.theme, initialTheme))
      }
      return helper.get(initialTheme)
    })()
    const initialDimensionThemes = (() => {
      const helper = ThemeManager.dimensionsThemes
      if (!helper.has(initialTheme)) {
        helper.set(initialTheme, getDimensionThemes(initialTheme, options))
      }
      return helper.get(initialTheme)
    })()

    // Cache getDimensionsMap per dimension-themes identity — all instances
    // of the same component definition share the same dimension structure.
    let dimResult = _dimensionsCache.get(initialDimensionThemes as object)
    if (dimResult) {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('rocketstyle.dimensionsMap.hit')
    } else {
      dimResult = getDimensionsMap({
        themes: initialDimensionThemes,
        useBooleans: options.useBooleans,
      })
      _dimensionsCache.set(initialDimensionThemes as object, dimResult)
    }
    const { keysMap: dimensions, keywords: reservedPropNames } = dimResult

    // Cache Object.keys() result — same dimension structure = same keys
    let RESERVED_STYLING_PROPS_KEYS = _reservedKeysCache.get(reservedPropNames as object)
    if (!RESERVED_STYLING_PROPS_KEYS) {
      RESERVED_STYLING_PROPS_KEYS = Object.keys(reservedPropNames)
      _reservedKeysCache.set(reservedPropNames as object, RESERVED_STYLING_PROPS_KEYS)
    }

    // Silence "unused" warnings for initialBaseTheme / initialDimensionThemes —
    // they're eagerly populated into ThemeManager caches so the first accessor
    // call hits cache, but not referenced directly.
    void initialBaseTheme
    void initialDimensionThemes

    // Capture pseudo from localCtx once at setup — pseudo properties are
    // getters (from createLocalProvider) that read signals lazily.
    // Passing them through preserves reactivity without subscribing here.
    const localPseudo = localCtx?.pseudo

    // --------------------------------------------------
    // Shared accessor resolver.
    //
    // Both `$rocketstyleAccessor` and `$rocketstateAccessor` derive from the
    // same input set (theme, mode, dimension props, pseudo state). Folding
    // them into one resolver lets the dimension-prop memo return the SAME
    // object identities for both — which is what the styler's `classCache`
    // (keyed on `(rocketstyle, rocketstate)` identity) needs to skip the
    // resolve pipeline on cache hit.
    //
    // Reactive contract: this runs inside the styler's `computed()` (one per
    // mounted instance). All signal reads — theme, mode, dimension props,
    // pseudo getters from localCtx — are TRACKED, so any change re-runs the
    // computed which re-resolves the entry. Same key → cached entry; new key
    // → fresh computation, stored under LRU cap.
    // --------------------------------------------------
    const _resolveRsEntry = (): RsMemoEntry => {
      // Read reactive inputs (tracks theme + mode signals)
      const theme = themeAttrs.theme
      const mode = themeAttrs.mode
      const propsRec = props as Record<string, unknown>

      // Resolve active dimensions FIRST so the cache key uses the RESOLVED
      // dimension values, not the raw prop names. Under `useBooleans: true`
      // the user writes `<X primary />` / `<X secondary />` — both map to
      // `state="primary"` / `state="secondary"` after _calculateStylingAttrs
      // resolves the boolean shorthand. Keying off `propsRec[dimName]` would
      // read `undefined` for both (the dimension prop itself was never set)
      // and collide every variant onto the first cached entry. Reading
      // `rocketstateRaw[dimName]` gives the resolved string and partitions
      // them correctly.
      // Resolved from props (not localCtx which has pseudo getters).
      const rocketstateRaw = _calculateStylingAttrs({
        props: pickStyledAttrs(propsRec, reservedPropNames),
        dimensions,
      })

      // Build key: mode | dimensionValues | pseudoState. Reading dimension
      // props + pseudo signals here tracks them in the surrounding computed
      // so any change re-runs us with a different key.
      let key = mode as string
      for (const dimName in dimensions) {
        const v = rocketstateRaw[dimName]
        // Multi-key dimensions (e.g. variant={['primary', 'rounded']}) are
        // arrays. Sort + join so equivalent sets hash identically; without
        // this both `['a','b']` and `['b','a']` would produce different keys.
        if (Array.isArray(v)) {
          key +=
            '|' + (v.length === 0 ? '' : (v as unknown[]).slice().sort().join(','))
        } else {
          // String/number/boolean serialize directly. Anything else (including
          // undefined / objects) gets a typeof tag so we don't collide.
          key +=
            '|' +
            (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
              ? String(v)
              : v === undefined
                ? ''
                : '~' + typeof v)
        }
      }
      for (const k of ALL_PSEUDO_KEYS) {
        const propV = propsRec[k]
        const localV = localPseudo?.[k as keyof typeof localPseudo]
        const v = propV !== undefined ? propV : localV
        key += '|' + (v === undefined ? '' : v ? '1' : '0')
      }

      // Cache lookup
      let themeMemo = _rsMemo.get(theme as object)
      if (!themeMemo) {
        themeMemo = new Map()
        _rsMemo.set(theme as object, themeMemo)
      }

      const cached = themeMemo.get(key)
      if (cached) {
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('rocketstyle.dimensionMemo.hit')
        // LRU touch: move to end so eviction targets oldest unused entry
        themeMemo.delete(key)
        themeMemo.set(key, cached)
        return cached
      }

      // Miss: compute fresh. Counter measures actual theme resolutions
      // (not accessor invocations) — see COUNTERS.md.
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('rocketstyle.getTheme')

      // Resolve base + dimension themes for the CURRENT theme. WeakMap
      // keyed on theme identity — stable-theme renders hit cache in O(1),
      // theme swaps fall through to recompute (once per new theme).
      const baseThemeHelper = ThemeManager.baseTheme
      if (baseThemeHelper.has(theme)) {
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('rocketstyle.localThemeManager.hit')
      } else {
        baseThemeHelper.set(theme, getThemeFromChain(options.theme, theme))
      }
      const baseTheme = baseThemeHelper.get(theme)

      const dimHelper = ThemeManager.dimensionsThemes
      if (dimHelper.has(theme)) {
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('rocketstyle.localThemeManager.hit')
      } else {
        dimHelper.set(theme, getDimensionThemes(theme, options))
      }
      const themes = dimHelper.get(theme)

      // Resolve mode-specific theme
      const modeBaseHelper = ThemeManager.modeBaseTheme[mode]
      if (modeBaseHelper.has(baseTheme)) {
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('rocketstyle.localThemeManager.hit')
      } else {
        modeBaseHelper.set(baseTheme, getThemeByMode(baseTheme, mode))
      }
      const currentModeBaseTheme = modeBaseHelper.get(baseTheme)

      const modeDimHelper = ThemeManager.modeDimensionTheme[mode]
      if (modeDimHelper.has(themes)) {
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('rocketstyle.localThemeManager.hit')
      } else {
        modeDimHelper.set(themes, getThemeByMode(themes, mode))
      }
      const currentModeThemes = modeDimHelper.get(themes)

      const rocketstyle = getTheme({
        rocketstate: rocketstateRaw,
        themes: currentModeThemes,
        baseTheme: currentModeBaseTheme,
        transformKeys: options.transformKeys,
        appTheme: theme,
      })

      // $rocketstate carries dimension state + pseudo flags so the styler
      // emits matching pseudo selectors (`:hover`, `:focus`, etc.).
      const propPseudo = pick(propsRec, ALL_PSEUDO_KEYS)
      const rocketstate = {
        ...rocketstateRaw,
        pseudo: { ...localPseudo, ...propPseudo },
      }

      // LRU eviction at cap — drop the oldest (first-inserted) entry.
      if (themeMemo.size >= RS_MEMO_CAP) {
        const oldestKey = themeMemo.keys().next().value
        if (oldestKey !== undefined) themeMemo.delete(oldestKey)
      }
      const entry: RsMemoEntry = { rocketstyle, rocketstate }
      themeMemo.set(key, entry)
      return entry
    }

    const $rocketstyleAccessor = () => _resolveRsEntry().rocketstyle
    const $rocketstateAccessor = () => _resolveRsEntry().rocketstate

    // --------------------------------------------------
    // final props passed to WrappedComponent
    // --------------------------------------------------
    // Cache a pre-built Set for omit() — avoids building a new Set from
    // the key array on every mount. Same dimension structure = same Set.
    let omitSet = _omitSetCache.get(RESERVED_STYLING_PROPS_KEYS)
    if (omitSet) {
      if (process.env.NODE_ENV !== 'production')
        _countSink.__pyreon_count__?.('rocketstyle.omitSet.hit')
    } else {
      omitSet = new Set([...RESERVED_STYLING_PROPS_KEYS, ...STATIC_OMIT_KEYS])
      _omitSetCache.set(RESERVED_STYLING_PROPS_KEYS, omitSet)
    }

    // Merge localCtx + props via descriptor-copy so reactive getter
    // props on `props` (compiler-emitted `_rp(() => signal())` wrappers
    // converted to getters by `makeReactiveProps`) survive the merge.
    // A plain `{ ...localCtx, ...props }` spread would fire every getter
    // and collapse to static values, defeating reactivity for any
    // downstream JSX accessor reading `props.x`.
    const mergeProps = localCtx ? mergeDescriptors(localCtx, props) : props

    // omit() preserves descriptors (since ui-core's omit was updated to
    // copy descriptors), so reactive getters carry through to finalProps.
    const finalProps = omit(mergeProps as Record<string, unknown>, omitSet) as Record<string, any>

    if (options.passProps) {
      const passed = pick(mergeProps, options.passProps)
      // Copy descriptors so any reactive getters in passProps survive.
      // Plain `finalProps[k] = passed[k]` would fire getters at setup time
      // AND silently fail when finalProps[k] is already a getter-only
      // descriptor (assignment to a getter-only property is a no-op in
      // non-strict mode, throws in strict mode).
      const passedDescriptors = Object.getOwnPropertyDescriptors(passed)
      for (const k of Object.keys(passedDescriptors)) {
        Object.defineProperty(finalProps, k, passedDescriptors[k]!)
      }
    }

    // Use defineProperty for these last writes too — if props.ref or
    // an existing finalProps slot happened to carry a getter-only
    // descriptor, plain assignment would silently fail. defineProperty
    // explicitly replaces the descriptor regardless of shape.
    const refDescriptor = Object.getOwnPropertyDescriptor(props, 'ref')
    if (refDescriptor) {
      Object.defineProperty(finalProps, 'ref', refDescriptor)
    }
    // Function accessors — DynamicStyled wraps them in a computed() so
    // mode/dimension changes produce a new CSS class reactively. The
    // computed tracks only these two accessors; the resolve itself runs
    // untracked to prevent exponential cascade from theme deep-reads.
    Object.defineProperty(finalProps, '$rocketstyle', {
      value: $rocketstyleAccessor,
      writable: true,
      enumerable: true,
      configurable: true,
    })
    Object.defineProperty(finalProps, '$rocketstate', {
      value: $rocketstateAccessor,
      writable: true,
      enumerable: true,
      configurable: true,
    })

    // development debugging — tree-shaken in production via import.meta.env.DEV
    if (process.env.NODE_ENV !== 'production') {
      // defineProperty rather than `=` to be safe against any preserved
      // descriptor in this slot (defense-in-depth — `data-rocketstyle`
      // is unlikely to be passed as a user prop, but the writes above
      // use defineProperty for the same reason).
      Object.defineProperty(finalProps, 'data-rocketstyle', {
        value: componentName,
        writable: true,
        enumerable: true,
        configurable: true,
      })

      if (options.DEBUG) {
        const debugPayload = {
          component: componentName,
          rocketstate: $rocketstateAccessor(),
          rocketstyle: $rocketstyleAccessor(),
          dimensions,
          mode: themeAttrs.mode,
          reservedPropNames: RESERVED_STYLING_PROPS_KEYS,
          filteredAttrs: options.filterAttrs,
        }

        // oxlint-disable-next-line no-console
        console.debug(`[rocketstyle] ${componentName} render:`, debugPayload)
      }
    }

    // STATIC VNode — created once, never remounted on mode change.
    // The styled component handles reactive class swaps internally.
    return RenderComponent(finalProps)
  }

  // ------------------------------------------------------
  // Compose HOC chain and create final component
  // ------------------------------------------------------
  const FinalComponent: RocketStyleComponent = compose(...hocsFuncs)(EnhancedComponent)
  FinalComponent.IS_ROCKETSTYLE = true
  FinalComponent.displayName = componentName

  hoistNonReactStatics(FinalComponent as Record<string, unknown>, options.component)

  // ------------------------------------------------------
  // enhance for chaining methods
  // ------------------------------------------------------
  createStaticsChainingEnhancers({
    context: FinalComponent,
    dimensionKeys: options.dimensionKeys,
    func: cloneAndEnhance,
    options,
  })

  FinalComponent.IS_ROCKETSTYLE = true
  FinalComponent.displayName = componentName
  FinalComponent.meta = {}

  // ------------------------------------------------------
  // enhance for statics
  // ------------------------------------------------------
  createStaticsEnhancers({
    context: FinalComponent.meta,
    options: options.statics,
  })

  // Also assign statics directly onto the component so they are
  // discoverable via `"key" in Component` checks (e.g. _documentType).
  createStaticsEnhancers({
    context: FinalComponent,
    options: options.statics,
  })

  // ─── Hoisted attrs chain (T3.1) ──────────────────────────────────────
  //
  // Expose the accumulated `.attrs()` callback chain on the component so
  // external inspectors (notably `extractDocumentTree` from
  // `@pyreon/connector-document`) can compute the post-attrs props
  // without invoking the full component. The previous Path B workaround
  // had to run the entire styled wrapper — JSX tree creation, dimension
  // resolution, the lot — just to read `_documentProps` off the result.
  //
  // Typed surface: `RocketStyleComponent.__rs_attrs` is a `readonly
  // ReadonlyArray<(props) => Record<string, unknown>>`. Empty when
  // no `.attrs()` was ever called. `chain.reduce(Object.assign, {})`
  // produces the post-attrs result for a given props bag.
  //
  // The `readonly` modifier guards external CONSUMERS — internal
  // assignment from the factory itself is the only legitimate write,
  // hence the cast. Do not drop the readonly on the type.
  ;(FinalComponent as unknown as { __rs_attrs: typeof options.attrs }).__rs_attrs =
    options.attrs ?? []

  Object.assign(FinalComponent, {
    attrs: (attrs: any, { priority, filter }: any = {}) => {
      const result: Record<string, any> = {}

      if (filter) {
        result.filterAttrs = filter
      }

      if (priority) {
        result.priorityAttrs = attrs as ExtendedConfiguration['priorityAttrs']

        return cloneAndEnhance(options, result)
      }

      result.attrs = attrs as ExtendedConfiguration['attrs']

      return cloneAndEnhance(options, result)
    },

    config: (opts: any = {}) => {
      const result = pick(opts, CONFIG_KEYS) as ExtendedConfiguration

      return cloneAndEnhance(options, result)
    },

    statics: (opts: any) => cloneAndEnhance(options, { statics: opts }),

    getStaticDimensions: (theme: any) => {
      const themes = getDimensionThemes(theme, options)

      const { keysMap, keywords } = getDimensionsMap({
        themes,
        useBooleans: options.useBooleans,
      })

      return {
        dimensions: keysMap,
        keywords,
        useBooleans: options.useBooleans,
        multiKeys: options.multiKeys,
      }
    },

    getDefaultAttrs: (props: any, theme: any, mode: any) =>
      calculateChainOptions(options.attrs)([
        props,
        theme,
        {
          render,
          mode,
          isDark: mode === 'dark',
          isLight: mode === 'light',
        },
      ]),
  })

  return FinalComponent
}

export default rocketComponent
