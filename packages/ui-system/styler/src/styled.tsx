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
import { buildProps } from './forward'
import { type Interpolation, normalizeCSS, resolve } from './resolve'
import { isDynamic } from './shared'
import { sheet } from './sheet'
import { useTheme } from './ThemeProvider'

type Tag = string | ComponentFn<any>

export interface StyledOptions {
  /** Custom prop filter. Return true to forward the prop to the DOM element. */
  shouldForwardProp?: (prop: string) => boolean
  /**
   * Double the class selector to raise specificity from (0,1,0) to (0,2,0).
   * Ensures this component's styles override inner library components
   * regardless of CSS source order.
   */
  boost?: boolean
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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex logic is inherent to this function
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
  const boost = options ? (options.boost ?? false) : false

  // STATIC FAST PATH: no function interpolations → compute class once at creation time
  if (!hasDynamicValues) {
    // Inline resolve for the common no-values case
    const raw = values.length === 0 ? (strings[0] as string) : resolve(strings, values, {})
    const cssText = normalizeCSS(raw)
    const hasCss = cssText.length > 0

    const staticClassName = hasCss ? sheet.insert(cssText, boost) : ''

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

  // DYNAMIC PATH: resolve CSS on every render with theme/props.
  const DynamicStyled: ComponentFn = (rawProps: Record<string, any>): VNode | null => {
    const theme = useTheme()
    const allProps = { ...rawProps, theme }
    const cssText = normalizeCSS(resolve(strings, values, allProps))

    const className = cssText.length > 0 ? sheet.insert(cssText, boost) : ''

    const finalTag = rawProps.as || tag
    const isDOM = typeof finalTag === 'string'
    const finalProps = buildProps(rawProps, className, isDOM, customFilter)

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

type TagTemplateFn = (strings: TemplateStringsArray, ...values: Interpolation[]) => ComponentFn

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
