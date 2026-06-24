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

/**
 * Merge consumer `style` (from passthrough) AFTER the primitive's
 * computed style — consumer overrides win for any key collision.
 * Returns either a string (when consumer passed a string), a merged
 * object, or the primitive's style if no consumer override.
 *
 * String `style` (`<Stack style="color: red">`) is rare but allowed
 * by HTML; we concatenate it onto the primitive's style with `;`.
 */
export function mergePassthroughStyle(
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
