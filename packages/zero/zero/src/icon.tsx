import type { PyreonHTMLAttributes, SvgAttributes, VNodeChild } from '@pyreon/core'
import { splitProps } from '@pyreon/core'

// ─── Icon ───────────────────────────────────────────────────────────────────
//
// Renders a FULL, already-complete SVG that you loaded — it does NOT
// synthesize its own <svg> wrapper around hand-authored <path> children.
// You load an svg (it contains the <svg> root itself); Icon renders it and
// makes it container-sizable + theme-aware.
//
// Two ways to hand it the loaded svg (you chose: support both):
//   • `as`  — an imported SVG *component* (`import X from './x.svg?component'`).
//             Rendered directly — NO host wrapper. Recommended form: it's a
//             real <svg> element, so container-fill is reliable.
//   • `svg` — the raw `<svg>…</svg>` *markup string*
//             (`import x from './x.svg?raw'`). Inlined via a single `<span>`
//             host (a markup string can't mount without a parent element —
//             this one host is unavoidable for the string form).
//
// Either way:
//   • Container-filling defaults (`fill="currentColor"`,
//     `display:block;width:100%;height:100%`) — every consumer prop spreads
//     through and OVERRIDES them (`style`, `class`, `fill`, `aria-*`, …).
//   • No fixed size → it fills its container; the consumer's wrapper
//     (`<span style="width:2rem"><Icon/></span>`, a flex/grid cell,
//     `font-size`) controls the size.
//   • `fill="currentColor"` → CSS `color` themes it (dark mode for free).
//
// Two layers (mirrors createLink/Link, createImage/Image):
//   1. createIcon(source) — factory: one component per loaded glyph
//   2. Icon               — generic shell for a one-off loaded svg
//
// There is intentionally no `useIcon` — an icon has no composable behaviour
// (no async, no state, no router). A hook layer would be surface for its
// own sake.

const FILL_STYLE = 'display:block;width:100%;height:100%'

/** An imported SVG component (`import X from './x.svg?component'`). */
export type SvgComponent = (props: SvgAttributes) => VNodeChild

/**
 * Props for {@link Icon}. The standard `<svg>` attribute surface
 * (`fill`, `class`, `style`, `aria-*`, `onClick`, …) — every one passed
 * straight through and overriding the container-fill defaults — plus the
 * two source props.
 */
export interface IconProps extends SvgAttributes {
  /**
   * An imported SVG component, e.g. `import X from './icon.svg?component'`.
   * Rendered directly with no host wrapper. Recommended over `svg`.
   */
  as?: SvgComponent | undefined
  /**
   * A full `<svg>…</svg>` markup string, e.g.
   * `import x from './icon.svg?raw'`. Inlined inside a single `<span>` host.
   */
  svg?: string | undefined
}

/**
 * Render a loaded SVG — container-filling, theme-aware, props-transparent.
 *
 * @example
 * import Check from './check.svg?component'
 * <span style="width:2rem"><Icon as={Check} /></span>
 *
 * @example
 * import check from './check.svg?raw'
 * <span style="width:2rem"><Icon svg={check} /></span>
 */
export function Icon(props: IconProps): VNodeChild {
  const [own, rest] = splitProps(props, ['as', 'svg'])

  // Component form — render the imported SVG directly, no host wrapper.
  // Defaults first so consumer `rest` (spread) overrides them; JSX spread
  // is reactivity-safe (compiler wraps it with `_wrapSpread`).
  if (own.as) {
    const As = own.as
    return <As fill="currentColor" style={FILL_STYLE} {...rest} />
  }

  // Raw-markup form — the string already contains its own <svg>, so we
  // inline it via a single <span> host. `dangerouslySetInnerHTML` last so
  // it can't be clobbered by a stray spread key.
  if (own.svg) {
    // svg-only props (`fill`, `viewBox`, …) are inapplicable to the host
    // span AND can't reach the opaque inlined markup — only host-level
    // attrs (`class`, `style`, `aria-*`, events) are meaningfully
    // forwardable here. Narrow the spread to the host's real surface.
    const hostRest = rest as unknown as PyreonHTMLAttributes<HTMLElement>
    return <span style={FILL_STYLE} {...hostRest} dangerouslySetInnerHTML={{ __html: own.svg }} />
  }

  return null
}

/**
 * Build a reusable icon component from a loaded svg — a markup string OR an
 * imported SVG component. The result is still just `<Icon>`, so it's
 * container-sizable + theme-aware with every prop passed through.
 *
 * @example
 * import check from './check.svg?raw'
 * export const Check = createIcon(check)
 *
 * import StarSvg from './star.svg?component'
 * export const Star = createIcon(StarSvg)
 *
 * // …sized + themed entirely by the consumer:
 * <span style="width:48px"><Check class="text-green-600" /></span>
 */
export function createIcon(source: string | SvgComponent): (props: SvgAttributes) => VNodeChild {
  return (props: SvgAttributes) =>
    typeof source === 'string' ? <Icon svg={source} {...props} /> : <Icon as={source} {...props} />
}

// ─── createNamedIcon — typed icon-set runtime ────────────────────────────────
//
// The runtime half of `iconsPlugin`. The plugin scans a folder and writes a
// generated file that calls this with a registry literal; `keyof typeof
// REGISTRY` makes `name` a strict union (autocompletes, rejects typos) and
// gives real go-to-definition — zero per-app wiring.

/** How a named icon set renders each entry. */
export type IconMode = 'inline' | 'image'

/** Props of a component built by {@link createNamedIcon}. */
export type NamedIconProps<R extends Record<string, string>> = {
  /** A name from the scanned set — strictly typed to the available files. */
  name: keyof R & string
  /** `<img>` alt text (image mode). Defaults to `""` (decorative). */
  alt?: string
} & Omit<IconProps, 'as' | 'svg'>

/**
 * Build a strictly-typed `<Icon name="…" />` from a name→source registry.
 *
 * - `mode: 'inline'` (default) — `source` is raw `<svg>` markup; rendered via
 *   {@link Icon} so it's `currentColor`-themeable (system icons you recolor).
 * - `mode: 'image'` — `source` is an asset URL; rendered as `<img>` with NO
 *   svg mutation, original colors preserved (colorful / brand icons).
 *
 * Either way it stays container-filling + props-transparent. Not called by
 * hand normally — `iconsPlugin` emits the generated file that calls it.
 *
 * @example
 * // icons.gen.tsx (auto-generated):
 * export const Icon = createNamedIcon({ 'check-circle': '<svg…' })
 * // app:
 * <span style="width:2rem"><Icon name="check-circle" /></span>
 */
export function createNamedIcon<R extends Record<string, string>>(
  registry: R,
  options: { mode?: IconMode } = {},
): (props: NamedIconProps<R>) => VNodeChild {
  const mode = options.mode ?? 'inline'
  return (props: NamedIconProps<R>) => {
    const [own, rest] = splitProps(props, ['name', 'alt'])
    const source = registry[own.name]
    if (mode === 'image') {
      // svg-only props can't apply to an <img>; only host attrs forward.
      const hostRest = rest as unknown as PyreonHTMLAttributes<HTMLImageElement>
      return <img src={source} alt={own.alt ?? ''} style={FILL_STYLE} {...hostRest} />
    }
    return <Icon svg={source} {...rest} />
  }
}
