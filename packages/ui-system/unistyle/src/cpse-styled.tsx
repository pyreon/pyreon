import { h } from '@pyreon/core'
import type { ComponentFn, VNode, VNodeChild } from '@pyreon/core'
import { renderEffect } from '@pyreon/reactivity'
import { css, normalizeCSS, sheet } from '@pyreon/styler'
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
 *     resolved + inserted ONCE per distinct *property set* (NOT per value),
 *     cached on the component definition — N instances with N distinct gap
 *     values share ONE class and pay ONE `styler.resolve`;
 *   - the value is delivered per-instance as an inline custom property
 *     (no `styler.resolve`, no rule insert);
 *   - dynamic (signal-driven) values update the inline custom property via a
 *     `renderEffect` — the value-agnostic class is stable, so NO re-resolve /
 *     re-insert.
 *
 * Opt-in (zero blast radius on the existing `styled` / `Element` /
 * `rocketstyle` paths). Auto-migrating those defaults is the staged,
 * regression-gated rollout (RFC §5) — deliberately NOT flipped here.
 *
 * SCOPE: a flat declaration set (the dimensional/style props that drive the
 * O(N) cost). Per-component media-query templates fall back to the classic
 * `styled` path (documented; responsive-via-per-breakpoint-vars is the next
 * phase).
 */
export interface CpseStyledProps {
  /** Style values, static or a signal accessor (the dynamic path). */
  styles?: InnerTheme | (() => InnerTheme) | undefined
  /** px→rem base for value conversion. Defaults to 16. */
  rootSize?: number | undefined
  class?: string | undefined
  ref?: ((node: Element | null) => void) | { current: Element | null } | undefined
  children?: unknown
  [key: string]: unknown
}

const RESERVED = new Set(['styles', 'rootSize', 'class', 'ref', 'children'])

export function cpseStyled(tag: string): ComponentFn<CpseStyledProps> {
  // Per-definition cache: property-SET → value-agnostic className. Because the
  // rule is value-agnostic, the className depends ONLY on which properties are
  // present, never on their values — so this collapses N distinct values to
  // ONE resolve+insert.
  const classByPropSet = new Map<string, string>()

  /**
   * Populate the per-instance var map (always) and resolve the shared
   * value-agnostic className (only on the first sighting of a property set).
   * `styles({ extractVars })` writes the vars synchronously while building its
   * fragments, so the vars are ready WITHOUT stringifying/resolving the
   * CSSResult — the expensive `String(...)` (→ one `styler.resolve`) + insert
   * run only on a cache miss.
   */
  const build = (styleTheme: InnerTheme, rootSize: number): { className: string; vars: Record<string, string> } => {
    const vars: Record<string, string> = {}
    const result = styles({ theme: styleTheme, css, rootSize, extractVars: vars })
    const propSetKey = Object.keys(styleTheme).sort().join('|')
    let className = classByPropSet.get(propSetKey)
    if (className === undefined) {
      const text = normalizeCSS(String(result))
      className = text.length > 0 ? sheet.insert(text) : ''
      classByPropSet.set(propSetKey, className)
    }
    return { className, vars }
  }

  return (props: CpseStyledProps): VNode => {
    const rootSize = props.rootSize ?? 16
    const stylesProp = props.styles
    const isDynamic = typeof stylesProp === 'function'
    const getTheme = (): InnerTheme =>
      isDynamic ? (stylesProp as () => InnerTheme)() : ((stylesProp as InnerTheme) ?? {})

    const first = build(getTheme(), rootSize)
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
        const vars: Record<string, string> = {}
        styles({ theme: getTheme(), css, rootSize, extractVars: vars }) // tracks the signal
        applyVars(vars)
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
