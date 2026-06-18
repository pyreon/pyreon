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
import type { ComponentFn, Ref, VNode } from '@pyreon/core'
import { h } from '@pyreon/core'
import { computed, isServer, renderEffect, runUntracked } from '@pyreon/reactivity'
import { buildProps } from './forward'
import { type Interpolation, normalizeCSS, resolve } from './resolve'
import { isDynamic } from './shared'
import { onSheetClear, sheet } from './sheet'
import { useThemeAccessor } from './ThemeProvider'

// Dev-time counter sink — see packages/internals/perf-harness/COUNTERS.md.
const _countSink = globalThis as { __pyreon_count__?: (name: string, n?: number) => void }

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

// SSR detection — evaluated once at module load (matches `sheet.ts` /
// `@pyreon/runtime-server`). On the server every render is a single pass with
// no client reactivity, so `DynamicStyled` skips the computed subscription +
// ref closure + renderEffect (all client-only dead weight server-side).
// `isServer` (from @pyreon/reactivity) is the same `typeof document` check,
// now the canonical framework primitive instead of a local copy.
const IS_SERVER = isServer

// Component cache: same template literal + tag + no options → same component.
// WeakMap on `strings` (TemplateStringsArray is object-identity per source location).
// `let` so `sheet.clearAll()` (HMR / dev reload) can drop stale entries by
// swapping the WeakMap reference — WeakMap has no `.clear()` method, and stale
// `StaticStyled` ComponentFns left behind would keep returning class names the
// sheet just deleted from the DOM.
let staticComponentCache = new WeakMap<TemplateStringsArray, Map<Tag, ComponentFn>>()

// Single-entry hot cache — 3 reference comparisons, no Map/WeakMap overhead.
// All 3 fields move atomically (consolidated into one object so `clearAll`
// resets them together — pre-fix, partial state was possible if a reset
// path forgot one field).
const _hotCache: {
  strings: TemplateStringsArray | null
  tag: Tag | null
  component: ComponentFn | null
} = { strings: null, tag: null, component: null }

// Subscribe to `sheet.clearAll()` (HMR / dev-time reset). Drops both the
// WeakMap and the hot-cache slots so subsequent `styled()` calls produce
// fresh components with up-to-date class names. Static class names emitted
// before `clearAll` are stale by the time the user observes them — the rule
// they pointed at has been deleted from the DOM.
onSheetClear(() => {
  staticComponentCache = new WeakMap()
  _hotCache.strings = null
  _hotCache.tag = null
  _hotCache.component = null
})

const createStyledComponent = (
  tag: Tag,
  strings: TemplateStringsArray,
  values: Interpolation[],
  options?: StyledOptions,
): ComponentFn => {
  // Ultra-fast hot cache: 3 reference comparisons → return immediately
  if (values.length === 0 && !options) {
    if (strings === _hotCache.strings && tag === _hotCache.tag)
      return _hotCache.component as ComponentFn

    // WeakMap fallback for alternating patterns
    const tagMap = staticComponentCache.get(strings)
    if (tagMap) {
      const cached = tagMap.get(tag)
      if (cached) {
        _hotCache.strings = strings
        _hotCache.tag = tag
        _hotCache.component = cached
        return cached
      }
    }
  }

  // Fast check: no values means no dynamic interpolations — avoids .some() scan
  const hasDynamicValues = values.some(isDynamic)
  const customFilter = options ? options.shouldForwardProp : undefined
  const insertLayer = options?.layer

  // STATIC FAST PATH: no function interpolations → compute class once at creation time
  if (!hasDynamicValues) {
    // Inline resolve for the common no-values case
    const raw = values.length === 0 ? (strings[0] as string) : resolve(strings, values, {})
    const cssText = normalizeCSS(raw)
    const hasCss = cssText.length > 0

    const staticClassName = hasCss ? sheet.insert(cssText, false, insertLayer) : ''

    // Hoisted out of the render fn: `tag` is known at component-creation time,
    // and `tag` matches `rawProps.as ?? tag` whenever rawProps is empty (the
    // common case for `<MyStyled />` without any props). The DOM-ness check
    // doesn't change between renders for the same `tag`.
    const tagIsDOM = typeof tag === 'string'

    // Pre-built VNode for the no-extra-props hot path (`<MyStyled />`). Same
    // shape `h(tag, { class })` would produce per render, but allocated once
    // at component-creation time. Mount.ts spreads `vnode.props` into a new
    // object before invoking the component (mount.ts:404-418 doesn't mutate
    // the source vnode), so sharing the same VNode across mount sites is
    // safe. `vnode.children` is empty here because the empty-rawProps branch
    // also implies no children were passed — `rawProps.children` would be
    // `undefined` and the `Array.isArray ? : ?? : []` chain produces `[]`.
    //
    // **Cache lifetime**: this VNode references `staticClassName`, which
    // is the className the sheet just inserted. The `onSheetClear`
    // subscriber wired at module top (see ~line 80) drops the outer
    // `staticComponentCache` + `_hotCache` on `sheet.clearAll()` (HMR /
    // dev reload). That forces a fresh `createStyledComponent` call on
    // the next mount, which produces a fresh `cachedEmptyVNode` with
    // the new (sheet-inserted) className. Cache lifetime is correctly
    // tied to the sheet's lifetime — no separate VNode-cache
    // invalidation needed.
    const cachedEmptyVNode = h(tag as string, staticClassName ? { class: staticClassName } : {})

    const StaticStyled: ComponentFn = (rawProps: Record<string, any>): VNode | null => {
      // Hot path: no extra props beyond what's empty AND no `ref` / `as`.
      // `for ... in` over an empty object is O(0); the `break` exits on the
      // first key. Skipping the cache when `ref` is present is necessary
      // because the user expects their callback to fire on the mounted DOM
      // node — the pre-built VNode has no `ref` in its props.
      let hasExtraProps = false
      for (const _k in rawProps) {
        hasExtraProps = true
        break
      }
      if (!hasExtraProps && rawProps.ref == null) {
        if (process.env.NODE_ENV !== 'production')
          _countSink.__pyreon_count__?.('styler.staticVNode.hit')
        return cachedEmptyVNode
      }

      const finalTag = rawProps.as || tag
      // Fast `isDOM` when the user didn't pass `as` — reuses the closure-time
      // check. Only `typeof` is needed when `as` overrides the tag.
      const isDOM = finalTag === tag ? tagIsDOM : typeof finalTag === 'string'
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
      _hotCache.strings = strings
      _hotCache.tag = tag
      _hotCache.component = StaticStyled
    }

    return StaticStyled
  }

  // ─── Tier 2: Per-definition class cache ───────────────────────────────────
  // Two-level WeakMap: $rocketstyle → $rocketstate → className.
  // 50 identical Items with the same resolved theme → 1 resolve + 49 hits.
  const classCache = new WeakMap<object, WeakMap<object, string>>()
  // Single-key cache for non-rocketstyle styled components (e.g. Element's
  // Wrapper, which depends on `$element` + `$childFix`). The key is the
  // `$element` object identity; `$childFix` is folded into a `Map<bool,
  // string>` per `$element` to avoid wrong-cache hits when childFix differs.
  // Element-layer interning (see `@pyreon/elements` Element/component.tsx)
  // gives `$element` stable identity across mounts, which is what makes this
  // cache fire — analogous to rocketstyle's dimension-prop memo.
  const elClassCache = new WeakMap<object, Map<unknown, string>>()

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

    // Helper: resolve CSS + cache result.
    // `rs` and `rsState` are opaque from styler's perspective (the styler can't
    // import rocketstyle types — that would be a circular dep). The body
    // narrows them via `typeof === 'object'` guards before using as WeakMap
    // keys. `t` is the resolved theme object — opaque shape from styler's
    // perspective (consumers augment `DefaultTheme` via declaration merging).
    const doResolve = (rs: unknown, rsState: unknown, t: unknown): string => {
      // Tier 2 cache: skip resolve if same object identity seen before
      if (rs && typeof rs === 'object' && rsState && typeof rsState === 'object') {
        const inner = classCache.get(rs)
        if (inner) {
          const cached = inner.get(rsState)
          if (cached !== undefined) return cached
        }
      }

      // Element-layer cache (no rocketstyle props, but $element is present
      // and an object). Fires only when the rocketstyle path didn't apply
      // — they're mutually exclusive in practice.
      const $el = rawProps.$element
      const $childFix = rawProps.$childFix
      const useElCache =
        (!rs || typeof rs !== 'object' || !rsState || typeof rsState !== 'object') &&
        $el &&
        typeof $el === 'object'
      if (useElCache) {
        const inner = elClassCache.get($el as object)
        if (inner) {
          const cached = inner.get($childFix)
          if (cached !== undefined) {
            if (process.env.NODE_ENV !== 'production')
              _countSink.__pyreon_count__?.('styler.elClassCache.hit')
            return cached
          }
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
      } else if (useElCache) {
        let inner = elClassCache.get($el as object)
        if (!inner) {
          inner = new Map()
          elClassCache.set($el as object, inner)
        }
        inner.set($childFix, className)
      }
      return className
    }

    // SSR fast path — a single render with no client reactivity. Resolve the
    // class once and emit, skipping the `computed` subscription, the `ref`
    // closure, and the `renderEffect` that the client path sets up below. All
    // three are client-only dead weight on the server: `el` is never assigned
    // (refs don't fire during `renderToString`), and no signal changes within
    // one SSR pass — so they allocate per dynamic component and produce zero
    // HTML. The emitted className is byte-identical to the reactive path's
    // initial value (`cssClass()` resolves the same inputs). Mirrors the
    // IS_SERVER variant split in vitus-labs/styler.
    if (IS_SERVER) {
      const finalTag = rawProps.as || tag
      const className = runUntracked(() =>
        doResolve(
          isReactiveRS ? $rs() : $rs,
          isReactiveState ? $rsState() : $rsState,
          theme,
        ),
      )
      const finalProps = buildProps(rawProps, className, typeof finalTag === 'string', customFilter)
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

    // If any axis is reactive, wrap in computed that tracks all three:
    //   1. $rocketstyle accessor (mode + dimension signals)
    //   2. $rocketstate accessor (state descriptor)
    //   3. themeAccessor (user-preference theme swap)
    // The resolve itself runs UNTRACKED to prevent exponential cascade.
    const hasReactive = isReactiveRS || isReactiveState
    const cssClass = hasReactive
      ? computed(
          () => {
            // TRACKED reads:
            const rs = isReactiveRS ? $rs() : $rs
            const rsState = isReactiveState ? $rsState() : $rsState
            const t = themeAccessor() // TRACKED — theme swap

            // UNTRACKED: resolve + sheet insert
            return runUntracked(() => doResolve(rs, rsState, t))
          },
          { equals: (a, b) => a === b },
        )
      : null

    const finalTag = rawProps.as || tag
    const isDOM = typeof finalTag === 'string'

    // Initial class: computed (reactive) or direct resolve (static)
    const className = cssClass ? cssClass() : doResolve($rs, $rsState, theme)
    const finalProps = buildProps(rawProps, className, isDOM, customFilter)

    // Reactive path: lightweight renderEffect that reads the pre-computed
    // class string and toggles classList. The expensive resolve() already
    // happened inside the computed — this renderEffect only does: read
    // string → compare → toggle.
    if (cssClass) {
      let el: Element | null = null
      let currentClassName = className

      const originalRef = finalProps.ref
      finalProps.ref = (node: Element | null) => {
        el = node
        if (originalRef) {
          // A valid `RefProp` is only ever a function or a `{ current }`
          // object, so the final `else` (truthy ref that is neither) is
          // unreachable — kept as a defensive guard, ignored for coverage.
          /* v8 ignore else */
          if (typeof originalRef === 'function') originalRef(node)
          else if (typeof originalRef === 'object') (originalRef as Ref<Element>).current = node
        }
      }

      renderEffect(() => {
        const newClass = cssClass() // reads computed — O(1), just string
        if (el && newClass !== currentClassName) {
          if (currentClassName) el.classList.remove(currentClassName)
          if (newClass) el.classList.add(newClass)
          currentClassName = newClass
        }
      })
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
const proxyCache = new Map<string, TagTemplateFn>()

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
      // The arrow's `Interpolation[]` arg shape can't be expressed as the
      // generic `<P>(strings, ...values: Interpolation<P>[])` of TagTemplateFn
      // (no generic arrow inside a Proxy handler), but the call signature is
      // structurally compatible — the inner `createStyledComponent` accepts
      // any-P interpolations. Cast bridges the variance at the assignment.
      fn = ((strings: TemplateStringsArray, ...values: Interpolation[]) =>
        createStyledComponent(prop, strings, values)) as TagTemplateFn
      proxyCache.set(prop, fn)
    }
    return fn
  },
})
