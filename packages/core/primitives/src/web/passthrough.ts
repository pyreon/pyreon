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
