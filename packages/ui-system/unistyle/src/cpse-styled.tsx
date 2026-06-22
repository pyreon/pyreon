import { h } from '@pyreon/core'
import type { ComponentFn, VNode, VNodeChild } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import { css, normalizeCSS, sheet, useThemeAccessor } from '@pyreon/styler'
import createMediaQueries from './responsive/createMediaQueries'
import sortBreakpoints from './responsive/sortBreakpoints'
import styles from './styles/styles/index'
import type { InnerTheme } from './styles/styles/types'

/**
 * `cpseStyled` — a styled primitive that applies Custom-Property Style
 * Extraction (CPSE). The complete, opt-in vehicle for the engine in `cpse.ts`
 * / `styles()`'s `extractVars` mode. See
 * `.claude/audits/custom-property-style-extraction-2026-06-22.md`.
 *
 * For a real rendered component, this makes styling cost **flat in style-value
 * cardinality**:
 *   - the CSS rule is value-agnostic (`gap: var(--u-…)`), so it is
 *     resolved + inserted ONCE per distinct *shape* (NOT per value), cached on
 *     the component definition — N instances with N distinct values share ONE
 *     class and pay ONE `styler.resolve`;
 *   - the value is delivered per-instance as an inline custom property
 *     (no `styler.resolve`, no rule insert);
 *   - dynamic (signal-driven) values update the inline custom property via a
 *     `renderEffect` — the value-agnostic class is stable, so NO re-resolve.
 *
 * RESPONSIVE: array (`padding={[8, 16]}`, mobile-first) and breakpoint-object
 * (`padding={{ sm: 16 }}`) values are supported — each breakpoint emits a
 * suffixed value-agnostic rule (`padding: var(--u-<hash>-sm)`) wrapped in the
 * matching `@media`, and the instance sets every breakpoint's value inline. The
 * class stays value-agnostic (shared); the browser's media cascade selects the
 * active var. Breakpoints come from the theme (`theme.breakpoints`), falling
 * back to a default set.
 *
 * Opt-in (zero blast radius on the existing `styled` / `Element` /
 * `rocketstyle` paths). Auto-migrating those defaults is the staged,
 * regression-gated rollout (RFC §5).
 */
/** A single style value: scalar, a mobile-first array, or a breakpoint object. */
export type ResponsiveValue<T> = T | T[] | Record<string, T>
/** `InnerTheme` with every leaf allowed to be responsive (array / bp-object). */
export type ResponsiveStyleTheme = {
  [K in keyof InnerTheme]?: ResponsiveValue<NonNullable<InnerTheme[K]>>
}

export interface CpseStyledProps {
  /** Style values, static or a signal accessor (the dynamic path). Values may
   * be scalar, a mobile-first array, or a breakpoint object. */
  styles?: ResponsiveStyleTheme | (() => ResponsiveStyleTheme) | undefined
  /** px→rem base for value conversion. Defaults to `theme.rootSize` ?? 16. */
  rootSize?: number | undefined
  /** Breakpoint map (name→min-width px) for responsive values. Defaults to
   * `theme.breakpoints` ?? the standard xs/sm/md/lg/xl set. */
  breakpoints?: Record<string, number> | undefined
  class?: string | undefined
  ref?: ((node: Element | null) => void) | { current: Element | null } | undefined
  children?: unknown
  [key: string]: unknown
}

const RESERVED = new Set(['styles', 'rootSize', 'breakpoints', 'class', 'ref', 'children'])
const DEFAULT_BREAKPOINTS: Record<string, number> = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200 }

/** A value is responsive if it's a mobile-first array or a breakpoint object
 * (a `var(--x)` / plain string is NOT — strings are scalar). */
const isResponsiveValue = (v: unknown): boolean =>
  Array.isArray(v) || (v != null && typeof v === 'object')

const isResponsiveTheme = (t: ResponsiveStyleTheme): boolean => {
  for (const k in t) if (isResponsiveValue((t as Record<string, unknown>)[k])) return true
  return false
}

/** Expand a responsive theme into per-breakpoint flat themes (only the
 * breakpoints that actually carry a value). Mobile-first arrays map index→
 * sorted-breakpoint; breakpoint objects map by key; scalars land on the base. */
function expandResponsive(
  t: ResponsiveStyleTheme,
  sorted: string[],
): Map<string, Record<string, unknown>> {
  const perBp = new Map<string, Record<string, unknown>>()
  const put = (bp: string, prop: string, val: unknown): void => {
    let m = perBp.get(bp)
    if (!m) {
      m = {}
      perBp.set(bp, m)
    }
    m[prop] = val
  }
  const rec = t as Record<string, unknown>
  for (const prop in rec) {
    const v = rec[prop]
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && i < sorted.length; i++) {
        if (v[i] != null) put(sorted[i]!, prop, v[i])
      }
    } else if (v != null && typeof v === 'object') {
      for (const bp in v as Record<string, unknown>) {
        const bv = (v as Record<string, unknown>)[bp]
        if (sorted.includes(bp) && bv != null) put(bp, prop, bv)
      }
    } else {
      put(sorted[0]!, prop, v) // scalar inside a responsive theme → base breakpoint
    }
  }
  return perBp
}

export function cpseStyled(tag: string): ComponentFn<CpseStyledProps> {
  // Per-definition cache: shape-key → value-agnostic className. Because every
  // rule is value-agnostic, the className depends ONLY on the *shape* (which
  // properties at which breakpoints), never on values — collapsing N distinct
  // values to ONE resolve+insert.
  const classByShape = new Map<string, string>()

  /**
   * Compute the per-instance var map (always) and the value-agnostic className
   * (resolved + inserted only on the first sighting of a shape). Returns both.
   * `styles({ extractVars })` writes vars synchronously while building fragments,
   * so vars are ready without the expensive `String(...)` (→ `styler.resolve`)
   * + insert — those run only on a cache miss.
   */
  const resolve = (
    styleTheme: ResponsiveStyleTheme,
    rootSize: number,
    breakpoints: Record<string, number>,
  ): { className: string; vars: Record<string, string> } => {
    const vars: Record<string, string> = {}

    if (!isResponsiveTheme(styleTheme)) {
      // Flat (scalar) fast path.
      const result = styles({ theme: styleTheme as InnerTheme, css, rootSize, extractVars: vars })
      const shapeKey = `flat:${Object.keys(styleTheme).sort().join('|')}`
      let className = classByShape.get(shapeKey)
      if (className === undefined) {
        const text = normalizeCSS(String(result))
        className = text.length > 0 ? sheet.insert(text) : ''
        classByShape.set(shapeKey, className)
      }
      return { className, vars }
    }

    // Responsive path: per-breakpoint value-agnostic rules + @media wrapping.
    const sorted = sortBreakpoints(breakpoints) as string[]
    const perBp = expandResponsive(styleTheme, sorted)
    const mq = createMediaQueries({ breakpoints, rootSize, css })
    const frags: string[] = []
    const shapeParts: string[] = []
    for (const bp of sorted) {
      const flat = perBp.get(bp)
      if (!flat || Object.keys(flat).length === 0) continue
      // Suffix every breakpoint (incl. base) so each gets a distinct var; the
      // base breakpoint's media wrapper (min-width 0) emits no @media.
      const decl = String(styles({ theme: flat as InnerTheme, css, rootSize, extractVars: vars, breakpoint: bp }))
      frags.push(String((mq as Record<string, (s: TemplateStringsArray, ...a: unknown[]) => unknown>)[bp]!`${decl}`))
      shapeParts.push(`${bp}:${Object.keys(flat).sort().join(',')}`)
    }
    const shapeKey = `resp:${shapeParts.join('|')}`
    let className = classByShape.get(shapeKey)
    if (className === undefined) {
      const text = normalizeCSS(frags.join('\n'))
      className = text.length > 0 ? sheet.insert(text) : ''
      classByShape.set(shapeKey, className)
    }
    return { className, vars }
  }

  return (props: CpseStyledProps): VNode => {
    const theme = (useThemeAccessor()() ?? {}) as { rootSize?: number; breakpoints?: Record<string, number> }
    const rootSize = props.rootSize ?? theme.rootSize ?? 16
    const breakpoints = props.breakpoints ?? theme.breakpoints ?? DEFAULT_BREAKPOINTS
    const stylesProp = props.styles
    const isDynamic = typeof stylesProp === 'function'
    const getTheme = (): ResponsiveStyleTheme =>
      isDynamic ? (stylesProp as () => ResponsiveStyleTheme)() : ((stylesProp as ResponsiveStyleTheme) ?? {})

    const first = resolve(getTheme(), rootSize, breakpoints)
    const className = props.class ? `${first.className} ${props.class}` : first.className

    // Forward arbitrary HTML props (everything except the reserved CPSE keys).
    const rest: Record<string, unknown> = {}
    for (const k in props) if (!RESERVED.has(k)) rest[k] = props[k]

    let el: HTMLElement | null = null
    const applyVars = (vars: Record<string, string>): void => {
      if (!el) return
      for (const k in vars) el.style.setProperty(k, vars[k]!)
    }

    const ref = (node: Element | null): void => {
      el = node as HTMLElement | null
      if (el) applyVars(first.vars)
      const userRef = props.ref
      if (typeof userRef === 'function') userRef(node)
      else if (userRef && typeof userRef === 'object') userRef.current = node
    }

    // Dynamic path: re-extract vars on signal change and patch the inline
    // custom properties in place. The class is value-agnostic → never re-resolved.
    if (isDynamic) {
      renderEffect(() => {
        applyVars(resolve(getTheme(), rootSize, breakpoints).vars) // tracks the signal
      })
    }

    // `style: first.vars` carries the initial values for SSR + first paint
    // (custom-property names survive both runtime-dom `applyStyleProp` and the
    // SSR `normalizeStyle` `--`-guard). The renderEffect keeps them current on
    // the client for the dynamic case.
    const children: VNodeChild[] = props.children != null ? [props.children as VNodeChild] : []
    return h(tag, { class: className, style: first.vars, ref, ...rest }, ...children)
  }
}
