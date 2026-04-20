import { compose, config, hoistNonReactStatics, omit, pick, render } from '@pyreon/ui-core'
import { LocalThemeManager } from './cache'
import { CONFIG_KEYS, PSEUDO_KEYS, PSEUDO_META_KEYS, STYLING_KEYS } from './constants'
import createLocalProvider from './context/createLocalProvider'
import { useLocalContext } from './context/localContext'
import { rocketstyleAttrsHoc } from './hoc'
import { useTheme } from './hooks'
import type { Configuration, ExtendedConfiguration } from './types/configuration'
import type { RocketComponent } from './types/rocketComponent'
import type { InnerComponentProps, RocketStyleComponent } from './types/rocketstyle'
import type { ComponentFn } from './types/utils'
import { calculateChainOptions, calculateStylingAttrs, pickStyledAttrs } from './utils/attrs'
import { chainOptions, chainOrOptions, chainReservedKeyOptions } from './utils/chaining'
import { calculateHocsFuncs } from './utils/compose'
import { getDimensionsMap } from './utils/dimensions'
import { createStaticsChainingEnhancers, createStaticsEnhancers } from './utils/statics'
import { calculateStyles } from './utils/styles'
import { getDimensionThemes, getTheme, getThemeByMode, getThemeFromChain } from './utils/theme'

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

/** Clones the current configuration and merges new options, returning a fresh rocketComponent. */
const cloneAndEnhance: CloneAndEnhance = (defaultOpts, opts) =>
  rocketComponent({
    ...defaultOpts,
    attrs: chainOptions(opts.attrs, defaultOpts.attrs),
    filterAttrs: [...(defaultOpts.filterAttrs ?? []), ...(opts.filterAttrs ?? [])],
    priorityAttrs: chainOptions(opts.priorityAttrs, defaultOpts.priorityAttrs),
    statics: { ...defaultOpts.statics, ...opts.statics },
    compose: { ...defaultOpts.compose, ...opts.compose },
    ...chainOrOptions(CONFIG_KEYS, opts, defaultOpts),
    ...chainReservedKeyOptions([...defaultOpts.dimensionKeys, ...STYLING_KEYS], opts, defaultOpts),
  } as Parameters<typeof rocketComponent>[0])

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

    const { keysMap: dimensions, keywords: reservedPropNames } = getDimensionsMap({
      themes: initialDimensionThemes,
      useBooleans: options.useBooleans,
    })

    const RESERVED_STYLING_PROPS_KEYS = Object.keys(reservedPropNames)

    // --------------------------------------------------
    // $rocketstyle as a FUNCTION ACCESSOR — fully reactive.
    // Re-evaluates when THEME, MODE, or dimension props change.
    // Props are resolved fresh each call so reactive prop accessors
    // (signals, getters) produce updated dimension values.
    // --------------------------------------------------
    const $rocketstyleAccessor = () => {
      // Read theme + mode LAZILY via the getter-backed themeAttrs object.
      // Both reads are tracked when this accessor runs inside a reactive
      // scope (styler's effect), so theme swap / mode toggle re-runs the
      // surrounding resolver and swaps the generated class.
      const theme = themeAttrs.theme // reactive: tracks theme signal
      const mode = themeAttrs.mode // reactive: tracks mode signal

      // Resolve base + dimension themes for the CURRENT theme. WeakMap
      // keyed on theme identity — stable-theme renders hit cache in O(1),
      // theme swaps fall through to recompute (once per new theme).
      const baseThemeHelper = ThemeManager.baseTheme
      if (!baseThemeHelper.has(theme)) {
        baseThemeHelper.set(theme, getThemeFromChain(options.theme, theme))
      }
      const baseTheme = baseThemeHelper.get(theme)

      const dimHelper = ThemeManager.dimensionsThemes
      if (!dimHelper.has(theme)) {
        dimHelper.set(theme, getDimensionThemes(theme, options))
      }
      const themes = dimHelper.get(theme)

      // Resolve active dimensions from props (not localCtx which has pseudo getters)
      const rocketstate = _calculateStylingAttrs({
        props: pickStyledAttrs(props as Record<string, unknown>, reservedPropNames),
        dimensions,
      })

      // Resolve mode-specific theme
      const modeBaseHelper = ThemeManager.modeBaseTheme[mode]
      if (!modeBaseHelper.has(baseTheme)) {
        modeBaseHelper.set(baseTheme, getThemeByMode(baseTheme, mode))
      }
      const currentModeBaseTheme = modeBaseHelper.get(baseTheme)

      const modeDimHelper = ThemeManager.modeDimensionTheme[mode]
      if (!modeDimHelper.has(themes)) {
        modeDimHelper.set(themes, getThemeByMode(themes, mode))
      }
      const currentModeThemes = modeDimHelper.get(themes)

      return getTheme({
        rocketstate,
        themes: currentModeThemes,
        baseTheme: currentModeBaseTheme,
        transformKeys: options.transformKeys,
        appTheme: theme,
      })
    }

    // Silence "unused" warnings for initialBaseTheme / initialDimensionThemes —
    // they're eagerly populated into ThemeManager caches so the first accessor
    // call hits cache, but not referenced directly.
    void initialBaseTheme
    void initialDimensionThemes

    // --------------------------------------------------
    // $rocketstate as a FUNCTION ACCESSOR — reactive on prop changes.
    // Re-evaluates active dimensions + pseudo state from current props.
    // --------------------------------------------------
    // Capture pseudo from localCtx once at setup — pseudo properties are
    // getters (from createLocalProvider) that read signals lazily.
    // Passing them through preserves reactivity without subscribing here.
    const localPseudo = localCtx?.pseudo

    const $rocketstateAccessor = () => {
      const rocketstate = _calculateStylingAttrs({
        props: pickStyledAttrs(props as Record<string, unknown>, reservedPropNames),
        dimensions,
      })

      // Read pseudo props fresh each call — props may have reactive getters
      // from _rp() wrapping. Reading inside the accessor (which runs in an
      // effect) ensures changes to pseudo props like active={isDark()} are tracked.
      const propPseudo = pick(props, [...PSEUDO_KEYS, ...PSEUDO_META_KEYS])

      return {
        ...rocketstate,
        pseudo: { ...localPseudo, ...propPseudo },
      }
    }

    // --------------------------------------------------
    // Static mergeProps for final prop filtering (non-dimension props)
    // --------------------------------------------------
    const { pseudo: _pseudo, ...mergeProps } = {
      ...localCtx,
      ...props,
    }

    // --------------------------------------------------
    // final props passed to WrappedComponent
    // --------------------------------------------------
    const finalProps: Record<string, any> = {
      ...omit(mergeProps, [
        ...RESERVED_STYLING_PROPS_KEYS,
        ...PSEUDO_KEYS,
        ...options.filterAttrs,
      ]),
      ...(options.passProps ? pick(mergeProps, options.passProps) : {}),
      ref: props.ref,
      // Function accessors — DynamicStyled wraps them in a computed() so
      // mode/dimension changes produce a new CSS class reactively. The
      // computed tracks only these two accessors; the resolve itself runs
      // untracked to prevent exponential cascade from theme deep-reads.
      $rocketstyle: $rocketstyleAccessor,
      $rocketstate: $rocketstateAccessor,
    }

    // development debugging
    if (process.env.NODE_ENV !== 'production') {
      finalProps['data-rocketstyle'] = componentName

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
          isDark: mode === 'light',
          isLight: mode === 'dark',
        },
      ]),
  })

  return FinalComponent
}

export default rocketComponent
