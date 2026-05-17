import type { SvgAttributes, VNodeChild } from '@pyreon/core'

// ─── Icon ───────────────────────────────────────────────────────────────────
//
// The minimal leaf: renders a plain <svg> and NOTHING else — no wrapper
// element, no host span, no sizing box. The consumer wraps and sizes it.
//
// Contract:
//  - Root IS the <svg>. Wrap it yourself if you want (`<span><Icon/></span>`).
//  - No fixed width/height → it fills its container; the consumer's wrapper
//    (CSS width/height, font-size, flex/grid cell) controls the size.
//  - `fill="currentColor"` → CSS `color` themes it (dark mode for free).
//  - All props pass straight through to the <svg> and override the defaults
//    (pass `style`, `class`, `fill`, `viewBox`, `aria-*`, `onClick`, …).
//
// Two layers (mirrors createLink/Link, createImage/Image):
//  1. createIcon(viewBox, paths) — factory: one icon component per glyph
//  2. Icon                       — generic shell for one-off inline SVG
//
// There is intentionally no `useIcon` — an icon has no composable behaviour
// (no async, no state, no router). Adding a hook layer would be surface for
// its own sake.

/**
 * Props for {@link Icon}. Exactly the standard `<svg>` attribute surface —
 * `viewBox`, `fill`, `class`, `style`, `aria-*`, `onClick`, `children`, … —
 * every one passed straight through and overriding the component's defaults.
 */
export type IconProps = SvgAttributes

/**
 * Generic inline-SVG shell. Container-filling, props-transparent, no wrapper.
 *
 * @example
 * <span style="width:2rem">
 *   <Icon><path d="M20 6 9 17l-5-5" /></Icon>
 * </span>
 */
export function Icon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      style="display:block;width:100%;height:100%"
      {...props}
    >
      {props.children}
    </svg>
  )
}

/**
 * Build a reusable icon component from a viewBox + its shapes. Each icon is
 * still just a plain container-filling <svg> with props passed through.
 *
 * @example
 * export const Check = createIcon('0 0 24 24', <path d="M20 6 9 17l-5-5" />)
 * // …then, sized entirely by the consumer's wrapper:
 * <span style="width:48px"><Check class="text-green-600" /></span>
 */
export function createIcon(viewBox: string, paths: VNodeChild) {
  return (props: SvgAttributes) => (
    <Icon viewBox={viewBox} {...props}>
      {paths}
    </Icon>
  )
}
