// Web-side helper for forwarding HTML pass-through attrs (`data-*`,
// `aria-*`, `id`, `class`, `style`) from canonical primitive props
// to the rendered DOM node.
//
// Each primitive's web impl picks out the keys it OWNS (e.g.
// `<Stack>` owns `gap` / `align` / `padding` etc.) and routes everything
// else through this helper before calling `h('tag', attrs)`. Pyreon's
// `h()` accepts arbitrary attrs so passthrough is just data-flow —
// no special runtime support needed.
//
// Native targets (PMTC iOS / Android) ignore the passthrough keys at
// emit time; they're type-level only there.

import type { TransformProps } from '../types/shared'

const OWN_KEYS_PREFIX_DATA = 'data-'
const OWN_KEYS_PREFIX_ARIA = 'aria-'

// accessibilityRole → the ARIA `role` token. Keyed by the constrained
// AccessibilityRole enum (button / image / header) so it maps 1:1 with the
// iOS trait + Android Compose Role the PMTC emit produces.
const ARIA_ROLE: Record<string, string> = {
  button: 'button',
  image: 'img',
  header: 'heading',
}

/**
 * Extract `data-*`, `aria-*`, `id`, `class`, and `style` from `props`,
 * returning them as a flat record suitable for spreading into the
 * primitive's rendered `h()` attrs.
 *
 * `style` from props is intentionally NOT returned here — primitives
 * compute their own `style` and merge it with the passthrough `style`
 * at the call site (see `mergePassthroughStyle`). This lets the
 * primitive's tokens-first style win for the props the primitive
 * understands, while still letting consumers override raw CSS for
 * the rest.
 */
export function collectPassthroughAttrs(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in props) {
    if (
      key.startsWith(OWN_KEYS_PREFIX_DATA) ||
      key.startsWith(OWN_KEYS_PREFIX_ARIA) ||
      key === 'id' ||
      key === 'class'
    ) {
      out[key] = props[key]
    }
  }
  // Lower the cross-platform a11y vocabulary (AccessibilityProps) to web
  // aria-*. A raw `aria-label` / `aria-hidden` (collected in the loop above)
  // WINS — it's the explicit web override — so only fill from the neutral
  // prop when the aria- attr isn't already set. (Native targets lower these
  // same props to `.accessibilityLabel` / `semantics{}` via PMTC emit.)
  if (typeof props.accessibilityLabel === 'string' && out['aria-label'] === undefined) {
    out['aria-label'] = props.accessibilityLabel
  }
  // Emit the STRING "true" (not a boolean) so it renders as aria-hidden="true",
  // never presence-only `aria-hidden=""` (which assistive tech ignores). Omit
  // when false/unset — an absent aria-hidden means "not hidden".
  if (props.accessibilityHidden === true && out['aria-hidden'] === undefined) {
    out['aria-hidden'] = 'true'
  }
  // accessibilityRole → ARIA `role` (a raw `role`, if passed, wins).
  if (typeof props.accessibilityRole === 'string' && out['role'] === undefined) {
    const ariaRole = ARIA_ROLE[props.accessibilityRole]
    if (ariaRole !== undefined) out['role'] = ariaRole
  }
  return out
}

/** The {@link TransformProps} keys, in their fixed application order. */
const TRANSFORM_KEYS = ['translateX', 'translateY', 'scale', 'rotate'] as const

/** The props `mergePassthroughStyle` reads: the consumer `style` and the transform props. */
export interface StyleSourceProps extends TransformProps {
  style?: string | Record<string, string> | undefined
}

/**
 * The CSS `transform` for the {@link TransformProps}, or `undefined` when none
 * is set. Order matches the native lowerings: CSS applies the list right to
 * left, so `translate() scale() rotate()` rotates, then scales, then
 * translates — a translation is not multiplied by the scale.
 */
export function transformCss(props: TransformProps): string | undefined {
  const tx = props.translateX
  const ty = props.translateY
  const s = props.scale
  const r = props.rotate
  const parts: string[] = []
  if (tx !== undefined || ty !== undefined) parts.push(`translate(${tx ?? 0}px, ${ty ?? 0}px)`)
  if (s !== undefined) parts.push(`scale(${s})`)
  if (r !== undefined) parts.push(`rotate(${r}deg)`)
  return parts.length === 0 ? undefined : parts.join(' ')
}

function mergeStatic(
  computed: Record<string, string>,
  consumer: string | Record<string, string> | undefined,
): string | Record<string, string> {
  if (consumer === undefined) return computed
  if (typeof consumer === 'string') {
    // Serialize the primitive's style object + suffix the consumer's
    // string. Browser parses concatenated `;`-separated CSS just fine.
    const computedStr = Object.entries(computed)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ')
    return `${computedStr}; ${consumer}`
  }
  // Both objects — consumer wins per-key.
  return { ...computed, ...consumer }
}

/**
 * Merge consumer `style` (from passthrough) AFTER the primitive's
 * computed style — consumer overrides win for any key collision.
 * Returns either a string (when consumer passed a string), a merged
 * object, or the primitive's style if no consumer override.
 *
 * String `style` (`<Stack style="color: red">`) is rare but allowed
 * by HTML; we concatenate it onto the primitive's style with `;`.
 *
 * When any {@link TransformProps} key is PRESENT on `props`, the result is an
 * ACCESSOR so the transform stays live: the compiler passes `scale={s()}` as a
 * getter, and reading it here at setup would freeze it at its first value.
 * Presence is tested with `in`, not by reading, for the same reason. The
 * transform is applied last, so it wins over a consumer `transform` in
 * `style`.
 */
export function mergePassthroughStyle(
  computed: Record<string, string>,
  props: StyleSourceProps,
): string | Record<string, string> | (() => string | Record<string, string>) {
  if (!TRANSFORM_KEYS.some((k) => k in props)) return mergeStatic(computed, props.style)
  return () => {
    const merged = mergeStatic(computed, props.style)
    const transform = transformCss(props)
    if (transform === undefined) return merged
    return typeof merged === 'string'
      ? `${merged}; transform: ${transform}`
      : { ...merged, transform }
  }
}
