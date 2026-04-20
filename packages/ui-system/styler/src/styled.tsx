/**
 * styled() component factory. Creates Pyreon components that inject CSS
 * class names from tagged template literals.
 *
 * Supports:
 * - styled('div')`...` and styled(Component)`...`
 * - styled.div`...` (via Proxy)
 * - `as` prop for polymorphic rendering
 * - $-prefixed transient props (not forwarded to DOM)
 * - Custom shouldForwardProp for per-component prop filtering
 * - Static path optimization (templates with no dynamic interpolations)
 * - Boost specificity via doubled selector
 *
 * CSS nesting (`&` selectors) works natively — the resolver passes CSS
 * through without transformation, so `&:hover`, `&::before`, etc. work
 * as-is in browsers supporting CSS Nesting (all modern browsers).
 */
import type { ComponentFn, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { computed, runUntracked } from '@pyreon/reactivity'
import { buildProps } from './forward'
import { type Interpolation, normalizeCSS, resolve } from './resolve'
import { isDynamic } from './shared'
import { sheet } from './sheet'
import { useThemeAccessor } from './ThemeProvider'

type Tag = string | ComponentFn<any>

export interface StyledOptions {
  /** Custom prop filter. Return true to forward the prop to the DOM element. */
  shouldForwardProp?: (prop: string) => boolean
  /**
   * CSS @layer name. Rules are wrapped in `@layer <name> { ... }`.
   * Framework CSS uses two layers with explicit ordering:
   *   `@layer elements, rocketstyle;`
   * Elements (base layout) use `'elements'`, rocketstyle themes use
   * `'rocketstyle'`. The ordering ensures themes always override base
   * styles regardless of source order.
   */
  layer?: string
}

const getDisplayName = (tag: Tag): string =>
  typeof tag === 'string'
    ? tag
    : (tag as ComponentFn<any> & { displayName?: string }).displayName || tag.name || 'Component'

// Component cache: same template literal + tag + no options → same component.
// WeakMap on `strings` (TemplateStringsArray is object-identity per source location).
const staticComponentCache = new WeakMap<TemplateStringsArray, Map<Tag, ComponentFn>>()

// Single-entry hot cache — just 3 reference comparisons, no Map/WeakMap overhead.
let _hotStrings: TemplateStringsArray | null = null
let _hotTag: Tag | null = null
let _hotComponent: ComponentFn | null = null

const createStyledComponent = (
  tag: Tag,
  strings: TemplateStringsArray,
  values: Interpolation[],
  options?: StyledOptions,
): ComponentFn => {
  // Ultra-fast hot cache: 3 reference comparisons → return immediately
  if (values.length === 0 && !options) {
    if (strings === _hotStrings && tag === _hotTag) return _hotComponent as ComponentFn

    // WeakMap fallback for alternating patterns
    const tagMap = staticComponentCache.get(strings)
    if (tagMap) {
      const cached = tagMap.get(tag)
      if (cached) {
        _hotStrings = strings
        _hotTag = tag
        _hotComponent = cached
        return cached
      }
    }
  }

  // Fast check: no values means no dynamic interpolations — avoids .some() scan
  const hasDynamicValues = values.length > 0 && values.some(isDynamic)
  const customFilter = options ? options.shouldForwardProp : undefined
  const insertLayer = options?.layer

  // STATIC FAST PATH: no function interpolations → compute class once at creation time
  if (!hasDynamicValues) {
    // Inline resolve for the common no-values case
    const raw = values.length === 0 ? (strings[0] as string) : resolve(strings, values, {})
    const cssText = normalizeCSS(raw)
    const hasCss = cssText.length > 0

    const staticClassName = hasCss ? sheet.insert(cssText, false, insertLayer) : ''

    const StaticStyled: ComponentFn = (rawProps: Record<string, any>): VNode | null => {
      const finalTag = rawProps.as || tag
      const isDOM = typeof finalTag === 'string'
      const finalProps = buildProps(rawProps, staticClassName, isDOM, customFilter)

      return h(
        finalTag as string,
        finalProps,
        ...(Array.isArray(rawProps.children)
          ? rawProps.children
          : rawProps.children != null
            ? [rawProps.children]
            : []),
      )
    }

    ;(StaticStyled as ComponentFn & { displayName?: string }).displayName =
      `styled(${getDisplayName(tag)})`

    // Store in component cache + hot cache for future reuse
    if (!options && values.length === 0) {
      let tagMap = staticComponentCache.get(strings)
      if (!tagMap) {
        tagMap = new Map()
        staticComponentCache.set(strings, tagMap)
      }
      tagMap.set(tag, StaticStyled)
      _hotStrings = strings
      _hotTag = tag
      _hotComponent = StaticStyled
    }

    return StaticStyled
  }

  // ─── Tier 2: Per-definition class cache ───────────────────────────────────
  // Two-level WeakMap: $rocketstyle → $rocketstate → className.
  // 50 identical Items with the same resolved theme → 1 resolve + 49 hits.
  const classCache = new WeakMap<object, WeakMap<object, string>>()

  // DYNAMIC PATH: uses computed() for reactive class derivation.
  //
  // Architecture:
  // - $rocketstyle/$rocketstate may be function ACCESSORS (from rocketstyle)
  //   or plain objects (from direct styled() usage).
  // - When they're accessors, a computed() tracks them so mode/dimension
  //   signal changes produce a new CSS class reactively.
  // - The resolve() itself runs UNTRACKED inside the computed to prevent
  //   exponential cascade from theme deep-reads in interpolation functions.
  // - The computed memoizes by string equality — same CSS class = no DOM update.
  // - Pyreon's built-in renderEffect handles the DOM class attribute update
  //   when the computed value changes.
  //
  // This gives reactive mode/dimension switching WITHOUT per-component effect().
  const DynamicStyled: ComponentFn = (rawProps: Record<string, any>): VNode | null => {
    const themeAccessor = useThemeAccessor()
    const theme = themeAccessor() // snapshot for initial + static path
    const $rs = rawProps.$rocketstyle
    const $rsState = rawProps.$rocketstate
    const isReactiveRS = typeof $rs === 'function'
    const isReactiveState = typeof $rsState === 'function'

    // Helper: resolve CSS + cache result
    const doResolve = (rs: any, rsState: any, t: any): string => {
      // Tier 2 cache: skip resolve if same object identity seen before
      if (rs && typeof rs === 'object' && rsState && typeof rsState === 'object') {
        const inner = classCache.get(rs)
        if (inner) {
          const cached = inner.get(rsState)
          if (cached !== undefined) return cached
        }
      }

      const resolveProps = {
        ...rawProps,
        ...(isReactiveRS ? { $rocketstyle: rs } : {}),
        ...(isReactiveState ? { $rocketstate: rsState } : {}),
        theme: t,
      }
      const cssText = normalizeCSS(resolve(strings, values, resolveProps))
      const className = cssText.length > 0 ? sheet.insert(cssText, false, insertLayer) : ''

      if (rs && typeof rs === 'object' && rsState && typeof rsState === 'object') {
        let inner = classCache.get(rs)
        if (!inner) {
          inner = new WeakMap()
          classCache.set(rs, inner)
        }
        inner.set(rsState, className)
      }
      return className
    }

    // If any axis is reactive, wrap in computed that tracks all three:
    //   1. $rocketstyle accessor (mode + dimension signals)
    //   2. $rocketstate accessor (state descriptor)
    //   3. themeAccessor (user-preference theme swap)
    // The resolve itself runs UNTRACKED to prevent exponential cascade.
    const hasReactive = isReactiveRS || isReactiveState
    const cssClass = hasReactive
      ? computed(() => {
          // TRACKED reads:
          const rs = isReactiveRS ? $rs() : $rs
          const rsState = isReactiveState ? $rsState() : $rsState
          const t = themeAccessor() // TRACKED — theme swap

          // UNTRACKED: resolve + sheet insert
          return runUntracked(() => doResolve(rs, rsState, t))
        }, { equals: (a, b) => a === b })
      : null

    const finalTag = rawProps.as || tag
    const isDOM = typeof finalTag === 'string'

    // Initial class: computed (reactive) or direct resolve (static)
    const className = cssClass
      ? cssClass()
      : doResolve($rs, $rsState, theme)
    const finalProps = buildProps(rawProps, className, isDOM, customFilter)

    // Reactive path: override class with accessor for renderEffect
    if (cssClass) {
      finalProps.class = () => {
        const newClass = cssClass()
        const userClass = rawProps.class || rawProps.className
        return userClass ? `${newClass} ${userClass}` : newClass
      }
    }

    return h(
      finalTag as string,
      finalProps,
      ...(Array.isArray(rawProps.children)
        ? rawProps.children
        : rawProps.children != null
          ? [rawProps.children]
          : []),
    )
  }

  ;(DynamicStyled as ComponentFn & { displayName?: string }).displayName =
    `styled(${getDisplayName(tag)})`
  return DynamicStyled
}

/** Factory function: styled(tag) returns a tagged template function. */
const styledFactory = (tag: Tag, options?: StyledOptions) => {
  const templateFn = (strings: TemplateStringsArray, ...values: Interpolation[]) =>
    createStyledComponent(tag, strings, values, options)

  return templateFn
}

/**
 * Main styled export. Supports both calling conventions:
 * - `styled('div')` or `styled(Component)` → returns tagged template function
 * - `styled('div', { shouldForwardProp })` → with custom prop filtering
 * - `styled.div` → shorthand via Proxy (no options)
 */
// Cache template functions per tag to avoid closure allocation on every Proxy get
const proxyCache = new Map<string, (...args: any[]) => any>()

/**
 * Generic tagged template function returned by `styled(tag)` and `styled.tag`.
 *
 * Accepts an optional type parameter `<P>` for consumer-defined props
 * (typically transient $-prefixed props that aren't forwarded to the DOM).
 *
 * @example
 * const Box = styled('div')<{ $color: string }>`
 *   background: ${(props) => props.$color};
 * `
 * <Box $color="red" />  // $color is required and typed
 */
type TagTemplateFn = <P extends object = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: Interpolation<P>[]
) => ComponentFn<P & Record<string, unknown>>

type HtmlTags =
  | 'a'
  | 'abbr'
  | 'address'
  | 'article'
  | 'aside'
  | 'audio'
  | 'b'
  | 'blockquote'
  | 'body'
  | 'br'
  | 'button'
  | 'canvas'
  | 'caption'
  | 'code'
  | 'col'
  | 'colgroup'
  | 'dd'
  | 'details'
  | 'div'
  | 'dl'
  | 'dt'
  | 'em'
  | 'fieldset'
  | 'figcaption'
  | 'figure'
  | 'footer'
  | 'form'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'head'
  | 'header'
  | 'hr'
  | 'html'
  | 'i'
  | 'iframe'
  | 'img'
  | 'input'
  | 'label'
  | 'legend'
  | 'li'
  | 'link'
  | 'main'
  | 'mark'
  | 'menu'
  | 'meta'
  | 'nav'
  | 'ol'
  | 'optgroup'
  | 'option'
  | 'output'
  | 'p'
  | 'picture'
  | 'pre'
  | 'progress'
  | 'q'
  | 'section'
  | 'select'
  | 'small'
  | 'source'
  | 'span'
  | 'strong'
  | 'style'
  | 'sub'
  | 'summary'
  | 'sup'
  | 'svg'
  | 'table'
  | 'tbody'
  | 'td'
  | 'template'
  | 'textarea'
  | 'tfoot'
  | 'th'
  | 'thead'
  | 'time'
  | 'tr'
  | 'u'
  | 'ul'
  | 'video'

export type StyledFunction = ((tag: Tag, options?: StyledOptions) => TagTemplateFn) & {
  [K in HtmlTags]: TagTemplateFn
}

// Proxy is needed to support styled.div`...` syntax; the cast bridges
// styledFactory's call signature to StyledFunction which adds HTML tag properties.
// Proxy target uses `as any` because TS can't resolve Proxy<StyledFunction> with mapped types
export const styled: StyledFunction = new Proxy(styledFactory as any, {
  get(_target: unknown, prop: string) {
    if (prop === 'prototype' || prop === '$$typeof') return undefined
    // styled.div`...`, styled.span`...`, etc.
    let fn = proxyCache.get(prop)
    if (!fn) {
      fn = (strings: TemplateStringsArray, ...values: Interpolation[]) =>
        createStyledComponent(prop, strings, values)
      proxyCache.set(prop, fn)
    }
    return fn
  },
})
