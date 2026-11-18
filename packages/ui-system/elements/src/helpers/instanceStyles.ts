/**
 * The typed per-instance style override (`styles` prop on Element / Text).
 *
 * The object uses the same keys and value shapes as a component's `.theme()`
 * (unistyle property mappings; a single value, a mobile-first array or a
 * breakpoint object; units resolved against `rootSize`), and renders into
 * `@layer instance`, declared after `elements` and `rocketstyle`, so it beats
 * the component's theme for the same property (#4354).
 *
 * Caching: identical override CONTENT must share one class without a cache
 * that grows per instance.
 *  - `internStyles` maps equal content to one canonical object (a 256-entry
 *    LRU keyed by a canonical JSON key, the same bound as
 *    `internElementBundle`), so the `$element` / `$text` bundle that carries it
 *    interns too and the styler's per-bundle class cache hits.
 *  - Past the LRU (or on the reactive path, which builds a fresh object per
 *    change), the class name is still the hash of the CSS text, so equal
 *    content still lands on one sheet rule; the sheet is bounded by its own
 *    `maxCacheSize` and evicts rules no element in the document carries.
 */
import { SizedMap } from '@pyreon/sized-map'
import type { config } from '@pyreon/ui-core'
import { makeItResponsive, styles } from '@pyreon/unistyle'
import type { StyleOverride } from '../types'
import { INSTANCE_LAYER } from './instanceCss'

const INTERN_CAP = 256
const _byKey = /* @__PURE__ */ new SizedMap<string, StyleOverride>({ maxEntries: INTERN_CAP, lru: true })
const _keyOf = /* @__PURE__ */ new WeakMap<object, string>()

/**
 * Canonical JSON of plain style data (object keys sorted, so `{ a, b }` and
 * `{ b, a }` agree). `undefined` when the value is not plain data (a function
 * anywhere), which callers treat as "do not intern".
 */
const canonicalKey = (value: unknown): string | undefined => {
  let plain = true
  const key = JSON.stringify(value, (_k, v: unknown) => {
    if (typeof v === 'function') plain = false
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) sorted[k] = (v as Record<string, unknown>)[k]

    return sorted
  })

  return plain ? key : undefined
}

/**
 * The canonical object for this override's content: the first object seen
 * with the same content, while it stays in the LRU. Non-plain data is returned
 * as is (not interned).
 */
export const internStyles = (override: StyleOverride): StyleOverride => {
  const key = _keyOf.get(override) ?? canonicalKey(override)
  if (key === undefined) return override
  const hit = _byKey.get(key)
  if (hit) return hit
  _byKey.set(key, override)
  _keyOf.set(override, key)

  return override
}

/** The canonical key of an interned override (for `internElementBundle`'s key). */
export const internedStylesKey = (override: unknown): string | undefined =>
  override !== null && typeof override === 'object' ? _keyOf.get(override) : undefined

/** Test-only: entries in the intern LRU. */
export const internStylesSizeForTest = (): number => _byKey.size

// The selectors a component's `.theme()` pseudo groups render to (the
// `el` / `txt` bases in @pyreon/ui-components use the same mapping).
const PSEUDO_SELECTORS = [
  ['hover', '&:hover'],
  ['focus', '&:focus-visible'],
  ['active', '&:active'],
  ['disabled', "&:disabled, &[aria-disabled='true']"],
] as const

type CssFn = typeof config.css
type CssResult = ReturnType<CssFn>
type InterpolationProps = { theme?: Record<string, unknown>; [prop: string]: unknown }

/**
 * Wrap the bundle's own responsive interpolation so it never sees
 * `instanceStyles`: the override rides IN the bundle (the styler's class cache
 * keys on the bundle, so it must be part of its identity), but the bundle's
 * layout pipeline would normalize it as a breakpoint map. Bundles without an
 * override pass through untouched (same object, so `makeItResponsive`'s
 * per-bundle cache still hits).
 */
export const withoutInstanceStyles =
  <R>(bundleKey: string, interpolation: (props: InterpolationProps) => R) =>
  (props: InterpolationProps): R => {
    const bundle = props[bundleKey] as Record<string, unknown> | undefined
    if (!bundle || bundle.instanceStyles === undefined) return interpolation(props)
    const { instanceStyles: _omit, ...rest } = bundle

    return interpolation({ ...props, [bundleKey]: rest })
  }

/**
 * A styled interpolation that renders `props[bundleKey].instanceStyles` into
 * `@layer instance { … }` (the styler hoists the block to the top-level
 * `instance` layer under the element's own class, so no extra class exists).
 * Responsive values go through the same `makeItResponsive` + unistyle
 * `styles` pipeline as a theme, reading breakpoints and `rootSize` from the
 * styler theme.
 */
export const instanceStylesInterpolation =
  (cssFn: CssFn, bundleKey: string) =>
  (props: InterpolationProps): CssResult | '' => {
    const bundle = props[bundleKey] as { instanceStyles?: StyleOverride | undefined } | undefined
    const override = bundle?.instanceStyles
    if (!override) return ''
    const { hover, focus, active, disabled, ...base } = override
    const groups = { hover, focus, active, disabled }
    const render = (theme: object) =>
      makeItResponsive({ theme: theme as Record<string, unknown>, styles, css: cssFn })(props)
    const parts: ReturnType<typeof render>[] = [render(base)]
    for (const [key, selector] of PSEUDO_SELECTORS) {
      const group = groups[key]
      if (group) parts.push(cssFn`${selector}{${render(group)}}`)
    }

    return cssFn`@layer ${INSTANCE_LAYER}{${parts}}`
  }
